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

        fireEvent.click(screen.getByRole('button', { name: 'Input' }))
        fireEvent.click(screen.getByRole('button', { name: 'Select' }))
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
        expect(startHandle).toBeVisible()
        expect(endHandle).toBeVisible()
        expect(startHandle).toHaveClass('h-11', 'w-11')
        expect(endHandle).toHaveClass('h-11', 'w-11')

        fireEvent.pointerDown(startHandle)
        fireEvent.pointerDown(endHandle)
        fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
        fireEvent.click(screen.getByRole('button', { name: 'Select all' }))
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

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
