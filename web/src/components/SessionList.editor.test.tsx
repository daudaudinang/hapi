import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { SessionSummary } from '@/types/api'
import { SessionList } from './SessionList'

const navigateMock = vi.fn()

vi.mock('@tanstack/react-router', () => ({
    useNavigate: () => navigateMock
}))

vi.mock('@/lib/use-translation', () => ({
    useTranslation: () => ({
        t: (key: string, params?: Record<string, string | number>) => {
            const messages: Record<string, string> = {
                'dialog.archive.description': 'Archive "{name}"? You can still find it in archived sessions.',
                'dialog.archive.terminalImpact': 'Archiving will stop all running terminals in this session.',
                'dialog.archive.terminalCount': 'Running terminals: {n}/{max}',
                'dialog.archiveAll.description': 'Archive {n} session(s)?',
                'dialog.archiveAll.terminalImpact': 'Archiving these sessions will stop their running terminals.',
                'dialog.archiveAll.terminalCount': 'Running terminals: {n}'
            }
            let value = messages[key] ?? (params?.n !== undefined ? `${key} ${params.n}` : key)
            for (const [param, replacement] of Object.entries(params ?? {})) {
                value = value.replace(`{${param}}`, String(replacement))
            }
            return value
        }
    })
}))

vi.mock('@/hooks/useLongPress', () => ({
    useLongPress: ({ onClick }: { onClick: () => void }) => ({ onClick })
}))

vi.mock('@/hooks/usePlatform', () => ({
    usePlatform: () => ({ haptic: { impact: vi.fn(), notification: vi.fn() } })
}))

vi.mock('@/hooks/mutations/useSessionActions', () => ({
    useSessionActions: () => ({
        archiveSession: vi.fn(),
        renameSession: vi.fn(),
        deleteSession: vi.fn(),
        isPending: false
    })
}))

vi.mock('@/components/SessionActionMenu', () => ({
    SessionActionMenu: (props: { onArchive: () => void }) => (
        <button type="button" onClick={props.onArchive}>Archive session</button>
    )
}))

vi.mock('@/components/RenameSessionDialog', () => ({
    RenameSessionDialog: () => null
}))

vi.mock('@/components/ui/ConfirmDialog', () => ({
    ConfirmDialog: (props: { isOpen: boolean; description: string }) => (
        props.isOpen ? <div role="dialog">{props.description}</div> : null
    )
}))

function makeSession(overrides: Partial<SessionSummary> & { id: string }): SessionSummary {
    return {
        active: true,
        thinking: false,
        activeAt: Date.now(),
        updatedAt: Date.now(),
        metadata: { path: '/work/hapi', machineId: 'machine-1', flavor: 'codex' },
        todoProgress: null,
        pendingRequestsCount: 0,
        model: null,
        effort: null,
        ...overrides
    }
}

function createWrapper() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    return function Wrapper({ children }: { children: ReactNode }) {
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }
}

describe('SessionList editor entry point', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    afterEach(() => {
        cleanup()
    })

    it('opens a project group in editor mode', () => {
        render(
            <SessionList
                sessions={[makeSession({ id: 'session-1' })]}
                onSelect={vi.fn()}
                onNewSession={vi.fn()}
                onRefresh={vi.fn()}
                isLoading={false}
                renderHeader={false}
                api={null}
                machineLabelsById={{ 'machine-1': 'Dev machine' }}
            />,
            { wrapper: createWrapper() }
        )

        fireEvent.click(screen.getByRole('button', { name: 'Open hapi in Editor' }))

        expect(navigateMock).toHaveBeenCalledWith({
            to: '/editor',
            search: { machine: 'machine-1', project: '/work/hapi' }
        })
    })

    it('shows archive terminal impact copy for a session with known terminals', () => {
        render(
            <SessionList
                sessions={[makeSession({ id: 'session-1', terminalLiveCount: 2 })]}
                onSelect={vi.fn()}
                onNewSession={vi.fn()}
                onRefresh={vi.fn()}
                isLoading={false}
                renderHeader={false}
                api={null}
                machineLabelsById={{ 'machine-1': 'Dev machine' }}
            />,
            { wrapper: createWrapper() }
        )

        fireEvent.click(screen.getAllByRole('button', { name: 'Archive session' })[0])

        expect(screen.getByRole('dialog')).toHaveTextContent('Archiving will stop all running terminals in this session.')
        expect(screen.getByRole('dialog')).toHaveTextContent('Running terminals: 2/3')
    })

    it('shows archive-all terminal impact copy with total known terminals', () => {
        render(
            <SessionList
                sessions={[
                    makeSession({ id: 'session-1', terminalLiveCount: 2 }),
                    makeSession({ id: 'session-2', terminalLiveCount: 1 })
                ]}
                onSelect={vi.fn()}
                onNewSession={vi.fn()}
                onRefresh={vi.fn()}
                isLoading={false}
                renderHeader={false}
                api={null}
                machineLabelsById={{ 'machine-1': 'Dev machine' }}
            />,
            { wrapper: createWrapper() }
        )

        fireEvent.click(screen.getByTitle('dialog.archiveAll.title'))

        expect(screen.getByRole('dialog')).toHaveTextContent('Archiving these sessions will stop their running terminals.')
        expect(screen.getByRole('dialog')).toHaveTextContent('Running terminals: 3')
    })
})
