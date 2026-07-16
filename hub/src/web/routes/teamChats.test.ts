import { describe, expect, it } from 'bun:test'
import { Hono } from 'hono'

import type { SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { createTeamChatsRoutes } from './teamChats'

function createApp(namespace: string, engine: Record<string, unknown>, actor: { membershipId: string; role: 'admin' | 'member' | 'viewer' } = { membershipId: 'admin', role: 'admin' }) {
    const app = new Hono<WebAppEnv>()
    app.use('*', async (c, next) => {
        c.set('namespace', namespace)
        c.set('organizationId', namespace)
        c.set('membershipId', actor.membershipId)
        c.set('organizationRole', actor.role)
        await next()
    })
    const augmentedEngine = {
        getTeamChat: (_organizationId: string, teamChatId: string) => ({ id: teamChatId, namespace, ownerMembershipId: 'admin', name: 'Team', projectPath: null, sharedContext: null, archivedAt: null, createdAt: 1, updatedAt: 1 }),
        listTeamParticipants: () => ['participant-1', 'p1'].map((id) => ({
            id, namespace, teamChatId: 'team-1', type: 'user' as const, userId: actor.membershipId,
            sessionId: null, displayName: id, role: 'general' as const, color: '#60a5fa',
            archivedAt: null, joinedAt: 1
        })),
        listSessionTeamMentions: (_organizationId: string, sessionId: string) => [{
            id: 'req-1', teamChatId: 'team-1', sourceMessageId: 'msg-1', targetSessionId: sessionId,
            status: 'seen', contextSnapshot: null, hopDepth: 0, parentRequestId: null, error: null,
            createdAt: 1, deliveredAt: null, seenAt: null, processingStartedAt: null, resolvedAt: null
        }],
        ...engine
    }
    app.route('/api', createTeamChatsRoutes(
        () => augmentedEngine as unknown as SyncEngine,
        { resolveLiveSubject: (organizationId: string, membershipId: string) => ({ organizationId, membershipId, role: actor.role, disabled: false }) },
        () => 'manage'
    ))
    return app
}

describe('team chat routes', () => {
    it('rejects team chat access across namespaces', async () => {
        const engine = {
            getTeamChat: (namespace: string, id: string) => namespace === 'ns-a' && id === 'team-a' ? { id: 'team-a', namespace: 'ns-a', name: 'Team', projectPath: null, sharedContext: null, archivedAt: null, createdAt: 1, updatedAt: 1 } : null,
            listTeamChats: () => []
        }
        const app = createApp('ns-b', engine)
        const response = await app.request('/api/team-chats/team-a')
        expect(response.status).toBe(404)
    })

    it('posts messages through the namespace-scoped engine API', async () => {
        const calls: unknown[] = []
        const engine = {
            postTeamMessage: (input: unknown) => {
                calls.push(input)
                return {
                    message: {
                        id: 'msg-1',
                        namespace: 'default',
                        teamChatId: 'team-1',
                        seq: 1,
                        authorParticipantId: 'participant-1',
                        text: 'hello',
                        reportType: null,
                        replyToMessageId: null,
                        replyPreview: null,
                        mentions: [],
                        files: [],
                        createdAt: 1
                    }
                }
            }
        }
        const app = createApp('default', engine)

        const response = await app.request('/api/team-chats/team-1/messages', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ authorParticipantId: 'participant-1', text: 'hello', replyToMessageId: null })
        })

        expect(response.status).toBe(201)
        expect(calls).toEqual([{ namespace: 'default', teamChatId: 'team-1', authorParticipantId: 'participant-1', text: 'hello', replyToMessageId: null }])
    })

    it('maps Team Chat ownership errors to 404 responses', async () => {
        const engine = {
            postTeamMessage: () => {
                throw new Error('TEAM_PARTICIPANT_NOT_FOUND')
            }
        }
        const app = createApp('default', engine)

        const response = await app.request('/api/team-chats/team-1/messages', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ authorParticipantId: 'foreign-participant', text: 'hello' })
        })

        expect(response.status).toBe(404)
        expect(await response.json()).toEqual({ error: 'Team Chat resource not found' })
    })

    it('archives Team Chats through the namespace-scoped engine API', async () => {
        const calls: unknown[] = []
        const engine = {
            archiveTeamChat: (namespace: string, teamChatId: string) => {
                calls.push({ namespace, teamChatId })
            }
        }
        const app = createApp('ns-a', engine)

        const response = await app.request('/api/team-chats/team-1', { method: 'DELETE' })

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ ok: true })
        expect(calls).toEqual([{ namespace: 'ns-a', teamChatId: 'team-1' }])
    })

    it('rejects wrong-team reply context IDs', async () => {
        const engine = {
            getTeamMessagesAround: () => {
                throw new Error('TEAM_MESSAGE_NOT_FOUND')
            }
        }
        const app = createApp('default', engine)

        const response = await app.request('/api/team-chats/team-a/messages/msg-from-team-b/context')

        expect(response.status).toBe(404)
        expect(await response.json()).toEqual({ error: 'Team Chat resource not found' })
    })

    it('rejects invalid Team Chat message query params', async () => {
        const engine = { getTeamMessages: () => ({ messages: [], page: { limit: 50, beforeSeq: null, nextBeforeSeq: null, hasMore: false } }) }
        const app = createApp('default', engine)

        const response = await app.request('/api/team-chats/team-1/messages?limit=bad')

        expect(response.status).toBe(400)
        expect(await response.json()).toEqual({ error: 'Invalid query' })
    })

    it('lists session Team mention requests through namespace-scoped session access', async () => {
        const calls: unknown[] = []
        const engine = {
            resolveSessionAccess: (sessionId: string, namespace: string) => ({
                ok: true as const,
                sessionId,
                session: { id: sessionId, namespace, active: true }
            }),
            listSessionTeamMentions: (namespace: string, sessionId: string) => {
                calls.push({ namespace, sessionId })
                return [{ id: 'req-1', teamChatId: 'team-1', sourceMessageId: 'msg-1', targetSessionId: sessionId, status: 'seen', createdAt: 1 }]
            }
        }
        const app = createApp('ns-a', engine)

        const response = await app.request('/api/sessions/session-1/team-mentions')

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ requests: [{ id: 'req-1', teamChatId: 'team-1', sourceMessageId: 'msg-1', targetSessionId: 'session-1', status: 'seen', createdAt: 1 }] })
        expect(calls).toEqual([{ namespace: 'ns-a', sessionId: 'session-1' }])
    })

    it('lists session Team Chat memberships with aliases through namespace-scoped session access', async () => {
        const calls: unknown[] = []
        const engine = {
            resolveSessionAccess: (sessionId: string, namespace: string) => ({
                ok: true as const,
                sessionId,
                session: { id: sessionId, namespace, active: true }
            }),
            listSessionTeamMemberships: (namespace: string, sessionId: string) => {
                calls.push({ namespace, sessionId })
                return [{
                    teamChat: { id: 'team-1', namespace, name: 'Frontend Team', projectPath: '/repo', createdAt: 1, updatedAt: 2 },
                    participant: { id: 'p1', teamChatId: 'team-1', type: 'session', sessionId, displayName: 'UI', role: 'frontend', color: '#60a5fa', joinedAt: 3 }
                }]
            }
        }
        const app = createApp('ns-a', engine)

        const response = await app.request('/api/sessions/session-1/team-memberships')

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
            memberships: [{
                teamChat: { id: 'team-1', namespace: 'ns-a', name: 'Frontend Team', projectPath: '/repo', createdAt: 1, updatedAt: 2 },
                participant: { id: 'p1', teamChatId: 'team-1', type: 'session', sessionId: 'session-1', displayName: 'UI', role: 'frontend', color: '#60a5fa', joinedAt: 3 }
            }]
        })
        expect(calls).toEqual([{ namespace: 'ns-a', sessionId: 'session-1' }])
    })

    it('updates a Team Chat participant through the namespace-scoped engine API', async () => {
        const calls: unknown[] = []
        const engine = {
            updateTeamParticipant: (input: unknown) => {
                calls.push(input)
                return { id: 'p1', teamChatId: 'team-1', type: 'session', sessionId: 'session-1', displayName: 'UI Lead', role: 'frontend', color: '#a78bfa', joinedAt: 1 }
            }
        }
        const app = createApp('ns-a', engine)

        const response = await app.request('/api/team-chats/team-1/participants/p1', {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ displayName: '  UI Lead  ', role: 'frontend', color: '#a78bfa' })
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ participant: { id: 'p1', teamChatId: 'team-1', type: 'session', sessionId: 'session-1', displayName: 'UI Lead', role: 'frontend', color: '#a78bfa', joinedAt: 1 } })
        expect(calls).toEqual([{
            namespace: 'ns-a',
            teamChatId: 'team-1',
            participantId: 'p1',
            displayName: 'UI Lead',
            role: 'frontend',
            color: '#a78bfa'
        }])
    })

    it('trims participant aliases before adding a Team Chat member', async () => {
        const calls: unknown[] = []
        const engine = {
            addTeamParticipant: (input: unknown) => {
                calls.push(input)
                return { id: 'p1', teamChatId: 'team-1', type: 'session', sessionId: 'session-1', displayName: 'UI', role: 'general', color: '#60a5fa', joinedAt: 1 }
            }
        }
        const app = createApp('default', engine)

        const response = await app.request('/api/team-chats/team-1/participants', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ type: 'session', sessionId: 'session-1', displayName: '  UI  ', role: 'general', color: '#60a5fa' })
        })

        expect(response.status).toBe(201)
        expect(calls).toEqual([{
            namespace: 'default',
            teamChatId: 'team-1',
            type: 'session',
            sessionId: 'session-1',
            displayName: 'UI',
            role: 'general',
            color: '#60a5fa'
        }])
    })

    it('marks Team mention requests seen with session ownership guard and emits updates', async () => {
        const calls: unknown[] = []
        const engine = {
            resolveSessionAccess: (sessionId: string, namespace: string) => ({
                ok: true as const,
                sessionId,
                session: { id: sessionId, namespace, active: true }
            }),
            updateTeamMentionStatus: (input: unknown) => {
                calls.push(input)
                return { id: 'req-1', teamChatId: 'team-1', sourceMessageId: 'msg-1', targetSessionId: 'session-1', status: 'seen', createdAt: 1, seenAt: 2 }
            }
        }
        const app = createApp('ns-a', engine)

        const response = await app.request('/api/sessions/session-1/team-mentions/req-1/seen', { method: 'POST' })

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ request: { id: 'req-1', teamChatId: 'team-1', sourceMessageId: 'msg-1', targetSessionId: 'session-1', status: 'seen', createdAt: 1, seenAt: 2 } })
        expect(calls).toEqual([{ namespace: 'ns-a', sessionId: 'session-1', requestId: 'req-1', status: 'seen' }])
    })

    it('patches Team mention status for allowed lifecycle actions', async () => {
        const calls: unknown[] = []
        const engine = {
            resolveSessionAccess: (sessionId: string, namespace: string) => ({
                ok: true as const,
                sessionId,
                session: { id: sessionId, namespace, active: true }
            }),
            updateTeamMentionStatus: (input: unknown) => {
                calls.push(input)
                return { id: 'req-1', teamChatId: 'team-1', sourceMessageId: 'msg-1', targetSessionId: 'session-1', status: 'no_action', createdAt: 1, resolvedAt: 2 }
            }
        }
        const app = createApp('ns-a', engine)

        const response = await app.request('/api/sessions/session-1/team-mentions/req-1', {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ status: 'no_action' })
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ request: { id: 'req-1', teamChatId: 'team-1', sourceMessageId: 'msg-1', targetSessionId: 'session-1', status: 'no_action', createdAt: 1, resolvedAt: 2 } })
        expect(calls).toEqual([{ namespace: 'ns-a', sessionId: 'session-1', requestId: 'req-1', status: 'no_action' }])
    })

    it('posts structured Team Chat reports', async () => {
        const calls: unknown[] = []
        const engine = {
            reportToTeam: (input: unknown) => {
                calls.push(input)
                return { message: { id: 'msg-report', namespace: 'default', teamChatId: 'team-1', seq: 1, authorParticipantId: 'p1', text: 'Blocked', reportType: 'blocked', replyToMessageId: null, replyPreview: null, mentions: [], files: [], createdAt: 1 } }
            }
        }
        const app = createApp('default', engine)

        const response = await app.request('/api/team-chats/team-1/reports', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ authorParticipantId: 'p1', type: 'blocked', summary: 'Blocked on schema' })
        })

        expect(response.status).toBe(201)
        expect(calls).toEqual([{ namespace: 'default', teamChatId: 'team-1', authorParticipantId: 'p1', type: 'blocked', summary: 'Blocked on schema', mentions: [], files: [] }])
    })

    it('denies a nonparticipant before reading messages or invoking a mutation', async () => {
        let reads = 0
        let writes = 0
        const engine = {
            getTeamMessages: () => { reads++; return { messages: [] } },
            postTeamMessage: () => { writes++; return { message: {} } },
            listTeamParticipants: () => []
        }
        const app = createApp('default', engine, { membershipId: 'outsider', role: 'member' })

        expect((await app.request('/api/team-chats/team-1/messages')).status).toBe(403)
        expect((await app.request('/api/team-chats/team-1/messages', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ authorParticipantId: 'p-outsider', text: 'secret' })
        })).status).toBe(403)
        expect({ reads, writes }).toEqual({ reads: 0, writes: 0 })
    })

    it('allows a participant to interact but denies management and impersonation', async () => {
        let posts = 0
        let archives = 0
        const participant = { id: 'p-member', namespace: 'default', teamChatId: 'team-1', type: 'user' as const, userId: 'member-1', sessionId: null, displayName: 'Member', role: 'general' as const, color: '#60a5fa', archivedAt: null, joinedAt: 1 }
        const engine = {
            listTeamParticipants: () => [participant, { ...participant, id: 'p-other', userId: 'other' }],
            postTeamMessage: () => { posts++; return { message: { id: 'm1' } } },
            archiveTeamChat: () => { archives++ }
        }
        const app = createApp('default', engine, { membershipId: 'member-1', role: 'member' })

        expect((await app.request('/api/team-chats/team-1/messages', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ authorParticipantId: 'p-member', text: 'hello' })
        })).status).toBe(201)
        expect((await app.request('/api/team-chats/team-1/messages', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ authorParticipantId: 'p-other', text: 'spoof' })
        })).status).toBe(404)
        expect((await app.request('/api/team-chats/team-1', { method: 'DELETE' })).status).toBe(403)
        expect({ posts, archives }).toEqual({ posts: 1, archives: 0 })
    })

    it('does not let session access reveal or mutate an unrelated Team Chat', async () => {
        let updates = 0
        const engine = {
            listTeamParticipants: () => [],
            resolveSessionAccess: (sessionId: string, namespace: string) => ({
                ok: true as const, sessionId, session: { id: sessionId, namespace, active: true }
            }),
            listSessionTeamMemberships: () => [{
                teamChat: { id: 'team-1', namespace: 'default', ownerMembershipId: 'admin', name: 'Secret', projectPath: null, sharedContext: null, archivedAt: null, createdAt: 1, updatedAt: 1 },
                participant: { id: 'session-p', namespace: 'default', teamChatId: 'team-1', type: 'session', userId: null, sessionId: 'session-1', displayName: 'Agent', role: 'general', color: '#60a5fa', archivedAt: null, joinedAt: 1 }
            }],
            updateTeamMentionStatus: () => { updates++; return {} }
        }
        const app = createApp('default', engine, { membershipId: 'outsider', role: 'member' })

        const memberships = await (await app.request('/api/sessions/session-1/team-memberships')).json()
        const mentions = await (await app.request('/api/sessions/session-1/team-mentions')).json()
        const update = await app.request('/api/sessions/session-1/team-mentions/req-1/seen', { method: 'POST' })

        expect(memberships).toEqual({ memberships: [] })
        expect(mentions).toEqual({ requests: [] })
        expect(update.status).toBe(403)
        expect(updates).toBe(0)
    })

})
