import { Database } from 'bun:sqlite'
import { describe, expect, it } from 'bun:test'
import { Hono } from 'hono'
import { IdentityService } from '../../auth/identityService'
import { SharedHubStore } from '../../store/sharedHubStore'
import type { SharedWebAppEnv } from '../sharedAuthEnv'
import { createSharedMembersRoutes } from './sharedMembers'

const PEPPER = 'p'.repeat(32)

function app(overrides?: { role?: 'admin' | 'member' | 'viewer'; membershipId?: string; onDisabled?: (organizationId: string, membershipId: string) => void }) {
    const db = new Database(':memory:')
    const store = new SharedHubStore(db, { organizationId: 'o1', organizationName: 'Pilot' })
    db.exec("INSERT INTO memberships(id,organization_id,invited_email,role,status,created_at) VALUES ('admin','o1','admin@example.com','admin','active',1)")
    db.exec("INSERT INTO memberships(id,organization_id,invited_email,role,status,created_at) VALUES ('m1','o1','member@example.com','member','active',2)")
    const identity = new IdentityService(store, PEPPER, 100)
    const app = new Hono<SharedWebAppEnv>()
    app.use('*', async (c, next) => {
        c.set('membershipId', overrides?.membershipId ?? 'admin')
        c.set('organizationId', 'o1')
        c.set('organizationRole', overrides?.role ?? 'admin')
        c.set('namespace', 'o1')
        await next()
    })
    app.route('/api', createSharedMembersRoutes(identity, overrides?.onDisabled))
    return app
}

describe('shared Member routes', () => {
    it('lists members for admin', async () => {
        const response = await app().request('/api/members')
        expect(response.status).toBe(200)
        const body = await response.json() as { members: unknown[] }
        expect(body.members).toHaveLength(2)
    })

    it('rejects member listing for non-admin', async () => {
        const response = await app({ role: 'member' }).request('/api/members')
        expect(response.status).toBe(403)
    })

    it('gets a single member by id', async () => {
        const response = await app().request('/api/members/m1')
        expect(response.status).toBe(200)
        const body = await response.json() as { invitedEmail: string }
        expect(body.invitedEmail).toBe('member@example.com')
    })

    it('returns 404 for unknown member', async () => {
        const response = await app().request('/api/members/nonexistent')
        expect(response.status).toBe(404)
    })

    it('updates a member role', async () => {
        const response = await app().request('/api/members/m1/role', {
            method: 'PATCH', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ role: 'admin' })
        })
        expect(response.status).toBe(204)
    })

    it('rejects invalid role body', async () => {
        const response = await app().request('/api/members/m1/role', {
            method: 'PATCH', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ role: 'superadmin' })
        })
        expect(response.status).toBe(400)
    })

    it('disables a member', async () => {
        const disconnected: string[] = []
        const response = await app({ onDisabled: (organizationId, membershipId) => disconnected.push(`${organizationId}:${membershipId}`) }).request('/api/members/m1/status', {
            method: 'PATCH', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ status: 'disabled' })
        })
        expect(response.status).toBe(204)
        expect(disconnected).toEqual(['o1:m1'])
    })

    it('re-enables a member', async () => {
        const instance = app()
        await instance.request('/api/members/m1/status', {
            method: 'PATCH', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ status: 'disabled' })
        })
        const response = await instance.request('/api/members/m1/status', {
            method: 'PATCH', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ status: 'active' })
        })
        expect(response.status).toBe(204)
    })

    it('rejects non-admin from updating members', async () => {
        const response = await app({ role: 'member', membershipId: 'm1' }).request('/api/members/admin/role', {
            method: 'PATCH', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ role: 'member' })
        })
        expect(response.status).toBe(403)
    })

    it('issues, lists, and cancels invitations without caching the one-time token', async () => {
        const instance = app()
        const issued = await instance.request('/api/invitations', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email: 'new@example.com', role: 'member' })
        })
        expect(issued.status).toBe(201)
        expect(issued.headers.get('cache-control')).toBe('no-store')
        const body = await issued.json() as { invitationId: string; token: string }
        expect(body.token.length).toBeGreaterThanOrEqual(32)

        const listed = await (await instance.request('/api/invitations')).json() as { invitations: Array<{ id: string; status: string }> }
        expect(listed.invitations).toEqual([expect.objectContaining({ id: body.invitationId, status: 'active' })])
        expect(JSON.stringify(listed)).not.toContain(body.token)

        expect((await instance.request(`/api/invitations/${body.invitationId}`, { method: 'DELETE' })).status).toBe(204)
        const cancelled = await (await instance.request('/api/invitations')).json() as { invitations: Array<{ status: string }> }
        expect(cancelled.invitations[0]?.status).toBe('cancelled')
    })

    it('rejects invitation lifecycle access for non-admins', async () => {
        const instance = app({ role: 'member', membershipId: 'm1' })
        expect((await instance.request('/api/invitations')).status).toBe(403)
        expect((await instance.request('/api/invitations', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email: 'new@example.com', role: 'member' })
        })).status).toBe(403)
    })
})
