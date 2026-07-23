import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditorTab } from '@/hooks/useEditorState'
import { EditorTerminal } from './EditorTerminal'

var mocks = {
    useSession: vi.fn(),
    useTerminalSocket: vi.fn(),
    isRemoteTerminalSupported: vi.fn(),
    onMountTerminal: vi.fn(),
    onResizeTerminal: vi.fn(),
    terminalViewProps: [] as Array<{ compactFontSize?: boolean }>,
    sessionTabsProps: [] as unknown[],
    disconnectsByTerminalId: new Map<string, ReturnType<typeof vi.fn>>(),
    closesByTerminalId: new Map<string, ReturnType<typeof vi.fn>>(),
    writesByTerminalId: new Map<string, ReturnType<typeof vi.fn>>()
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
    TerminalView: (props: { onMount?: (terminal: unknown) => void; onResize?: (cols: number, rows: number) => void; compactFontSize?: boolean }) => {
        mocks.terminalViewProps.push({ compactFontSize: props.compactFontSize })
        mocks.onMountTerminal(props.onMount)
        mocks.onResizeTerminal(props.onResize)
        return <div data-testid="terminal-view" />
    }
}))

const tabs: EditorTab[] = [
    { id: 'file-1', type: 'file', path: '/repo/src/App.tsx', label: 'App.tsx' },
    { id: 'term-1', type: 'terminal', label: 'Terminal: bash', shell: 'bash', sessionId: 'session-1' },
    { id: 'term-2', type: 'terminal', label: 'Terminal: zsh', shell: 'zsh', sessionId: 'session-1' }
]

