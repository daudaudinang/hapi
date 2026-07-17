import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AssistantRuntimeProvider, ThreadPrimitive } from '@assistant-ui/react'
import type { ApiClient } from '@/api/client'
import type { ChatBlock, ToolCallBlock } from '@/chat/types'
import type { Session } from '@/types/api'
import { HappyChatProvider } from '@/components/AssistantChat/context'
import { HappyAssistantMessage } from '@/components/AssistantChat/messages/AssistantMessage'
import { HappySystemMessage } from '@/components/AssistantChat/messages/SystemMessage'
import { HappyUserMessage } from '@/components/AssistantChat/messages/UserMessage'
import { I18nProvider } from '@/lib/i18n-context'
import { useHappyRuntime } from '@/lib/assistant-runtime'

const api = {
    updateTeamMentionStatus: vi.fn().mockResolvedValue(undefined)
} as unknown as ApiClient
const onSendMessage = vi.fn()
const onAbort = async () => undefined
const onRefresh = vi.fn()

beforeAll(() => {
    window.matchMedia = vi.fn((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn()
    })) as unknown as typeof window.matchMedia
})

function toolBlock(
    name: string,
    input: unknown = {},
    overrides: Partial<ToolCallBlock['tool']> = {}
): ToolCallBlock {
    return {
        kind: 'tool-call',
        id: `block-${name}`,
        localId: null,
        createdAt: 1000,
        children: [],
        tool: {
            id: `tool-${name}`,
            name,
            input,
            state: 'completed',
            createdAt: 1000,
            startedAt: 1000,
            completedAt: 2000,
            description: null,
            result: null,
            ...overrides
        }
    }
}

function identifiedTool(
    id: string,
    name: string,
    input: unknown = {},
    overrides: Partial<ToolCallBlock['tool']> = {}
): ToolCallBlock {
    const block = toolBlock(name, input, overrides)
    block.id = id
    block.tool.id = `tool-${id}`
    return block
}

const threadComponents = {
    UserMessage: HappyUserMessage,
    AssistantMessage: HappyAssistantMessage,
    SystemMessage: HappySystemMessage
} as const

function RuntimeHarness(props: {
    blocks: readonly ChatBlock[]
    thinking?: boolean
}) {
    const runtime = useHappyRuntime({
        session: {
            active: true,
            thinking: props.thinking ?? false
        } as Session,
        blocks: props.blocks,
        isSending: false,
        onSendMessage,
        onAbort
    })

    return (
        <I18nProvider>
            <AssistantRuntimeProvider runtime={runtime}>
                <HappyChatProvider value={{
                    api,
                    sessionId: 'session-1',
                    metadata: null,
                    disabled: false,
                    onRefresh
                }}>
                    <ThreadPrimitive.Root>
                        <ThreadPrimitive.Messages components={threadComponents} />
                    </ThreadPrimitive.Root>
                </HappyChatProvider>
            </AssistantRuntimeProvider>
        </I18nProvider>
    )
}

const mixedBlocks: ChatBlock[] = [
    { kind: 'agent-reasoning', id: 'reason', localId: null, createdAt: 1, text: 'reason-before-tools' },
    toolBlock('Read', { file_path: '/workspace/a.ts' }),
    toolBlock('Bash', { command: 'printf ready' }, {
        result: { stdout: 'ready', stderr: '', exitCode: 0 }
    }),
    { kind: 'agent-text', id: 'middle', localId: null, createdAt: 4, text: 'text-between-runs' },
    toolBlock('Grep', { pattern: 'needle' }, { result: 'needle:1' }),
    toolBlock('Glob', { pattern: '**/*.ts' }, { result: 'a.ts' }),
    {
        kind: 'cli-output',
        id: 'assistant-cli',
        localId: null,
        createdAt: 7,
        source: 'assistant',
        text: 'Exit code: 0\nOutput:\nassistant-cli-marker'
    },
    toolBlock('CodexPatch', {
        changes: [{
            path: '/workspace/a.ts',
            kind: { type: 'update', move_path: null },
            diff: '@@ -1 +1 @@\n-a\n+b'
        }]
    }),
    toolBlock('CodexDiff', {
        unified_diff: 'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-a\n+b'
    }),
    { kind: 'agent-text', id: 'after', localId: null, createdAt: 10, text: 'text-after-tools' },
    {
        kind: 'agent-event',
        id: 'event',
        createdAt: 11,
        event: { type: 'message', message: 'event-marker' }
    },
    {
        kind: 'team-mention',
        id: 'mention',
        localId: null,
        createdAt: 12,
        requestId: 'request-1',
        teamChatId: 'team-1',
        sourceMessageId: 'source-1',
        text: 'team-mention-marker',
        status: 'delivered'
    },
    {
        kind: 'cli-output',
        id: 'user-cli',
        localId: null,
        createdAt: 13,
        source: 'user',
        text: 'user-cli-marker'
    }
]

