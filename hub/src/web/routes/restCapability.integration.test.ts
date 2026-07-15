import { Database } from 'bun:sqlite'
import { describe, expect, it } from 'bun:test'
import { Hono } from 'hono'
import type { Capability, OrganizationRole } from '@hapi/protocol/auth'
import { AuthorizationService, type AuthorizationSubject } from '../../auth/authorizationService'
import { TeamAuthorizationService } from '../../application/teamAuthorizationService'
import { SharedHubStore } from '../../store/sharedHubStore'
import type { Machine, Session, SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { createRestCapabilityResolver } from '../server'
import { createMachinesRoutes } from './machines'
import { createSessionsRoutes } from './sessions'
import { SSEManager } from '../../sse/sseManager'
import { VisibilityTracker } from '../../visibility/visibilityTracker'
import { capabilitySatisfies } from '../../auth/resourceCapability'

const machine = { id: 'm1', namespace: 'o1', active: true } as Machine
const session = {
    id: 's1', namespace: 'o1', active: true, seq: 1, createdAt: 1, updatedAt: 1, activeAt: 1,
    metadata: { path: '/repo', host: 'host', flavor: 'claude' }, metadataVersion: 1,
    agentState: { requests: {}, completedRequests: {} }, agentStateVersion: 1,
    thinking: false, thinkingAt: 1, model: null, modelReasoningEffort: null, effort: null,
    permissionMode: 'default', collaborationMode: null
} as unknown as Session

function createActorApp(input: {
    membershipId: string
    role: OrganizationRole
    service: TeamAuthorizationService
    onSpawn: () => void
    onAbort: () => void
}) {
    const engine = {
        getOnlineMachinesByNamespace: () => [machine],
        getMachine: () => machine,
        getSessionsByNamespace: () => [session],
        resolveSessionAccess: () => ({ ok: true, sessionId: 's1', session }),
        spawnSession: async () => { input.onSpawn(); return { type: 'success', sessionId: 's1' } },
        abortSession: async () => { input.onAbort() }
    } as unknown as SyncEngine
    const resolver = createRestCapabilityResolver(input.service)
    const app = new Hono<WebAppEnv>()
    app.use('*', async (c, next) => {
        c.set('organizationId', 'o1')
        c.set('namespace', 'o1')
        c.set('membershipId', input.membershipId)
        c.set('organizationRole', input.role)
        await next()
    })
    app.route('/api', createMachinesRoutes(() => engine, resolver))
    app.route('/api', createSessionsRoutes(() => engine, {
        capabilityResolver: resolver,
        getUserCapability: ({ organizationId, membershipId, role, sessionId }) => resolver({
            organizationId, membershipId, role, resourceType: 'session', resourceId: sessionId
        })
    }))
    return app
}

describe('production-wired REST capability matrix', () => {
    it('keeps route decisions consistent with owner, Admin, Viewer, direct, Team and expired grants', async () => {
        const db = new Database(':memory:')
        const store = new SharedHubStore(db, { organizationId: 'o1', organizationName: 'Pilot' })
        db.exec(`INSERT INTO memberships(id,organization_id,invited_email,role,status,created_at) VALUES
            ('admin','o1','admin@example.com','admin','active',1),
            ('owner','o1','owner@example.com','member','active',1),
            ('viewer','o1','viewer@example.com','viewer','active',1),
            ('direct','o1','direct@example.com','member','active',1),
            ('team-member','o1','team@example.com','member','active',1),
            ('expired','o1','expired@example.com','member','active',1),
            ('readonly','o1','readonly@example.com','member','active',1),
            ('ungranted','o1','ungranted@example.com','member','active',1)`)
        store.createRunnerProjection({
            runnerId: 'r1', organizationId: 'o1', ownerMembershipId: 'owner', machineId: 'm1',
            name: 'Runner', metadata: {}, runnerState: {}, createdAt: 1
        })
        store.upsertSessionProjectionByMachine({ sessionId: 's1', organizationId: 'o1', machineId: 'm1', updatedAt: 2 })
        const service = new TeamAuthorizationService(store, new AuthorizationService())
        const admin: AuthorizationSubject = { membershipId: 'admin', organizationId: 'o1', role: 'admin', disabled: false }
        service.createGrant(admin, {
            principalType: 'user', principalId: 'viewer', resourceType: 'runner', resourceId: 'r1',
            capability: 'operate', expiresAt: null
        }, 3)
        service.createGrant(admin, {
            principalType: 'user', principalId: 'direct', resourceType: 'runner', resourceId: 'r1',
            capability: 'operate', expiresAt: null
        }, 4)
        const team = service.createTeam(admin, { name: 'Readers', ownerMembershipId: 'owner' }, 5)
        service.addMember(admin, team.id, { membershipId: 'team-member', role: 'member' }, 6)
        service.createGrant(admin, {
            principalType: 'team', principalId: team.id, resourceType: 'runner', resourceId: 'r1',
            capability: 'interact', expiresAt: null
        }, 7)
        store.createResourceGrant({
            id: 'expired-grant', organizationId: 'o1', principalType: 'user', principalId: 'expired',
            resourceType: 'runner', resourceId: 'r1', capability: 'manage', expiresAt: 1,
            createdByMembershipId: 'admin', createdAt: 1
        })
        service.createGrant(admin, {
            principalType: 'user', principalId: 'readonly', resourceType: 'session', resourceId: 's1',
            capability: 'view', expiresAt: null
        }, 8)

        const expected: Array<[string, OrganizationRole, Capability | null, number]> = [
            ['admin', 'admin', 'manage', 1], ['owner', 'member', 'manage', 1],
            ['viewer', 'viewer', 'view', 1], ['direct', 'member', 'operate', 1],
            ['team-member', 'member', 'interact', 1], ['expired', 'member', null, 0],
            ['ungranted', 'member', null, 0]
        ]
        let spawns = 0
        let aborts = 0
        for (const [membershipId, role, capability, visibleCount] of expected) {
            const app = createActorApp({
                membershipId, role, service, onSpawn: () => { spawns++ }, onAbort: () => { aborts++ }
            })
            const listed = await (await app.request('/api/machines')).json() as { machines: Machine[] }
            expect(listed.machines).toHaveLength(visibleCount)
            expect(createRestCapabilityResolver(service)({
                organizationId: 'o1', membershipId, role, resourceType: 'machine', resourceId: 'm1'
            })).toBe(capability)

            const realtimeEvents: string[] = []
            const realtimeResolver = createRestCapabilityResolver(service)
            const sse = new SSEManager(0, new VisibilityTracker())
            sse.subscribe({
                id: membershipId,
                namespace: 'o1',
                membershipId,
                all: true,
                authorize: ({ resourceType, resourceId }) => capabilitySatisfies(realtimeResolver({
                    organizationId: 'o1', membershipId, role, resourceType, resourceId
                }), 'view'),
                send: (event) => { realtimeEvents.push(event.type) },
                sendHeartbeat: () => {}
            })
            sse.broadcast({ type: 'machine-updated', namespace: 'o1', machineId: 'm1' })
            expect(realtimeEvents).toHaveLength(visibleCount)
            sse.stop()
        }

        const viewerApp = createActorApp({ membershipId: 'viewer', role: 'viewer', service, onSpawn: () => { spawns++ }, onAbort: () => { aborts++ } })
        expect((await viewerApp.request('/api/machines/m1/spawn', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"directory":"/repo"}'
        })).status).toBe(403)
        const directApp = createActorApp({ membershipId: 'direct', role: 'member', service, onSpawn: () => { spawns++ }, onAbort: () => { aborts++ } })
        expect((await directApp.request('/api/machines/m1/spawn', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"directory":"/repo"}'
        })).status).toBe(200)
        const readOnlyApp = createActorApp({ membershipId: 'readonly', role: 'member', service, onSpawn: () => { spawns++ }, onAbort: () => { aborts++ } })
        expect((await readOnlyApp.request('/api/sessions/s1')).status).toBe(200)
        expect((await readOnlyApp.request('/api/sessions/s1/abort', { method: 'POST' })).status).toBe(403)
        expect({ spawns, aborts }).toEqual({ spawns: 1, aborts: 0 })

        const liveResolver = createRestCapabilityResolver(service)
        expect(store.updateMembershipRole('o1', 'direct', 'viewer')).toBe('updated')
        expect(liveResolver({
            organizationId: 'o1', membershipId: 'direct', role: 'member',
            resourceType: 'machine', resourceId: 'm1'
        })).toBe('view')
        expect(store.updateMembershipStatus('o1', 'direct', 'disabled')).toBe('updated')
        expect(liveResolver({
            organizationId: 'o1', membershipId: 'direct', role: 'admin',
            resourceType: 'machine', resourceId: 'm1'
        })).toBeNull()
    })
})
