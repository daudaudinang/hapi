import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
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
const session = { active: true, thinking: false } as Session
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

const threadComponents = {
    UserMessage: HappyUserMessage,
    AssistantMessage: HappyAssistantMessage,
    SystemMessage: HappySystemMessage
} as const

function RuntimeHarness(props: { blocks: readonly ChatBlock[] }) {
    const runtime = useHappyRuntime({
        session,
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

function markerOffsets(container: HTMLElement): number[] {
    const text = container.textContent ?? ''
    return [
        'reason-before-tools',
        'text-between-runs',
        'assistant-cli-marker',
        'text-after-tools',
        'event-marker',
        'team-mention-marker',
        'user-cli-marker'
    ].map((marker) => text.indexOf(marker))
}

afterEach(cleanup)

describe('Happy assistant actual-runtime tool grouping', () => {
    it('preserves every mixed stream marker and creates only eligible groups', () => {
        const { container } = render(<RuntimeHarness blocks={mixedBlocks} />)
        const markers = [
            'reason-before-tools',
            'text-between-runs',
            'assistant-cli-marker',
            'text-after-tools',
            'event-marker',
            'team-mention-marker',
            'user-cli-marker'
        ]

        for (const marker of markers) {
            expect((container.textContent ?? '').split(marker)).toHaveLength(2)
        }
        expect(markerOffsets(container)).toEqual([...markerOffsets(container)].sort((a, b) => a - b))
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
    })

    it('keeps tool IDs ordered through append, singleton-to-group, and late state boundaries', async () => {
        const readRunning = toolBlock('Read', {}, { state: 'running', completedAt: null })
        const view = render(<RuntimeHarness blocks={[readRunning]} />)
        expect(toolIds(view.container)).toEqual(['block-Read'])
        expect(view.container.querySelector('[data-tool-run-group]')).toBeNull()

        const bashRunning = toolBlock('Bash', {}, { state: 'running', completedAt: null })
        view.rerender(<RuntimeHarness blocks={[readRunning, bashRunning]} />)
        await waitFor(() => {
            expect(toolIds(view.container)).toEqual(['block-Read', 'block-Bash'])
        })
        const groupTrigger = view.container.querySelector('[data-tool-run-group] > button')
        expect(groupTrigger).toHaveAttribute('aria-expanded', 'true')

        view.rerender(<RuntimeHarness blocks={[toolBlock('Read'), toolBlock('Bash')]} />)
        await waitFor(() => {
            expect(toolIds(view.container)).toEqual(['block-Read', 'block-Bash'])
            expect(groupTrigger).toHaveAttribute('aria-expanded', 'true')
        })

        view.rerender(<RuntimeHarness blocks={[
            toolBlock('Read', {}, { state: 'error', result: 'failed' }),
            toolBlock('Bash')
        ]} />)
        await waitFor(() => {
            expect(toolIds(view.container)).toEqual(['block-Read', 'block-Bash'])
            expect(view.container.querySelector('[data-tool-run-group]')).toBeNull()
        })

        view.rerender(<RuntimeHarness blocks={[
            toolBlock('Read'),
            toolBlock('Bash', {}, {
                permission: { id: 'permission-1', status: 'pending' }
            })
        ]} />)
        await waitFor(() => {
            expect(toolIds(view.container)).toEqual(['block-Read', 'block-Bash'])
            expect(view.container.querySelector('[data-tool-run-group]')).toBeNull()
        })
    })

    it('allows pagination remount to reset disclosure but not ordered content', () => {
        const first = render(<RuntimeHarness blocks={mixedBlocks} />)
        const beforeIds = toolIds(first.container)
        const beforeOffsets = markerOffsets(first.container)
        first.unmount()

        const second = render(<RuntimeHarness blocks={mixedBlocks} />)
        expect(toolIds(second.container)).toEqual(beforeIds)
        expect(markerOffsets(second.container)).toEqual(beforeOffsets)
        expect(second.container.querySelectorAll('[data-tool-run-group]')).toHaveLength(3)
        for (const trigger of second.container.querySelectorAll('[data-tool-run-group] > button')) {
            expect(trigger).toHaveAttribute('aria-expanded', 'false')
        }
    })

    it('splits a late child without dropping the child or neighboring tool', () => {
        const read = toolBlock('Read')
        const withChild: ToolCallBlock = {
            ...read,
            children: [{
                kind: 'agent-text',
                id: 'child-text',
                localId: null,
                createdAt: 1001,
                text: 'late-child-marker'
            }]
        }
        const { container } = render(
            <RuntimeHarness blocks={[withChild, toolBlock('Bash')]} />
        )

        expect(toolIds(container)).toEqual(['block-Read', 'block-Bash'])
        expect(container.querySelector('[data-tool-run-group]')).toBeNull()
        expect((container.textContent ?? '').split('late-child-marker')).toHaveLength(2)
    })
})
