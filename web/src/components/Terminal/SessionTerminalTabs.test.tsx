import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TerminalState } from '@hapi/protocol'
import { en, viVN, zhCN } from '@/lib/locales'
import { SessionTerminalTabs } from './SessionTerminalTabs'

var mocks: {
    controller: null | {
        state: { status: 'idle' | 'connecting' | 'connected' | 'error'; error?: string }
        lastError: string | null
        recoveryReason: 'cli_lost' | null
        listLoaded: boolean
        terminals: TerminalState[]
        connect: ReturnType<typeof vi.fn>
        disconnect: ReturnType<typeof vi.fn>
        subscribe: ReturnType<typeof vi.fn>
        create: ReturnType<typeof vi.fn>
        write: ReturnType<typeof vi.fn>
        resize: ReturnType<typeof vi.fn>
        closeOne: ReturnType<typeof vi.fn>
        keepalive: ReturnType<typeof vi.fn>
        onOutput: ReturnType<typeof vi.fn>
        onExit: ReturnType<typeof vi.fn>
        onWarning: ReturnType<typeof vi.fn>
        clearLastError: ReturnType<typeof vi.fn>
    }
    terminalMounts: Array<{ onMount?: (terminal: unknown) => void; onResize?: (cols: number, rows: number) => void }>
    emittedEvents: string[]
} = {
    controller: null,
    terminalMounts: [],
    emittedEvents: []
}


vi.mock('@/lib/app-context', () => ({
    useAppContext: () => ({ token: 'token-1', baseUrl: 'http://hub.local', api: null })
}))

vi.mock('@/hooks/useTerminalSocket', () => ({
    useSessionTerminalSocket: () => mocks.controller
}))

vi.mock('@/components/Terminal/TerminalView', () => ({
    TerminalView: (props: { onMount?: (terminal: unknown) => void; onResize?: (cols: number, rows: number) => void }) => {
        mocks.terminalMounts.push(props)
        return <div data-testid="terminal-view" />
    }
}))


vi.mock('@/lib/use-translation', () => ({
    useTranslation: () => ({
        t: (key: string) => ({
            'button.paste': 'Paste',
            'button.cancel': 'Cancel',
            'terminal.paste.fallbackTitle': 'Paste input',
            'terminal.paste.fallbackDescription': 'Clipboard read is unavailable. Paste your text below.',
            'terminal.paste.placeholder': 'Paste terminal input here…',
            'terminal.lifecycle.hint': 'Closing this window only detaches. Terminals live with the session and stop only when you close them, archive the session, or timeout limits apply.',
            'terminal.limit.full': 'Close an existing terminal before creating another.',
            'terminal.new': 'New terminal',
            'terminal.close.confirmTitle': 'Stop terminal process?',
            'terminal.close.confirmDescription': 'Stop process and close this terminal tab?',
            'terminal.close.confirmAction': 'Stop process and close',
            'terminal.keep': 'Keep terminal',
            'terminal.warning.idle': 'Terminal is idle and will stop soon unless activity resumes.',
            'terminal.warning.age': 'Terminal is near its maximum lifetime hard limit and will stop soon.',
            'terminal.warning.badge.idle': 'Idle warning',
            'terminal.warning.badge.age': 'Age warning',
            'terminal.closed.idle': 'Closed after idle timeout.',
            'terminal.closed.age': 'Closed after hard timeout.',
            'terminal.closed.user': 'Closed by user.',
            'terminal.closed.archive': 'Closed because session was archived.',
            'terminal.closed.exited': 'Process exited.',
            'terminal.closed.lost': 'CLI connection was lost.',
            'terminal.recovery.cliLost': 'CLI restarted or disconnected. Previous terminals may be lost.',
            'terminal.closed.spawn': 'CLI could not spawn this terminal.',
            'terminal.closed.generic': 'Terminal is closed.',
            'terminal.createNew': 'Create new terminal',
            'terminal.unsupported': 'Remote terminal is not supported on this host.',
            'terminal.inactive': 'Session is inactive. Terminal is unavailable.',
        }[key] ?? key)
    })
}))

vi.mock('@/hooks/useLongPress', () => ({
    useLongPress: ({ onClick }: { onClick: () => void }) => ({ onClick })
}))

