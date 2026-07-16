import { Database } from 'bun:sqlite'
import { describe, expect, it } from 'bun:test'
import { AuthorizationService, type AuthorizationSubject } from '../auth/authorizationService'
import { SharedHubStore } from '../store/sharedHubStore'
import { TeamAuthorizationService, TeamServiceError } from './teamAuthorizationService'

function setup(onAccessLoss?: ConstructorParameters<typeof TeamAuthorizationService>[3]) {
    const db = new Database(':memory:')
    const store = new SharedHubStore(db, { organizationId: 'o1', organizationName: 'Pilot' })
    db.exec(`
        INSERT INTO memberships(id,organization_id,invited_email,role,status,created_at) VALUES
        ('admin','o1','admin@example.com','admin','active',1),
        ('owner','o1','owner@example.com','member','active',1),
        ('member','o1','member@example.com','member','active',1),
        ('third','o1','third@example.com','member','active',1),
        ('inactive','o1','inactive@example.com','member','disabled',1);
    `)
    store.createRunnerProjection({ runnerId: 'r1', organizationId: 'o1', ownerMembershipId: 'owner', machineId: 'm1', name: 'Runner', metadata: {}, runnerState: {}, createdAt: 1 })
    const service = new TeamAuthorizationService(store, new AuthorizationService(), undefined, onAccessLoss)
    const admin: AuthorizationSubject = { membershipId: 'admin', organizationId: 'o1', role: 'admin', disabled: false }
    const owner: AuthorizationSubject = { membershipId: 'owner', organizationId: 'o1', role: 'member', disabled: false }
    return { db, store, service, admin, owner }
}

function code(operation: () => unknown): string | undefined {
    try { operation() } catch (error) { return error instanceof TeamServiceError ? error.code : undefined }
    return undefined
}