function toolIds(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll<HTMLElement>('[data-tool-block-id]'))
        .map((node) => node.dataset.toolBlockId ?? '')
}

function expectTextMarkersOnceInOrder(container: HTMLElement, markers: readonly string[]) {
    const text = container.textContent ?? ''
    const offsets = markers.map((marker) => {
        expect(text.split(marker), `marker ${marker}`).toHaveLength(2)
        return text.indexOf(marker)
    })
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b))
}

function expectNodesInOrder(nodes: readonly Element[]) {
    for (let index = 0; index < nodes.length - 1; index += 1) {
        expect(
            nodes[index]!.compareDocumentPosition(nodes[index + 1]!)
                & Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy()
    }
}

afterEach(cleanup)

describe('Happy assistant actual-runtime activity grouping', () => {
    it('renders generic reasoning and four Codex activities as one lossless five-activity group', () => {
        const genericReasoning: ChatBlock = {
            kind: 'agent-reasoning',
            id: 'generic-reasoning',
            localId: null,
            createdAt: 2,
            text: 'generic-reasoning-marker'
        }
        const codexReasoning = identifiedTool('block-codex-reasoning', 'CodexReasoning', {
            title: 'Inspecting review details'
        }, {
            result: { content: 'codex-reasoning-marker', status: 'completed' }
        })
        const terminal = identifiedTool('block-codex-bash', 'CodexBash', {
            command: 'printf terminal-five-marker'
        }, {
            result: { stdout: 'terminal-five-marker', stderr: '', exitCode: 0 }
        })
        const diff = identifiedTool('block-codex-diff', 'CodexDiff', {
            unified_diff: 'diff --git a/five.ts b/five.ts\n--- a/five.ts\n+++ b/five.ts\n@@ -1 +1 @@\n-diff-old-marker\n+diff-new-marker'
        })
        const patch = identifiedTool('block-codex-patch', 'CodexPatch', {
            changes: [{
                path: '/workspace/five-activity-marker.ts',
                kind: { type: 'update', move_path: null },
                diff: '@@ -1 +1 @@\n-before\n+after'
            }]
        })
        const { container } = render(<RuntimeHarness blocks={[
            { kind: 'agent-text', id: 'before-five', localId: null, createdAt: 1, text: 'text-before-five' },
            genericReasoning,
            codexReasoning,
            terminal,
            diff,
            patch,
            { kind: 'agent-text', id: 'after-five', localId: null, createdAt: 8, text: 'text-after-five' }
        ]} />)

        const group = container.querySelector<HTMLElement>('[data-activity-group]')
        expect(group).not.toBeNull()
        expect(container.querySelectorAll('[data-activity-group]')).toHaveLength(1)
        expect(group).toHaveTextContent('5 activities completed')
        expect(group?.querySelector(':scope > button')).toHaveAttribute('aria-expanded', 'false')
        expect(toolIds(group!)).toEqual([
            'block-codex-reasoning',
            'block-codex-bash',
            'block-codex-diff',
            'block-codex-patch'
        ])

        const activities = Array.from(group!.querySelectorAll(
            '[data-hapi-reasoning], [data-tool-block-id]'
        ))
        expect(activities).toHaveLength(5)
        expectNodesInOrder(activities)
        expectTextMarkersOnceInOrder(container, [
            'text-before-five',
            'generic-reasoning-marker',
            'terminal-five-marker',
            'text-after-five'
        ])

        const before = screen.getByText('text-before-five')
        const after = screen.getByText('text-after-five')
        expect(group!.contains(before)).toBe(false)
        expect(group!.contains(after)).toBe(false)
        expectNodesInOrder([before, group!, after])

        // Completed groups mount closed. Open the group before exercising its nested disclosures.
        fireEvent.click(group!.querySelector(':scope > button')!)
        const genericToggle = group!.querySelector('[data-hapi-reasoning] button')!
        const codexToggle = screen.getByRole('button', { name: 'Inspecting review details' })
        fireEvent.click(genericToggle)
        fireEvent.click(codexToggle)
        expect(genericToggle).toHaveAttribute('aria-expanded', 'true')
        expect(codexToggle).toHaveAttribute('aria-expanded', 'true')
    })

    it('preserves every mixed-stream marker and ID once in input order', () => {
        const { container } = render(<RuntimeHarness blocks={mixedBlocks} />)
        expectTextMarkersOnceInOrder(container, [
            'reason-before-tools',
            'text-between-runs',
            'assistant-cli-marker',
            'text-after-tools',
            'event-marker',
            'team-mention-marker',
            'user-cli-marker'
        ])
        expect(container.querySelectorAll('[data-cli-output-part]')).toHaveLength(1)
        expect(container.querySelectorAll('[data-tool-run-group]')).toHaveLength(3)
        expect(toolIds(container)).toEqual([
            'block-Read',
            'block-Bash',
            'block-Grep',
            'block-Glob',
            'block-CodexPatch',
            'block-CodexDiff'
        ])

        for (const text of ['text-between-runs', 'text-after-tools']) {
            const textNode = screen.getByText(text)
            expect(textNode.closest('[data-activity-group]')).toBeNull()
        }
    })

    const boundaryCases: Array<{
        label: string
        boundary: () => ChatBlock
        marker: string
        markerKind: 'block-id' | 'text'
    }> = [
        {
            label: 'text',
            boundary: () => ({
                kind: 'agent-text', id: 'boundary-text', localId: null, createdAt: 3,
                text: 'boundary-text-marker'
            }),
            marker: 'boundary-text-marker',
            markerKind: 'text'
        },
        {
            label: 'assistant CLI output',
            boundary: () => ({
                kind: 'cli-output', id: 'boundary-cli', localId: null, createdAt: 3,
                source: 'assistant', text: 'boundary-cli-marker'
            }),
            marker: 'boundary-cli-marker',
            markerKind: 'text'
        },
        {
            label: 'system event',
            boundary: () => ({
                kind: 'agent-event', id: 'boundary-event', createdAt: 3,
                event: { type: 'message', message: 'boundary-event-marker' }
            }),
            marker: 'boundary-event-marker',
            markerKind: 'text'
        },
        {
            label: 'team mention',
            boundary: () => ({
                kind: 'team-mention', id: 'boundary-mention', localId: null, createdAt: 3,
                requestId: 'boundary-request', teamChatId: 'team-1', sourceMessageId: 'source-1',
                text: 'boundary-mention-marker', status: 'delivered'
            }),
            marker: 'boundary-mention-marker',
            markerKind: 'text'
        },
        {
            label: 'plan',
            boundary: () => identifiedTool('boundary-plan', 'update_plan', {
                plan: [{ step: 'boundary-plan-marker', status: 'in_progress' }]
            }),
            marker: 'boundary-plan',
            markerKind: 'block-id'
        },
        {
            label: 'permission',
            boundary: () => identifiedTool('boundary-permission', 'Read', {}, {
                permission: { id: 'permission-boundary', status: 'pending' }
            }),
            marker: 'boundary-permission',
            markerKind: 'block-id'
        },
        {
            label: 'error',
            boundary: () => identifiedTool('boundary-error', 'Read', {}, {
                state: 'error', result: 'boundary-error-marker'
            }),
            marker: 'boundary-error',
            markerKind: 'block-id'
        },
        {
            label: 'children',
            boundary: () => {
                const block = identifiedTool('boundary-children', 'Read')
                block.children = [{
                    kind: 'agent-text', id: 'boundary-child', localId: null, createdAt: 1001,
                    text: 'boundary-child-marker'
                }]
                return block
            },
            marker: 'boundary-children',
            markerKind: 'block-id'
        },
        ...[
            ['question', 'request_user_input'],
            ['Task', 'Task'],
            ['Agent', 'Agent'],
            ['Skill', 'Skill'],
            ['MCP', 'mcp__server__tool'],
            ['unknown', 'UnknownTool'],
            ['CLI pseudo-tool collision', 'HapiCliOutput'],
            ['reasoning pseudo-tool collision', 'HapiReasoning']
        ].map(([label, name]) => ({
            label,
            boundary: () => identifiedTool(`boundary-${label}`, name, {
                marker: `boundary-${label}-marker`
            }),
            marker: `boundary-${label}`,
            markerKind: 'block-id' as const
        }))
    ]

    it.each(boundaryCases)('keeps $label once between two valid activity groups', ({ boundary, marker, markerKind }) => {
        const boundaryBlock = boundary()
        const blocks: ChatBlock[] = [
            identifiedTool('left-read', 'Read'),
            identifiedTool('left-grep', 'Grep'),
            boundaryBlock,
            identifiedTool('right-bash', 'Bash'),
            identifiedTool('right-glob', 'Glob')
        ]
        const { container } = render(<RuntimeHarness blocks={blocks} />)
        const groups = Array.from(container.querySelectorAll('[data-activity-group]'))
        expect(groups).toHaveLength(2)

        const boundaryNode = markerKind === 'block-id'
            ? container.querySelector(`[data-tool-block-id="${marker}"]`)
            : screen.getByText(marker)
        expect(boundaryNode).not.toBeNull()
        if (markerKind === 'block-id') {
            expect(container.querySelectorAll(`[data-tool-block-id="${marker}"]`)).toHaveLength(1)
        } else {
            expect((container.textContent ?? '').split(marker)).toHaveLength(2)
        }
        expect(boundaryNode!.closest('[data-activity-group]')).toBeNull()
        expectNodesInOrder([groups[0]!, boundaryNode!, groups[1]!])

        const expectedIds = markerKind === 'block-id'
            ? ['left-read', 'left-grep', marker, 'right-bash', 'right-glob']
            : ['left-read', 'left-grep', 'right-bash', 'right-glob']
        expect(toolIds(container)).toEqual(expectedIds)
    })

    it('preserves IDs and disclosure state through singleton append and running completion', async () => {
        const readRunning = identifiedTool('stream-read', 'Read', {}, {
            state: 'running', completedAt: null
        })
        const view = render(<RuntimeHarness blocks={[readRunning]} />)
        expect(toolIds(view.container)).toEqual(['stream-read'])
        expect(view.container.querySelector('[data-activity-group]')).toBeNull()

        const bashRunning = identifiedTool('stream-bash', 'Bash', {}, {
            state: 'running', completedAt: null
        })
        view.rerender(<RuntimeHarness blocks={[readRunning, bashRunning]} />)
        await waitFor(() => expect(toolIds(view.container)).toEqual(['stream-read', 'stream-bash']))
        const groupTrigger = view.container.querySelector('[data-activity-group] > button')
        expect(groupTrigger).toHaveAttribute('aria-expanded', 'true')
        expect(groupTrigger).toHaveAttribute('aria-label', 'Toggle activity group: 2 activities running')

        view.rerender(<RuntimeHarness blocks={[
            identifiedTool('stream-read', 'Read'),
            identifiedTool('stream-bash', 'Bash')
        ]} />)
        await waitFor(() => {
            expect(toolIds(view.container)).toEqual(['stream-read', 'stream-bash'])
            const currentTrigger = view.container.querySelector('[data-activity-group] > button')
            expect(currentTrigger).toBe(groupTrigger)
            expect(currentTrigger?.isConnected).toBe(true)
            expect(currentTrigger).toHaveAttribute('aria-expanded', 'true')
            expect(currentTrigger).toHaveAttribute(
                'aria-label',
                'Toggle activity group: 2 activities completed'
            )
        })
    })

    it.each([
        {
            label: 'error',
            change: (block: ToolCallBlock) => ({
                ...block,
                tool: { ...block.tool, state: 'error' as const, result: 'late-error-marker' }
            }),
            marker: null
        },
        {
            label: 'permission',
            change: (block: ToolCallBlock) => ({
                ...block,
                tool: {
                    ...block.tool,
                    permission: { id: 'late-permission', status: 'pending' as const }
                }
            }),
            marker: null
        },
        {
            label: 'children',
            change: (block: ToolCallBlock) => ({
                ...block,
                children: [{
                    kind: 'agent-text' as const,
                    id: 'late-child',
                    localId: null,
                    createdAt: 1001,
                    text: 'late-child-marker'
                }]
            }),
            marker: 'late-child-marker'
        }
    ])('splits a group on late $label without moving or dropping content', async ({ change, marker }) => {
        const read = identifiedTool('late-read', 'Read')
        const bash = identifiedTool('late-bash', 'Bash')
        const view = render(<RuntimeHarness blocks={[read, bash]} />)
        expect(view.container.querySelectorAll('[data-activity-group]')).toHaveLength(1)

        view.rerender(<RuntimeHarness blocks={[change(read), bash]} />)
        await waitFor(() => {
            expect(view.container.querySelector('[data-activity-group]')).toBeNull()
            expect(toolIds(view.container)).toEqual(['late-read', 'late-bash'])
        })
        const readNode = view.container.querySelector('[data-tool-block-id="late-read"]')
        const bashNode = view.container.querySelector('[data-tool-block-id="late-bash"]')
        expectNodesInOrder([readNode!, bashNode!])
        if (marker) {
            expect((view.container.textContent ?? '').split(marker)).toHaveLength(2)
        }
    })

    it('preserves content through pagination prepend and completed-group remount', async () => {
        const olderRead = identifiedTool('older-read', 'Read', { file_path: '/workspace/older.ts' })
        const olderBash = identifiedTool('older-bash', 'Bash', { command: 'printf older' })
        const olderPage: ChatBlock[] = [
            { kind: 'agent-text', id: 'older-start', localId: null, createdAt: -2, text: 'older-page-start' },
            olderRead,
            olderBash,
            { kind: 'agent-text', id: 'older-end', localId: null, createdAt: -1, text: 'older-page-end' }
        ]
        const view = render(<RuntimeHarness blocks={mixedBlocks} />)
        const currentIds = toolIds(view.container)

        view.rerender(<RuntimeHarness blocks={[...olderPage, ...mixedBlocks]} />)
        await waitFor(() => {
            expect(toolIds(view.container)).toEqual(['older-read', 'older-bash', ...currentIds])
        })
        const orderedMarkers = [
            'older-page-start',
            'older-page-end',
            'reason-before-tools',
            'text-between-runs',
            'assistant-cli-marker',
            'text-after-tools',
            'event-marker',
            'team-mention-marker',
            'user-cli-marker'
        ]
        expectTextMarkersOnceInOrder(view.container, orderedMarkers)
        expect(view.container.querySelectorAll('[data-activity-group]')).toHaveLength(4)

        view.unmount()
        const remounted = render(<RuntimeHarness blocks={[...olderPage, ...mixedBlocks]} />)
        expect(toolIds(remounted.container)).toEqual(['older-read', 'older-bash', ...currentIds])
        expectTextMarkersOnceInOrder(remounted.container, orderedMarkers)
        for (const trigger of remounted.container.querySelectorAll('[data-activity-group] > button')) {
            expect(trigger).toHaveAttribute('aria-expanded', 'false')
        }
    })

    it('does not mark generic reasoning as streaming when a newer tool is the running part', () => {
        const reasoning: ChatBlock = {
            kind: 'agent-reasoning',
            id: 'older-reasoning',
            localId: null,
            createdAt: 1,
            text: 'older-reasoning-marker'
        }
        const runningTool = identifiedTool('newer-running-tool', 'Bash', {}, {
            state: 'running', completedAt: null
        })
        const { container } = render(<RuntimeHarness blocks={[reasoning, runningTool]} thinking />)
        const group = container.querySelector('[data-activity-group]')
        expect(group?.querySelector(':scope > button')).toHaveAttribute('aria-expanded', 'true')
        const reasoningToggle = group?.querySelector('[data-hapi-reasoning] button')
        expect(reasoningToggle).toHaveAttribute('aria-label', 'Toggle reasoning')
        expect(group?.querySelector('[data-hapi-reasoning]')).toHaveTextContent('Completed')
        expect(screen.queryByRole('button', { name: 'Reasoning in progress' })).not.toBeInTheDocument()
    })

    it('falls back exactly once for provider HapiReasoning and malformed pseudo artifacts', () => {
        const collision = identifiedTool('provider-reasoning-collision', 'HapiReasoning', {
            query: 'provider-reasoning-input-marker'
        }, {
            result: 'provider-reasoning-result-marker'
        })
        const malformedReasoning = {
            kind: 'agent-reasoning',
            id: 'malformed-reasoning',
            localId: null,
            createdAt: 3,
            text: 42
        } as unknown as ChatBlock
        const { container } = render(<RuntimeHarness blocks={[
            { kind: 'agent-text', id: 'collision-before', localId: null, createdAt: 1, text: 'collision-before-marker' },
            collision,
            malformedReasoning,
            { kind: 'agent-text', id: 'collision-after', localId: null, createdAt: 4, text: 'collision-after-marker' }
        ]} />)

        expect(container.querySelectorAll('[data-hapi-reasoning]')).toHaveLength(0)
        expect(container.querySelectorAll('[data-tool-block-id="provider-reasoning-collision"]')).toHaveLength(1)
        expect(screen.getAllByText('Tool: HapiReasoning')).toHaveLength(1)
        expect(screen.getAllByText('HapiReasoning')).toHaveLength(1)
        const before = screen.getByText('collision-before-marker')
        const provider = container.querySelector('[data-tool-block-id="provider-reasoning-collision"]')
        const malformed = screen.getByText('Tool: HapiReasoning')
        const after = screen.getByText('collision-after-marker')
        expectNodesInOrder([before, provider!, malformed, after])
        expect((container.textContent ?? '').split('42')).toHaveLength(2)
    })

    it('copies assistant text without reasoning and renders no blank assistant message', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText }
        })
        const { container } = render(<RuntimeHarness blocks={[
            { kind: 'agent-text', id: 'copy-before', localId: null, createdAt: 1, text: 'copy-visible-before' },
            {
                kind: 'agent-reasoning', id: 'copy-reasoning', localId: null, createdAt: 2,
                text: 'copy-hidden-reasoning'
            },
            { kind: 'agent-text', id: 'copy-after', localId: null, createdAt: 3, text: 'copy-visible-after' }
        ]} />)

        const copyButtons = screen.getAllByTitle('Copy')
        expect(copyButtons).toHaveLength(1)
        fireEvent.click(copyButtons[0]!)
        await waitFor(() => {
            expect(writeText).toHaveBeenCalledOnce()
            expect(writeText).toHaveBeenCalledWith('copy-visible-before\n\ncopy-visible-after')
        })
        expect(writeText.mock.calls[0]?.[0]).not.toContain('copy-hidden-reasoning')

        const messageRoots = Array.from(container.querySelectorAll<HTMLElement>('[id^="hapi-message-"]'))
        expect(messageRoots.length).toBeGreaterThan(0)
        for (const messageRoot of messageRoots) {
            expect(messageRoot.textContent?.trim().length).toBeGreaterThan(0)
        }
    })
})
