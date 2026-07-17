import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/lib/i18n-context'
import { ReasoningGroup } from './reasoning'

const { useMessageMock } = vi.hoisted(() => ({
    useMessageMock: vi.fn()
}))

vi.mock('@assistant-ui/react', () => ({
    useMessage: () => useMessageMock()
}))

function mockMessage(value: {
    status: { type: string }
    content: Array<{ type: string; text?: string }>
}) {
    useMessageMock.mockReturnValue(value)
}

function renderReasoning() {
    return render(
        <I18nProvider>
            <ReasoningGroup><span>Body</span></ReasoningGroup>
        </I18nProvider>
    )
}

describe('ReasoningGroup', () => {
    afterEach(() => {
        cleanup()
        useMessageMock.mockReset()
        localStorage.removeItem('hapi-lang')
    })

    it('renders a compact unboxed disclosure', () => {
        mockMessage({ status: { type: 'complete' }, content: [] })

        const { container } = renderReasoning()

        const trigger = screen.getByRole('button', { name: /reasoning/i })
        expect(trigger).toHaveAttribute('aria-expanded', 'false')
        expect(trigger).not.toHaveClass('w-full', 'border', 'bg-[var(--app-bg)]')
        expect(container.querySelector('[data-reasoning-body]')).not.toHaveClass('border-l-2')
    })

    it('opens from its semantic button', () => {
        mockMessage({ status: { type: 'complete' }, content: [] })
        renderReasoning()

        const trigger = screen.getByRole('button', { name: /reasoning/i })
        fireEvent.click(trigger)

        expect(trigger).toHaveAttribute('aria-expanded', 'true')
    })

    it('auto-opens while streaming and does not close on completion', () => {
        mockMessage({
            status: { type: 'running' },
            content: [{ type: 'reasoning', text: 'Working' }]
        })

        const view = renderReasoning()
        const trigger = screen.getByRole('button', { name: /reasoning in progress/i })

        expect(trigger).toHaveAttribute('aria-expanded', 'true')

        mockMessage({
            status: { type: 'complete' },
            content: [{ type: 'reasoning', text: 'Done' }]
        })
        view.rerender(
            <I18nProvider>
                <ReasoningGroup><span>Body</span></ReasoningGroup>
            </I18nProvider>
        )
        expect(trigger).toHaveAttribute('aria-expanded', 'true')
        expect(trigger).toHaveAccessibleName('Toggle reasoning')
    })

    it('links the disclosure to a body hidden from accessibility while collapsed', () => {
        mockMessage({ status: { type: 'complete' }, content: [] })
        const { container } = renderReasoning()

        const trigger = screen.getByRole('button', { name: /reasoning/i })
        const body = container.querySelector('[data-reasoning-body]')
        expect(body).toHaveAttribute('id')
        expect(body).toHaveAttribute('hidden')
        expect(trigger).toHaveAttribute('aria-controls', body?.id)

        fireEvent.click(trigger)
        expect(body).not.toHaveAttribute('hidden')
    })

    it('disables disclosure and chevron transitions for reduced motion', () => {
        mockMessage({ status: { type: 'complete' }, content: [] })
        const { container } = renderReasoning()

        const trigger = screen.getByRole('button', { name: /reasoning/i })
        const panel = container.querySelector('[data-reasoning-body]')
        const chevron = trigger.querySelector('svg')
        expect(trigger).toHaveClass('motion-reduce:transition-none')
        expect(panel).toHaveClass('motion-reduce:transition-none')
        expect(chevron).toHaveClass('motion-reduce:transition-none')
    })

    it('disables the streaming pulse for reduced motion', () => {
        mockMessage({
            status: { type: 'running' },
            content: [{ type: 'reasoning', text: 'Working' }]
        })
        const { container } = renderReasoning()

        expect(container.querySelector('.animate-pulse')).toHaveClass('motion-reduce:animate-none')
    })
})
