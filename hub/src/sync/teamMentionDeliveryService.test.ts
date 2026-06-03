import { describe, expect, it, mock } from 'bun:test'
import { Store } from '../store'
import { MessageService } from './messageService'
import { TeamMentionDeliveryService, getMentionDeliveryMode } from './teamMentionDeliveryService'

function createIo() {
    const updates: unknown[] = []
    return {
        updates,
        io: {
            of: () => ({
                to: () => ({
                    emit: (_event: string, payload: unknown) => updates.push(payload)
                })
            })
        }
    }
}

function createRequest(store: Store) {
    const session = store.sessions.getOrCreateSession('target', { path: '/repo' }, null, 'default')
    const chat = store.teamChats.createTeamChat({ namespace: 'default', name: 'Team' })
    const user = store.teamChats.addParticipant({ namespace: 'default', teamChatId: chat.id, type: 'user', displayName: 'You', role: 'general', color: '#34d399' })
    const message = store.teamChats.addMessage({ namespace: 'default', teamChatId: chat.id, authorParticipantId: user.id, text: '@Target hello', mentions: [] })
    const request = store.teamChats.addMentionRequest({
        namespace: 'default',
        teamChatId: chat.id,
        sourceMessageId: message.id,
        targetSessionId: session.id,
        contextSnapshot: { originalText: message.text, sharedContext: { decisions: [], openQuestions: [], relevantFiles: [] }, attachedFiles: [], recentUpdates: [] },
        hopDepth: 0
    })
    return { request, session }
}

describe('TeamMentionDeliveryService', () => {
    it('emits CLI update only when mention should invoke the agent', () => {
        const store = new Store(':memory:')
        const { request } = createRequest(store)
        const { io, updates } = createIo()
        const publisher = { emit: mock(() => undefined) }
        const messageService = new MessageService(store, io as never, publisher as never)
        const delivery = new TeamMentionDeliveryService(messageService, store, publisher)

        delivery.deliver({ namespace: 'default', request, envelope: '[HAPI_TEAM_MENTION]\nhello', mode: 'invoke-agent' })

        expect(updates).toHaveLength(1)
        expect(store.teamChats.getMentionRequest('default', request.id)?.status).toBe('delivered')
        expect(publisher.emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'team-mention-updated', requestId: request.id }))
    })

    it('stores card-only mentions without interrupting the CLI', () => {
        const store = new Store(':memory:')
        const { request } = createRequest(store)
        const { io, updates } = createIo()
        const publisher = { emit: mock(() => undefined) }
        const messageService = new MessageService(store, io as never, publisher as never)
        const delivery = new TeamMentionDeliveryService(messageService, store, publisher)

        delivery.deliver({ namespace: 'default', request, envelope: '[HAPI_TEAM_MENTION]\nhello', mode: 'card-only' })

        expect(updates).toHaveLength(0)
        expect(store.messages.getMessages(request.targetSessionId, 10)).toHaveLength(1)
    })

    it('uses card-only for thinking, inactive, or user-controlled sessions', () => {
        expect(getMentionDeliveryMode({ active: true, thinking: false, agentState: { controlledByUser: false } })).toBe('invoke-agent')
        expect(getMentionDeliveryMode({ active: true, thinking: true, agentState: { controlledByUser: false } })).toBe('card-only')
        expect(getMentionDeliveryMode({ active: true, thinking: false, agentState: { controlledByUser: true } })).toBe('card-only')
        expect(getMentionDeliveryMode({ active: false, thinking: false, agentState: { controlledByUser: false } })).toBe('card-only')
    })
})
