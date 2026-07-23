import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SessionActionMenu } from './SessionActionMenu'

vi.mock('@/lib/use-translation', () => ({
    useTranslation: () => ({
        t: (key: string) => key
    })
}))

describe('SessionActionMenu', () => {
    it('portals the floating menu outside transformed session modal layout', () => {
        const { container } = render(
            <div data-testid="session-modal">
                <SessionActionMenu
                    isOpen
                    onClose={vi.fn()}
                    sessionActive
                    onRename={vi.fn()}
                    onArchive={vi.fn()}
                    onDelete={vi.fn()}
                    anchorPoint={{ x: 400, y: 80 }}
                />
            </div>
        )

        const floatingSurface = screen.getByRole('menu').parentElement

        expect(floatingSurface?.parentElement).toBe(document.body)
        expect(container.contains(floatingSurface)).toBe(false)
        expect(floatingSurface).toHaveClass('fixed')
    })
})
