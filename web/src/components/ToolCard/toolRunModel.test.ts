import { describe, expect, it } from 'vitest'
import type { ChatBlock, ToolCallBlock, ToolPermission } from '@/chat/types'
import {
    getToolExpansionKind,
    getToolRunDurationMs,
    isGroupableToolBlock,
    isToolCallBlock,
    partitionToolRunParts,
    type ToolRunPart
} from '@/components/ToolCard/toolRunModel'

type BlockOptions = {
    input?: unknown
    result?: unknown
    state?: ToolCallBlock['tool']['state']
    startedAt?: number | null
    completedAt?: number | null
    permission?: ToolPermission
    children?: ChatBlock[]
}

function block(name: string, options: BlockOptions = {}): ToolCallBlock {
    return {
        kind: 'tool-call',
        id: `block-${name}`,
        localId: null,
        createdAt: 1000,
        children: options.children ?? [],
        tool: {
            id: `tool-${name}`,
            name,
            input: options.input ?? {},
            state: options.state ?? 'completed',
            createdAt: 1000,
            startedAt: options.startedAt === undefined ? 1000 : options.startedAt,
            completedAt: options.completedAt === undefined ? 2000 : options.completedAt,
            description: null,
            result: options.result,
            permission: options.permission
        }
    }
}

function part(artifact: unknown): ToolRunPart {
    return { type: 'tool-call', artifact }
}

const permission = (status: ToolPermission['status']): ToolPermission => ({
    id: `permission-${status}`,
    status
})

describe('tool run partitioning', () => {
    it('groups allowlisted runs and preserves every offset', () => {
        const parts = [
            part(block('Read')),
            part(block('Bash')),
            part(block('Agent')),
            part(block('Grep')),
            part(block('Glob'))
        ]

        const segments = partitionToolRunParts(parts)

        expect(segments.map((item) => [item.kind, item.startOffset, item.endOffset])).toEqual([
            ['group', 0, 1],
            ['single', 2, 2],
            ['group', 3, 4]
        ])
        expect(segments.flatMap((item) =>
            Array.from(
                { length: item.endOffset - item.startOffset + 1 },
                (_, index) => item.startOffset + index
            )
        )).toEqual([0, 1, 2, 3, 4])
        expect(segments.filter((item) => item.kind === 'group').map((item) => item.id)).toEqual([
            'tool-run:block-Read',
            'tool-run:block-Grep'
        ])
    })

    it.each(['Agent', 'Task', 'update_plan', 'SendMessage', 'mcp__server__tool'])(
        'keeps %s outside groups',
        (name) => expect(isGroupableToolBlock(block(name))).toBe(false)
    )

    it('allows only the exact safe tool allowlist', () => {
        expect([
            'Read',
            'Grep',
            'Glob',
            'Bash',
            'CodexBash',
            'CodexPatch',
            'CodexDiff'
        ].every((name) => isGroupableToolBlock(block(name)))).toBe(true)
        expect(isGroupableToolBlock(block('read'))).toBe(false)
    })

    it('treats permission, children and error as hard boundaries', () => {
        expect(isGroupableToolBlock(block('Read', { permission: permission('pending') }))).toBe(false)
        expect(isGroupableToolBlock(block('Read', { permission: permission('approved') }))).toBe(false)
        expect(isGroupableToolBlock(block('Read', { children: [block('Grep')] }))).toBe(false)
        expect(isGroupableToolBlock(block('Read', { state: 'error' }))).toBe(false)
    })

    it('keeps non-tool and CLI offsets lossless', () => {
        const parts = [part(block('Read')), part({ kind: 'cli-output' }), part(block('Bash'))]

        const segments = partitionToolRunParts(parts)

        expect(segments.map((item) => [item.kind, item.startOffset, item.endOffset])).toEqual([
            ['single', 0, 0],
            ['single', 1, 1],
            ['single', 2, 2]
        ])
        expect(segments.map((item) => item.kind === 'single' ? item.block?.tool.name ?? null : null)).toEqual([
            'Read',
            null,
            'Bash'
        ])
    })

    it('recognizes only structurally valid tool-call blocks', () => {
        expect(isToolCallBlock(block('Read'))).toBe(true)
        expect(isToolCallBlock({ ...block('Read'), children: null })).toBe(false)
        expect(isToolCallBlock({ ...block('Read'), tool: { ...block('Read').tool, input: undefined } })).toBe(true)
        const missingInput = { ...block('Read').tool } as Record<string, unknown>
        delete missingInput.input
        expect(isToolCallBlock({ ...block('Read'), tool: missingInput })).toBe(false)
        expect(isToolCallBlock({ ...block('Read'), tool: { ...block('Read').tool, state: 'unknown' } })).toBe(false)
    })
})

