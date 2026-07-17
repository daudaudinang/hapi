import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ToolCallMessagePartProps } from '@assistant-ui/react'
import type { AgentReasoningBlock, ChatBlock, ToolCallBlock } from '@/chat/types'
import type { ActivityPart } from '@/components/ToolCard/toolRunModel'
import { ToolRunGroup } from '@/components/ToolCard/ToolRunGroup'
import {
    ToolRunLayoutProvider,
    useToolRunLayout
} from '@/components/ToolCard/toolRunContext'
import { HappyToolMessage } from '@/components/AssistantChat/messages/ToolMessage'

const assistantState = vi.hoisted(() => ({
    parts: [] as ActivityPart[],
    status: { type: 'complete' }
}))

vi.mock('@assistant-ui/react', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@assistant-ui/react')>()
    return {
        ...actual,
        useAssistantState: (selector: (state: {
            message: {
                content: ActivityPart[]
                parts: ActivityPart[]
                status: { type: string }
            }
        }) => unknown) => selector({
            message: {
                content: assistantState.parts,
                parts: assistantState.parts,
                status: assistantState.status
            }
        })
    }
})

vi.mock('@/lib/use-translation', () => ({
    useTranslation: () => ({
        t: (key: string, params?: Record<string, string | number>) =>
            `${key}:${params ? JSON.stringify(params) : ''}`
    })
}))

vi.mock('@/components/AssistantChat/context', () => ({
    useHappyChatContext: () => ({
        api: undefined,
        sessionId: 'session-1',
        metadata: null,
        disabled: false,
        onRefresh: vi.fn()
    })
}))

vi.mock('@/components/ToolCard/ToolCard', () => ({
    ToolCard: (props: { displayMode?: string; block: ToolCallBlock }) => (
        <div data-testid="tool-card" data-display-mode={props.displayMode}>
            {props.block.tool.name}
        </div>
    )
}))

type BlockOptions = {
    state?: ToolCallBlock['tool']['state']
    completedAt?: number | null
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
            input: {},
            state: options.state ?? 'completed',
            createdAt: 1000,
            startedAt: 1000,
            completedAt: options.completedAt === undefined ? 2000 : options.completedAt,
            description: null
        }
    }
}

function reasoning(id: string): AgentReasoningBlock {
    return {
        kind: 'agent-reasoning',
        id,
        localId: null,
        createdAt: 1000,
        text: `${id} body`
    }
}

function part(artifact: unknown): ActivityPart {
    return {
        type: 'tool-call',
        toolCallId: artifact && typeof artifact === 'object' && 'kind' in artifact
            && artifact.kind === 'agent-reasoning' && 'id' in artifact
            ? `reasoning:${String(artifact.id)}`
            : undefined,
        artifact
    }
}

function setMessageParts(parts: ActivityPart[], status: 'running' | 'complete' = 'complete') {
    assistantState.parts = parts
    assistantState.status = { type: status }
}

function toolMessageProps(artifact: ToolCallBlock): ToolCallMessagePartProps {
    return {
        type: 'tool-call',
        toolName: artifact.tool.name,
        toolCallId: artifact.tool.id,
        args: {},
        argsText: '{}',
        artifact,
        result: artifact.tool.result,
        isError: false,
        status: { type: 'complete' },
        addResult: vi.fn(),
        resume: vi.fn()
    }
}

function LayoutProbe(props: { name: string; children: ReactNode }) {
    const layout = useToolRunLayout()
    return (
        <span data-testid={props.name} data-grouped={layout.grouped} data-now={layout.now}>
            {props.children}
        </span>
    )
}

afterEach(cleanup)

