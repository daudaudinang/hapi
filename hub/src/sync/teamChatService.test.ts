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
})
