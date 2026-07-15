import { Database } from 'bun:sqlite'
import { describe, expect, it } from 'bun:test'
import { Hono } from 'hono'
import { AuthorizationService } from '../../auth/authorizationService'
import { TeamAuthorizationService } from '../../application/teamAuthorizationService'
import { SharedHubStore } from '../../store/sharedHubStore'
import type { SharedWebAppEnv } from '../sharedAuthEnv'
import { createSharedTeamsRoutes } from './sharedTeams'

function app() {
    const db = new Database(':memory:')
    const store = new SharedHubStore(db, { organizationId: 'o1', organizationName: 'Pilot' })
    db.exec("INSERT INTO memberships(id,organization_id,invited_email,role,status,created_at) VALUES ('admin','o1','admin@example.com','admin','active',1)")
    const app = new Hono<SharedWebAppEnv>()
    app.use('*', async (c, next) => {
        c.set('membershipId', 'admin')
        c.set('organizationId', 'o1')
        c.set('organizationRole', 'admin')
        c.set('namespace', 'o1')
        await next()
    })
    app.route('/api', createSharedTeamsRoutes(new TeamAuthorizationService(store, new AuthorizationService())))
    return app
}

describe('shared Team routes', () => {
    it('validates requests and exposes stable errors', async () => {
        const response = await app().request('/api/teams', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
        expect(response.status).toBe(400)
        expect(await response.json()).toEqual({ error: 'invalid_request', code: 'bad_request' })
    })

    it('creates and lists teams using the authenticated actor', async () => {
        const instance = app()
        const created = await instance.request('/api/teams', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: 'Core', ownerMembershipId: 'admin' })
        })
        expect(created.status).toBe(201)
        const listed = await instance.request('/api/teams')
        expect(listed.status).toBe(200)
        expect((await listed.json() as { teams: unknown[] }).teams).toHaveLength(1)
        const grants = await instance.request('/api/grants')
        expect(grants.status).toBe(200)
        expect(await grants.json()).toEqual({ grants: [] })
        const audit = await instance.request('/api/audit-events?limit=10')
        expect(audit.status).toBe(200)
        expect((await audit.json() as { events: Array<{ action: string }> }).events[0]?.action).toBe('team.created')
        expect((await instance.request('/api/audit-events?limit=1000')).status).toBe(400)
    })
})