describe('ToolRunGroup', () => {
    it('groups five reasoning and tool activities in original order with the approved header', () => {
        const first = block('CodexReasoning')
        const terminal = block('Bash')
        const diff = block('CodexDiff')
        const thought = reasoning('reason-middle')
        const patch = block('CodexPatch', { completedAt: 5000 })
        setMessageParts([
            part(first),
            part(terminal),
            part(diff),
            part(thought),
            part(patch)
        ])

        const { container } = render(
            <ToolRunGroup startIndex={0} endIndex={4}>
                <span>reasoning-title</span>
                <span>terminal-child</span>
                <span>diff-child</span>
                <span>reasoning-generic</span>
                <span>patch-child</span>
            </ToolRunGroup>
        )

        const group = screen.getByTestId('tool-run-group')
        const trigger = screen.getByRole('button')
        expect(group).toHaveClass('w-full', 'max-w-[600px]')
        expect(trigger).toHaveAttribute('aria-expanded', 'false')
        expect(trigger).toHaveAccessibleName(/tool\.group\.toggleActivities/)
        expect(trigger).toHaveTextContent('tool.group.activitiesCompleted:{"count":5}')
        expect(trigger).toHaveTextContent('4.0s')
        expect(trigger).not.toHaveTextContent('Terminal')
        expect(trigger).not.toHaveTextContent('Diff')
        expect(trigger.querySelector('.rounded-full')).toBeNull()
        expect(trigger.querySelector('.h-2.w-2')).toBeNull()
        expect(trigger.querySelector('time')).toBeNull()

        const orderedText = container.textContent ?? ''
        const labels = [
            'reasoning-title',
            'terminal-child',
            'diff-child',
            'reasoning-generic',
            'patch-child'
        ]
        for (const label of labels) {
            expect(screen.getAllByText(label)).toHaveLength(1)
        }
        expect(labels.map((label) => orderedText.indexOf(label))).toEqual(
            [...labels].map((label) => orderedText.indexOf(label)).sort((a, b) => a - b)
        )
    })

    it('renders an internal boundary exactly once between two valid activity groups', () => {
        const before = reasoning('reason-before')
        setMessageParts([
            { type: 'text' },
            part(before),
            part(block('Bash')),
            part(block('Agent')),
            part(block('CodexDiff')),
            part(block('CodexPatch')),
            { type: 'text' }
        ])

        const { container } = render(
            <ToolRunGroup startIndex={1} endIndex={5}>
                <span>reason-before</span>
                <span>terminal-before</span>
                <span>boundary</span>
                <span>diff-after</span>
                <span>patch-after</span>
            </ToolRunGroup>
        )

        for (const text of ['reason-before', 'terminal-before', 'boundary', 'diff-after', 'patch-after']) {
            expect(screen.getAllByText(text)).toHaveLength(1)
        }
        expect(screen.getAllByTestId('tool-run-group')).toHaveLength(2)
        expect(container.textContent).toMatch(
            /reason-before.*terminal-before.*boundary.*diff-after.*patch-after/
        )
    })

    it('uses a mount-only default and keeps children mounted while closed', () => {
        setMessageParts([part(block('Read')), part(block('Bash'))])
        const view = render(
            <ToolRunGroup startIndex={0} endIndex={1}>
                <span>read-child</span>
                <span>bash-child</span>
            </ToolRunGroup>
        )
        const trigger = screen.getByRole('button')
        expect(trigger).toHaveAttribute('aria-expanded', 'false')
        expect(screen.getByText('read-child')).toBeInTheDocument()

        fireEvent.click(trigger)
        expect(trigger).toHaveAttribute('aria-expanded', 'true')

        setMessageParts([
            part(block('Read', { state: 'running', completedAt: null })),
            part(block('Bash', { state: 'running', completedAt: null }))
        ])
        view.rerender(
            <ToolRunGroup startIndex={0} endIndex={1}>
                <span>read-child</span>
                <span>bash-child</span>
            </ToolRunGroup>
        )
        expect(trigger).toHaveAttribute('aria-expanded', 'true')
    })

    it('does not auto-close when a mounted running group completes', () => {
        setMessageParts([
            part(block('Read', { state: 'running', completedAt: null })),
            part(block('Bash', { state: 'running', completedAt: null }))
        ])
        const view = render(
            <ToolRunGroup startIndex={0} endIndex={1}>
                <span>body</span>
                <span>tail</span>
            </ToolRunGroup>
        )
        expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true')

        setMessageParts([part(block('Read')), part(block('Bash'))])
        view.rerender(
            <ToolRunGroup startIndex={0} endIndex={1}>
                <span>body</span>
                <span>tail</span>
            </ToolRunGroup>
        )
        expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true')
    })

    it('opens when the final generic reasoning is the running message part and stays open on completion', () => {
        const finalReasoning = reasoning('reason-final')
        setMessageParts([
            part(block('Bash')),
            part(finalReasoning)
        ], 'running')
        const view = render(
            <ToolRunGroup startIndex={0} endIndex={1}>
                <span>terminal</span>
                <span>reasoning</span>
            </ToolRunGroup>
        )
        const trigger = screen.getByRole('button')
        expect(trigger).toHaveAttribute('aria-expanded', 'true')
        expect(trigger).toHaveTextContent('tool.group.activitiesRunning:{"count":2}')

        setMessageParts([part(block('Bash')), part(finalReasoning)], 'complete')
        view.rerender(
            <ToolRunGroup startIndex={0} endIndex={1}>
                <span>terminal</span>
                <span>reasoning</span>
            </ToolRunGroup>
        )
        expect(trigger).toHaveAttribute('aria-expanded', 'true')
        expect(trigger).toHaveTextContent('tool.group.activitiesCompleted:{"count":2}')
    })

    it('renders a singleton without a group wrapper', () => {
        setMessageParts([part(block('Read'))])
        const { container } = render(
            <ToolRunGroup startIndex={0} endIndex={0}>
                <span>only</span>
            </ToolRunGroup>
        )

        expect(screen.getByText('only')).toBeInTheDocument()
        expect(container.querySelector('[data-tool-run-group]')).toBeNull()
    })

    it('keeps unknown and child-bearing tools outside the layout provider', () => {
        setMessageParts([
            part({ kind: 'unknown' }),
            part(block('Read', { children: [block('Bash')] })),
            part(block('Bash'))
        ])

        render(
            <ToolRunGroup startIndex={0} endIndex={2}>
                <LayoutProbe name="unknown">unknown</LayoutProbe>
                <LayoutProbe name="children">children</LayoutProbe>
                <LayoutProbe name="single">single</LayoutProbe>
            </ToolRunGroup>
        )

        expect(screen.queryByTestId('tool-run-group')).not.toBeInTheDocument()
        for (const testId of ['unknown', 'children', 'single']) {
            expect(screen.getByTestId(testId)).toHaveAttribute('data-grouped', 'false')
        }
    })
})

