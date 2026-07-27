import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionActionMenu } from './SessionActionMenu'

vi.mock('@/lib/use-translation', () => ({
    useTranslation: () => ({
        t: (key: string) => key
    })
}))

afterEach(() => {
    cleanup()
})

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

    it('runs optional compact actions and closes the menu', () => {
        const onClose = vi.fn()
        const onOpenFiles = vi.fn()
        const onUnpin = vi.fn()

        render(
            <SessionActionMenu
                isOpen
                onClose={onClose}
                sessionActive
                onRename={vi.fn()}
                onArchive={vi.fn()}
                onDelete={vi.fn()}
                onOpenFiles={onOpenFiles}
                onUnpin={onUnpin}
                anchorPoint={{ x: 400, y: 80 }}
            />
        )

        fireEvent.click(screen.getByRole('menuitem', { name: 'button.files' }))
        expect(onClose).toHaveBeenCalledTimes(1)
        expect(onOpenFiles).toHaveBeenCalledTimes(1)

        fireEvent.click(screen.getByRole('menuitem', { name: 'dashboard.unpin' }))
        expect(onClose).toHaveBeenCalledTimes(2)
        expect(onUnpin).toHaveBeenCalledTimes(1)
    })
})
