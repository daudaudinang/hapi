import { describe, expect, it } from 'bun:test'
import { Hono } from 'hono'
import type { Session, SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { createMessagesRoutes } from './messages'

function createSession(overrides?: Partial<Session>): Session {
    const baseMetadata = {
        path: '/tmp/project',
        host: 'localhost',
        flavor: 'codex' as const
    }
    const base: Session = {
        id: 'session-1',
        namespace: 'default',
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: true,
        activeAt: 1,
        metadata: baseMetadata,
        metadataVersion: 1,
        agentState: {
            controlledByUser: false,
            requests: {},
            completedRequests: {}
        },
        agentStateVersion: 1,
        thinking: false,
        thinkingAt: 1,
        model: 'gpt-5.4',
        effort: null,
        permissionMode: 'default',
        collaborationMode: 'default'
    }

    return {
        ...base,
        ...overrides,
        metadata: overrides?.metadata === undefined
            ? base.metadata
            : overrides.metadata === null
                ? null
                : {
                    ...baseMetadata,
                    ...overrides.metadata
                },
        agentState: overrides?.agentState === undefined ? base.agentState : overrides.agentState
    }
}

function createApp(
    session: Session,
    options?: { autoResume?: boolean }
) {
    const sendMessageCalls: Array<[string, Record<string, unknown>]> = []
    const enqueueMessageCalls: Array<[string, Record<string, unknown>]> = []
    const triggerResumeCalls: Array<[string, string]> = []

    const engine = {
        resolveSessionAccess: () => ({ ok: true, sessionId: session.id, session }),
        sendMessage: async (sessionId: string, payload: Record<string, unknown>) => {
            sendMessageCalls.push([sessionId, payload])
        },
        enqueueMessage: async (sessionId: string, payload: Record<string, unknown>) => {
            enqueueMessageCalls.push([sessionId, payload])
            return { queued: true, queueDepth: 1 }
        },
        triggerResume: async (sessionId: string, namespace: string) => {
            triggerResumeCalls.push([sessionId, namespace])
        }
    } as Partial<SyncEngine>

    const app = new Hono<WebAppEnv>()
    app.use('*', async (c, next) => {
        c.set('namespace', 'default')
        c.set('features', {
            autoResume: options?.autoResume ?? false
        })
        await next()
    })
    app.route('/api', createMessagesRoutes(() => engine as SyncEngine))

    return { app, sendMessageCalls, enqueueMessageCalls, triggerResumeCalls }
}

describe('messages routes', () => {
    it('returns canonical sessionId on direct send success', async () => {
        const { app, sendMessageCalls, enqueueMessageCalls } = createApp(createSession({ id: 'canonical-1' }))

        const response = await app.request('/api/sessions/legacy-id/messages', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ text: 'hello', localId: 'local-1' })
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ ok: true, sessionId: 'canonical-1' })
        expect(sendMessageCalls).toEqual([
            ['canonical-1', { text: 'hello', localId: 'local-1', attachments: undefined, sentFrom: 'webapp' }]
        ])
        expect(enqueueMessageCalls).toEqual([])
    })

    it('returns queued response with canonical sessionId for inactive session with auto-resume', async () => {
        const { app, sendMessageCalls, enqueueMessageCalls, triggerResumeCalls } = createApp(
            createSession({ id: 'canonical-2', active: false }),
            { autoResume: true }
        )

        const response = await app.request('/api/sessions/legacy-id/messages', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ text: 'resume me' })
        })

        expect(response.status).toBe(202)
        expect(await response.json()).toEqual({
            queued: true,
            resuming: true,
            sessionId: 'canonical-2',
            message: 'Message queued, session is resuming...'
        })
        expect(enqueueMessageCalls).toEqual([
            ['canonical-2', { text: 'resume me', localId: undefined, attachments: undefined, sentFrom: 'webapp' }]
        ])
        expect(triggerResumeCalls).toEqual([['canonical-2', 'default']])
        expect(sendMessageCalls).toEqual([])
    })
})
