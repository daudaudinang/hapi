import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '@/api/client'
import type { ToolCallBlock } from '@/chat/types'
import { HappyChatProvider } from '@/components/AssistantChat/context'
import { I18nProvider } from '@/lib/i18n-context'
import { RoutineActivityGroup } from './RoutineActivityGroup'

vi.mock('@/components/CodeBlock', () => ({
    CodeBlock: ({ code }: { code: string }) => <pre>{code}</pre>
}))

function makeToolBlock(
    name: string,
    input: unknown = {},
    overrides: Partial<ToolCallBlock['tool']> = {}
): ToolCallBlock {
    return {
        kind: 'tool-call',
        id: `block-${name}-${overrides.state ?? 'completed'}`,
        localId: null,
        createdAt: 1,
        children: [],
        tool: {
            id: `tool-${name}`,
            name,
            input,
            state: 'completed',
            createdAt: 1,
            startedAt: 1,
            completedAt: 2,
            description: null,
            result: null,
            ...overrides
        }
    }
}

const api = {} as ApiClient
const contextValue = {
    api,
    sessionId: 'session-1',
    metadata: null,
    disabled: false,
    onRefresh: vi.fn()
}

const readBlock = makeToolBlock('Read', { file_path: '/workspace/a.ts' })
const bashBlock = makeToolBlock('CodexBash', { command: 'bun test' })
const globBlock = makeToolBlock('Glob', { pattern: '**/*.ts' })
const grepBlock = makeToolBlock('Grep', { pattern: 'ActivityGroup' })

function renderGroup(blocks: ToolCallBlock[]) {
    localStorage.setItem('hapi-lang', 'en')
    return render(
        <I18nProvider>
            <HappyChatProvider value={contextValue}>
                <RoutineActivityGroup blocks={blocks} />
            </HappyChatProvider>
        </I18nProvider>
    )
}

describe('RoutineActivityGroup', () => {
    beforeEach(() => localStorage.clear())
    afterEach(() => cleanup())

    it('starts open with a bounded summary, rail, and all source rows', () => {
        const { container } = renderGroup([
            readBlock,
            bashBlock,
            globBlock,
            grepBlock
        ])
        const toggle = screen.getByRole('button', { name: /4 background actions/i })

        expect(toggle).toHaveAttribute('aria-expanded', 'true')
        expect(toggle).toHaveTextContent('Terminal')
        expect(toggle).toHaveTextContent('**/*.ts')
        expect(toggle).not.toHaveTextContent('ActivityGroup')
        expect(screen.getByRole('region', { name: /background actions/i })).toBeVisible()
        expect(container.querySelectorAll('[data-tool-display="activity-row"]')).toHaveLength(4)
    })

    it('collapses and reopens without losing source rows', () => {
        const { container } = renderGroup([readBlock, bashBlock])
        const toggle = screen.getByRole('button', { name: /2 background actions/i })

        fireEvent.click(toggle)
        expect(toggle).toHaveAttribute('aria-expanded', 'false')
        expect(screen.queryByRole('region', { name: /background actions/i })).not.toBeInTheDocument()

        fireEvent.click(toggle)
        expect(screen.getByRole('region', { name: /background actions/i })).toBeVisible()
        expect(container.querySelectorAll('[data-tool-display="activity-row"]')).toHaveLength(2)
    })

    it('keeps row details interactive through the shared ToolCard dialog', () => {
        renderGroup([readBlock, bashBlock])
        const region = screen.getByRole('region', { name: /background actions/i })

        fireEvent.click(within(region).getByRole('button', { name: /terminal/i }))

        expect(screen.getByRole('dialog')).toHaveTextContent('Input')
        expect(screen.getByRole('dialog')).toHaveTextContent('bun test')
    })

    it('keeps running and error status semantics visible', () => {
        const running = makeToolBlock('CodexBash', {}, { state: 'running' })
        const failed = makeToolBlock('Read', {}, { state: 'error' })
        renderGroup([running, failed])

        expect(screen.getByLabelText('running')).toBeVisible()
        expect(screen.getByLabelText('error')).toBeVisible()
    })

    it('keeps disclosure focusable and prevents narrow-row overflow', () => {
        const { container } = renderGroup([
            readBlock,
            makeToolBlock('CodexBash', { command: 'x'.repeat(400) })
        ])
        const toggle = screen.getByRole('button', { name: /2 background actions/i })
        toggle.focus()
        fireEvent.click(toggle)

        expect(toggle).toHaveAttribute('aria-expanded', 'false')
        expect(container.firstElementChild).toHaveClass('min-w-0', 'max-w-full')
    })

    it('exposes the disclosure relationship to assistive technology', () => {
        renderGroup([readBlock, bashBlock])
        const toggle = screen.getByRole('button', { name: /2 background actions/i })
        const region = screen.getByRole('region', { name: /background actions/i })

        expect(toggle).toHaveAttribute('aria-controls', region.id)
        expect(within(region).getAllByRole('button')).toHaveLength(2)
    })
})
