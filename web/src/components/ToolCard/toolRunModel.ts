import type { ToolCallBlock } from '@/chat/types'
import { extractCodexBashDisplay, extractTextFromResult } from '@/components/ToolCard/views/_results'
import { isObject } from '@hapi/protocol'
import { parsePatch } from 'diff'

const GROUPABLE_TOOL_NAMES = new Set([
    'Read',
    'Grep',
    'Glob',
    'Bash',
    'CodexBash',
    'CodexPatch',
    'CodexDiff'
])

const EMPTY_RESULT = /^(done|\(no output\)|done\s*\(no output\))$/i

export type ToolRunPart = {
    type?: string
    artifact?: unknown
}

export type ToolRunSegment =
    | {
        kind: 'group'
        id: string
        startOffset: number
        endOffset: number
        blocks: ToolCallBlock[]
    }
    | {
        kind: 'single'
        startOffset: number
        endOffset: number
        block: ToolCallBlock | null
    }

export function isToolCallBlock(value: unknown): value is ToolCallBlock {
    if (!isObject(value) || value.kind !== 'tool-call') return false
    if (typeof value.id !== 'string') return false
    if (value.localId !== null && typeof value.localId !== 'string') return false
    if (typeof value.createdAt !== 'number' || !Array.isArray(value.children)) return false
    if (!isObject(value.tool) || typeof value.tool.name !== 'string' || !('input' in value.tool)) return false
    if (value.tool.description !== null && typeof value.tool.description !== 'string') return false
    return value.tool.state === 'pending'
        || value.tool.state === 'running'
        || value.tool.state === 'completed'
        || value.tool.state === 'error'
}

export function isGroupableToolBlock(block: ToolCallBlock): boolean {
    return GROUPABLE_TOOL_NAMES.has(block.tool.name)
        && block.tool.state !== 'error'
        && block.tool.permission === undefined
        && block.children.length === 0
}

function stableGroupId(blocks: readonly ToolCallBlock[]): string {
    return `tool-run:${blocks[0]?.id ?? 'empty'}`
}

export function partitionToolRunParts(parts: readonly ToolRunPart[]): ToolRunSegment[] {
    const segments: ToolRunSegment[] = []
    let runStart = -1
    let runBlocks: ToolCallBlock[] = []

    const flushRun = () => {
        if (runBlocks.length === 0) return

        const endOffset = runStart + runBlocks.length - 1
        segments.push(runBlocks.length >= 2
            ? {
                kind: 'group',
                id: stableGroupId(runBlocks),
                startOffset: runStart,
                endOffset,
                blocks: runBlocks
            }
            : {
                kind: 'single',
                startOffset: runStart,
                endOffset,
                block: runBlocks[0]
            })
        runStart = -1
        runBlocks = []
    }

    parts.forEach((part, offset) => {
        const block = isToolCallBlock(part.artifact) ? part.artifact : null
        if (block && isGroupableToolBlock(block)) {
            if (runBlocks.length === 0) runStart = offset
            runBlocks.push(block)
            return
        }

        flushRun()
        segments.push({
            kind: 'single',
            startOffset: offset,
            endOffset: offset,
            block
        })
    })
    flushRun()
    return segments
}

function hasMeaningfulText(value: string | null | undefined): boolean {
    const text = value?.trim() ?? ''
    return text.length > 0 && !EMPTY_RESULT.test(text)
}

function hasRenderableUnifiedDiff(value: unknown): boolean {
    if (typeof value !== 'string' || value.trim().length === 0) return false

    try {
        return parsePatch(value).some((patch) => patch.hunks.length > 0)
    } catch {
        return false
    }
}

export function getToolExpansionKind(block: ToolCallBlock): 'input' | 'result' | null {
    if (block.tool.name === 'CodexDiff') {
        const input = block.tool.input
        return isObject(input) && hasRenderableUnifiedDiff(input.unified_diff)
            ? 'input'
            : null
    }

    if (block.tool.name === 'Bash' || block.tool.name === 'CodexBash') {
        const display = extractCodexBashDisplay(block.tool.result)
        if (display && (hasMeaningfulText(display.stdout) || hasMeaningfulText(display.stderr))) {
            return 'result'
        }
    }

    return hasMeaningfulText(extractTextFromResult(block.tool.result)) ? 'result' : null
}

export function getToolRunDurationMs(
    blocks: readonly ToolCallBlock[],
    now: number
): number | null {
    const starts = blocks.map((block) => block.tool.startedAt)
    if (starts.some((value) => value === null || !Number.isFinite(value) || value < 0)) return null

    const start = Math.min(...(starts as number[]))
    const running = blocks.some((block) =>
        block.tool.state === 'running' || block.tool.state === 'pending'
    )
    const completions = blocks.map((block) => block.tool.completedAt)
    if (!running && completions.some((value) =>
        value === null || !Number.isFinite(value) || value < 0
    )) return null

    const end = running ? now : Math.max(...(completions as number[]))
    const duration = end - start
    return Number.isFinite(duration) && duration >= 0 ? duration : null
}
