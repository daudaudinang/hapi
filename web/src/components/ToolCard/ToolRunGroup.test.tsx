import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ToolCallMessagePartProps } from '@assistant-ui/react'
import type { ChatBlock, ToolCallBlock } from '@/chat/types'
import type { ToolRunPart } from '@/components/ToolCard/toolRunModel'
import { ToolRunGroup } from '@/components/ToolCard/ToolRunGroup'
import {
    ToolRunLayoutProvider,
    useToolRunLayout
} from '@/components/ToolCard/toolRunContext'
import { HappyToolMessage } from '@/components/AssistantChat/messages/ToolMessage'

const assistantState = vi.hoisted(() => ({ parts: [] as ToolRunPart[] }))

vi.mock('@assistant-ui/react', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@assistant-ui/react')>()
    return {
        ...actual,
        useAssistantState: (selector: (state: {
            message: { content: ToolRunPart[]; parts: ToolRunPart[] }
        }) => unknown) => selector({
            message: { content: assistantState.parts, parts: assistantState.parts }
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

function part(artifact: unknown): ToolRunPart {
    return { type: 'tool-call', artifact }
}

function setMessageParts(parts: ToolRunPart[]) {
    assistantState.parts = parts
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
    return (
        <span data-testid={props.name} data-grouped={useToolRunLayout()}>
            {props.children}
        </span>
    )
}

afterEach(cleanup)

describe('ToolRunGroup', () => {
    it('wraps two allowlisted children and preserves a boundary child exactly once', () => {
        setMessageParts([part(block('Read')), part(block('Bash')), part(block('Agent'))])

        render(
            <ToolRunGroup startIndex={0} endIndex={2}>
                <LayoutProbe name="read">read-child</LayoutProbe>
                <LayoutProbe name="bash">bash-child</LayoutProbe>
                <LayoutProbe name="agent">agent-child</LayoutProbe>
            </ToolRunGroup>
        )

        expect(screen.getAllByText('read-child')).toHaveLength(1)
        expect(screen.getAllByText('bash-child')).toHaveLength(1)
        expect(screen.getAllByText('agent-child')).toHaveLength(1)
        expect(screen.getAllByTestId('tool-run-group')).toHaveLength(1)
        expect(screen.getByTestId('read')).toHaveAttribute('data-grouped', 'true')
        expect(screen.getByTestId('bash')).toHaveAttribute('data-grouped', 'true')
        expect(screen.getByTestId('agent')).toHaveAttribute('data-grouped', 'false')
    })

    it('maps a non-zero inclusive range to children without duplication', () => {
        setMessageParts([
            { type: 'text' },
            part(block('Read')),
            part({ kind: 'cli-output' }),
            part(block('Grep')),
            part(block('Glob')),
            { type: 'text' }
        ])

        render(
            <ToolRunGroup startIndex={1} endIndex={4}>
                <span>read</span>
                <span>cli</span>
                <span>grep</span>
                <span>glob</span>
            </ToolRunGroup>
        )

        for (const text of ['read', 'cli', 'grep', 'glob']) {
            expect(screen.getAllByText(text)).toHaveLength(1)
        }
        expect(screen.getAllByTestId('tool-run-group')).toHaveLength(1)
        expect(screen.getByTestId('tool-run-group')).toHaveAttribute(
            'data-tool-run-id',
            'tool-run:block-Grep'
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
    it('passes group-row only when rendered inside the tool run provider', () => {
        const props = toolMessageProps(block('Read'))
        const standalone = render(<HappyToolMessage {...props} />)
        expect(screen.getByTestId('tool-card')).toHaveAttribute('data-display-mode', 'card')
        standalone.unmount()

        render(
            <ToolRunLayoutProvider>
                <HappyToolMessage {...props} />
            </ToolRunLayoutProvider>
        )
        expect(screen.getByTestId('tool-card')).toHaveAttribute('data-display-mode', 'group-row')
    })
})