function pressQuickKey(name: string): void {
    const button = screen.getByRole('button', { name })
    fireEvent.mouseDown(button)
    fireEvent.mouseUp(button)
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

describe('EditorTerminal', () => {
    beforeEach(() => {
        vi.clearAllMocks()
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
        mocks.useTerminalSocket.mockImplementation((options: { terminalId: string }) => {
            const disconnect = vi.fn()
            const close = vi.fn()
            const write = vi.fn()
            mocks.disconnectsByTerminalId.set(options.terminalId, disconnect)
            mocks.closesByTerminalId.set(options.terminalId, close)
            mocks.writesByTerminalId.set(options.terminalId, write)
            return {
            state: { status: 'connected' },
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

    it('shows mobile terminal quick keys and writes their escape sequences', () => {
        render(
            <EditorTerminal
                tabs={[{ id: 'term-machine', type: 'terminal', label: 'Terminal: bash', shell: 'bash', machineId: 'machine-1', cwd: '/repo' }]}
                activeTabId="term-machine"
                isCollapsed={false}
                mobileMode={true}
                api={null}
                onSelectTab={vi.fn()}
                onCloseTab={vi.fn()}
                onOpenTerminal={vi.fn()}
                onToggleCollapsed={vi.fn()}
            />
        )

        pressQuickKey('Tab')

        expect(mocks.writesByTerminalId.get('term-machine')).toHaveBeenCalledWith('\t')
        expect(screen.getByRole('button', { name: 'Escape' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Control' })).toBeInTheDocument()
    })

    it('does not focus the hidden xterm input when tapping mobile quick keys', () => {
        render(
            <EditorTerminal
                tabs={[{ id: 'term-machine', type: 'terminal', label: 'Terminal: bash', shell: 'bash', machineId: 'machine-1', cwd: '/repo' }]}
                activeTabId="term-machine"
                isCollapsed={false}
                mobileMode={true}
                api={null}
                onSelectTab={vi.fn()}
                onCloseTab={vi.fn()}
                onOpenTerminal={vi.fn()}
                onToggleCollapsed={vi.fn()}
            />
        )
        const terminal = mountLastTerminal()
        terminal.focus.mockClear()

        pressQuickKey('Escape')
        pressQuickKey('Tab')

        expect(mocks.writesByTerminalId.get('term-machine')).toHaveBeenCalledWith('\u001b')
        expect(mocks.writesByTerminalId.get('term-machine')).toHaveBeenCalledWith('\t')
        expect(terminal.focus).not.toHaveBeenCalled()
    })

    it('blurs the focused terminal input before handling touch quick keys', () => {
        render(
            <EditorTerminal
                tabs={[{ id: 'term-machine', type: 'terminal', label: 'Terminal: bash', shell: 'bash', machineId: 'machine-1', cwd: '/repo' }]}
                activeTabId="term-machine"
                isCollapsed={false}
                mobileMode={true}
                api={null}
                onSelectTab={vi.fn()}
                onCloseTab={vi.fn()}
                onOpenTerminal={vi.fn()}
                onToggleCollapsed={vi.fn()}
            />
        )
        const terminalInput = document.createElement('textarea')
        document.body.appendChild(terminalInput)
        terminalInput.focus()
        expect(document.activeElement).toBe(terminalInput)

        fireEvent.pointerDown(screen.getByRole('button', { name: 'Tab' }), { pointerType: 'touch' })

        expect(document.activeElement).not.toBe(terminalInput)
        terminalInput.remove()
    })

    it('offers Ctrl+C on the primary mobile row and advanced keys in More', () => {
        render(
            <EditorTerminal
                tabs={[{ id: 'term-machine', type: 'terminal', label: 'Terminal: bash', shell: 'bash', machineId: 'machine-1', cwd: '/repo' }]}
                activeTabId="term-machine"
                isCollapsed={false}
                mobileMode={true}
                api={null}
                onSelectTab={vi.fn()}
                onCloseTab={vi.fn()}
                onOpenTerminal={vi.fn()}
                onToggleCollapsed={vi.fn()}
            />
        )

        fireEvent.click(screen.getByRole('button', { name: 'Ctrl+C' }))
        expect(mocks.writesByTerminalId.get('term-machine')).toHaveBeenCalledWith('\u0003')

        expect(screen.queryByRole('button', { name: 'F1' })).not.toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'More terminal keys' }))

        expect(screen.getByRole('dialog', { name: 'More terminal keys' })).toBeInTheDocument()
        for (const key of ['F1', 'F6', 'F12', 'Ctrl+D', 'Ctrl+Z', 'Ctrl+L', 'Home', 'End', 'PgUp', 'PgDn']) {
            expect(screen.getByRole('button', { name: key })).toBeInTheDocument()
        }

        pressQuickKey('F5')
        expect(mocks.writesByTerminalId.get('term-machine')).toHaveBeenCalledWith('\u001b[15~')
    })

    it('groups mobile modifiers with Esc and Tab while keeping arrows together', () => {
        render(
            <EditorTerminal
                tabs={[{ id: 'term-machine', type: 'terminal', label: 'Terminal: bash', shell: 'bash', machineId: 'machine-1', cwd: '/repo' }]}
                activeTabId="term-machine"
                isCollapsed={false}
                mobileMode={true}
                api={null}
                onSelectTab={vi.fn()}
                onCloseTab={vi.fn()}
                onOpenTerminal={vi.fn()}
                onToggleCollapsed={vi.fn()}
            />
        )

        const modifierRow = screen.getByRole('group', { name: 'Terminal modifier keys' })
        expect(within(modifierRow).getByRole('button', { name: 'Escape' })).toBeInTheDocument()
        expect(within(modifierRow).getByRole('button', { name: 'Tab' })).toBeInTheDocument()
        expect(within(modifierRow).getByRole('button', { name: 'Control' })).toBeInTheDocument()
        expect(within(modifierRow).getByRole('button', { name: 'Alternate' })).toBeInTheDocument()
        expect(within(modifierRow).queryByRole('button', { name: 'Arrow up' })).not.toBeInTheDocument()

        const arrowRow = screen.getByRole('group', { name: 'Terminal arrow keys' })
        for (const key of ['Arrow left', 'Arrow up', 'Arrow down', 'Arrow right']) {
            expect(within(arrowRow).getByRole('button', { name: key })).toBeInTheDocument()
        }
        expect(within(arrowRow).queryByRole('button', { name: 'Control' })).not.toBeInTheDocument()
    })
})
