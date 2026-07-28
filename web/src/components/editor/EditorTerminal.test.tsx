import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditorTab } from '@/hooks/useEditorState'
import { EditorTerminal } from './EditorTerminal'

vi.mock('@/components/Terminal/TerminalSnippetPanel', () => ({
    TerminalSnippetPanel: (props: {
        api: unknown
        disabled: boolean
        onInsert: (command: string) => boolean
        onClose: () => void
        onInserted?: () => void
    }) => (
        <section role="region" aria-label="Snippet content" data-api={String(Boolean(props.api))}>
            <button
                type="button"
                onClick={() => {
                    if (props.onInsert('git status --short')) {
                        props.onInserted?.()
                        props.onClose()
                    }
                }}
            >
                Insert Git status
            </button>
        </section>
    ),
}))

var mocks = {
    useSession: vi.fn(),
    useTerminalSocket: vi.fn(),
    isRemoteTerminalSupported: vi.fn(),
    onMountTerminal: vi.fn(),
    onResizeTerminal: vi.fn(),
    terminalViewProps: [] as Array<{
        compactFontSize?: boolean
        mobileInteractionEnabled?: boolean
        dismissMobileInteraction?: boolean
    }>,
    sessionTabsProps: [] as unknown[],
    disconnectsByTerminalId: new Map<string, ReturnType<typeof vi.fn>>(),
    closesByTerminalId: new Map<string, ReturnType<typeof vi.fn>>(),
    writesByTerminalId: new Map<string, ReturnType<typeof vi.fn>>(),
    terminalStatusesById: new Map<string, string>(),
}

vi.mock('@/lib/app-context', () => ({
    useAppContext: () => ({ token: 'token-1', baseUrl: 'http://hub.local' })
}))

vi.mock('@/lib/use-translation', () => ({
    useTranslation: () => ({
        t: (key: string) => ({
            'button.paste': 'Paste',
            'button.cancel': 'Cancel',
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
        }[key] ?? key)
    })
}))

vi.mock('@/hooks/queries/useSession', () => ({
    useSession: (...args: unknown[]) => mocks.useSession(...args)
}))

vi.mock('@/hooks/useTerminalSocket', () => ({
    useTerminalSocket: (...args: unknown[]) => mocks.useTerminalSocket(...args)
}))

vi.mock('@/utils/terminalSupport', () => ({
    isRemoteTerminalSupported: (...args: unknown[]) => mocks.isRemoteTerminalSupported(...args)
}))

vi.mock('@/components/Terminal/SessionTerminalTabs', () => ({
    SessionTerminalTabs: (props: unknown) => {
        mocks.sessionTabsProps.push(props)
        return <div data-testid="session-terminal-tabs" />
    }
}))

vi.mock('@/components/Terminal/TerminalView', () => ({
    TerminalView: (props: {
        onMount?: (terminal: unknown) => void
        onResize?: (cols: number, rows: number) => void
        compactFontSize?: boolean
        mobileInteractionEnabled?: boolean
        dismissMobileInteraction?: boolean
    }) => {
        mocks.terminalViewProps.push({
            compactFontSize: props.compactFontSize,
            mobileInteractionEnabled: props.mobileInteractionEnabled,
            dismissMobileInteraction: props.dismissMobileInteraction,
        })
        mocks.onMountTerminal(props.onMount)
        mocks.onResizeTerminal(props.onResize)
        return (
            <div
                data-testid="terminal-view"
                data-mobile-interaction-enabled={String(props.mobileInteractionEnabled)}
                data-dismiss-mobile-interaction={String(props.dismissMobileInteraction)}
            />
        )
    }
}))

const tabs: EditorTab[] = [
    { id: 'file-1', type: 'file', path: '/repo/src/App.tsx', label: 'App.tsx' },
    { id: 'term-1', type: 'terminal', label: 'Terminal: bash', shell: 'bash', sessionId: 'session-1' },
    { id: 'term-2', type: 'terminal', label: 'Terminal: zsh', shell: 'zsh', sessionId: 'session-1' }
]

