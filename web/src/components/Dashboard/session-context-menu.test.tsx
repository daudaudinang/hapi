import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Dashboard } from './index'
import type { SessionSummary } from '@/types/api'

const navigate = vi.fn()

vi.mock('@tanstack/react-router', () => ({
    useNavigate: () => navigate,
    useSearch: () => ({})
}))

vi.mock('@/hooks/queries/useSessions', () => ({
    useSessions: () => ({
        sessions: [
            makeSession({ id: 'session-1', metadata: { path: '/repo/app', name: 'Build app', flavor: 'claude' } }),
        ],
        isLoading: false,
    })
}))

vi.mock('@/hooks/queries/useMachines', () => ({
    useMachines: () => ({ machines: [], isLoading: false })
}))

vi.mock('@/hooks/queries/useSession', () => ({
    useSession: (_api: unknown, sessionId: string | null) => ({
        session: sessionId ? makeSession({ id: sessionId, metadata: { path: '/repo/app', name: 'Build app', flavor: 'claude' } }) : null,
        refetch: vi.fn(),
    })
}))

vi.mock('@/hooks/queries/useMessages', () => ({
    useMessages: () => ({
        messages: [],
        warning: null,
        isLoading: false,
        isLoadingMore: false,
        hasMore: false,
        loadMore: vi.fn(),
        refetch: vi.fn(),
        pendingCount: 0,
        messagesVersion: 0,
        flushPending: vi.fn(),
        setAtBottom: vi.fn(),
    })
}))

vi.mock('@/hooks/mutations/useSendMessage', () => ({
    useSendMessage: () => ({
        sendMessage: vi.fn(),
        retryMessage: vi.fn(),
        isSending: false,
    })
}))

vi.mock('@/hooks/queries/useSlashCommands', () => ({
    useSlashCommands: () => ({ commands: [], getSuggestions: vi.fn(async () => []) })
}))

vi.mock('@/hooks/queries/useSkills', () => ({
    useSkills: () => ({ getSuggestions: vi.fn(async () => []) })
}))

vi.mock('@/components/SessionChat', () => ({
    SessionChat: (props: { session: { id: string } }) => <div data-testid="pinned-panel">{props.session.id}</div>
}))

vi.mock('@/lib/use-translation', () => ({
    useTranslation: () => ({
        t: (key: string, params?: Record<string, unknown>) => {
            if (key === 'dashboard.sessions' && params?.n !== undefined) return `${params.n} sessions`
            return key
        }
    })
}))

function makeSession(overrides: Partial<SessionSummary> & { id: string }): SessionSummary {
    return {
        active: true,
        thinking: false,
        activeAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000,
        metadata: { path: '/repo', flavor: 'claude', ...overrides.metadata },
        todoProgress: null,
        pendingRequestsCount: 0,
        model: null,
        effort: null,
        ...overrides,
        id: overrides.id,
    }
}

function setCoarsePointer(matches: boolean) {
    Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: vi.fn(() => ({
            matches,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        }))
    })
}

function renderDashboard() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
    })
    return render(
        <QueryClientProvider client={queryClient}>
            <Dashboard api={null} />
        </QueryClientProvider>
    )
}

describe('Dashboard session context menu', () => {
    beforeEach(() => {
        navigate.mockClear()
        sessionStorage.clear()
        setCoarsePointer(false)
    })

    afterEach(() => {
        cleanup()
        sessionStorage.clear()
    })

    it('opens the unified context menu from a session card right-click', () => {
        renderDashboard()

        fireEvent.contextMenu(screen.getByText('Build app'))

        expect(screen.getByText('dashboard.archiveSession')).toBeInTheDocument()
        expect(screen.getByText('dashboard.copySessionId')).toBeInTheDocument()
    })

    it('pins from single-clicking a session card', () => {
        renderDashboard()
        const cardTitle = screen.getByText('Build app')

        fireEvent.click(cardTitle)
        expect(sessionStorage.getItem('mc-pinned-ids')).toBe(JSON.stringify(['session-1']))
    })

    it('opens the unified context menu from the explicit menu button', () => {
        renderDashboard()

        fireEvent.click(screen.getByTitle('dashboard.openSessionMenu'))

        expect(screen.getByText('dashboard.archiveSession')).toBeInTheDocument()
        expect(screen.getByText('dashboard.copySessionId')).toBeInTheDocument()
    })

    it('hides open in new tab from the mobile context menu', () => {
        setCoarsePointer(true)
        renderDashboard()

        fireEvent.click(screen.getByTitle('dashboard.openSessionMenu'))

        expect(screen.queryByText('dashboard.openInNewTab')).not.toBeInTheDocument()
        expect(screen.getByText('dashboard.copySessionId')).toBeInTheDocument()
    })

    it('toggles pin directly from the pin button without opening the context menu', () => {
        renderDashboard()
        const pinButton = screen.getByTitle('dashboard.pinSession')

        fireEvent.click(pinButton)
        expect(sessionStorage.getItem('mc-pinned-ids')).toBe(JSON.stringify(['session-1']))
        expect(screen.queryByText('dashboard.archiveSession')).not.toBeInTheDocument()

        fireEvent.click(screen.getByTitle('dashboard.unpinSession'))
        expect(sessionStorage.getItem('mc-pinned-ids')).toBe('[]')
    })
})
