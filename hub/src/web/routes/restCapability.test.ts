import { describe, expect, it } from 'bun:test'
import { Hono } from 'hono'
import type { Machine, Session, SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import type { Capability } from '@hapi/protocol/auth'
import type { RestCapabilityResolver } from './guards'
import { createMessagesRoutes } from './messages'
import { createPermissionsRoutes } from './permissions'
import { createEditorRoutes } from './editor'
import { createGitRoutes } from './git'

const session = {
    id: 's1', namespace: 'o1', active: true,
    metadata: { path: '/repo', flavor: 'claude' },
    agentState: { requests: { request1: {} } }
} as unknown as Session

const machine = { id: 'm1', namespace: 'o1', active: true } as Machine

function resolver(capability: Capability | null): RestCapabilityResolver {
    return () => capability
}

function appFor(engine: Partial<SyncEngine>, capability: Capability | null): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()
    app.use('*', async (c, next) => {
        c.set('organizationId', 'o1')
        c.set('namespace', 'o1')
        c.set('membershipId', 'member')
        c.set('organizationRole', 'member')
        await next()
    })
    const getEngine = () => engine as SyncEngine
    const resolve = resolver(capability)
    app.route('/api', createMessagesRoutes(getEngine, resolve))
    app.route('/api', createPermissionsRoutes(getEngine, resolve))
    app.route('/api', createEditorRoutes(getEngine, resolve))
    app.route('/api', createGitRoutes(getEngine, resolve))
    return app
}

describe('REST capability boundary', () => {
    it('allows view reads but denies message and permission side effects', async () => {
        let sent = 0
        let approved = 0
        const engine: Partial<SyncEngine> = {
            resolveSessionAccess: () => ({ ok: true, sessionId: 's1', session }),
            getMessagesPage: () => ({
                messages: [], page: { limit: 50, beforeSeq: null, nextBeforeSeq: null, hasMore: false }
            }),
            sendMessage: async () => { sent++ },
            approvePermission: async () => { approved++ }
        }
        const app = appFor(engine, 'view')

        expect((await app.request('/api/sessions/s1/messages')).status).toBe(200)
        expect((await app.request('/api/sessions/s1/messages', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"text":"hello"}'
        })).status).toBe(403)
        expect((await app.request('/api/sessions/s1/permissions/request1/approve', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}'
        })).status).toBe(403)
        expect({ sent, approved }).toEqual({ sent: 0, approved: 0 })
    })

    it('requires spawn in addition to interact before auto-resuming an inactive session', async () => {
        let resumes = 0
        const inactive = { ...session, active: false }
        const app = appFor({
            resolveSessionAccess: () => ({ ok: true, sessionId: 's1', session: inactive }),
            canAutoResume: () => true,
            triggerAutoResume: async () => { resumes++ }
        }, 'interact')

        const response = await app.request('/api/sessions/s1/messages', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"text":"hello"}'
        })
        expect(response.status).toBe(403)
        expect(resumes).toBe(0)
    })

    it('maps editor and Git reads to view and editor writes to operate', async () => {
        let writes = 0
        const engine: Partial<SyncEngine> = {
            getMachine: () => machine,
            resolveSessionAccess: () => ({ ok: true, sessionId: 's1', session }),
            readEditorFile: async () => ({ success: true, content: 'ok' }),
            writeEditorFile: async () => { writes++; return { success: true } },
            getGitStatus: async () => ({ success: true, branch: 'main', files: [] })
        }
        const app = appFor(engine, 'view')
        const body = JSON.stringify({ machineId: 'm1', path: '/repo/a.ts' })

        expect((await app.request('/api/editor/file', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body
        })).status).toBe(200)
        expect((await app.request('/api/editor/file/write', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body
        })).status).toBe(403)
        expect((await app.request('/api/sessions/s1/git-status')).status).toBe(200)
        expect(writes).toBe(0)
    })

    it('fails closed before reads when no effective grant exists', async () => {
        let reads = 0
        const app = appFor({
            resolveSessionAccess: () => ({ ok: true, sessionId: 's1', session }),
            getMessagesPage: () => {
                reads++
                return { messages: [], page: { limit: 50, beforeSeq: null, nextBeforeSeq: null, hasMore: false } }
            }
        }, null)
        expect((await app.request('/api/sessions/s1/messages')).status).toBe(403)
        expect(reads).toBe(0)
    })

    it('does not reveal a cross-organization session', async () => {
        const app = appFor({
            resolveSessionAccess: () => ({ ok: false, reason: 'access-denied' })
        }, 'manage')
        const response = await app.request('/api/sessions/s1/messages')
        expect(response.status).toBe(404)
        expect(await response.json()).toEqual({ error: 'Session not found' })
    })
})