function pressQuickKey(name: string): void {
    fireEvent.click(screen.getByRole('button', { name }))
}

function mountLastTerminal() {
    const focus = vi.fn()
    const onData = vi.fn(() => ({ dispose: vi.fn() }))
    const onSelectionChange = vi.fn(() => ({ dispose: vi.fn() }))
    const getSelection = vi.fn(() => '')
    const element = document.createElement('div')
    const mount = mocks.onMountTerminal.mock.calls.at(-1)?.[0] as ((terminal: unknown) => void) | undefined
    mount?.({ focus, onData, onSelectionChange, getSelection, element })
    return { focus }
}

function expectTerminalWrite(terminalId: string, text: string): void {
    const matchingWrites = mocks.useTerminalSocket.mock.results.flatMap((result, index) => {
        const options = mocks.useTerminalSocket.mock.calls[index]?.[0] as { terminalId?: string } | undefined
        if (options?.terminalId !== terminalId) {
            return []
        }
        return [(result.value as { write: ReturnType<typeof vi.fn> }).write]
    })

    expect(matchingWrites.some((write) => (
        write.mock.calls.some(([data]) => data === text)
    ))).toBe(true)
}

function renderMachineTerminal(overrides: Partial<React.ComponentProps<typeof EditorTerminal>> = {}) {
    return render(
        <EditorTerminal
            tabs={[{ id: 'term-machine', type: 'terminal', label: 'Terminal: bash', shell: 'bash', machineId: 'machine-1', cwd: '/repo' }]}
            activeTabId="term-machine"
            isCollapsed={false}
            api={null}
            onSelectTab={vi.fn()}
            onCloseTab={vi.fn()}
            onOpenTerminal={vi.fn()}
            onToggleCollapsed={vi.fn()}
            {...overrides}
        />
    )
}

