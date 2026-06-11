import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '@/api/client'
import type { AttachmentMetadata, Session } from '@/types/api'
import { FocusedSessionChatModal } from './FocusedSessionChatModal'

const useSessionMock = vi.fn()
const useMessagesMock = vi.fn()
const useSlashCommandsMock = vi.fn()
const useSkillsMock = vi.fn()
const useSendMessageMock = vi.fn()
const useRegisterActiveOverlaySessionMock = vi.fn()
const sessionChatMock = vi.fn()

vi.mock('@/hooks/queries/useSession', () => ({
    useSession: (...args: unknown[]) => useSessionMock(...args)
}))

vi.mock('@/hooks/queries/useMessages', () => ({
    useMessages: (...args: unknown[]) => useMessagesMock(...args)
}))

vi.mock('@/hooks/queries/useSlashCommands', () => ({
    useSlashCommands: (...args: unknown[]) => useSlashCommandsMock(...args)
}))

vi.mock('@/hooks/queries/useSkills', () => ({
    useSkills: (...args: unknown[]) => useSkillsMock(...args)
}))

vi.mock('@/hooks/mutations/useSendMessage', () => ({
    useSendMessage: (...args: unknown[]) => useSendMessageMock(...args)
}))

vi.mock('@/lib/active-chat-session', () => ({
    useRegisterActiveOverlaySession: (...args: unknown[]) => useRegisterActiveOverlaySessionMock(...args)
}))

vi.mock('@/lib/toast-context', () => ({
    useToast: () => ({ toasts: [], addToast: vi.fn(), removeToast: vi.fn() })
}))

vi.mock('@/components/SessionChat', () => ({
    SessionChat: (props: {
        session: Session
        hideHeader?: boolean
        compactMode?: boolean
        disableVoice?: boolean
        onSend: (text: string, attachments?: AttachmentMetadata[]) => void
    }) => {
        sessionChatMock(props)
        return (
            <div data-testid="session-chat">
                Focused Session Chat {props.session.id}
                <button type="button" onClick={() => props.onSend('focus question')}>
                    Send focus
                </button>
            </div>
        )
    }
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
        metadata: { path: '/repo/hapi', host: 'host', flavor: 'codex', name: 'Frontend polish' },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 1,
        thinking: false,
        thinkingAt: 1,
        backgroundTaskCount: 0,
        todos: undefined,
        teamState: undefined,
        model: 'gpt-5.4',
        modelReasoningEffort: null,
        effort: 'high',
        permissionMode: 'default',
        collaborationMode: undefined,
        ...overrides
    }
}

describe('FocusedSessionChatModal', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        useSessionMock.mockReturnValue({ session: makeSession(), isLoading: false, error: null, refetch: vi.fn() })
        useMessagesMock.mockReturnValue({
            messages: [],
            warning: null,
            isLoading: false,
            isLoadingMore: false,
            hasMore: false,
            pendingCount: 0,
            messagesVersion: 0,
            loadMore: vi.fn(),
            refetch: vi.fn(),
            flushPending: vi.fn(),
            setAtBottom: vi.fn()
        })
        useSlashCommandsMock.mockReturnValue({ commands: [], isLoading: false, error: null, getSuggestions: vi.fn(async () => []) })
        useSkillsMock.mockReturnValue({ skills: [], isLoading: false, error: null, getSuggestions: vi.fn(async () => []) })
        useSendMessageMock.mockReturnValue({ sendMessage: vi.fn(), retryMessage: vi.fn(), isSending: false })
    })

    afterEach(() => {
        cleanup()
    })

    it('renders a large focused session chat and sends through the focused session', () => {
        const api = {} as ApiClient
        const onClose = vi.fn()
        const sendMessage = vi.fn()
        useSendMessageMock.mockReturnValue({ sendMessage, retryMessage: vi.fn(), isSending: false })
        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })

        render(
            <QueryClientProvider client={queryClient}>
                <FocusedSessionChatModal api={api} sessionId="session-1" onClose={onClose} />
            </QueryClientProvider>
        )

        expect(screen.getByRole('dialog', { name: /Focus session/i })).toBeInTheDocument()
        expect(screen.getByText('Frontend polish')).toBeInTheDocument()
        expect(screen.getByText(/gpt-5.4/)).toBeInTheDocument()
        expect(screen.getByTestId('session-chat')).toHaveTextContent('Focused Session Chat session-1')
        expect(useRegisterActiveOverlaySessionMock).toHaveBeenCalledWith('session-1')
        expect(sessionChatMock).toHaveBeenCalledWith(expect.objectContaining({
            api,
            hideHeader: true,
            compactMode: false,
            disableVoice: true
        }))

        fireEvent.click(screen.getByRole('button', { name: /Send focus/i }))
        fireEvent.click(screen.getByRole('button', { name: /Close focus session/i }))

        expect(sendMessage).toHaveBeenCalledWith('focus question', undefined)
        expect(onClose).toHaveBeenCalled()
    })
})
