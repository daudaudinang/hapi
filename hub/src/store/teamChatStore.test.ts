import { describe, expect, it } from 'bun:test'

import { Store } from './index'

describe('TeamChatStore', () => {
    it('creates chats, participants, and seq-ordered messages by namespace', () => {
        const store = new Store(':memory:')
        const chat = store.teamChats.createTeamChat({ namespace: 'ns-a', name: 'Build Team Chat', projectPath: '/repo' })
        const user = store.teamChats.addParticipant({
            namespace: 'ns-a',
            teamChatId: chat.id,
            type: 'user',
            displayName: 'You',
            color: '#34d399',
            role: 'general'
        })
        const msg = store.teamChats.addMessage({
            namespace: 'ns-a',
            teamChatId: chat.id,
            authorParticipantId: user.id,
            text: '@Backend confirm fields',
            mentions: []
        })

        expect(msg.seq).toBe(1)
        expect(store.teamChats.listTeamChats('ns-a')).toHaveLength(1)
        expect(store.teamChats.listTeamChats('ns-b')).toHaveLength(0)
    })

    it('fetches messages around a reply target', () => {
        const store = new Store(':memory:')
        const chat = store.teamChats.createTeamChat({ namespace: 'default', name: 'Chat' })
        const user = store.teamChats.addParticipant({ namespace: 'default', teamChatId: chat.id, type: 'user', displayName: 'You', color: '#34d399', role: 'general' })
        const first = store.teamChats.addMessage({ namespace: 'default', teamChatId: chat.id, authorParticipantId: user.id, text: 'first', mentions: [] })
        store.teamChats.addMessage({ namespace: 'default', teamChatId: chat.id, authorParticipantId: user.id, text: 'second', mentions: [] })

        const around = store.teamChats.getMessagesAround({ namespace: 'default', teamChatId: chat.id, messageId: first.id, before: 5, after: 5 })
        expect(around.messages.map((message) => message.text)).toEqual(['first', 'second'])
    })

    it('stores mention requests and lifecycle timestamps', () => {
        const store = new Store(':memory:')
        const targetSession = store.sessions.getOrCreateSession('session-backend', { path: '/repo' }, null, 'default')
        const chat = store.teamChats.createTeamChat({ namespace: 'default', name: 'Chat' })
        const user = store.teamChats.addParticipant({ namespace: 'default', teamChatId: chat.id, type: 'user', displayName: 'You', color: '#34d399', role: 'general' })
        const message = store.teamChats.addMessage({ namespace: 'default', teamChatId: chat.id, authorParticipantId: user.id, text: '@Backend confirm', mentions: [] })
        const request = store.teamChats.addMentionRequest({
            namespace: 'default',
            teamChatId: chat.id,
            sourceMessageId: message.id,
            targetSessionId: targetSession.id,
            contextSnapshot: {
                originalText: message.text,
                sharedContext: { decisions: [], openQuestions: [], relevantFiles: [] },
                attachedFiles: [],
                recentUpdates: []
            },
            hopDepth: 1
        })

        const seenAt = Date.now()
        store.teamChats.updateMentionStatus({ namespace: 'default', requestId: request.id, status: 'seen', seenAt })

        const updated = store.teamChats.getMentionRequest('default', request.id)
        expect(updated?.status).toBe('seen')
        expect(updated?.seenAt).toBe(seenAt)
        expect(store.teamChats.listPendingMentionRequests('default', targetSession.id).map((item) => item.id)).toEqual([request.id])
        expect(store.teamChats.getMentionRequest('other-ns', request.id)).toBeNull()
    })

    it('requires mention target sessions to exist', () => {
        const store = new Store(':memory:')
        const chat = store.teamChats.createTeamChat({ namespace: 'default', name: 'Chat' })
        const user = store.teamChats.addParticipant({ namespace: 'default', teamChatId: chat.id, type: 'user', displayName: 'You', color: '#34d399', role: 'general' })
        const message = store.teamChats.addMessage({ namespace: 'default', teamChatId: chat.id, authorParticipantId: user.id, text: '@Backend confirm', mentions: [] })

        expect(() => store.teamChats.addMentionRequest({
            namespace: 'default',
            teamChatId: chat.id,
            sourceMessageId: message.id,
            targetSessionId: 'missing-session',
            contextSnapshot: {
                originalText: message.text,
                sharedContext: { decisions: [], openQuestions: [], relevantFiles: [] },
                attachedFiles: [],
                recentUpdates: []
            },
            hopDepth: 1
        })).toThrow()
    })
})
