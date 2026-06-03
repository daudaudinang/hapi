import { describe, expect, it, mock } from 'bun:test'
import { Store } from '../store'
import { TeamChatService } from './teamChatService'

function createContext() {
    const store = new Store(':memory:')
    const backendSession = store.sessions.getOrCreateSession('backend', { path: '/repo' }, null, 'default')
    const testsSession = store.sessions.getOrCreateSession('tests', { path: '/repo' }, null, 'default')
    const service = new TeamChatService(store, { emit: mock(() => undefined) })
    const chat = service.createTeamChat({ namespace: 'default', name: 'Team' })
    const backend = service.addParticipant({ namespace: 'default', teamChatId: chat.id, type: 'session', sessionId: backendSession.id, displayName: 'Backend', role: 'backend', color: '#60a5fa' })
    const tests = service.addParticipant({ namespace: 'default', teamChatId: chat.id, type: 'session', sessionId: testsSession.id, displayName: 'Tests', role: 'tests', color: '#fbbf24' })
    const user = service.addParticipant({ namespace: 'default', teamChatId: chat.id, type: 'user', displayName: 'You', role: 'general', color: '#34d399' })
    return { store, service, chat, backend, tests, user, backendSession, testsSession }
}

describe('Team Chat reports', () => {
    it('ReportToTeam creates structured report and marks request responded', () => {
        const { store, service, chat, backend, tests, user, backendSession } = createContext()
        const source = service.postMessage({ namespace: 'default', teamChatId: chat.id, authorParticipantId: user.id, text: '@Backend blocked?' }).message
        const request = store.teamChats.listPendingMentionRequests('default', backendSession.id)[0]
        store.teamChats.updateMentionStatus({ namespace: 'default', requestId: request.id, status: 'processing', processingStartedAt: Date.now() })

        const report = service.reportToTeam({
            namespace: 'default',
            teamChatId: chat.id,
            authorParticipantId: backend.id,
            type: 'blocked',
            summary: 'Blocked on schema. @Tests please verify route behavior',
            replyToRequestId: request.id
        })

        expect(report.message.reportType).toBe('blocked')
        expect(report.message.replyToMessageId).toBe(source.id)
        expect(store.teamChats.getMentionRequest('default', request.id)?.status).toBe('responded')
        expect(store.teamChats.listPendingMentionRequests('default', tests.sessionId!).map((item) => item.sourceMessageId)).toEqual([report.message.id])
    })

    it('no-action marks mention without posting a report', () => {
        const { store, service, chat, user, backendSession } = createContext()
        service.postMessage({ namespace: 'default', teamChatId: chat.id, authorParticipantId: user.id, text: '@Backend FYI' })
        const request = store.teamChats.listPendingMentionRequests('default', backendSession.id)[0]
        store.teamChats.updateMentionStatus({ namespace: 'default', requestId: request.id, status: 'seen', seenAt: Date.now() })

        service.markMentionNoAction({ namespace: 'default', sessionId: backendSession.id, requestId: request.id })

        expect(store.teamChats.getMentionRequest('default', request.id)?.status).toBe('no_action')
        expect(store.teamChats.getMessages('default', chat.id, 10).map((message) => message.reportType)).not.toContain('reply')
    })

    it('rejects low-signal reports that are not replying to a request', () => {
        const { service, chat, backend } = createContext()

        expect(() => service.reportToTeam({ namespace: 'default', teamChatId: chat.id, authorParticipantId: backend.id, type: 'done', summary: 'done' })).toThrow('TEAM_REPORT_TOO_LOW_SIGNAL')
    })
})
