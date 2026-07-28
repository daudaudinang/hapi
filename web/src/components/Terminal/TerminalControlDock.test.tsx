import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState, type ReactNode } from 'react'
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
            'terminal.controls.keys': 'Keys',
            'terminal.controls.more': 'More',
            'terminal.controls.pasted': 'Pasted',
            'terminal.controls.keysPanel': 'Terminal helper keys',
            'terminal.controls.morePanel': 'More terminal keys',
            'terminal.controls.navigation': 'Navigation',
            'terminal.controls.functionKeys': 'Function keys',
            'terminal.controls.symbols': 'Symbols',
            'terminal.snippets.title': 'Snippets',
            'terminal.snippets.insertOnly': 'Insert only · does not run',
            'terminal.snippets.new': 'New',
            'terminal.snippets.close': 'Close snippets',
            'terminal.snippets.search': 'Search snippets',
            'terminal.snippets.tabs': 'Snippet sources',
            'terminal.snippets.builtIn': 'Built-in',
            'terminal.snippets.mySnippets': 'My snippets',
            'terminal.snippets.insert': 'Insert',
            'terminal.snippets.insertFailed': 'Could not insert the snippet.',
            'terminal.snippets.inserted': 'Inserted · not executed',
            'terminal.snippets.group.navigation': 'Navigation',
            'terminal.snippets.group.git': 'Git',
            'terminal.snippets.group.system': 'System',
            'terminal.snippets.builtin.pwd.name': 'Working directory',
            'terminal.snippets.builtin.pwd.description': 'Show the current directory.',
            'terminal.snippets.builtin.list.name': 'List files',
            'terminal.snippets.builtin.list.description': 'List all files with details.',
            'terminal.snippets.builtin.clear.name': 'Clear terminal',
            'terminal.snippets.builtin.clear.description': 'Clear the terminal screen.',
            'terminal.snippets.builtin.gitStatus.name': 'Git status',
            'terminal.snippets.builtin.gitStatus.description': 'Show a concise working tree status.',
            'terminal.snippets.builtin.gitDiff.name': 'Git diff',
            'terminal.snippets.builtin.gitDiff.description': 'Show unstaged changes.',
            'terminal.snippets.builtin.gitLog.name': 'Recent commits',
            'terminal.snippets.builtin.gitLog.description': 'Show the ten latest commits.',
            'terminal.snippets.builtin.processes.name': 'Processes',
            'terminal.snippets.builtin.processes.description': 'Show running processes.',
            'terminal.snippets.builtin.disk.name': 'Disk usage',
            'terminal.snippets.builtin.disk.description': 'Show filesystem disk usage.',
        }[key] ?? key),
        locale: 'en',
    }),
}))

const defaultProps: TerminalControlDockProps = {
    api: null,
    disabled: false,
    activeTool: null,
    onActiveToolChange: vi.fn(),
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
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    return render(makeDock(overrides), { wrapper })
}

function ControlledDock(props: {
    onWritePlainInput: (text: string) => boolean
}) {
    const [activeTool, setActiveTool] = useState<TerminalControlDockProps['activeTool']>(null)
    return (
        <TerminalControlDock
            {...defaultProps}
            activeTool={activeTool}
            onActiveToolChange={setActiveTool}
            onWritePlainInput={props.onWritePlainInput}
        />
    )
}

afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
})