describe('HappyToolMessage group layout', () => {
    it('uses group-row for safe singletons and grouped tools but keeps special tools as cards', () => {
        const props = toolMessageProps(block('Read'))
        const standalone = render(<HappyToolMessage {...props} />)
        expect(screen.getByTestId('tool-card')).toHaveAttribute('data-display-mode', 'group-row')
        standalone.unmount()

        render(
            <ToolRunLayoutProvider now={1000}>
                <HappyToolMessage {...props} />
            </ToolRunLayoutProvider>
        )
        expect(screen.getByTestId('tool-card')).toHaveAttribute('data-display-mode', 'group-row')

        cleanup()
        render(<HappyToolMessage {...toolMessageProps(block('Agent'))} />)
        expect(screen.getByTestId('tool-card')).toHaveAttribute('data-display-mode', 'card')
    })

    it('shows an exact grouped Codex reasoning duration from the shared clock', () => {
        const artifact = block('CodexReasoning', { completedAt: 5600 })
        render(
            <ToolRunLayoutProvider now={5600}>
                <HappyToolMessage {...toolMessageProps(artifact)} />
            </ToolRunLayoutProvider>
        )

        expect(screen.getByText('4.6s')).toHaveAccessibleName(
            'tool.group.activityDuration:{"duration":"4.6s"}'
        )
    })
})
