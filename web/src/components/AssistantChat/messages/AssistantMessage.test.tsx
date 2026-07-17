import type { ReactNode } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolCallBlock } from '@/chat/types'
import type { HappyChatMessageMetadata } from '@/lib/assistant-runtime'
import { HappyAssistantMessage } from './AssistantMessage'

type TestMessage = {
    id: string
    role: 'assistant'
    content: Array<{ type: 'text'; text: string } | { type: 'tool-call' }>
    metadata: { custom: Partial<HappyChatMessageMetadata> }
}

const assistantState = vi.hoisted(() => ({
    message: null as unknown as TestMessage
}))

vi.mock('@assistant-ui/react', () => ({
    useAssistantState: (selector: (state: { message: TestMessage }) => unknown) => (
        selector({ message: assistantState.message })
    ),
    MessagePrimitive: {
        Root: (props: { children: ReactNode; id?: string; className?: string }) => (
            <div id={props.id} className={props.className}>{props.children}</div>
        ),
        Content: () => <div data-testid="normal-message-content" />
    }
}))

vi.mock('@/components/ToolCard/RoutineActivityGroup', () => ({
    RoutineActivityGroup: (props: { blocks: ToolCallBlock[] }) => (
        <div data-testid="routine-activity-group">
            {props.blocks.map((block) => block.id).join(',')}
        </div>
    )
}))

vi.mock('@/components/AssistantChat/messages/assistantCopyText', () => ({
    getAssistantCopyText: () => ''
}))

vi.mock('@/hooks/useCopyToClipboard', () => ({
    useCopyToClipboard: () => ({ copied: false, copy: vi.fn() })
}))

function makeToolBlock(name: string): ToolCallBlock {
    return {
        kind: 'tool-call',
        id: `block-${name}`,
        localId: null,
        createdAt: 1,
        children: [],
        tool: {
            id: `tool-${name}`,
            name,
            input: {},
            state: 'completed',
            createdAt: 1,
            startedAt: 1,
            completedAt: 2,
            description: null,
            result: null
        }
    }
}

describe('HappyAssistantMessage activity branch', () => {
    beforeEach(() => {
        assistantState.message = {
            id: 'assistant:ordinary',
            role: 'assistant',
            content: [{ type: 'text', text: 'Hello' }],
            metadata: { custom: { kind: 'assistant' } }
        }
    })

    afterEach(() => cleanup())

    it('renders activity metadata with the group instead of empty content', () => {
        const first = makeToolBlock('Read')
        const second = makeToolBlock('CodexBash')
        assistantState.message = {
            id: 'activity:first',
            role: 'assistant',
            content: [{ type: 'text', text: '' }],
            metadata: {
                custom: {
                    kind: 'activity-group',
                    activityBlocks: [first, second]
                }
            }
        }

        render(<HappyAssistantMessage />)

        expect(screen.getByTestId('routine-activity-group')).toHaveTextContent(
            `${first.id},${second.id}`
        )
        expect(screen.queryByTestId('normal-message-content')).not.toBeInTheDocument()
    })

    it.each([
        {
            kind: 'assistant' as const,
            content: [{ type: 'text', text: 'Hello' }] satisfies TestMessage['content']
        },
        {
            kind: 'tool' as const,
            content: [{ type: 'tool-call' }] satisfies TestMessage['content']
        }
    ])('keeps ordinary $kind content on the existing branch', ({ kind, content }) => {
        assistantState.message = {
            ...assistantState.message,
            content,
            metadata: { custom: { kind } }
        }

        render(<HappyAssistantMessage />)

        expect(screen.getByTestId('normal-message-content')).toBeInTheDocument()
        expect(screen.queryByTestId('routine-activity-group')).not.toBeInTheDocument()
    })
})
