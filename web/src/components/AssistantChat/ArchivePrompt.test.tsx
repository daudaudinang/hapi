import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { I18nProvider } from '@/lib/i18n-context'
import { ArchivePrompt } from './ArchivePrompt'

function renderWithProviders(ui: React.ReactElement) {
    return render(<I18nProvider>{ui}</I18nProvider>)
}

describe('ArchivePrompt', () => {
    it('renders without crashing', () => {
        const { container } = renderWithProviders(<ArchivePrompt reason="Test error" onDismiss={vi.fn()} />)
        expect(container.firstChild).toBeTruthy()
    })

    it('renders reason when provided', () => {
        const { container } = renderWithProviders(<ArchivePrompt reason="Test error" onDismiss={vi.fn()} />)
        expect(container.textContent).toContain('Test error')
    })

    it('calls onDismiss when first button is clicked', () => {
        const onDismiss = vi.fn()
        const { container } = renderWithProviders(<ArchivePrompt reason="Test error" onDismiss={onDismiss} />)

        const buttons = container.querySelectorAll('button')
        expect(buttons.length).toBeGreaterThan(0)

        fireEvent.click(buttons[0])
        expect(onDismiss).toHaveBeenCalledTimes(1)
    })

    it('calls onNavigate when second button is clicked', () => {
        const onDismiss = vi.fn()
        const onNavigate = vi.fn()
        const { container } = renderWithProviders(
            <ArchivePrompt reason="Test error" onDismiss={onDismiss} onNavigate={onNavigate} />
        )

        const buttons = container.querySelectorAll('button')
        expect(buttons.length).toBe(2)

        fireEvent.click(buttons[1])
        expect(onNavigate).toHaveBeenCalledTimes(1)
    })

    it('only renders one button when onNavigate not provided', () => {
        const onDismiss = vi.fn()
        const { container } = renderWithProviders(<ArchivePrompt reason="Test error" onDismiss={onDismiss} />)

        const buttons = container.querySelectorAll('button')
        expect(buttons.length).toBe(1)
    })

    it('does not render reason when not provided', () => {
        const onDismiss = vi.fn()
        const { container } = renderWithProviders(<ArchivePrompt onDismiss={onDismiss} />)

        expect(container.textContent).not.toContain('Test error')
    })
})
