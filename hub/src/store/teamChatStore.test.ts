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

    it('reuses the active participant when adding the same session twice', () => {
        const store = new Store(':memory:')
        const session = store.sessions.getOrCreateSession('session-backend', { path: '/repo' }, null, 'default')
        const chat = store.teamChats.createTeamChat({ namespace: 'default', name: 'Chat' })

        const first = store.teamChats.addParticipant({
            namespace: 'default',
            teamChatId: chat.id,
            type: 'session',
            sessionId: session.id,
            displayName: 'Backend',
            color: '#60a5fa',
            role: 'backend'
        })
        const second = store.teamChats.addParticipant({
            namespace: 'default',
            teamChatId: chat.id,
            type: 'session',
            sessionId: session.id,
            displayName: 'Backend duplicate',
            color: '#f87171',
            role: 'general'
        })

        expect(second.id).toBe(first.id)
        expect(store.teamChats.listParticipants('default', chat.id)).toHaveLength(1)
        expect(store.teamChats.getActiveSessionParticipant('default', chat.id, session.id)?.role).toBe('backend')
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

    it('rejects cross-namespace writes for participants, messages, and mention requests', () => {
        const store = new Store(':memory:')
        const sessionA = store.sessions.getOrCreateSession('session-a', { path: '/repo-a' }, null, 'ns-a')
        const sessionB = store.sessions.getOrCreateSession('session-b', { path: '/repo-b' }, null, 'ns-b')
        const chatA = store.teamChats.createTeamChat({ namespace: 'ns-a', name: 'A' })
        const userA = store.teamChats.addParticipant({ namespace: 'ns-a', teamChatId: chatA.id, type: 'user', displayName: 'A', color: '#34d399', role: 'general' })
        const messageA = store.teamChats.addMessage({ namespace: 'ns-a', teamChatId: chatA.id, authorParticipantId: userA.id, text: 'hello', mentions: [] })

        expect(() => store.teamChats.addParticipant({ namespace: 'ns-b', teamChatId: chatA.id, type: 'session', sessionId: sessionB.id, displayName: 'B', color: '#60a5fa', role: 'backend' })).toThrow('TEAM_CHAT_NOT_FOUND')
        expect(() => store.teamChats.addMessage({ namespace: 'ns-b', teamChatId: chatA.id, authorParticipantId: userA.id, text: 'leak', mentions: [] })).toThrow('TEAM_CHAT_NOT_FOUND')
        expect(() => store.teamChats.addMentionRequest({
            namespace: 'ns-b',
            teamChatId: chatA.id,
            sourceMessageId: messageA.id,
            targetSessionId: sessionB.id,
            contextSnapshot: {
                originalText: messageA.text,
                sharedContext: { decisions: [], openQuestions: [], relevantFiles: [] },
                attachedFiles: [],
                recentUpdates: []
            },
            hopDepth: 1
        })).toThrow('TEAM_CHAT_NOT_FOUND')
        expect(() => store.teamChats.addMentionRequest({
            namespace: 'ns-a',
            teamChatId: chatA.id,
            sourceMessageId: messageA.id,
            targetSessionId: sessionB.id,
            contextSnapshot: {
                originalText: messageA.text,
                sharedContext: { decisions: [], openQuestions: [], relevantFiles: [] },
                attachedFiles: [],
                recentUpdates: []
            },
            hopDepth: 1
        })).toThrow('TEAM_SESSION_NOT_FOUND')
        expect(store.teamChats.listTeamChats('ns-b')).toHaveLength(0)
        expect(store.teamChats.getMessages('ns-b', chatA.id, 10)).toEqual([])
        expect(sessionA.namespace).toBe('ns-a')
    })

    it('does not use a message from another Team Chat as an around-page anchor', () => {
        const store = new Store(':memory:')
        const chatA = store.teamChats.createTeamChat({ namespace: 'default', name: 'A' })
        const chatB = store.teamChats.createTeamChat({ namespace: 'default', name: 'B' })
        const userA = store.teamChats.addParticipant({ namespace: 'default', teamChatId: chatA.id, type: 'user', displayName: 'A', color: '#34d399', role: 'general' })
        const userB = store.teamChats.addParticipant({ namespace: 'default', teamChatId: chatB.id, type: 'user', displayName: 'B', color: '#60a5fa', role: 'general' })
        store.teamChats.addMessage({ namespace: 'default', teamChatId: chatA.id, authorParticipantId: userA.id, text: 'local', mentions: [] })
        const foreign = store.teamChats.addMessage({ namespace: 'default', teamChatId: chatB.id, authorParticipantId: userB.id, text: 'foreign', mentions: [] })

        expect(store.teamChats.getMessagesAround({ namespace: 'default', teamChatId: chatA.id, messageId: foreign.id, before: 5, after: 5 }).messages).toEqual([])
    })

})
