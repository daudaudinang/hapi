import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session, TeamChat } from '@/types/api'
import { SessionHeader } from './SessionHeader'

const navigateMock = vi.fn()
const useTeamChatsMock = vi.fn<() => { teamChats: TeamChat[]; isLoading: boolean; error: string | null; refetch: () => Promise<unknown> | unknown }>(() => ({ teamChats: [], isLoading: false, error: null, refetch: vi.fn() }))

vi.mock('@tanstack/react-router', () => ({
    useNavigate: () => navigateMock
}))

vi.mock('@/hooks/useTelegram', () => ({
    isTelegramApp: () => false
}))

vi.mock('@/hooks/queries/useMachines', () => ({
    useMachines: () => ({ machines: [], isLoading: false })
}))

vi.mock('@/hooks/queries/useTeamChats', () => ({
    useTeamChats: () => useTeamChatsMock()
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
    SessionActionMenu: () => null
}))

vi.mock('@/components/RenameSessionDialog', () => ({
    RenameSessionDialog: () => null
}))

vi.mock('@/components/ui/ConfirmDialog', () => ({
    ConfirmDialog: () => null
}))

vi.mock('@/lib/use-translation', () => ({
    useTranslation: () => ({ t: (key: string) => key })
}))

function makeSession(overrides: Partial<Session> = {}): Session {
    return {
        id: 'session-1',
        namespace: 'default',
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: true,
        activeAt: 1,
        metadata: { path: '/repo', host: 'host', machineId: 'machine-1', flavor: 'codex' },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 1,
        thinking: false,
        thinkingAt: 1,
        backgroundTaskCount: 0,
        todos: undefined,
        teamState: undefined,
        model: null,
        modelReasoningEffort: null,
        effort: null,
        permissionMode: 'default',
        collaborationMode: undefined,
        ...overrides
    }
}

describe('SessionHeader editor entry point', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        useTeamChatsMock.mockReturnValue({ teamChats: [], isLoading: false, error: null, refetch: vi.fn() })
    })

    afterEach(() => {
        cleanup()
    })

    it('opens the session project in editor mode', () => {
        const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        render(<QueryClientProvider client={qc}><SessionHeader session={makeSession()} onBack={vi.fn()} api={null} /></QueryClientProvider>)

        fireEvent.click(screen.getByRole('button', { name: 'Open in Editor' }))

        expect(navigateMock).toHaveBeenCalledWith({
            to: '/editor',
            search: { machine: 'machine-1', project: '/repo' }
        })
    })

    it('hides the editor action when machine or path is missing', () => {
        const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        render(<QueryClientProvider client={qc}><SessionHeader session={makeSession({ metadata: { path: '/repo', host: 'host' } })} onBack={vi.fn()} api={null} /></QueryClientProvider>)

        expect(screen.queryByRole('button', { name: 'Open in Editor' })).not.toBeInTheDocument()
    })

    it('creates a Team Chat with the current session', async () => {
        const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        const api = {
            createTeamChat: vi.fn(async () => ({ teamChat: { id: 'team-1' } })),
            addTeamParticipant: vi.fn(async () => ({ participant: { id: 'participant-1' } }))
        }
        render(<QueryClientProvider client={qc}><SessionHeader session={makeSession()} onBack={vi.fn()} api={api as never} /></QueryClientProvider>)

        fireEvent.click(screen.getByRole('button', { name: 'Open Team Chat menu' }))
        fireEvent.click(screen.getByRole('button', { name: 'Create Team Chat with this session' }))

        await vi.waitFor(() => expect(api.createTeamChat).toHaveBeenCalledWith({ name: 'repo', projectPath: '/repo' }))
        expect(api.addTeamParticipant).toHaveBeenCalledWith('team-1', {
            type: 'session',
            sessionId: 'session-1',
            displayName: 'repo',
            role: 'general',
            color: '#60a5fa'
        })
        await waitFor(() => expect(navigateMock).toHaveBeenCalledWith({
            to: '/team-chats/$teamChatId',
            params: { teamChatId: 'team-1' }
        }))
    })


    it('adds the current session to an existing Team Chat from the picker', async () => {
        useTeamChatsMock.mockReturnValue({
            teamChats: [
                { id: 'team-2', namespace: 'default', name: 'Frontend Team', projectPath: '/repo', createdAt: 1, updatedAt: 2 }
            ],
            isLoading: false,
            error: null,
            refetch: vi.fn()
        })
        const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        const api = {
            createTeamChat: vi.fn(),
            addTeamParticipant: vi.fn(async () => ({ participant: { id: 'participant-1' } }))
        }
        render(<QueryClientProvider client={qc}><SessionHeader session={makeSession()} onBack={vi.fn()} api={api as never} /></QueryClientProvider>)

        fireEvent.click(screen.getByRole('button', { name: 'Open Team Chat menu' }))
        fireEvent.click(screen.getByRole('button', { name: 'Add to Frontend Team' }))

        await waitFor(() => expect(api.addTeamParticipant).toHaveBeenCalledWith('team-2', {
            type: 'session',
            sessionId: 'session-1',
            displayName: 'repo',
            role: 'general',
            color: '#60a5fa'
        }))
        await waitFor(() => expect(navigateMock).toHaveBeenCalledWith({
            to: '/team-chats/$teamChatId',
            params: { teamChatId: 'team-2' }
        }))
    })
})
