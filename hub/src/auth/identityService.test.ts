import { Database } from 'bun:sqlite'
import { describe, expect, it } from 'bun:test'
import { SharedHubStore } from '../store/sharedHubStore'
import { keyedHash } from './identityCrypto'
import { IdentityService } from './identityService'

const PEPPER = 'p'.repeat(32)
const identity = { issuer: 'https://id.example.com', subject: 'subject-1', email: 'User@Example.com', emailVerified: true as const }

function setup() {
    const db = new Database(':memory:')
    const store = new SharedHubStore(db, { organizationId: 'o1', organizationName: 'Pilot' })
    return { db, store, service: new IdentityService(store, PEPPER, 100) }
}

describe('IdentityService', () => {
    it('claims a matching verified-email invitation once and binds issuer+subject', () => {
        const { db, store, service } = setup()
        store.createInvitation({ id: 'i1', organizationId: 'o1', email: 'user@example.com', tokenHash: keyedHash('invite', PEPPER), role: 'member', expiresAt: 100, createdAt: 1 })
        const claimed = service.claimInvitation('invite', identity, 10)
        expect(claimed?.role).toBe('member')
        expect(service.claimInvitation('invite', identity, 11)).toBeNull()
        expect(db.prepare('SELECT issuer, subject, verified_email FROM identities').get()).toEqual({ issuer: identity.issuer, subject: identity.subject, verified_email: 'user@example.com' })
    })

    it('rejects mismatched/expired invitations without binding identity', () => {
        const { db, store, service } = setup()
        store.createInvitation({ id: 'i1', organizationId: 'o1', email: 'other@example.com', tokenHash: keyedHash('wrong', PEPPER), role: 'member', expiresAt: 100, createdAt: 1 })
        store.createInvitation({ id: 'i2', organizationId: 'o1', email: 'user@example.com', tokenHash: keyedHash('expired', PEPPER), role: 'member', expiresAt: 5, createdAt: 1 })
        expect(service.claimInvitation('wrong', identity, 10)).toBeNull()
        expect(service.claimInvitation('expired', identity, 10)).toBeNull()
        expect(db.prepare('SELECT count(*) count FROM identities').get()).toEqual({ count: 0 })
    })

    it('bootstraps only the configured first Admin and is idempotent for that identity', () => {
        const { db, service } = setup()
        expect(service.bootstrapFirstAdmin('o1', 'admin@example.com', identity, 1)).toBeNull()
        const adminIdentity = { ...identity, email: 'ADMIN@example.com' }
        const first = service.bootstrapFirstAdmin('o1', 'admin@example.com', adminIdentity, 2)
        expect(first?.role).toBe('admin')
        expect(service.bootstrapFirstAdmin('o1', 'admin@example.com', adminIdentity, 3)?.membershipId).toBe(first?.membershipId)
        expect(db.prepare("SELECT count(*) count FROM memberships WHERE role='admin'").get()).toEqual({ count: 1 })
    })

    it('stores opaque session hashes and requires CSRF for mutations', () => {
        const { db, service } = setup()
        const admin = service.bootstrapFirstAdmin('o1', 'user@example.com', identity, 1)!
        const session = service.createSession(admin.membershipId, 10)
        const stored = db.prepare('SELECT id_hash, csrf_hash FROM web_sessions').get() as { id_hash: string; csrf_hash: string }
        expect(stored.id_hash).not.toBe(session.sessionToken)
        expect(stored.csrf_hash).not.toBe(session.csrfToken)
        expect(service.validateSession(session.sessionToken, { mutation: false, now: 20 })).not.toBeNull()
        expect(service.validateSession(session.sessionToken, { mutation: true, now: 20 })).toBeNull()
        expect(service.validateSession(session.sessionToken, { mutation: true, csrfToken: 'wrong', now: 20 })).toBeNull()
        expect(service.validateSession(session.sessionToken, { mutation: true, csrfToken: session.csrfToken, now: 20 })).not.toBeNull()
        expect(service.validateSession(session.sessionToken, { mutation: false, now: 110 })).toBeNull()
    })

    it('logs an existing active identity in without requiring another invitation', () => {
        const { service } = setup()
        const admin = service.bootstrapFirstAdmin('o1', 'user@example.com', identity, 1)!
        const login = service.completeBrowserLogin({
            organizationId: 'o1', bootstrapAdminEmail: 'other@example.com', identity,
            invitationTokenHash: null, now: 2
        })
        expect(login).not.toBeNull()
        expect(service.validateSession(login!.sessionToken, { mutation: false, now: 3 })?.membershipId).toBe(admin.membershipId)
    })

    it('keeps invitation claim atomic when session creation fails', () => {
        const { db, store, service } = setup()
        store.createInvitation({ id: 'i1', organizationId: 'o1', email: 'user@example.com', tokenHash: keyedHash('invite', PEPPER), role: 'member', expiresAt: 100, createdAt: 1 })
        db.exec("CREATE TRIGGER fail_session BEFORE INSERT ON web_sessions BEGIN SELECT RAISE(ABORT, 'session failed'); END")
        expect(() => service.completeBrowserLogin({
            organizationId: 'o1', bootstrapAdminEmail: 'other@example.com', identity,
            invitationTokenHash: keyedHash('invite', PEPPER), now: 10
        })).toThrow(/session failed/)
        expect(db.prepare('SELECT claimed_at FROM invitations').get()).toEqual({ claimed_at: null })
        expect(db.prepare('SELECT count(*) count FROM memberships').get()).toEqual({ count: 0 })
    })

    it('invalidates sessions when the organization or membership is disabled', () => {
        const { db, service } = setup()
        const admin = service.bootstrapFirstAdmin('o1', 'user@example.com', identity, 1)!
        const session = service.createSession(admin.membershipId, 2)
        db.exec("UPDATE organizations SET status = 'disabled' WHERE id = 'o1'")
        expect(service.validateSession(session.sessionToken, { mutation: false, now: 3 })).toBeNull()
    })
})

