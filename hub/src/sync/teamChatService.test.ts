import { describe, expect, it, mock } from 'bun:test'

import { Store } from '../store'
import { TeamChatService } from './teamChatService'

function createPublisher() {
    return { emit: mock(() => undefined) }
}

describe('TeamChatService', () => {
    it('posts a message and emits team-message-created', () => {
        const store = new Store(':memory:')
        const publisher = createPublisher()
        const service = new TeamChatService(store, publisher)
        const chat = service.createTeamChat({ namespace: 'default', name: 'Team Chat', projectPath: '/repo' })
        const user = service.addParticipant({ namespace: 'default', teamChatId: chat.id, type: 'user', displayName: 'You', role: 'general', color: '#34d399' })

        const result = service.postMessage({ namespace: 'default', teamChatId: chat.id, authorParticipantId: user.id, text: 'hello' })

        expect(result.message.seq).toBe(1)
        expect(publisher.emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'team-message-created', teamChatId: chat.id, messageId: result.message.id }))
    })

    it('builds reply previews and rejects foreign participants', () => {
        const store = new Store(':memory:')
        const publisher = createPublisher()
        const service = new TeamChatService(store, publisher)
        const chatA = service.createTeamChat({ namespace: 'default', name: 'Team A' })
        const chatB = service.createTeamChat({ namespace: 'default', name: 'Team B' })
        const userA = service.addParticipant({ namespace: 'default', teamChatId: chatA.id, type: 'user', displayName: 'You', role: 'general', color: '#34d399' })
        const userB = service.addParticipant({ namespace: 'default', teamChatId: chatB.id, type: 'user', displayName: 'Other', role: 'general', color: '#60a5fa' })
        const first = service.postMessage({ namespace: 'default', teamChatId: chatA.id, authorParticipantId: userA.id, text: 'first message' })

        const reply = service.postMessage({ namespace: 'default', teamChatId: chatA.id, authorParticipantId: userA.id, text: 'reply', replyToMessageId: first.message.id })

        expect(reply.message.replyPreview).toEqual({ authorName: 'You', excerpt: 'first message' })
        expect(() => service.postMessage({ namespace: 'default', teamChatId: chatA.id, authorParticipantId: userB.id, text: 'wrong chat' })).toThrow('TEAM_PARTICIPANT_NOT_FOUND')
    })

    it('rejects reply context lookups for messages outside the Team Chat', () => {
        const store = new Store(':memory:')
        const publisher = createPublisher()
        const service = new TeamChatService(store, publisher)
        const chatA = service.createTeamChat({ namespace: 'default', name: 'Team A' })
        const chatB = service.createTeamChat({ namespace: 'default', name: 'Team B' })
        const userA = service.addParticipant({ namespace: 'default', teamChatId: chatA.id, type: 'user', displayName: 'A', role: 'general', color: '#34d399' })
        const userB = service.addParticipant({ namespace: 'default', teamChatId: chatB.id, type: 'user', displayName: 'B', role: 'general', color: '#60a5fa' })
        const messageB = service.postMessage({ namespace: 'default', teamChatId: chatB.id, authorParticipantId: userB.id, text: 'foreign' })
        service.postMessage({ namespace: 'default', teamChatId: chatA.id, authorParticipantId: userA.id, text: 'local' })

        expect(() => service.getMessagesAround('default', chatA.id, messageB.message.id, { before: 20, after: 20 })).toThrow('TEAM_MESSAGE_NOT_FOUND')
    })

    it('creates mention requests and delegates delivery for mentioned sessions', () => {
        const store = new Store(':memory:')
        const publisher = createPublisher()
        const target = store.sessions.getOrCreateSession('backend', { path: '/repo' }, null, 'default')
        const delivery = { deliver: mock(() => undefined) }
        const service = new TeamChatService(store, publisher, delivery, () => ({
            active: true,
            thinking: false,
            agentState: { controlledByUser: false, requests: {}, completedRequests: {} }
        } as never))
        const chat = service.createTeamChat({ namespace: 'default', name: 'Team Chat' })
        const user = service.addParticipant({ namespace: 'default', teamChatId: chat.id, type: 'user', displayName: 'You', role: 'general', color: '#34d399' })
        const backend = service.addParticipant({ namespace: 'default', teamChatId: chat.id, type: 'session', sessionId: target.id, displayName: 'Backend API', role: 'backend', color: '#60a5fa' })

        service.postMessage({ namespace: 'default', teamChatId: chat.id, authorParticipantId: user.id, text: 'Earlier full team context message with important details that should not be hidden' })
        const result = service.postMessage({ namespace: 'default', teamChatId: chat.id, authorParticipantId: user.id, text: '@Backend API confirm fields' })

        expect(result.message.mentions).toEqual([{ participantId: backend.id, sessionId: target.id }])
        const requests = store.teamChats.listPendingMentionRequests('default', target.id)
        expect(requests).toHaveLength(1)
        expect(delivery.deliver).toHaveBeenCalledWith(expect.objectContaining({
            namespace: 'default',
            request: expect.objectContaining({ id: requests[0].id }),
            mode: 'invoke-agent',
            envelope: expect.stringContaining('[HAPI_TEAM_MENTION]')
        }))
        expect(delivery.deliver).toHaveBeenCalledWith(expect.objectContaining({
            envelope: expect.stringContaining('Reply behavior:')
        }))
        expect(delivery.deliver).toHaveBeenCalledWith(expect.objectContaining({
            envelope: expect.stringContaining('Earlier full team context message with important details that should not be hidden')
        }))
    })

})
