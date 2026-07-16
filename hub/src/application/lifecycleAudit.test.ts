import { Database } from 'bun:sqlite'
import { describe, expect, it } from 'bun:test'
import { AuthorizationService, type AuthorizationSubject } from '../auth/authorizationService'
import { IdentityService } from '../auth/identityService'
import { SharedHubStore } from '../store/sharedHubStore'
import { RunnerEnrollmentService } from './runnerEnrollmentService'
import { RunnerLifecycleService } from './runnerLifecycleService'
import { TeamAuthorizationService } from './teamAuthorizationService'

const PEPPER = 'p'.repeat(32)
const admin: AuthorizationSubject = { membershipId: 'admin', organizationId: 'o1', role: 'admin', disabled: false }

function setup() {
    const db = new Database(':memory:')
    const store = new SharedHubStore(db, { organizationId: 'o1', organizationName: 'Pilot' })
    db.exec(`INSERT INTO memberships(id,organization_id,invited_email,role,status,created_at) VALUES
        ('admin','o1','admin@example.com','admin','active',1),
        ('owner','o1','owner@example.com','member','active',1),
        ('member','o1','member@example.com','member','active',1),
        ('third','o1','third@example.com','member','active',1)`)
    store.createRunnerProjection({
        runnerId: 'r1', organizationId: 'o1', ownerMembershipId: 'owner', machineId: 'm1',
        profile: 'profile', name: 'Runner', metadata: {}, runnerState: {}, createdAt: 1
    })
    store.createRunnerCredential({ id: 'c1', runnerId: 'r1', organizationId: 'o1', secretHash: 'stored-hash', generation: 1, createdAt: 1 })
    return { db, store }
}

describe('Shared Hub lifecycle audit/outbox', () => {
    it('covers Team, grant, invitation, enrollment, and Runner lifecycle without sensitive payloads', () => {
        const { db, store } = setup()
        const teams = new TeamAuthorizationService(store, new AuthorizationService())
        const identity = new IdentityService(store, PEPPER)
        const enrollment = new RunnerEnrollmentService(store, PEPPER, 'https://hub.test', () => 20)
        const runners = new RunnerLifecycleService(store, PEPPER, () => 30)

        const team = teams.createTeam(admin, { name: 'Core', ownerMembershipId: 'owner' }, 2)
        teams.addMember(admin, team.id, { membershipId: 'member', role: 'member' }, 3)
        teams.updateMemberRole(admin, team.id, 'member', 'owner', 4)
        teams.addMember(admin, team.id, { membershipId: 'third', role: 'member' }, 5)
        teams.transferOwnership(admin, team.id, 'owner', 'third', 6)
        const grant = teams.createGrant(admin, {
            principalType: 'user', principalId: 'member', resourceType: 'runner', resourceId: 'r1',
            capability: 'view', expiresAt: null
        }, 7)
        teams.revokeGrant(admin, grant.id, 8)

        const firstInvitation = identity.issueInvitation(admin, { email: 'new@example.com', role: 'member' }, 9)
        identity.claimInvitation(firstInvitation.token, {
            issuer: 'https://id.example.com', subject: 'subject-1', email: 'new@example.com', emailVerified: true
        }, 10)
        const secondInvitation = identity.issueInvitation(admin, { email: 'cancel@example.com', role: 'viewer' }, 11)
        identity.cancelInvitation(admin, secondInvitation.invitationId, 12)

        const issuedEnrollment = enrollment.issue(admin, 'owner')
        enrollment.cancel(admin, issuedEnrollment.enrollmentId)
        const rotated = runners.rotate(admin, 'r1', 1)
        runners.transfer(admin, 'r1', 'member')
        runners.revoke(admin, 'r1')
        runners.cleanup(admin, 'r1')

        const actions = store.listAuditEvents('o1', 200).map((event) => event.action)
        const eventNames = store.listPendingOutboxEvents(200).map((event) => event.name)
        for (const action of [
            'team.created', 'team.member-added', 'team.member-role-updated', 'team.ownership-transferred',
            'grant.created', 'grant.revoked', 'invitation.issued', 'invitation.claimed', 'invitation.cancelled',
            'runner.enrollment.issue', 'runner.enrollment.cancel', 'runner.credential.rotate',
            'runner.transfer', 'runner.revoke', 'runner.cleanup'
        ]) expect(actions).toContain(action)
        for (const eventName of [
            'team.created', 'team.member-added', 'team.member-role-updated', 'team.ownership-transferred',
            'grant.created', 'grant.revoked', 'invitation.issued', 'invitation.claimed', 'invitation.cancelled',
            'runner.enrollment.issued', 'runner.enrollment.cancelled', 'runner.credential.rotated',
            'runner.transferred', 'runner.revoked', 'runner.cleaned'
        ]) expect(eventNames).toContain(eventName)

        const serializedEvidence = JSON.stringify({
            audit: db.prepare('SELECT actor_id, action, resource_type, resource_id, metadata FROM audit_events').all(),
            outbox: db.prepare('SELECT name, resource_type, resource_id FROM outbox_events').all()
        })
        for (const secret of [firstInvitation.token, secondInvitation.token, issuedEnrollment.code, rotated.credential.secret, 'stored-hash']) {
            expect(serializedEvidence).not.toContain(secret)
        }
        expect(serializedEvidence).not.toMatch(/tokenHash|secretHash|credentialId|command|privatePath/i)
    })

    it('rolls back invitation issue and Runner cleanup when audit persistence fails', () => {
        const { db, store } = setup()
        const identity = new IdentityService(store, PEPPER)
        const runners = new RunnerLifecycleService(store, PEPPER, () => 30)
        runners.revoke(admin, 'r1')
        db.exec(`CREATE TRIGGER reject_lifecycle_audit BEFORE INSERT ON audit_events
            WHEN NEW.action IN ('invitation.issued', 'runner.cleanup')
            BEGIN SELECT RAISE(ABORT, 'audit rejected'); END`)

        expect(() => identity.issueInvitation(admin, { email: 'rollback@example.com', role: 'member' }, 40)).toThrow('audit rejected')
        expect(store.listInvitations('o1')).toHaveLength(0)
        expect(() => runners.cleanup(admin, 'r1')).toThrow('audit rejected')
        expect(db.prepare('SELECT count(*) count FROM runner_tombstones WHERE runner_id = ?').get('r1')).toEqual({ count: 1 })
        expect(db.prepare("SELECT count(*) count FROM outbox_events WHERE name IN ('invitation.issued','runner.cleaned')").get()).toEqual({ count: 0 })
    })
})