describe('IdentityService — member management', () => {
    it('lists members and gets individual member details', () => {
        const { db, service } = setup()
        const admin = service.bootstrapFirstAdmin('o1', 'user@example.com', identity, 1)!
        db.exec("INSERT INTO memberships(id,organization_id,invited_email,role,status,created_at) VALUES ('m1','o1','other@example.com','member','invited',2)")
        const members = service.listMembers('o1')
        expect(members.length).toBe(2)
        const member = service.getMember('o1', admin.membershipId)
        expect(member?.role).toBe('admin')
        expect(service.getMember('o1', 'nonexistent')).toBeNull()
    })

    it('changes member role and prevents demoting the last admin', () => {
        const { db, service } = setup()
        const admin = service.bootstrapFirstAdmin('o1', 'user@example.com', identity, 1)!
        db.exec("INSERT INTO memberships(id,organization_id,invited_email,role,status,created_at) VALUES ('m1','o1','other@example.com','member','active',2)")
        service.updateMemberRole('o1', 'm1', 'admin', admin.membershipId)
        expect(service.getMember('o1', 'm1')?.role).toBe('admin')
        service.updateMemberRole('o1', admin.membershipId, 'member', 'm1')
        expect(service.getMember('o1', admin.membershipId)?.role).toBe('member')
        expect(() => service.updateMemberRole('o1', 'm1', 'member', 'm1'))
            .toThrow('Cannot remove the last admin.')
        expect(service.getMember('o1', 'm1')?.role).toBe('admin')
    })

    it('allows admin to demote another admin when another admin remains', () => {
        const { db, service } = setup()
        const admin = service.bootstrapFirstAdmin('o1', 'user@example.com', identity, 1)!
        db.exec("INSERT INTO memberships(id,organization_id,invited_email,role,status,created_at) VALUES ('m1','o1','other@example.com','admin','active',2)")
        service.updateMemberRole('o1', 'm1', 'member', admin.membershipId)
        expect(service.getMember('o1', 'm1')?.role).toBe('member')
    })

    it('rejects role change for non-active members', () => {
        const { db, service } = setup()
        service.bootstrapFirstAdmin('o1', 'user@example.com', identity, 1)!
        db.exec("INSERT INTO memberships(id,organization_id,invited_email,role,status,created_at) VALUES ('m1','o1','other@example.com','member','invited',2)")
        expect(() => service.updateMemberRole('o1', 'm1', 'admin', 'm1')).toThrow('Only active members')
    })

    it('disables and re-enables a member', () => {
        const { db, service } = setup()
        const admin = service.bootstrapFirstAdmin('o1', 'user@example.com', identity, 1)!
        db.exec("INSERT INTO memberships(id,organization_id,invited_email,role,status,created_at) VALUES ('m1','o1','other@example.com','member','active',2)")
        service.disableMember('o1', 'm1', admin.membershipId)
        expect(service.getMember('o1', 'm1')?.status).toBe('disabled')
        service.enableMember('o1', 'm1')
        expect(service.getMember('o1', 'm1')?.status).toBe('active')
    })

    it('prevents disabling the last admin', () => {
        const { db, service } = setup()
        const admin = service.bootstrapFirstAdmin('o1', 'user@example.com', identity, 1)!
        expect(() => service.disableMember('o1', admin.membershipId, admin.membershipId))
            .toThrow('Cannot disable the last admin.')
    })

    it('prevents disabling an already disabled member', () => {
        const { db, service } = setup()
        const admin = service.bootstrapFirstAdmin('o1', 'user@example.com', identity, 1)!
        db.exec("INSERT INTO memberships(id,organization_id,invited_email,role,status,created_at) VALUES ('m1','o1','other@example.com','member','active',2)")
        service.disableMember('o1', 'm1', admin.membershipId)
        expect(() => service.disableMember('o1', 'm1', admin.membershipId)).toThrow('already disabled')
    })

    it('prevents re-enabling an already active member', () => {
        const { db, service } = setup()
        const admin = service.bootstrapFirstAdmin('o1', 'user@example.com', identity, 1)!
        db.exec("INSERT INTO memberships(id,organization_id,invited_email,role,status,created_at) VALUES ('m1','o1','other@example.com','member','active',2)")
        expect(() => service.enableMember('o1', 'm1')).toThrow('already active')
    })
})
