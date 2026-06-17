import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/lib/i18n-context'
import { DirectorySection } from './DirectorySection'

function renderDirectorySection(overrides: Partial<Parameters<typeof DirectorySection>[0]> = {}) {
    const props: Parameters<typeof DirectorySection>[0] = {
        directory: '',
        suggestions: [],
        selectedIndex: -1,
        isDisabled: false,
        recentPaths: ['/home/huynq/notebooks/hapi'],
        onDirectoryChange: vi.fn(),
        onDirectoryFocus: vi.fn(),
        onDirectoryBlur: vi.fn(),
        onDirectoryKeyDown: vi.fn(),
        onSuggestionSelect: vi.fn(),
        onPathClick: vi.fn(),
        ...overrides,
    }

    render(
        <I18nProvider>
            <DirectorySection {...props} />
        </I18nProvider>
    )

    return props
}

describe('DirectorySection', () => {
    it('shows recent path tail first while preserving full path for action and tooltip', () => {
        const onPathClick = vi.fn()
        renderDirectorySection({ onPathClick })

        const recentPath = screen.getByRole('button', { name: 'hapi — /home/huynq/notebooks' })

        expect(recentPath).toHaveAttribute('title', '/home/huynq/notebooks/hapi')
        fireEvent.click(recentPath)
        expect(onPathClick).toHaveBeenCalledWith('/home/huynq/notebooks/hapi')
    })
})
