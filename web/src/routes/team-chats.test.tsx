import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '@/api/client'
import TeamChatsPage from './team-chats'

const navigateMock = vi.fn()
const useTeamChatsMock = vi.fn()
const useTeamChatActionsMock = vi.fn()
const api = {} as ApiClient

vi.mock('@tanstack/react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@tanstack/react-router')>()
    return {
        ...actual,
        Link: (props: {
            children: React.ReactNode
            className?: string
            to: string
            params?: { teamChatId?: string }
        }) => (
            <a href={props.params?.teamChatId ? `/team-chats/${props.params.teamChatId}` : props.to} className={props.className}>
                {props.children}
            </a>
        ),
        useNavigate: () => navigateMock,
        useSearch: () => ({ machine: 'machine-1', project: '/repo' })
    }
})

vi.mock('@/lib/app-context', () => ({
    useAppContext: () => ({ api })
}))

vi.mock('@/hooks/queries/useTeamChats', () => ({
    useTeamChats: () => useTeamChatsMock()
}))

vi.mock('@/hooks/mutations/useTeamChatActions', () => ({
    useTeamChatActions: (...args: unknown[]) => useTeamChatActionsMock(...args)
}))

describe('TeamChatsPage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        useTeamChatsMock.mockReturnValue({ teamChats: [], isLoading: false, error: null })
        useTeamChatActionsMock.mockReturnValue({
            createTeamChat: vi.fn(async () => 'team-new'),
            addTeamParticipantTo: vi.fn(async () => {}),
            deleteTeamChat: vi.fn(async () => {}),
            isPending: false
        })
    })

    afterEach(() => {
        cleanup()
    })

    it('creates a standalone Team Chat with a user participant', async () => {
        const createTeamChat = vi.fn(async () => 'team-new')
        const addTeamParticipantTo = vi.fn(async () => {})
        useTeamChatActionsMock.mockReturnValue({
            createTeamChat,
            addTeamParticipantTo,
            deleteTeamChat: vi.fn(async () => {}),
            isPending: false
        })

        render(<TeamChatsPage />)

        fireEvent.click(screen.getByRole('button', { name: /New Team Chat/i }))
        fireEvent.change(screen.getByRole('textbox', { name: /Team Chat name/i }), { target: { value: 'Planning Room' } })
        fireEvent.click(screen.getByRole('button', { name: /^Create Team Chat$/i }))

        await waitFor(() => expect(createTeamChat).toHaveBeenCalledWith({ name: 'Planning Room', projectPath: '/repo' }))
        expect(addTeamParticipantTo).toHaveBeenCalledWith('team-new', {
            type: 'user',
            userId: null,
            sessionId: null,
            displayName: 'You',
            role: 'general',
            color: '#34d399'
        })
        expect(navigateMock).toHaveBeenCalledWith({
            to: '/team-chats/$teamChatId',
            params: { teamChatId: 'team-new' },
            search: { machine: 'machine-1', project: '/repo' }
        })
    })

    it('deletes a Team Chat after confirmation without deleting sessions', async () => {
        const deleteTeamChat = vi.fn(async () => {})
        useTeamChatsMock.mockReturnValue({
            teamChats: [{ id: 'team-1', namespace: 'default', name: 'Planning', projectPath: '/repo', createdAt: 1, updatedAt: 2 }],
            isLoading: false,
            error: null
        })
        useTeamChatActionsMock.mockReturnValue({
            createTeamChat: vi.fn(async () => 'team-new'),
            addTeamParticipantTo: vi.fn(async () => {}),
            deleteTeamChat,
            isPending: false
        })

        render(<TeamChatsPage />)

        fireEvent.click(screen.getByRole('button', { name: /Delete Planning/i }))
        expect(screen.getByText('Sessions in this Team Chat will not be deleted.')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: /^Delete Team Chat$/i }))

        await waitFor(() => expect(deleteTeamChat).toHaveBeenCalledWith('team-1'))
    })
})