describe('TeamAuthorizationService', () => {
    it('commits lifecycle, audit and outbox and enforces archived immutability', () => {
        const { db, service, admin } = setup()
        const team = service.createTeam(admin, { name: 'Core', ownerMembershipId: 'owner' }, 10)
        service.addMember(admin, team.id, { membershipId: 'member', role: 'member' }, 11)
        expect(db.prepare('SELECT count(*) count FROM audit_events').get()).toEqual({ count: 2 })
        expect(db.prepare('SELECT count(*) count FROM outbox_events').get()).toEqual({ count: 2 })
        expect(db.prepare('SELECT count(*) count FROM outbox_events WHERE published_at IS NULL').get()).toEqual({ count: 2 })
        service.archiveTeam(admin, team.id, 12)
        expect(code(() => service.renameTeam(admin, team.id, 'Other', 13))).toBe('conflict')
    })

    it('handles ownership transfer boundaries without creating an owner gap', () => {
        const { db, service, admin } = setup()
        const team = service.createTeam(admin, { name: 'Core', ownerMembershipId: 'owner' }, 10)
        service.addMember(admin, team.id, { membershipId: 'member', role: 'member' }, 11)
        db.prepare(`INSERT INTO team_memberships(team_id,membership_id,organization_id,role,created_at)
            VALUES (?,'inactive','o1','member',12)`).run(team.id)
        expect(code(() => service.transferOwnership(admin, team.id, 'owner', 'owner'))).toBe('bad_request')
        expect(code(() => service.transferOwnership(admin, team.id, 'owner', 'inactive'))).toBe('not_found')
        service.updateMemberRole(admin, team.id, 'member', 'owner', 13)
        expect(code(() => service.transferOwnership(admin, team.id, 'owner', 'member'))).toBe('conflict')
        expect(db.prepare("SELECT count(*) count FROM team_memberships WHERE team_id=? AND role='owner'").get(team.id)).toEqual({ count: 2 })
    })

    it('lets Admin revoke stale grants while non-Admin fails closed', () => {
        const { db, store, service, admin, owner } = setup()
        store.upsertSessionProjectionByMachine({ sessionId: 's1', organizationId: 'o1', machineId: 'm1', updatedAt: 10 })
        const grant = service.createGrant(admin, { principalType: 'user', principalId: 'owner', resourceType: 'session', resourceId: 's1', capability: 'view', expiresAt: null }, 11)
        db.prepare("DELETE FROM session_security_projections WHERE session_id='s1'").run()
        expect(code(() => service.revokeGrant(owner, grant.id, 12))).toBe('forbidden')
        service.revokeGrant(admin, grant.id, 13)
        expect(store.findResourceGrant('o1', grant.id)).toBeNull()
    })

    it('keeps outbox pending without a production publisher and validates grant targets and expiry', () => {
        const { db, service, admin } = setup()
        const team = service.createTeam(admin, { name: 'Core', ownerMembershipId: 'owner' }, 10)
        service.archiveTeam(admin, team.id, 11)
        expect(code(() => service.createGrant(admin, {
            principalType: 'team', principalId: team.id, resourceType: 'runner', resourceId: 'r1', capability: 'view', expiresAt: null
        }, 12))).toBe('not_found')
        expect(code(() => service.createGrant(admin, {
            principalType: 'user', principalId: 'owner', resourceType: 'runner', resourceId: 'r1', capability: 'view', expiresAt: 12
        }, 12))).toBe('bad_request')
        db.prepare("UPDATE runners SET status='revoked' WHERE id='r1'").run()
        expect(code(() => service.createGrant(admin, {
            principalType: 'user', principalId: 'owner', resourceType: 'runner', resourceId: 'r1', capability: 'view', expiresAt: null
        }, 13))).toBe('not_found')
        expect(db.prepare('SELECT published_at FROM outbox_events ORDER BY created_at LIMIT 1').get()).toEqual({ published_at: null })
    })

    it('allows a Team owner to transfer only their own source ownership while Admin may clean arbitrary owners', () => {
        const { service, admin, owner } = setup()
        const team = service.createTeam(admin, { name: 'Core', ownerMembershipId: 'owner' }, 10)
        service.addMember(admin, team.id, { membershipId: 'member', role: 'owner' }, 11)
        service.addMember(admin, team.id, { membershipId: 'third', role: 'member' }, 12)
        expect(code(() => service.transferOwnership(owner, team.id, 'member', 'third', 13))).toBe('forbidden')
        service.transferOwnership(admin, team.id, 'member', 'third', 14)
    })

    it('resolves owner, direct, Team, expiry, Viewer cap and session read-only capability', () => {
        const { store, service, admin, owner } = setup()
        const member: AuthorizationSubject = { membershipId: 'member', organizationId: 'o1', role: 'member', disabled: false }
        expect(service.resolveEffectiveCapability(admin, 'runner', 'r1', 10)).toBe('manage')
        expect(service.resolveMachineCapability(admin, 'm1', 10)).toBe('manage')
        expect(service.resolveEffectiveCapability(owner, 'runner', 'r1', 10)).toBe('manage')
        expect(service.resolveEffectiveCapability(member, 'runner', 'r1', 10)).toBeNull()
        expect(service.resolveMachineCapability(member, 'other-org-machine', 10)).toBeNull()
        service.createGrant(admin, { principalType: 'user', principalId: 'member', resourceType: 'runner', resourceId: 'r1', capability: 'operate', expiresAt: 20 }, 11)
        expect(service.resolveEffectiveCapability(member, 'runner', 'r1', 12)).toBe('operate')
        expect(service.resolveMachineCapability(member, 'm1', 12)).toBe('operate')
        expect(service.resolveEffectiveCapability(member, 'runner', 'r1', 20)).toBeNull()
        const team = service.createTeam(admin, { name: 'Readers', ownerMembershipId: 'owner' }, 21)
        service.addMember(admin, team.id, { membershipId: 'member', role: 'member' }, 22)
        service.createGrant(admin, { principalType: 'team', principalId: team.id, resourceType: 'runner', resourceId: 'r1', capability: 'interact', expiresAt: null }, 23)
        expect(service.resolveEffectiveCapability(member, 'runner', 'r1', 24)).toBe('interact')
        expect(service.resolveEffectiveCapability({ ...member, role: 'viewer' }, 'runner', 'r1', 24)).toBe('view')
        store.upsertSessionProjectionByMachine({ sessionId: 's1', organizationId: 'o1', machineId: 'm1', updatedAt: 25 })
        service.createGrant(admin, { principalType: 'user', principalId: 'third', resourceType: 'session', resourceId: 's1', capability: 'view', expiresAt: null }, 26)
        expect(service.resolveEffectiveCapability({ ...member, membershipId: 'third' }, 'session', 's1', 27)).toBe('view')
    })

    it('publishes targeted access loss after Team removal and grant revoke commit', () => {
        const losses: Array<{ organizationId: string; membershipIds: readonly string[]; resourceType: 'runner' | 'session' | 'team'; resourceId: string }> = []
        const { service, admin } = setup((input) => losses.push(input))
        const team = service.createTeam(admin, { name: 'Core', ownerMembershipId: 'owner' }, 10)
        service.addMember(admin, team.id, { membershipId: 'member', role: 'member' }, 11)
        service.removeMember(admin, team.id, 'member', 12)
        const grant = service.createGrant(admin, { principalType: 'user', principalId: 'member', resourceType: 'runner', resourceId: 'r1', capability: 'view', expiresAt: null }, 13)
        service.revokeGrant(admin, grant.id, 14)
        expect(losses).toEqual([
            { organizationId: 'o1', membershipIds: ['member'], resourceType: 'team', resourceId: team.id },
            { organizationId: 'o1', membershipIds: ['member'], resourceType: 'runner', resourceId: 'r1' }
        ])
    })

    it('expires grants proactively and rechecks replacement access before teardown', () => {
        const losses: Array<{ organizationId: string; membershipIds: readonly string[]; resourceType: 'runner' | 'session' | 'team'; resourceId: string }> = []
        const { store, service, admin } = setup((input) => losses.push(input))
        const expiring = service.createGrant(admin, { principalType: 'user', principalId: 'member', resourceType: 'runner', resourceId: 'r1', capability: 'operate', expiresAt: 20 }, 10)
        service.createGrant(admin, { principalType: 'user', principalId: 'member', resourceType: 'runner', resourceId: 'r1', capability: 'operate', expiresAt: null }, 11)

        expect(service.expireDueGrants('o1', 19)).toBe(0)
        expect(service.expireDueGrants('o1', 20)).toBe(1)
        expect(store.findResourceGrant('o1', expiring.id)).toBeNull()
        expect(losses).toEqual([])

        service.createGrant(admin, { principalType: 'user', principalId: 'member', resourceType: 'runner', resourceId: 'r1', capability: 'manage', expiresAt: 30 }, 21)
        expect(service.expireDueGrants('o1', 30)).toBe(1)
        expect(losses).toEqual([{ organizationId: 'o1', membershipIds: ['member'], resourceType: 'runner', resourceId: 'r1' }])
        expect(service.expireDueGrants('o1', 31)).toBe(0)
    })
})
