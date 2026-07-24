import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    MobileTerminalInteractionOverlay,
    type MobileTerminalOverlayProps,
} from './MobileTerminalInteractionOverlay'

vi.mock('@/lib/use-translation', () => ({
    useTranslation: () => ({
        t: (key: string) => ({
            'terminal.interaction.choice': 'Terminal action',
            'terminal.interaction.input': 'Input',
            'terminal.interaction.select': 'Select',
            'terminal.interaction.selectionToolbar': 'Selection actions',
            'terminal.interaction.selectionStart': 'Selection start',
            'terminal.interaction.selectionEnd': 'Selection end',
            'terminal.interaction.copy': 'Copy',
            'terminal.interaction.selectAll': 'Select all',
            'terminal.interaction.cancel': 'Cancel',
            'terminal.interaction.copied': 'Copied',
            'terminal.interaction.copyFailed': 'Could not copy',
        }[key] ?? key),
    }),
}))

const baseProps: MobileTerminalOverlayProps = {
    mode: 'idle',
    choiceAnchor: null,
    startHandle: null,
    endHandle: null,
    toolbarAnchor: null,
    feedback: null,
    onInput: vi.fn(),
    onSelect: vi.fn(),
    onCopy: vi.fn(),
    onSelectAll: vi.fn(),
    onCancel: vi.fn(),
    onSelectionPointerDown: vi.fn(),
    onHandlePointerDown: vi.fn(),
}

afterEach(() => {
    cleanup()
    vi.clearAllMocks()
})

describe('MobileTerminalInteractionOverlay', () => {
    it('renders the choice actions at the supplied anchor', () => {
        render(
            <MobileTerminalInteractionOverlay
                {...baseProps}
                mode="choice"
                choiceAnchor={{ x: 120, y: 80 }}
            />,
        )

        const toolbar = screen.getByRole('toolbar', { name: 'Terminal action' })
        expect(toolbar).toHaveStyle({ left: '120px', top: '80px' })

        const inputAction = screen.getByRole('button', { name: 'Input' })
        const selectAction = screen.getByRole('button', { name: 'Select' })
        expect(inputAction).toHaveClass('min-h-[44px]', 'min-w-[44px]')
        expect(selectAction).toHaveClass('min-h-[44px]', 'min-w-[44px]')

        fireEvent.click(inputAction)
        fireEvent.click(selectAction)
        expect(baseProps.onInput).toHaveBeenCalledOnce()
        expect(baseProps.onSelect).toHaveBeenCalledOnce()
    })

    it('renders handles and routes all selection actions in select mode', () => {
        render(
            <MobileTerminalInteractionOverlay
                {...baseProps}
                mode="select"
                startHandle={{ x: 40, y: 100 }}
                endHandle={{ x: 180, y: 120 }}
                toolbarAnchor={{ x: 110, y: 70 }}
            />,
        )

        const startHandle = screen.getByRole('button', { name: 'Selection start' })
        const endHandle = screen.getByRole('button', { name: 'Selection end' })
        const toolbar = screen.getByRole('toolbar', { name: 'Selection actions' })
        expect(startHandle).toBeVisible()
        expect(endHandle).toBeVisible()
        expect(startHandle).toHaveClass('h-[44px]', 'w-[44px]')
        expect(endHandle).toHaveClass('h-[44px]', 'w-[44px]')

        fireEvent.pointerDown(startHandle)
        fireEvent.pointerDown(endHandle)
        const copyAction = screen.getByRole('button', { name: 'Copy' })
        const selectAllAction = screen.getByRole('button', { name: 'Select all' })
        const cancelAction = screen.getByRole('button', { name: 'Cancel' })
        expect(copyAction).toHaveClass('min-h-[44px]', 'min-w-[44px]')
        expect(selectAllAction).toHaveClass('min-h-[44px]', 'min-w-[44px]')
        expect(cancelAction).toHaveClass('min-h-[44px]', 'min-w-[44px]')

        fireEvent.click(copyAction)
        fireEvent.click(selectAllAction)
        fireEvent.click(cancelAction)

        expect(baseProps.onHandlePointerDown).toHaveBeenNthCalledWith(
            1,
            'start',
            expect.anything(),
        )
        expect(baseProps.onHandlePointerDown).toHaveBeenNthCalledWith(
            2,
            'end',
            expect.anything(),
        )
        expect(baseProps.onCopy).toHaveBeenCalledOnce()
        expect(baseProps.onSelectAll).toHaveBeenCalledOnce()
        expect(baseProps.onCancel).toHaveBeenCalledOnce()
        expect(toolbar).toBeVisible()
    })

    it('routes selection pointer-down without letting toolbar presses bubble', () => {
        render(
            <MobileTerminalInteractionOverlay
                {...baseProps}
                mode="select"
                toolbarAnchor={{ x: 110, y: 70 }}
            />,
        )

        fireEvent.pointerDown(screen.getByTestId('terminal-selection-layer'))
        expect(baseProps.onSelectionPointerDown).toHaveBeenCalledOnce()

        vi.mocked(baseProps.onSelectionPointerDown).mockClear()
        fireEvent.pointerDown(screen.getByRole('toolbar', { name: 'Selection actions' }))
        expect(baseProps.onSelectionPointerDown).not.toHaveBeenCalled()
    })

    it('announces copy failure without removing selection controls', () => {
        render(
            <MobileTerminalInteractionOverlay
                {...baseProps}
                mode="select"
                feedback="copy-error"
            />,
        )

        expect(screen.getByRole('status')).toHaveTextContent('Could not copy')
        expect(screen.getByRole('button', { name: 'Copy' })).toBeVisible()
    })
})
