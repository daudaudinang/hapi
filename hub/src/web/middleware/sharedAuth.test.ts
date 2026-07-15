import { Hono } from 'hono'
import { describe, expect, it } from 'bun:test'
import { createSharedAuthMiddleware, SHARED_SESSION_COOKIE } from './sharedAuth'
import type { SharedWebAppEnv } from '../sharedAuthEnv'

describe('createSharedAuthMiddleware', () => {
    function appWith(validateSession: (token: string, input: { mutation: boolean; csrfToken?: string }) => {
        membershipId: string; organizationId: string; role: 'admin' | 'member' | 'viewer'; csrfHash: string
    } | null) {
        const app = new Hono<SharedWebAppEnv>()
        app.use('/protected/*', createSharedAuthMiddleware({ validateSession } as never))
        app.get('/protected/context', (c) => c.json({
            membershipId: c.get('membershipId'), organizationId: c.get('organizationId'), role: c.get('organizationRole')
        }))
        app.post('/protected/mutate', (c) => c.json({ ok: true }))
        return app
    }

    it('sets organization actor context from an opaque session', async () => {
        const app = appWith((token) => token === 'opaque'
            ? { membershipId: 'u1', organizationId: 'o1', role: 'member', csrfHash: 'hash' }
            : null)
        const response = await app.request('/protected/context', { headers: { cookie: `${SHARED_SESSION_COOKIE}=opaque` } })
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ membershipId: 'u1', organizationId: 'o1', role: 'member' })
    })

    it('rejects missing sessions and mutation CSRF failures', async () => {
        const calls: Array<{ mutation: boolean; csrfToken?: string }> = []
        const app = appWith((_token, input) => {
            calls.push(input)
            return input.mutation && input.csrfToken !== 'valid' ? null
                : { membershipId: 'u1', organizationId: 'o1', role: 'admin', csrfHash: 'hash' }
        })
        expect((await app.request('/protected/context')).status).toBe(401)
        expect((await app.request('/protected/mutate', { method: 'POST', headers: { cookie: `${SHARED_SESSION_COOKIE}=opaque` } })).status).toBe(403)
        expect((await app.request('/protected/mutate', {
            method: 'POST', headers: { cookie: `${SHARED_SESSION_COOKIE}=opaque`, 'x-csrf-token': 'valid' }
        })).status).toBe(200)
        expect(calls).toEqual([{ mutation: true, csrfToken: undefined }, { mutation: true, csrfToken: 'valid' }])
    })
})