function state(id: string, status: TerminalState['status'] = 'running', closeReason: TerminalState['closeReason'] = null): TerminalState {
    return {
        scopeType: 'session',
        sessionId: 'session-1',
        terminalId: id,
        label: id,
        cwd: '/repo',
        cols: 80,
        rows: 24,
        status,
        closeReason,
        createdAt: 1,
        lastActivityAt: 1,
        idleWarningAt: null,
        hardExpiresAt: 2
    }
}

function makeController(terminals: TerminalState[] = []) {
    return {
        state: { status: 'connected' as const },
        lastError: null,
        recoveryReason: null,
        listLoaded: true,
        terminals,
        connect: vi.fn(),
        disconnect: vi.fn(),
        subscribe: vi.fn(),
        create: vi.fn((input) => {
            mocks.emittedEvents.push(`terminal:create:${input.terminalId}`)
            return true
        }),
        write: vi.fn(),
        resize: vi.fn(),
        closeOne: vi.fn((terminalId: string) => mocks.emittedEvents.push(`terminal:close:${terminalId}`)),
        keepalive: vi.fn(),
        onOutput: vi.fn(),
        onExit: vi.fn(),
        onWarning: vi.fn(),
        clearLastError: vi.fn()
    }
}

function renderTabs(props: Partial<React.ComponentProps<typeof SessionTerminalTabs>> = {}) {
    return render(
        <SessionTerminalTabs
            sessionId="session-1"
            active={true}
            terminalSupported={true}
            {...props}
        />
    )
}

