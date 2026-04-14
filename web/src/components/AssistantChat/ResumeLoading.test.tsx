import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { I18nProvider } from '@/lib/i18n-context'
import { ResumeLoading } from './ResumeLoading'

function renderWithProviders(ui: React.ReactElement) {
    return render(<I18nProvider>{ui}</I18nProvider>)
}

describe('ResumeLoading', () => {
    it('renders loading spinner and text', () => {
        const { container } = renderWithProviders(<ResumeLoading />)

        // Check for spinner (animated div)
        const spinner = container.querySelector('.animate-spin')
        expect(spinner).toBeTruthy()
        expect(spinner?.className).toContain('rounded-full')
        expect(spinner?.className).toContain('border-2')

        // Check for text (either translated or fallback)
        const text = container.textContent
        expect(text).toMatch(/(Resuming session|resume\.resumingSession)/)
    })

    it('has correct styling classes', () => {
        const { container } = renderWithProviders(<ResumeLoading />)
        const wrapper = container.firstChild as HTMLElement

        expect(wrapper.className).toContain('flex')
        expect(wrapper.className).toContain('items-center')
        expect(wrapper.className).toContain('gap-3')
        expect(wrapper.className).toContain('px-4')
        expect(wrapper.className).toContain('py-3')
    })
})
