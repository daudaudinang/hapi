import { describe, expect, it } from 'bun:test'
import { Hono } from 'hono'

import type { SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { createTeamChatsRoutes } from './teamChats'

function createApp(namespace: string, engine: Partial<SyncEngine>) {
    const app = new Hono<WebAppEnv>()
    app.use('*', async (c, next) => {
        c.set('namespace', namespace)
        await next()
    })
    app.route('/api', createTeamChatsRoutes(() => engine as SyncEngine))
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
})
