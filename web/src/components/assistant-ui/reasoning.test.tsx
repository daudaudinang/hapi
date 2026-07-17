import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

describe('ReasoningGroup', () => {
    afterEach(() => {
        cleanup()
        useMessageMock.mockReset()
    })

    it('starts collapsed with the approved bordered toggle', () => {
        mockMessage({ status: { type: 'complete' }, content: [] })

        render(<ReasoningGroup><span>Body</span></ReasoningGroup>)

        const trigger = screen.getByRole('button', { name: /reasoning/i })
        expect(trigger).toHaveAttribute('aria-expanded', 'false')
        expect(trigger).toHaveClass('border-[var(--app-border)]')
    })

    it('opens from its semantic button', () => {
        mockMessage({ status: { type: 'complete' }, content: [] })
        render(<ReasoningGroup><span>Body</span></ReasoningGroup>)

        const trigger = screen.getByRole('button', { name: /reasoning/i })
        fireEvent.click(trigger)

        expect(trigger).toHaveAttribute('aria-expanded', 'true')
    })

    it('auto-opens while the last message content is streaming reasoning', () => {
        mockMessage({
            status: { type: 'running' },
            content: [{ type: 'reasoning', text: 'Working' }]
        })

        render(<ReasoningGroup><span>Body</span></ReasoningGroup>)

        expect(screen.getByRole('button', { name: /reasoning/i })).toHaveAttribute(
            'aria-expanded',
            'true'
        )
    })

    it('disables disclosure and chevron transitions for reduced motion', () => {
        mockMessage({ status: { type: 'complete' }, content: [] })
        const { container } = render(<ReasoningGroup><span>Body</span></ReasoningGroup>)

        const trigger = screen.getByRole('button', { name: /reasoning/i })
        const panel = container.querySelector('.aui-reasoning-group > div')
        const chevron = trigger.querySelector('svg')
        expect(trigger).toHaveClass('motion-reduce:transition-none')
        expect(panel).toHaveClass('motion-reduce:transition-none')
        expect(chevron).toHaveClass('motion-reduce:transition-none')
    })
})
