import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
    AppDialog,
    AppDialogBody,
    AppDialogContent,
    AppDialogFooter,
    AppDialogHeader,
} from './app-dialog'

describe('AppDialog', () => {
    afterEach(() => cleanup())

    it('renders shared header slots and one accessible close control', () => {
        render(
            <AppDialog open>
                <AppDialogContent data-testid="content" className="h-[85vh] max-w-3xl">
                    <AppDialogHeader
                        icon={<span data-testid="icon">T</span>}
                        title="Terminal"
                        subtitle="/repo"
                        meta={<span>connected</span>}
                        actions={<button type="button">Refresh</button>}
                    />
                    <AppDialogBody>Body</AppDialogBody>
                    <AppDialogFooter>Footer</AppDialogFooter>
                </AppDialogContent>
            </AppDialog>
        )

        expect(screen.getByRole('heading', { name: 'Terminal' })).toBeInTheDocument()
        expect(screen.getByText('/repo')).toBeInTheDocument()
        expect(screen.getByText('connected')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
        expect(screen.getAllByRole('button', { name: 'Close' })).toHaveLength(1)
        expect(screen.getByTestId('content')).toHaveClass('h-[85vh]', 'max-w-3xl')
        expect(document.querySelector('[data-app-dialog-footer]')).toHaveTextContent('Footer')
    })

    it('uses a slim outline visual inside a larger close hit area', () => {
        render(
            <AppDialog open>
                <AppDialogContent>
                    <AppDialogHeader title="Settings" />
                    <AppDialogBody>Body</AppDialogBody>
                </AppDialogContent>
            </AppDialog>
        )

        const close = screen.getByRole('button', { name: 'Close' })
        expect(close).toHaveClass('h-[36px]', 'w-[36px]')
        expect(close.firstElementChild).toHaveClass('h-[28px]', 'w-[28px]', 'border')
        expect(screen.getByText('Settings dialog')).toHaveClass('sr-only')
        expect(document.querySelector('[data-app-dialog-footer]')).not.toBeInTheDocument()
    })

    it('lets non-dismissible feature dialogs keep their existing Escape behavior', () => {
        function Harness() {
            const [open, setOpen] = useState(true)
            return (
                <AppDialog open={open} onOpenChange={setOpen}>
                    <AppDialogContent dismissible={false}>
                        <AppDialogHeader title="Destructive action" />
                        <AppDialogBody>Body</AppDialogBody>
                    </AppDialogContent>
                </AppDialog>
            )
        }

        render(<Harness />)
        fireEvent.keyDown(document, { key: 'Escape' })

        expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('can disable the shared close control while a feature action is pending', () => {
        render(
            <AppDialog open>
                <AppDialogContent>
                    <AppDialogHeader title="Saving" closeDisabled />
                </AppDialogContent>
            </AppDialog>
        )

        expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled()
    })
})