describe('SessionTerminalTabs', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.terminalMounts = []
        mocks.emittedEvents = []
        mocks.controller = makeController()
    })

    afterEach(() => cleanup())

    it('marks terminal quick keys as mobile and tablet only', () => {
        mocks.controller = makeController([state('t1')])

        renderTabs()

        expect(screen.getByRole('toolbar', { name: 'Terminal quick keys' })).toHaveClass('lg:hidden')
    })

    it('renders count n/3 from CLI list', () => {
        mocks.controller = makeController([state('t1', 'running'), state('t2', 'detached')])

        renderTabs()

        expect(screen.getByText('2/3')).toBeInTheDocument()
    })

    it('places new-terminal button directly after the latest terminal tab', () => {
        mocks.controller = makeController([state('t1'), state('t2')])

        renderTabs()

        const tabList = screen.getByRole('group', { name: 'Terminal tabs' })
        const addButton = screen.getByRole('button', { name: 'New terminal' })
        expect(addButton.parentElement).toBe(tabList)
        expect(tabList.lastElementChild).toBe(addButton)
    })

    it('disables plus at 3/3 with tooltip', () => {
        mocks.controller = makeController([state('t1'), state('t2'), state('t3')])

        renderTabs()

        const addButton = screen.getByRole('button', { name: 'New terminal' })
        expect(addButton).toBeDisabled()
        expect(addButton).toHaveAttribute('title', 'Close an existing terminal before creating another.')
    })


    it('renders idle warning banner and tab badge from terminal list state', () => {
        mocks.controller = makeController([state('t1', 'warning_idle')])

        renderTabs()

        expect(screen.getByRole('status')).toHaveTextContent('Terminal is idle')
        expect(screen.getByLabelText('Idle warning')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Keep terminal' })).toBeInTheDocument()
    })

    it('keeps terminal through keepalive without writing shell input', () => {
        mocks.controller = makeController([state('t1', 'warning_idle')])

        renderTabs()
        fireEvent.click(screen.getByRole('button', { name: 'Keep terminal' }))

        expect(mocks.controller.keepalive).toHaveBeenCalledWith('t1')
        expect(mocks.controller.write).not.toHaveBeenCalled()
    })

    it('renders age warning without keep button', () => {
        mocks.controller = makeController([state('t1', 'warning_age')])

        renderTabs()

        expect(screen.getByRole('status')).toHaveTextContent('maximum lifetime hard limit')
        expect(screen.getByLabelText('Age warning')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Keep terminal' })).not.toBeInTheDocument()
    })

    it('does not expose or emit close-all from web hook/controller', () => {
        mocks.controller = makeController([state('t1')])

        renderTabs()
        expect(mocks.controller).not.toHaveProperty('closeAll')
        expect(mocks.emittedEvents).not.toContain('terminal:close-all')
    })

    it('unmount disconnects without close-one', () => {
        mocks.controller = makeController([state('t1')])
        const rendered = renderTabs()

        rendered.unmount()

        expect(mocks.controller.disconnect).toHaveBeenCalledTimes(1)
        expect(mocks.controller.closeOne).not.toHaveBeenCalled()
    })

    it('explicit close requires confirm and closes only selected terminal', () => {
        mocks.controller = makeController([state('t1'), state('t2')])

        renderTabs()
        fireEvent.click(screen.getByRole('button', { name: 'Close terminal t2' }))

        expect(screen.getByRole('dialog', { name: 'Stop terminal process?' })).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Stop process and close' }))

        expect(mocks.controller.closeOne).toHaveBeenCalledTimes(1)
        expect(mocks.controller.closeOne).toHaveBeenCalledWith('t2')
        expect(mocks.controller.closeOne).not.toHaveBeenCalledWith('t1')
    })



    it('reattaches an existing listed live terminal on first resize before resizing', () => {
        mocks.controller = makeController([state('t1', 'detached')])

        renderTabs()
        mocks.terminalMounts.at(-1)?.onResize?.(100, 30)
        mocks.terminalMounts.at(-1)?.onResize?.(120, 40)

        expect(mocks.controller.create).toHaveBeenCalledTimes(1)
        expect(mocks.controller.create).toHaveBeenCalledWith({
            terminalId: 't1',
            cols: 100,
            rows: 30,
            cwd: undefined,
            replay: true
        })
        expect(mocks.controller.resize).toHaveBeenCalledWith('t1', 120, 40)
    })

    it('blocks rapid plus clicks while create is pending', () => {
        mocks.controller = makeController([state('t1', 'running')])

        renderTabs()
        mocks.terminalMounts.at(-1)?.onResize?.(80, 24)
        fireEvent.click(screen.getByRole('button', { name: 'New terminal' }))
        fireEvent.click(screen.getByRole('button', { name: 'New terminal' }))

        expect(mocks.controller.create).toHaveBeenCalledTimes(2)
        expect(mocks.controller.create).toHaveBeenNthCalledWith(1, expect.objectContaining({ terminalId: 't1', replay: true }))
    })

    it('does not create or leave pending while the terminal socket is still connecting', () => {
        mocks.controller = {
            ...makeController([]),
            state: { status: 'connecting' as const },
            create: vi.fn(() => false)
        }

        renderTabs()
        mocks.terminalMounts.at(-1)?.onResize?.(80, 24)
        expect(screen.getByRole('button', { name: 'New terminal' })).toBeDisabled()
        fireEvent.click(screen.getByRole('button', { name: 'New terminal' }))

        expect(mocks.controller.create).not.toHaveBeenCalled()
    })

    it('does not bootstrap a new terminal before the first session terminal list arrives', () => {
        mocks.controller = {
            ...makeController([]),
            listLoaded: false
        }

        renderTabs()
        mocks.terminalMounts.at(-1)?.onResize?.(80, 24)

        expect(mocks.controller.create).not.toHaveBeenCalled()
    })

    it('prefers first live terminal when closed terminal appears before running terminal', () => {
        mocks.controller = makeController([
            state('closed-first', 'closed_idle', 'idle_timeout'),
            state('live-second', 'running')
        ])

        renderTabs()

        expect(screen.getByTestId('terminal-view')).toBeInTheDocument()
        expect(screen.queryByText(/Closed after idle timeout/)).not.toBeInTheDocument()
    })



    it('keeps selected terminal when it becomes closed and shows reason with CTA', () => {
        mocks.controller = makeController([state('t1', 'running'), state('t2', 'running')])
        const rendered = renderTabs()

        mocks.terminalMounts.at(-1)?.onResize?.(80, 24)
        expect(mocks.controller.create).toHaveBeenCalledWith(expect.objectContaining({ terminalId: 't1' }))

        mocks.controller = {
            ...mocks.controller,
            terminals: [state('t1', 'closed_idle', 'idle_timeout'), state('t2', 'running')]
        }
        rendered.rerender(
            <SessionTerminalTabs
                sessionId="session-1"
                active={true}
                terminalSupported={true}
            />
        )

        expect(screen.getByText('Closed after idle timeout.')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Create new terminal' })).toBeInTheDocument()
        expect(screen.queryByTestId('terminal-view')).not.toBeInTheDocument()
    })

    it('switches to first live terminal only when selected terminal is removed', () => {
        mocks.controller = makeController([state('t1', 'running'), state('t2', 'running')])
        const rendered = renderTabs()

        mocks.terminalMounts.at(-1)?.onResize?.(80, 24)
        expect(mocks.controller.create).toHaveBeenCalledWith(expect.objectContaining({ terminalId: 't1' }))

        mocks.controller = {
            ...mocks.controller,
            terminals: [state('t2', 'running')]
        }
        rendered.rerender(
            <SessionTerminalTabs
                sessionId="session-1"
                active={true}
                terminalSupported={true}
            />
        )

        expect(screen.getByTestId('terminal-view')).toBeInTheDocument()
        mocks.terminalMounts.at(-1)?.onResize?.(100, 30)
        expect(mocks.controller.create).toHaveBeenCalledWith({
            terminalId: 't2',
            cols: 100,
            rows: 30,
            cwd: undefined,
            replay: true
        })
    })

    it('renders last terminal error without hiding connected terminal UI', () => {
        mocks.controller = { ...makeController([state('t1', 'running')]), lastError: 'Too many terminals open (max 3).' }

        renderTabs()

        expect(screen.getByText('Too many terminals open (max 3).')).toBeInTheDocument()
        expect(screen.getByTestId('terminal-view')).toBeInTheDocument()
    })

    it('renders closed idle/age/lost terminal reason with create new CTA', () => {
        mocks.controller = makeController([
            state('idle-old', 'closed_idle', 'idle_timeout'),
            state('age-old', 'closed_age', 'hard_timeout'),
            state('lost-one', 'lost', 'cli_lost')
        ])

        renderTabs()

        expect(screen.getByText('Closed after idle timeout.')).toBeInTheDocument()
        expect(screen.getByText('Closed after hard timeout.')).toBeInTheDocument()
        expect(screen.getByText('CLI connection was lost.')).toBeInTheDocument()
        expect(screen.getAllByRole('button', { name: 'Create new terminal' })).toHaveLength(3)
    })

    it('renders session-level CLI lost recovery banner without terminal metadata', () => {
        mocks.controller = { ...makeController([]), recoveryReason: 'cli_lost' }

        renderTabs()

        expect(screen.getByText('CLI restarted or disconnected. Previous terminals may be lost.')).toBeInTheDocument()
        expect(screen.getByTestId('terminal-view')).toBeInTheDocument()
    })

    it('creates a new terminal from closed-only CTA using closed terminal size', () => {
        mocks.controller = makeController([{
            ...state('idle-old', 'closed_idle', 'idle_timeout'),
            cols: 132,
            rows: 43
        }])

        renderTabs()
        fireEvent.click(screen.getByRole('button', { name: 'Create new terminal' }))

        expect(mocks.controller.create).toHaveBeenCalledTimes(1)
        expect(mocks.controller.create).toHaveBeenCalledWith({
            terminalId: expect.any(String),
            cols: 132,
            rows: 43,
            cwd: undefined,
            replay: true
        })
        expect(screen.queryByText('Waiting for terminal size before creating a terminal.')).not.toBeInTheDocument()
    })

    it('has terminal lifecycle locale coverage in en vi and zh', () => {
        const keys = [
            'terminal.lifecycle.hint',
            'terminal.limit.full',
            'terminal.new',
            'terminal.close.confirmTitle',
            'terminal.close.confirmDescription',
            'terminal.close.confirmAction',
            'terminal.keep',
            'terminal.warning.idle',
            'terminal.warning.age',
            'terminal.warning.badge.idle',
            'terminal.warning.badge.age',
            'terminal.closed.idle',
            'terminal.closed.age',
            'terminal.closed.user',
            'terminal.closed.archive',
            'terminal.closed.exited',
            'terminal.closed.lost',
            'terminal.recovery.cliLost',
            'terminal.closed.spawn',
            'terminal.closed.generic',
            'terminal.createNew',
            'terminal.unsupported',
            'terminal.inactive',
            'button.cancel'
        ] as const

        for (const key of keys) {
            expect(en[key]).toBeTruthy()
            expect(viVN[key]).toBeTruthy()
            expect(zhCN[key]).toBeTruthy()
        }
    })
})