describe('TerminalControlDock', () => {
    it('renders a slim six-item dock with Snippets enabled and History disabled', () => {
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
            expect.objectContaining({ textContent: 'Keys' }),
            expect.objectContaining({ textContent: 'More' }),
        ]))
        expect(screen.getByRole('button', { name: 'Snippets' })).toBeEnabled()
        expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'History' })).toBeDisabled()
    })

    it('opens Snippets in a floating region rather than a dialog', () => {
        const onActiveToolChange = vi.fn()
        const rendered = renderDock({ onActiveToolChange })

        fireEvent.click(screen.getByRole('button', { name: 'Snippets' }))
        expect(onActiveToolChange).toHaveBeenCalledWith('snippets')

        rendered.rerender(makeDock({
            activeTool: 'snippets',
            onActiveToolChange,
        }))

        const panel = screen.getByRole('region', { name: 'Snippets' })
        expect(panel.parentElement).toHaveAttribute('role', 'region')
        expect(panel.parentElement).toHaveClass('absolute')
        expect(screen.queryByRole('dialog', { name: 'Snippets' })).not.toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Snippets' }))
        expect(onActiveToolChange).toHaveBeenLastCalledWith(null)
    })

    it('inserts an exact snippet without executing it and keeps feedback after closing', () => {
        const onWritePlainInput = vi.fn<(text: string) => boolean>(() => true)
        const queryClient = new QueryClient()
        render(
            <QueryClientProvider client={queryClient}>
                <ControlledDock onWritePlainInput={onWritePlainInput} />
            </QueryClientProvider>,
        )

        fireEvent.click(screen.getByRole('button', { name: 'Snippets' }))
        fireEvent.click(screen.getByRole('button', { name: 'Insert Git status' }))

        expect(onWritePlainInput).toHaveBeenCalledWith('git status --short')
        expect(onWritePlainInput.mock.calls[0][0]).not.toMatch(/[\r\n]/)
        expect(screen.queryByRole('region', { name: 'Snippets' })).not.toBeInTheDocument()
        expect(screen.getByRole('status')).toHaveTextContent('Inserted · not executed')
    })

    it('keeps Snippets open when inserting into the terminal fails', () => {
        const onWritePlainInput = vi.fn(() => false)
        const queryClient = new QueryClient()
        render(
            <QueryClientProvider client={queryClient}>
                <ControlledDock onWritePlainInput={onWritePlainInput} />
            </QueryClientProvider>,
        )

        fireEvent.click(screen.getByRole('button', { name: 'Snippets' }))
        fireEvent.click(screen.getByRole('button', { name: 'Insert Working directory' }))

        expect(onWritePlainInput).toHaveBeenCalledWith('pwd')
        expect(screen.getByRole('region', { name: 'Snippets' })).toBeVisible()
        expect(screen.getByRole('status')).toHaveTextContent('Could not insert the snippet.')
    })

    it('cleans up live snippet feedback when the dock unmounts', () => {
        vi.useFakeTimers()
        const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
        const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')
        const queryClient = new QueryClient()
        const rendered = render(
            <QueryClientProvider client={queryClient}>
                <ControlledDock onWritePlainInput={() => true} />
            </QueryClientProvider>,
        )

        fireEvent.click(screen.getByRole('button', { name: 'Snippets' }))
        fireEvent.click(screen.getByRole('button', { name: 'Insert Git status' }))
        expect(screen.getByRole('status')).toHaveTextContent('Inserted · not executed')

        const feedbackTimer = setTimeoutSpy.mock.results.find((_, index) => (
            setTimeoutSpy.mock.calls[index]?.[1] === 1200
        ))?.value
        expect(feedbackTimer).toBeDefined()

        rendered.unmount()

        expect(clearTimeoutSpy).toHaveBeenCalledWith(feedbackTimer)
        act(() => vi.runOnlyPendingTimers())
        expect(screen.queryByRole('status')).not.toBeInTheDocument()
        expect(screen.queryByRole('region', { name: 'Snippets' })).not.toBeInTheDocument()
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

    it('opens the Keys helper panel', () => {
        const onActiveToolChange = vi.fn()
        const rendered = renderDock({ onActiveToolChange })

        fireEvent.click(screen.getByRole('button', { name: 'Keys' }))

        expect(onActiveToolChange).toHaveBeenCalledWith('keys')
        rendered.rerender(makeDock({
            activeTool: 'keys',
            onActiveToolChange,
        }))
        expect(screen.getByRole('region', { name: 'Terminal helper keys' })).toBeVisible()
    })

    it('pastes directly without summoning manual input', async () => {
        vi.stubGlobal('navigator', {
            clipboard: { readText: vi.fn().mockResolvedValue('pwd') },
        })
        const onWritePlainInput = vi.fn(() => true)
        renderDock({ onWritePlainInput })

        fireEvent.click(screen.getByRole('button', { name: 'Paste' }))

        await waitFor(() => expect(onWritePlainInput).toHaveBeenCalledWith('pwd'))
        expect(screen.queryByRole('dialog', { name: 'Paste input' })).not.toBeInTheDocument()
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

    it('submits manual paste input', async () => {
        vi.stubGlobal('navigator', {
            clipboard: { readText: vi.fn().mockRejectedValue(new Error('denied')) },
        })
        const onWritePlainInput = vi.fn(() => true)
        renderDock({ onWritePlainInput })

        fireEvent.click(screen.getByRole('button', { name: 'Paste' }))
        const dialog = await screen.findByRole('dialog', { name: 'Paste input' })
        fireEvent.change(within(dialog).getByPlaceholderText('Paste terminal input here…'), {
            target: { value: 'pwd' },
        })
        fireEvent.click(within(dialog).getByRole('button', { name: 'Paste' }))

        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Paste input' })).not.toBeInTheDocument())
        expect(onWritePlainInput).toHaveBeenCalledWith('pwd')
    })

    it('routes helper sequences through onQuickInput', () => {
        const onQuickInput = vi.fn()
        renderDock({ activeTool: 'keys', onQuickInput })

        fireEvent.click(screen.getByRole('button', { name: 'Escape' }))

        expect(onQuickInput).toHaveBeenCalledWith('\u001b')
    })

    it('routes Ctrl and Alt through onModifierToggle', () => {
        const onModifierToggle = vi.fn()
        renderDock({ activeTool: 'keys', onModifierToggle })

        fireEvent.click(screen.getByRole('button', { name: 'Control' }))
        fireEvent.click(screen.getByRole('button', { name: 'Alternate' }))

        expect(onModifierToggle.mock.calls).toEqual([['ctrl'], ['alt']])
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
