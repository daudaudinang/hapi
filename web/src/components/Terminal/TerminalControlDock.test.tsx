import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    TerminalControlDock,
    type TerminalControlDockProps,
} from './TerminalControlDock'

vi.mock('@/lib/use-translation', () => ({
    useTranslation: () => ({
        t: (key: string) => ({
            'button.cancel': 'Cancel',
            'button.paste': 'Paste',
            'terminal.paste.fallbackTitle': 'Paste input',
            'terminal.paste.fallbackDescription': 'Clipboard read is unavailable. Paste your text below.',
            'terminal.paste.placeholder': 'Paste terminal input here…',
            'terminal.controls.toolbar': 'Terminal controls',
            'terminal.controls.paste': 'Paste',
            'terminal.controls.snippets': 'Snippets',
            'terminal.controls.search': 'Search',
            'terminal.controls.history': 'History',
            'terminal.controls.keyboard': 'Keyboard',
            'terminal.controls.more': 'More',
            'terminal.controls.pasted': 'Pasted',
            'terminal.controls.keyboardPanel': 'Terminal keyboard helpers',
            'terminal.controls.morePanel': 'More terminal keys',
            'terminal.controls.navigation': 'Navigation',
            'terminal.controls.functionKeys': 'Function keys',
            'terminal.controls.symbols': 'Symbols',
        }[key] ?? key),
    }),
}))

const defaultProps: TerminalControlDockProps = {
    disabled: false,
    activeTool: null,
    onActiveToolChange: vi.fn(),
    onFocusTerminal: vi.fn(),
    ctrlActive: false,
    altActive: false,
    onQuickInput: vi.fn(),
    onModifierToggle: vi.fn(),
    onWritePlainInput: vi.fn(() => true),
}

function makeDock(overrides: Partial<TerminalControlDockProps> = {}) {
    return <TerminalControlDock {...defaultProps} {...overrides} />
}

function renderDock(overrides: Partial<TerminalControlDockProps> = {}) {
    return render(makeDock(overrides))
}

afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
})

describe('TerminalControlDock', () => {
    it('renders a slim six-item dock and disables unfinished tools', () => {
        renderDock()

        expect(screen.getByRole('toolbar', { name: 'Terminal controls' })).toHaveClass(
            'min-h-[calc(56px+env(safe-area-inset-bottom))]',
            'pb-[env(safe-area-inset-bottom)]',
            'lg:hidden',
        )
        expect(screen.getAllByRole('button')).toEqual(expect.arrayContaining([
            expect.objectContaining({ textContent: 'Paste' }),
            expect.objectContaining({ textContent: 'Snippets' }),
            expect.objectContaining({ textContent: 'Search' }),
            expect.objectContaining({ textContent: 'History' }),
            expect.objectContaining({ textContent: 'Keyboard' }),
            expect.objectContaining({ textContent: 'More' }),
        ]))
        expect(screen.getByRole('button', { name: 'Snippets' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'History' })).toBeDisabled()
    })

    it('opens an anchored panel instead of a dialog and toggles it closed', () => {
        const onActiveToolChange = vi.fn()
        const { rerender } = renderDock({ activeTool: null, onActiveToolChange })

        fireEvent.click(screen.getByRole('button', { name: 'More' }))
        expect(onActiveToolChange).toHaveBeenCalledWith('more')

        rerender(makeDock({ activeTool: 'more', onActiveToolChange }))
        expect(screen.getByRole('region', { name: 'More terminal keys' })).toHaveClass('absolute')
        expect(screen.queryByRole('dialog', { name: 'More terminal keys' })).not.toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'More' }))
        expect(onActiveToolChange).toHaveBeenLastCalledWith(null)
    })

    it('focuses terminal synchronously from Keyboard pointer-down', () => {
        const onFocusTerminal = vi.fn()
        renderDock({ onFocusTerminal })

        fireEvent.pointerDown(screen.getByRole('button', { name: 'Keyboard' }))
        expect(onFocusTerminal).toHaveBeenCalledTimes(1)
    })

    it('keeps xterm focused when Paste is pressed from the mobile keyboard', () => {
        const onFocusTerminal = vi.fn()
        renderDock({ onFocusTerminal })

        const eventAccepted = fireEvent.pointerDown(screen.getByRole('button', { name: 'Paste' }))

        expect(eventAccepted).toBe(false)
        expect(onFocusTerminal).toHaveBeenCalledTimes(1)
    })

    it('keeps Paste immediate and falls back to manual input', async () => {
        vi.stubGlobal('navigator', {
            clipboard: { readText: vi.fn().mockRejectedValue(new Error('denied')) },
        })
        const onActiveToolChange = vi.fn()
        renderDock({ onActiveToolChange })

        fireEvent.click(screen.getByRole('button', { name: 'Paste' }))
        expect(await screen.findByRole('dialog', { name: 'Paste input' })).toBeInTheDocument()
        expect(onActiveToolChange).not.toHaveBeenCalled()
    })

    it('returns focus to xterm after the manual paste dialog closes', async () => {
        vi.stubGlobal('navigator', {
            clipboard: { readText: vi.fn().mockRejectedValue(new Error('denied')) },
        })
        const onFocusTerminal = vi.fn()
        const onWritePlainInput = vi.fn(() => true)
        renderDock({ onFocusTerminal, onWritePlainInput })

        fireEvent.click(screen.getByRole('button', { name: 'Paste' }))
        const dialog = await screen.findByRole('dialog', { name: 'Paste input' })
        fireEvent.change(within(dialog).getByPlaceholderText('Paste terminal input here…'), {
            target: { value: 'pwd' },
        })
        fireEvent.click(within(dialog).getByRole('button', { name: 'Paste' }))

        await waitFor(() => expect(onFocusTerminal).toHaveBeenCalledTimes(1))
        expect(onWritePlainInput).toHaveBeenCalledWith('pwd')
    })

    it('announces a successful direct paste without selecting a tool', async () => {
        vi.stubGlobal('navigator', {
            clipboard: { readText: vi.fn().mockResolvedValue('pwd') },
        })
        const onWritePlainInput = vi.fn(() => true)
        const onActiveToolChange = vi.fn()
        renderDock({ onWritePlainInput, onActiveToolChange })

        fireEvent.click(screen.getByRole('button', { name: 'Paste' }))
        expect(await screen.findByRole('status')).toHaveTextContent('Pasted')
        expect(onWritePlainInput).toHaveBeenCalledWith('pwd')
        expect(onActiveToolChange).not.toHaveBeenCalled()
    })
})