function setDockViewport(matches: boolean): void {
    window.matchMedia = vi.fn((query: string) => ({
        matches: query === '(max-width: 1023px)' ? matches : false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia
}

describe('EditorTerminal', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        setDockViewport(false)
        mocks.terminalViewProps = []
        mocks.sessionTabsProps = []
        mocks.useSession.mockReturnValue({
            session: { id: 'session-1', active: true, metadata: { os: 'linux', path: '/repo', host: 'dev' } },
            isLoading: false,
            error: null,
            refetch: vi.fn()
        })
        mocks.disconnectsByTerminalId.clear()
        mocks.closesByTerminalId.clear()
        mocks.writesByTerminalId.clear()
        mocks.terminalStatusesById.clear()
        mocks.useTerminalSocket.mockImplementation((options: { terminalId: string }) => {
            const disconnect = vi.fn()
            const close = vi.fn()
            const write = vi.fn()
            mocks.disconnectsByTerminalId.set(options.terminalId, disconnect)
            mocks.closesByTerminalId.set(options.terminalId, close)
            mocks.writesByTerminalId.set(options.terminalId, write)
            return {
            state: {
                status: mocks.terminalStatusesById.get(options.terminalId)
                    ?? 'connected',
            },
            connect: vi.fn(),
            write,
            resize: vi.fn(),
            disconnect,
            close,
            onOutput: vi.fn(),
            onExit: vi.fn()
            }
        })
        mocks.isRemoteTerminalSupported.mockReturnValue(true)
    })

    afterEach(() => {
        cleanup()
        vi.unstubAllGlobals()
    })

    it('shows an empty state when no terminal tabs exist', () => {
        render(
            <EditorTerminal
                tabs={[tabs[0]]}
                activeTabId="file-1"
                isCollapsed={false}
                api={null}
                onSelectTab={vi.fn()}
                onCloseTab={vi.fn()}
                onOpenTerminal={vi.fn()}
                onToggleCollapsed={vi.fn()}
            />
        )

        expect(screen.getByText('No terminal open')).toBeInTheDocument()
    })

    it('renders only the shared session terminal strip in agent mode', () => {
        const onSelectTab = vi.fn()
        const onCloseTab = vi.fn()
        const onOpenTerminal = vi.fn()
        const onToggleCollapsed = vi.fn()

        render(
            <EditorTerminal
                tabs={tabs}
                activeTabId="term-2"
                isCollapsed={false}
                api={null}
                onSelectTab={onSelectTab}
                onCloseTab={onCloseTab}
                onOpenTerminal={onOpenTerminal}
                onToggleCollapsed={onToggleCollapsed}
            />
        )

        expect(screen.queryByText('App.tsx')).not.toBeInTheDocument()
        expect(screen.queryByText('Terminal: bash')).not.toBeInTheDocument()
        expect(screen.queryByText('Terminal: zsh')).not.toBeInTheDocument()
        expect(screen.getAllByTestId('session-terminal-tabs')).toHaveLength(1)
        expect(screen.queryByTestId('terminal-view')).not.toBeInTheDocument()
        expect(mocks.sessionTabsProps[0]).toEqual(expect.objectContaining({
            sessionId: 'session-1',
            active: true,
            terminalSupported: true
        }))
        expect(mocks.useTerminalSocket).not.toHaveBeenCalled()

        expect(screen.queryByRole('button', { name: /^Select terminal / })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /^Close terminal / })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Open terminal' })).not.toBeInTheDocument()
        expect(onSelectTab).not.toHaveBeenCalled()
        expect(onCloseTab).not.toHaveBeenCalled()
        expect(onOpenTerminal).not.toHaveBeenCalled()

        fireEvent.click(screen.getByRole('button', { name: 'Collapse terminal' }))
        expect(onToggleCollapsed).toHaveBeenCalledWith()
    })

    it('renders one shared component for multiple editor session terminal tabs', () => {
        const { rerender } = render(
            <EditorTerminal
                tabs={tabs}
                activeTabId="term-1"
                isCollapsed={false}
                api={null}
                onSelectTab={vi.fn()}
                onCloseTab={vi.fn()}
                onOpenTerminal={vi.fn()}
                onToggleCollapsed={vi.fn()}
            />
        )

        expect(screen.getAllByTestId('session-terminal-tabs')).toHaveLength(1)
        expect(mocks.useTerminalSocket).not.toHaveBeenCalled()

        rerender(
            <EditorTerminal
                tabs={tabs}
                activeTabId="term-2"
                isCollapsed={true}
                api={null}
                onSelectTab={vi.fn()}
                onCloseTab={vi.fn()}
                onOpenTerminal={vi.fn()}
                onToggleCollapsed={vi.fn()}
            />
        )

        expect(screen.getAllByTestId('session-terminal-tabs')).toHaveLength(1)
        expect(mocks.useTerminalSocket).not.toHaveBeenCalled()
    })

    it('connects machine-scoped terminals without session lookup', () => {
        render(
            <EditorTerminal
                tabs={[{ id: 'term-machine', type: 'terminal', label: 'Terminal: bash', shell: 'bash', machineId: 'machine-1', cwd: '/repo' }]}
                activeTabId="term-machine"
                isCollapsed={false}
                api={null}
                onSelectTab={vi.fn()}
                onCloseTab={vi.fn()}
                onOpenTerminal={vi.fn()}
                onToggleCollapsed={vi.fn()}
            />
        )

        expect(mocks.useSession).toHaveBeenCalledWith(null, null)
        expect(mocks.useTerminalSocket).toHaveBeenCalledWith(expect.objectContaining({
            machineId: 'machine-1',
            cwd: '/repo',
            sessionId: '',
            terminalId: 'term-machine'
        }))
        expect(screen.getByTestId('terminal-view')).toBeInTheDocument()
        expect(screen.queryByTestId('session-terminal-tabs')).not.toBeInTheDocument()
        expect(mocks.sessionTabsProps).toHaveLength(0)
        expect(screen.queryByText(/\b[0-9]+\/3\b/)).not.toBeInTheDocument()
    })

    it('enables mobile interaction only for the active editor terminal body', () => {
        const machineTabs: EditorTab[] = [
            { id: 'term-machine-1', type: 'terminal', label: 'Terminal: bash', shell: 'bash', machineId: 'machine-1', cwd: '/repo' },
            { id: 'term-machine-2', type: 'terminal', label: 'Terminal: zsh', shell: 'zsh', machineId: 'machine-1', cwd: '/repo' },
        ]
        const commonProps = {
            tabs: machineTabs,
            isCollapsed: false,
            api: null,
            onSelectTab: vi.fn(),
            onCloseTab: vi.fn(),
            onOpenTerminal: vi.fn(),
            onToggleCollapsed: vi.fn(),
        }
        const { rerender } = render(
            <EditorTerminal {...commonProps} activeTabId="term-machine-1" />,
        )

        let terminalViews = screen.getAllByTestId('terminal-view')
        expect(terminalViews[0]).toHaveAttribute('data-mobile-interaction-enabled', 'true')
        expect(terminalViews[0]).toHaveAttribute('data-dismiss-mobile-interaction', 'false')
        expect(terminalViews[1]).toHaveAttribute('data-mobile-interaction-enabled', 'false')
        expect(terminalViews[1]).toHaveAttribute('data-dismiss-mobile-interaction', 'true')

        rerender(
            <EditorTerminal {...commonProps} activeTabId="term-machine-2" />,
        )

        terminalViews = screen.getAllByTestId('terminal-view')
        expect(terminalViews[0]).toHaveAttribute('data-mobile-interaction-enabled', 'false')
        expect(terminalViews[0]).toHaveAttribute('data-dismiss-mobile-interaction', 'true')
        expect(terminalViews[1]).toHaveAttribute('data-mobile-interaction-enabled', 'true')
        expect(terminalViews[1]).toHaveAttribute('data-dismiss-mobile-interaction', 'false')
    })

    it('dismisses active terminal interaction when an editor dock tool opens', () => {
        renderMachineTerminal({ mobileMode: true })

        expect(screen.getByTestId('terminal-view')).toHaveAttribute(
            'data-dismiss-mobile-interaction',
            'false',
        )
        fireEvent.click(screen.getByRole('button', { name: 'Keys' }))

        expect(screen.getByTestId('terminal-view')).toHaveAttribute(
            'data-dismiss-mobile-interaction',
            'true',
        )
    })

    it('routes a snippet exactly through the active editor terminal without focusing xterm', () => {
        const api = { cacheScope: 'test' } as React.ComponentProps<typeof EditorTerminal>['api']
        setDockViewport(true)
        renderMachineTerminal({ mobileMode: true, api })
        const { focus } = mountLastTerminal()

        fireEvent.click(screen.getAllByRole('button', { name: 'Snippets' })[0])
        expect(screen.getByRole('region', { name: 'Snippet content' })).toHaveAttribute(
            'data-api',
            'true',
        )
        expect(screen.getByTestId('terminal-view')).toHaveAttribute(
            'data-dismiss-mobile-interaction',
            'true',
        )
        fireEvent.click(screen.getByRole('button', { name: 'Insert Git status' }))

        expectTerminalWrite('term-machine', 'git status --short')
        expect(focus).not.toHaveBeenCalled()
        expect(screen.queryByRole('region', { name: 'Snippet content' })).not.toBeInTheDocument()
        expect(screen.getByRole('status')).toHaveTextContent('terminal.snippets.inserted')
    })

    it('closes the active Snippets panel when switching editor terminal tabs', () => {
        const machineTabs: EditorTab[] = [
            { id: 'term-machine-1', type: 'terminal', label: 'Terminal: bash', shell: 'bash', machineId: 'machine-1', cwd: '/repo' },
            { id: 'term-machine-2', type: 'terminal', label: 'Terminal: zsh', shell: 'zsh', machineId: 'machine-1', cwd: '/repo' },
        ]
        const commonProps = {
            tabs: machineTabs,
            isCollapsed: false,
            api: null,
            onSelectTab: vi.fn(),
            onCloseTab: vi.fn(),
            onOpenTerminal: vi.fn(),
            onToggleCollapsed: vi.fn(),
        }
        const rendered = render(
            <EditorTerminal {...commonProps} activeTabId="term-machine-1" />,
        )

        fireEvent.click(screen.getAllByRole('button', { name: 'Snippets' })[0])
        expect(screen.getByRole('region', { name: 'Snippet content' })).toBeVisible()

        rendered.rerender(
            <EditorTerminal {...commonProps} activeTabId="term-machine-2" />,
        )

        expect(screen.queryByRole('region', { name: 'Snippet content' })).not.toBeInTheDocument()
    })

    it('disables terminal interaction while the editor terminal is disconnected', () => {
        const props = {
            mobileMode: true,
        }
        mocks.terminalStatusesById.set('term-machine', 'disconnected')
        const { rerender } = renderMachineTerminal(props)

        expect(screen.getByTestId('terminal-view')).toHaveAttribute(
            'data-mobile-interaction-enabled',
            'false',
        )

        mocks.terminalStatusesById.set('term-machine', 'connected')
        rerender(
            <EditorTerminal
                tabs={[{ id: 'term-machine', type: 'terminal', label: 'Terminal: bash', shell: 'bash', machineId: 'machine-1', cwd: '/repo' }]}
                activeTabId="term-machine"
                isCollapsed={false}
                api={null}
                onSelectTab={vi.fn()}
                onCloseTab={vi.fn()}
                onOpenTerminal={vi.fn()}
                onToggleCollapsed={vi.fn()}
                {...props}
            />,
        )

        expect(screen.getByTestId('terminal-view')).toHaveAttribute(
            'data-mobile-interaction-enabled',
            'true',
        )
    })

    it('keeps a mixed active machine editor terminal on the legacy hook path', () => {
        const onOpenTerminal = vi.fn()

        render(
            <EditorTerminal
                tabs={[
                    { id: 'term-session', type: 'terminal', label: 'Terminal: session', shell: 'bash', sessionId: 'session-1' },
                    { id: 'term-machine', type: 'terminal', label: 'Terminal: bash', shell: 'bash', machineId: 'machine-1', cwd: '/repo' }
                ]}
                activeTabId="term-machine"
                isCollapsed={false}
                api={null}
                onSelectTab={vi.fn()}
                onCloseTab={vi.fn()}
                onOpenTerminal={onOpenTerminal}
                onToggleCollapsed={vi.fn()}
            />
        )

        expect(screen.getByTestId('terminal-view')).toBeInTheDocument()
        expect(screen.queryByTestId('session-terminal-tabs')).not.toBeInTheDocument()
        expect(mocks.useTerminalSocket).toHaveBeenCalledWith(expect.objectContaining({
            machineId: 'machine-1',
            sessionId: '',
            cwd: '/repo',
            terminalId: 'term-machine'
        }))
        expect(screen.queryByText(/\b[0-9]+\/3\b/)).not.toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Open terminal' }))
        expect(onOpenTerminal).toHaveBeenCalledWith()
    })

    it('hides terminal body content when collapsed and exposes expand action', () => {
        render(
            <EditorTerminal
                tabs={tabs}
                activeTabId="term-2"
                isCollapsed={true}
                api={null}
                onSelectTab={vi.fn()}
                onCloseTab={vi.fn()}
                onOpenTerminal={vi.fn()}
                onToggleCollapsed={vi.fn()}
            />
        )

        expect(screen.queryAllByTestId('session-terminal-tabs')).toHaveLength(1)
        expect(screen.getByRole('button', { name: 'Expand terminal' })).toBeInTheDocument()
    })

    it('toggles the desktop panel from the terminal header background', () => {
        const onToggleCollapsed = vi.fn()
        renderMachineTerminal({ onToggleCollapsed })

        fireEvent.click(screen.getByText('Terminal'))
        fireEvent.click(screen.getByText('Terminal'))

        expect(onToggleCollapsed).toHaveBeenCalledTimes(2)
    })

    it('does not toggle the panel from terminal header controls', () => {
        const onToggleCollapsed = vi.fn()
        const onSelectTab = vi.fn()
        const onCloseTab = vi.fn()
        const onOpenTerminal = vi.fn()
        renderMachineTerminal({
            onToggleCollapsed,
            onSelectTab,
            onCloseTab,
            onOpenTerminal,
        })

        fireEvent.click(screen.getByRole('button', { name: 'Collapse terminal' }))
        expect(onToggleCollapsed).toHaveBeenCalledTimes(1)

        const selectTab = screen.getByRole('button', { name: 'Select terminal Terminal: bash' })
        fireEvent.click(selectTab)
        fireEvent.click(selectTab.parentElement!)
        fireEvent.click(screen.getByRole('button', { name: 'Close terminal Terminal: bash' }))
        fireEvent.click(screen.getByRole('button', { name: 'Open terminal' }))

        expect(onSelectTab).toHaveBeenCalledWith('term-machine')
        expect(onCloseTab).toHaveBeenCalledWith('term-machine')
        expect(onOpenTerminal).toHaveBeenCalledTimes(1)
        expect(onToggleCollapsed).toHaveBeenCalledTimes(1)
    })

    it('does not add terminal header collapse behavior on mobile', () => {
        const onToggleCollapsed = vi.fn()
        renderMachineTerminal({ mobileMode: true, onToggleCollapsed })

        fireEvent.click(screen.getByText('Terminal'))

        expect(onToggleCollapsed).not.toHaveBeenCalled()
    })

    it('hides chrome-only controls and uses compact terminal font in mobile mode', () => {
        render(
            <EditorTerminal
                tabs={[tabs[1]]}
                activeTabId="term-1"
                isCollapsed={true}
                mobileMode={true}
                api={null}
                onSelectTab={vi.fn()}
                onCloseTab={vi.fn()}
                onOpenTerminal={vi.fn()}
                onToggleCollapsed={vi.fn()}
            />
        )

        expect(screen.queryByRole('button', { name: 'Expand terminal' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Collapse terminal' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Open terminal' })).not.toBeInTheDocument()
        expect(mocks.sessionTabsProps[0]).toEqual(expect.objectContaining({ compactFontSize: true }))
    })

    it('confirms before closing a mobile terminal', () => {
        const onCloseTab = vi.fn()

        render(
            <EditorTerminal
                tabs={[{ id: 'term-machine', type: 'terminal', label: 'Terminal: bash', shell: 'bash', machineId: 'machine-1', cwd: '/repo' }]}
                activeTabId="term-machine"
                isCollapsed={true}
                mobileMode={true}
                api={null}
                onSelectTab={vi.fn()}
                onCloseTab={onCloseTab}
                onOpenTerminal={vi.fn()}
                onToggleCollapsed={vi.fn()}
            />
        )

        expect(screen.getAllByTestId('terminal-view')).toHaveLength(1)

        fireEvent.click(screen.getByRole('button', { name: 'Close terminal Terminal: bash' }))

        const dialog = screen.getByRole('dialog', { name: 'Close terminal?' })
        expect(dialog).toBeInTheDocument()
        expect(dialog).toHaveClass('bottom-0', 'left-0', 'translate-x-0', 'rounded-t-xl')
        expect(dialog).toHaveClass('sm:left-1/2', 'sm:-translate-x-1/2')
        expect(screen.getByRole('button', { name: 'Stop process and close' })).toHaveClass('w-full', 'py-2')
        expect(screen.getByRole('button', { name: 'Cancel' }).parentElement).toHaveClass('flex-col')
        expect(onCloseTab).not.toHaveBeenCalled()
        expect(mocks.closesByTerminalId.get('term-machine')).not.toHaveBeenCalled()

        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

        expect(screen.queryByRole('dialog', { name: 'Close terminal?' })).not.toBeInTheDocument()
        expect(onCloseTab).not.toHaveBeenCalled()

        fireEvent.click(screen.getByRole('button', { name: 'Close terminal Terminal: bash' }))
        const closeTerminal = mocks.closesByTerminalId.get('term-machine')
        fireEvent.click(screen.getByRole('button', { name: 'Stop process and close' }))

        expect(closeTerminal).toHaveBeenCalled()
        expect(onCloseTab).toHaveBeenCalledWith('term-machine')
    })

    it('shows the mobile terminal dock and writes helper key sequences', () => {
        renderMachineTerminal({ mobileMode: true })

        fireEvent.click(screen.getByRole('button', { name: 'Keys' }))
        pressQuickKey('Tab')

        expectTerminalWrite('term-machine', '\t')
        expect(screen.getByRole('toolbar', { name: 'Terminal controls' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Escape' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Control' })).toBeInTheDocument()
    })

    it('does not focus xterm from the mobile Keys action', () => {
        setDockViewport(true)
        renderMachineTerminal({ mobileMode: true })
        const { focus } = mountLastTerminal()

        expect(focus).not.toHaveBeenCalled()
        fireEvent.pointerDown(screen.getByRole('button', { name: 'Keys' }))
        fireEvent.click(screen.getByRole('button', { name: 'Keys' }))

        expect(focus).not.toHaveBeenCalled()
    })

    it('does not focus xterm during direct Paste', async () => {
        vi.stubGlobal('navigator', {
            clipboard: { readText: vi.fn().mockResolvedValue('pwd') },
        })
        setDockViewport(true)
        renderMachineTerminal({ mobileMode: true })
        const { focus } = mountLastTerminal()

        const pasteButton = screen.getByRole('button', { name: 'Paste' })
        fireEvent.pointerDown(pasteButton)
        fireEvent.click(pasteButton)

        await waitFor(() => expectTerminalWrite('term-machine', 'pwd'))
        expect(focus).not.toHaveBeenCalled()
        expect(screen.queryByRole('dialog', { name: 'Paste input' })).not.toBeInTheDocument()
    })

    it('does not focus xterm when manual Paste is cancelled or submitted', async () => {
        vi.stubGlobal('navigator', {
            clipboard: { readText: vi.fn().mockRejectedValue(new Error('denied')) },
        })
        setDockViewport(true)
        renderMachineTerminal({ mobileMode: true })
        const { focus } = mountLastTerminal()

        const pasteButton = screen.getByRole('button', { name: 'Paste' })
        fireEvent.pointerDown(pasteButton)
        fireEvent.click(pasteButton)
        fireEvent.click(within(await screen.findByRole('dialog', { name: 'Paste input' }))
            .getByRole('button', { name: 'Cancel' }))
        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Paste input' })).not.toBeInTheDocument())
        expect(focus).not.toHaveBeenCalled()

        fireEvent.pointerDown(pasteButton)
        fireEvent.click(pasteButton)
        const dialog = await screen.findByRole('dialog', { name: 'Paste input' })
        fireEvent.change(within(dialog).getByPlaceholderText('Paste terminal input here…'), {
            target: { value: 'pwd' },
        })
        fireEvent.click(within(dialog).getByRole('button', { name: 'Paste' }))

        await waitFor(() => expectTerminalWrite('term-machine', 'pwd'))
        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Paste input' })).not.toBeInTheDocument())
        expect(focus).not.toHaveBeenCalled()
    })

    it('keeps the dock available below lg when editor mobile mode is false', () => {
        setDockViewport(true)
        renderMachineTerminal({ mobileMode: false })
        const { focus } = mountLastTerminal()

        expect(focus).not.toHaveBeenCalled()
        expect(screen.getByRole('toolbar', { name: 'Terminal controls' })).toHaveClass('lg:hidden')
        fireEvent.pointerDown(screen.getByRole('button', { name: 'Keys' }))

        expect(focus).not.toHaveBeenCalled()
    })

    it('preserves automatic terminal focus at desktop width', () => {
        setDockViewport(false)
        renderMachineTerminal({ mobileMode: false })
        const { focus } = mountLastTerminal()

        expect(focus).toHaveBeenCalledTimes(1)
    })

    it('does not refocus xterm when tapping mobile helper keys', () => {
        setDockViewport(true)
        renderMachineTerminal({ mobileMode: true })
        const terminal = mountLastTerminal()

        fireEvent.pointerDown(screen.getByRole('button', { name: 'Keys' }))
        fireEvent.click(screen.getByRole('button', { name: 'Keys' }))
        terminal.focus.mockClear()

        pressQuickKey('Escape')
        pressQuickKey('Tab')

        expectTerminalWrite('term-machine', '\u001b')
        expectTerminalWrite('term-machine', '\t')
        expect(terminal.focus).not.toHaveBeenCalled()
    })

    it('closes the dock panel from terminal content without blurring the native input', () => {
        renderMachineTerminal({ mobileMode: true })
        fireEvent.click(screen.getByRole('button', { name: 'More' }))
        expect(screen.getByRole('region', { name: 'More terminal keys' })).toBeInTheDocument()

        const terminalInput = document.createElement('textarea')
        document.body.appendChild(terminalInput)
        terminalInput.focus()
        expect(document.activeElement).toBe(terminalInput)

        fireEvent.pointerDown(screen.getByTestId('terminal-surface'))

        expect(screen.queryByRole('region', { name: 'More terminal keys' })).not.toBeInTheDocument()
        expect(document.activeElement).toBe(terminalInput)
        terminalInput.remove()
    })

    it('opens advanced keys in an anchored More panel', () => {
        renderMachineTerminal({ mobileMode: true })
        expect(screen.queryByRole('button', { name: 'F1' })).not.toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'More' }))

        expect(screen.getByRole('region', { name: 'More terminal keys' })).toHaveClass('absolute')
        expect(screen.queryByRole('dialog', { name: 'More terminal keys' })).not.toBeInTheDocument()
        for (const key of ['F1', 'F6', 'F12', 'Home', 'End', 'PgUp', 'PgDn']) {
            expect(screen.getByRole('button', { name: key })).toBeInTheDocument()
        }

        pressQuickKey('F5')
        expectTerminalWrite('term-machine', '\u001b[15~')
    })

    it('keeps modifiers, navigation and function layers in the Keys panel', () => {
        renderMachineTerminal({ mobileMode: true })
        fireEvent.click(screen.getByRole('button', { name: 'Keys' }))

        const keyboardPanel = screen.getByRole('region', { name: 'Terminal helper keys' })
        for (const key of ['Escape', 'Tab', 'Control', 'Alternate']) {
            expect(within(keyboardPanel).getByRole('button', { name: key })).toBeInTheDocument()
        }
        for (const key of ['Arrow left', 'Arrow up', 'Arrow down', 'Arrow right']) {
            expect(within(keyboardPanel).getByRole('button', { name: key })).toBeInTheDocument()
        }

        fireEvent.click(within(keyboardPanel).getByRole('button', { name: 'Function keys' }))
        expect(within(keyboardPanel).getByRole('button', { name: 'F1' })).toBeInTheDocument()
        expect(within(keyboardPanel).queryByRole('button', { name: 'Escape' })).not.toBeInTheDocument()
    })
})
