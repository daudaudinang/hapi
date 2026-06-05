import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiClient } from './client'

describe('ApiClient team chat methods', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    function mockJson(body: unknown) {
        return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => body
        } as Response)
    }

    it('lists and creates Team Chats', async () => {
        const fetchMock = mockJson({ teamChats: [] })
        const api = new ApiClient('token')

        await api.getTeamChats()
        await api.createTeamChat({ name: 'Build Team Chat', projectPath: '/repo' })

        expect(fetchMock).toHaveBeenCalledWith('/api/team-chats', expect.any(Object))
        expect(fetchMock).toHaveBeenCalledWith('/api/team-chats', expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ name: 'Build Team Chat', projectPath: '/repo' })
        }))
    })

    it('fetches a Team Chat detail with URL encoding', async () => {
        const fetchMock = mockJson({ teamChat: { id: 'team/1', name: 'Team' } })
        const api = new ApiClient('token')

        await api.getTeamChat('team/1')

        expect(fetchMock).toHaveBeenCalledWith('/api/team-chats/team%2F1', expect.any(Object))
    })

    it('deletes a Team Chat with URL encoding', async () => {
        const fetchMock = mockJson({ ok: true })
        const api = new ApiClient('token')

        await api.deleteTeamChat('team/1')

        expect(fetchMock).toHaveBeenCalledWith('/api/team-chats/team%2F1', expect.objectContaining({
            method: 'DELETE'
        }))
    })

    it('fetches Team Chat messages with limit, beforeSeq, and URL encoding', async () => {
        const fetchMock = mockJson({ messages: [], page: { limit: 20, nextBeforeSeq: null, hasMore: false } })
        const api = new ApiClient('token')

        await api.getTeamMessages('team/1', { limit: 20, beforeSeq: 7 })

        expect(fetchMock).toHaveBeenCalledWith('/api/team-chats/team%2F1/messages?limit=20&beforeSeq=7', expect.any(Object))
    })

    it('fetches Team Chat reply context with URL encoding', async () => {
        const fetchMock = mockJson({ messages: [], page: { limit: 41, nextBeforeSeq: null, hasMore: false } })
        const api = new ApiClient('token')

        await api.getTeamMessagesAround('team/1', 'msg/2')

        expect(fetchMock).toHaveBeenCalledWith('/api/team-chats/team%2F1/messages/msg%2F2/context', expect.any(Object))
    })

    it('sends Team Chat messages and lists participants/session mentions', async () => {
        const fetchMock = mockJson({ ok: true })
        const api = new ApiClient('token')

        await api.sendTeamMessage('team/1', { authorParticipantId: 'p1', text: 'hello', replyToMessageId: 'm1' })
        await api.getTeamParticipants('team/1')
        await api.addTeamParticipant('team/1', { type: 'session', sessionId: 'session-1', displayName: 'Backend', role: 'backend', color: '#60a5fa' })
        await api.updateTeamParticipant('team/1', 'participant/1', { displayName: 'UI Lead', role: 'frontend', color: '#a78bfa' })
        await api.deleteTeamParticipant('team/1', 'participant/1')
        await api.getSessionTeamMentions('session/1')
        await api.getSessionTeamMemberships('session/1')
        await api.updateTeamMentionStatus('session/1', 'req/1', 'no_action')

        expect(fetchMock).toHaveBeenCalledWith('/api/team-chats/team%2F1/messages', expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ authorParticipantId: 'p1', text: 'hello', replyToMessageId: 'm1' })
        }))
        expect(fetchMock).toHaveBeenCalledWith('/api/team-chats/team%2F1/participants', expect.any(Object))
        expect(fetchMock).toHaveBeenCalledWith('/api/team-chats/team%2F1/participants', expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ type: 'session', sessionId: 'session-1', displayName: 'Backend', role: 'backend', color: '#60a5fa' })
        }))
        expect(fetchMock).toHaveBeenCalledWith('/api/team-chats/team%2F1/participants/participant%2F1', expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ displayName: 'UI Lead', role: 'frontend', color: '#a78bfa' })
        }))
        expect(fetchMock).toHaveBeenCalledWith('/api/team-chats/team%2F1/participants/participant%2F1', expect.objectContaining({
            method: 'DELETE'
        }))
        expect(fetchMock).toHaveBeenCalledWith('/api/sessions/session%2F1/team-mentions', expect.any(Object))
        expect(fetchMock).toHaveBeenCalledWith('/api/sessions/session%2F1/team-memberships', expect.any(Object))
        expect(fetchMock).toHaveBeenCalledWith('/api/sessions/session%2F1/team-mentions/req%2F1', expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ status: 'no_action' })
        }))
    })
})
