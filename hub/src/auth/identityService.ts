import { randomUUID } from 'node:crypto'
import { SharedHubStore, type StoredWebSession } from '../store/sharedHubStore'
import { keyedHash, normalizeEmail, randomOpaqueToken, safeHashEquals } from './identityCrypto'

export type VerifiedIdentity = { issuer: string; subject: string; email: string; emailVerified: true }

export type MemberSummary = {
    membershipId: string
    invitedEmail: string
    role: 'admin' | 'member' | 'viewer'
    status: 'invited' | 'active' | 'disabled'
    identityId: string | null
    identityIssuer: string | null
    identitySubject: string | null
    createdAt: number
}

export class MemberServiceError extends Error {
    constructor(readonly code: 'bad_request' | 'forbidden' | 'not_found' | 'conflict', message: string) {
        super(message)
        this.name = 'MemberServiceError'
    }
}

export class IdentityService {
    constructor(
        private readonly store: SharedHubStore,
        private readonly pepper: string,
        private readonly sessionTtlMs = 8 * 60 * 60 * 1000
    ) {
        if (pepper.length < 32) throw new Error('Identity pepper must contain at least 32 characters.')
    }

    claimInvitation(token: string, identity: VerifiedIdentity, now = Date.now()) {
        return this.store.claimInvitation({
            tokenHash: keyedHash(token, this.pepper),
            verifiedEmail: normalizeEmail(identity.email),
            identityId: randomUUID(), issuer: identity.issuer, subject: identity.subject,
            membershipId: randomUUID(), now
        })
    }

    claimInvitationHash(tokenHash: string, identity: VerifiedIdentity, now = Date.now()) {
        return this.store.claimInvitationHash({
            tokenHash,
            verifiedEmail: normalizeEmail(identity.email),
            identityId: randomUUID(), issuer: identity.issuer, subject: identity.subject,
            membershipId: randomUUID(), now
        })
    }

    findActiveMembership(identity: VerifiedIdentity) {
        const membership = this.store.findMembershipByIdentity(identity.issuer, identity.subject)
        return membership?.status === 'active'
            ? { membershipId: membership.membershipId, organizationId: membership.organizationId, role: membership.role }
            : null
    }

    bootstrapFirstAdmin(organizationId: string, configuredEmail: string, identity: VerifiedIdentity, now = Date.now()) {
        return this.store.bootstrapFirstAdmin({
            organizationId,
            configuredEmail: normalizeEmail(configuredEmail),
            verifiedEmail: normalizeEmail(identity.email),
            identityId: randomUUID(), issuer: identity.issuer, subject: identity.subject,
            membershipId: randomUUID(), now
        })
    }

    createSession(membershipId: string, now = Date.now()): { sessionToken: string; csrfToken: string; expiresAt: number } {
        const sessionToken = randomOpaqueToken()
        const csrfToken = randomOpaqueToken()
        const expiresAt = now + this.sessionTtlMs
        this.store.createWebSession({
            idHash: keyedHash(sessionToken, this.pepper), membershipId,
            csrfHash: keyedHash(csrfToken, this.pepper), expiresAt, createdAt: now
        })
        return { sessionToken, csrfToken, expiresAt }
    }

    completeBrowserLogin(input: {
        organizationId: string
        bootstrapAdminEmail: string
        identity: VerifiedIdentity
        invitationTokenHash: string | null
        now?: number
    }): { sessionToken: string; csrfToken: string; expiresAt: number } | null {
        const now = input.now ?? Date.now()
        return this.store.transaction(() => {
            const membership = this.findActiveMembership(input.identity)
                ?? this.bootstrapFirstAdmin(input.organizationId, input.bootstrapAdminEmail, input.identity, now)
                ?? (input.invitationTokenHash ? this.claimInvitationHash(input.invitationTokenHash, input.identity, now) : null)
            return membership ? this.createSession(membership.membershipId, now) : null
        })
    }

    validateSession(sessionToken: string, input: { mutation: boolean; csrfToken?: string; now?: number }): StoredWebSession | null {
        const session = this.store.getValidWebSession(keyedHash(sessionToken, this.pepper), input.now ?? Date.now())
        if (!session) return null
        if (!input.mutation) return session
        if (!input.csrfToken) return null
        return safeHashEquals(session.csrfHash, keyedHash(input.csrfToken, this.pepper)) ? session : null
    }

    revokeSession(sessionToken: string, now = Date.now()): boolean {
        return this.store.revokeWebSession(keyedHash(sessionToken, this.pepper), now)
    }

    listMembers(organizationId: string): MemberSummary[] {
        return this.store.listMemberships(organizationId)
    }

    getMember(organizationId: string, membershipId: string): MemberSummary | null {
        return this.store.findMembershipById(organizationId, membershipId)
    }

    updateMemberRole(organizationId: string, membershipId: string, role: 'admin' | 'member' | 'viewer', actorMembershipId: string): void {
        const member = this.store.findMembershipById(organizationId, membershipId)
        if (!member) throw new MemberServiceError('not_found', 'Member not found.')
        if (member.status !== 'active') throw new MemberServiceError('conflict', 'Only active members can have their role changed.')
        if (member.role === role) throw new MemberServiceError('bad_request', 'Role is unchanged.')
        if (member.role === 'admin' && role !== 'admin' && membershipId === actorMembershipId) {
            if (this.store.countActiveAdmins(organizationId) <= 1) {
                throw new MemberServiceError('conflict', 'Cannot remove the last admin.')
            }
        }
        if (this.store.updateMembershipRole(organizationId, membershipId, role) === 'not_found') {
            throw new MemberServiceError('not_found', 'Member not found.')
        }
    }

    disableMember(organizationId: string, membershipId: string, actorMembershipId: string): void {
        const member = this.store.findMembershipById(organizationId, membershipId)
        if (!member) throw new MemberServiceError('not_found', 'Member not found.')
        if (member.status === 'disabled') throw new MemberServiceError('bad_request', 'Member is already disabled.')
        if (member.role === 'admin' && membershipId === actorMembershipId) {
            if (this.store.countActiveAdmins(organizationId) <= 1) {
                throw new MemberServiceError('conflict', 'Cannot disable the last admin.')
            }
        }
        if (this.store.updateMembershipStatus(organizationId, membershipId, 'disabled') === 'not_found') {
            throw new MemberServiceError('not_found', 'Member not found.')
        }
    }

    enableMember(organizationId: string, membershipId: string): void {
        const member = this.store.findMembershipById(organizationId, membershipId)
        if (!member) throw new MemberServiceError('not_found', 'Member not found.')
        if (member.status === 'active') throw new MemberServiceError('bad_request', 'Member is already active.')
        if (this.store.updateMembershipStatus(organizationId, membershipId, 'active') === 'not_found') {
            throw new MemberServiceError('not_found', 'Member not found.')
        }
    }
}