describe('tool expansion', () => {
    it('opens structured Read output when file content is meaningful', () => {
        expect(getToolExpansionKind(block('Read', {
            result: { file: { content: 'const ready = true\n', filePath: '/workspace/ready.ts' } }
        }))).toBe('result')
    })

    it.each([
        { file: { content: '', filePath: '/workspace/empty.ts' } },
        { file: { content: '   \n', filePath: '/workspace/blank.ts' } },
        { file: { filePath: '/workspace/missing.ts' } },
        { file: null }
    ])('keeps empty structured Read output collapsed for %#', (result) => {
        expect(getToolExpansionKind(block('Read', { result }))).toBeNull()
    })

    it('opens patch results only when their text is meaningful', () => {
        expect(getToolExpansionKind(block('CodexPatch', { result: null }))).toBeNull()
        expect(getToolExpansionKind(block('CodexPatch', { result: 'patched' }))).toBe('result')
        expect(getToolExpansionKind(block('CodexPatch', { result: 'Done' }))).toBeNull()
        expect(getToolExpansionKind(block('CodexPatch', { result: '(no output)' }))).toBeNull()
        expect(getToolExpansionKind(block('CodexPatch', { result: ' done (no output) ' }))).toBeNull()
    })

    it('applies completion sentinels only to mutation result views', () => {
        expect(getToolExpansionKind(block('Grep', { result: 'Done' }))).toBe('result')
        expect(getToolExpansionKind(block('Read', { result: '(no output)' }))).toBe('result')
        expect(getToolExpansionKind(block('CodexPatch', { result: 'Done' }))).toBeNull()
    })

    it('opens CodexDiff input for renderer-supported hunks and metadata-only diffs', () => {
        expect(getToolExpansionKind(block('CodexDiff', {
            input: {
                unified_diff: 'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-a\n+b'
            }
        }))).toBe('input')
        for (const unifiedDiff of [
            'diff --git a/old.ts b/new.ts\nsimilarity index 100%\nrename from old.ts\nrename to new.ts',
            'diff --git a/a.sh b/a.sh\nold mode 100644\nnew mode 100755',
            'diff --git a/a.png b/a.png\nBinary files a/a.png and b/a.png differ'
        ]) {
            expect(getToolExpansionKind(block('CodexDiff', {
                input: { unified_diff: unifiedDiff }
            }))).toBe('input')
        }
    })

    it('falls back to meaningful CodexDiff results when input is missing or malformed', () => {
        expect(getToolExpansionKind(block('CodexDiff', {
            input: {},
            result: 'result-only-diff'
        }))).toBe('result')
        expect(getToolExpansionKind(block('CodexDiff', {
            input: { unified_diff: 'not a diff' },
            result: 'result-fallback-diff'
        }))).toBe('result')
        expect(getToolExpansionKind(block('CodexDiff', {
            input: { unified_diff: 'not a diff' }
        }))).toBe('input')
        expect(getToolExpansionKind(block('CodexDiff', { input: {}, result: '  \n' }))).toBeNull()
    })

    it('opens shell results for any non-whitespace renderer-supported stdout or stderr', () => {
        expect(getToolExpansionKind(block('Bash', {
            result: { stdout: 'ready\n', stderr: '' }
        }))).toBe('result')
        expect(getToolExpansionKind(block('Bash', {
            result: { stdout: ' ', stderr: '' }
        }))).toBeNull()
        expect(getToolExpansionKind(block('CodexBash', {
            result: { stdout: '', stderr: 'failed' }
        }))).toBe('result')
        expect(getToolExpansionKind(block('CodexBash', {
            result: { stdout: 'Done', stderr: '(no output)' }
        }))).toBe('result')
        expect(getToolExpansionKind(block('Bash', {
            result: { output: { stdout: 'nested stdout', stderr: '' } }
        }))).toBe('result')
        expect(getToolExpansionKind(block('Bash', { result: 'Done' }))).toBe('result')
        expect(getToolExpansionKind(block('Bash', { result: '(no output)' }))).toBe('result')
    })
})

describe('tool run duration', () => {
    it('uses injected now when any block is still running', () => {
        expect(getToolRunDurationMs([
            block('Read', { startedAt: 1000, completedAt: 2000 }),
            block('Bash', { state: 'running', startedAt: 1500, completedAt: null })
        ], 4000)).toBe(3000)
        expect(getToolRunDurationMs([
            block('Read', { state: 'pending', startedAt: 2000, completedAt: null })
        ], 4500)).toBe(2500)
    })

    it('uses the earliest start and latest completion for completed blocks', () => {
        expect(getToolRunDurationMs([
            block('Read', { startedAt: 1500, completedAt: 2500 }),
            block('Bash', { startedAt: 1000, completedAt: 3000 })
        ], 9000)).toBe(2000)
    })

    it('rejects missing, negative and non-finite timestamps or durations', () => {
        expect(getToolRunDurationMs([block('Read', { startedAt: null })], 4000)).toBeNull()
        expect(getToolRunDurationMs([block('Read', { completedAt: null })], 4000)).toBeNull()
        expect(getToolRunDurationMs([block('Read', { startedAt: -1 })], 4000)).toBeNull()
        expect(getToolRunDurationMs([block('Read', { completedAt: Number.POSITIVE_INFINITY })], 4000)).toBeNull()
        expect(getToolRunDurationMs([block('Read', { startedAt: 4000, completedAt: 3000 })], 4000)).toBeNull()
        expect(getToolRunDurationMs([
            block('Read', { state: 'running', startedAt: 1000, completedAt: null })
        ], Number.NaN)).toBeNull()
        expect(getToolRunDurationMs([], 4000)).toBeNull()
    })
})
