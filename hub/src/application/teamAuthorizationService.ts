import { randomUUID } from 'node:crypto'
import type { Capability } from '@hapi/protocol/auth'
import { AuthorizationService, type AuthorizationSubject } from '../auth/authorizationService'
import {
    SharedHubStore,
    type StoredResourceGrant,
    type StoredTeam,
    type StoredTeamMembership
} from '../store/sharedHubStore'

export type TeamServiceErrorCode = 'bad_request' | 'forbidden' | 'not_found' | 'conflict'

export class TeamServiceError extends Error {
    constructor(readonly code: TeamServiceErrorCode, message: string) {
        super(message)
        this.name = 'TeamServiceError'
    }
}

export class TeamAuthorizationService {
    constructor(
        private readonly store: SharedHubStore,
        private readonly authorization: AuthorizationService,
        private readonly publish?: (event: { id: string; name: string; organizationId: string; resourceType: string; resourceId: string }) => void,
        private readonly onAccessLoss?: (input: { organizationId: string; membershipIds: readonly string[]; resourceType: 'runner' | 'session' | 'team'; resourceId: string }) => void
    ) {}

    resolveLiveSubject(organizationId: string, membershipId: string): AuthorizationSubject | null {
        const membership = this.store.findMembershipById(organizationId, membershipId)
        if (!membership || membership.status !== 'active') return null
        return {
            organizationId,
            membershipId,
            role: membership.role,
            disabled: false
        }
    }

    listTeams(subject: AuthorizationSubject): StoredTeam[] {
        this.requireActive(subject)
        return this.store.listTeams(subject.organizationId)
    }

    listGrants(subject: AuthorizationSubject) {
        this.requireAdmin(subject)
        return this.store.listResourceGrants(subject.organizationId)
    }

    listAuditEvents(subject: AuthorizationSubject, limit?: number) {
        this.requireAdmin(subject)
        return this.store.listAuditEvents(subject.organizationId, limit)
    }

    resolveEffectiveCapability(
        subject: AuthorizationSubject,
        resourceType: 'runner' | 'session',
        resourceId: string,
        now = Date.now()
    ): Capability | null {
        this.requireActive(subject)
        const runner = resourceType === 'runner'
            ? this.store.findRunner(subject.organizationId, resourceId)
            : this.store.findSessionRunner(subject.organizationId, resourceId)
        if (!runner || runner.status !== 'active') return null
        const resource = {
            type: 'runner' as const,
            id: runner.id,
            organizationId: runner.organizationId,
            ownerMembershipId: runner.ownerMembershipId
        }
        const grants = this.store.resolveEffectiveGrants({
            organizationId: subject.organizationId,
            membershipId: subject.membershipId,
            resourceType: 'runner',
            resourceId: runner.id,
            now
        })
        const actions: ReadonlyArray<readonly [Capability, 'runner.manage' | 'runner.operate' | 'runner.spawn' | 'runner.interact' | 'runner.view']> = [
            ['manage', 'runner.manage'],
            ['operate', 'runner.operate'],
            ['spawn', 'runner.spawn'],
            ['interact', 'runner.interact'],
            ['view', 'runner.view']
        ]
        for (const [capability, action] of actions) {
            if (this.authorization.can(subject, action, resource, grants, now)) return capability
        }
        if (resourceType === 'session') {
            const sessionGrants = this.store.resolveEffectiveGrants({
                organizationId: subject.organizationId,
                membershipId: subject.membershipId,
                resourceType: 'session',
                resourceId,
                now
            })
            if (this.authorization.can(subject, 'session.view', {
                type: 'session', id: resourceId, organizationId: runner.organizationId,
                ownerMembershipId: runner.ownerMembershipId
            }, sessionGrants, now)) return 'view'
        }
        return null
    }

    resolveMachineCapability(
        subject: AuthorizationSubject,
        machineId: string,
        now = Date.now()
    ): Capability | null {
        const runner = this.store.findRunnerByMachine(subject.organizationId, machineId)
        return runner ? this.resolveEffectiveCapability(subject, 'runner', runner.id, now) : null
    }

    listMembers(subject: AuthorizationSubject, teamId: string): StoredTeamMembership[] {
        this.requireTeamManager(subject, teamId)
        const team = this.store.findTeam(subject.organizationId, teamId)
        if (!team) throw new TeamServiceError('not_found', 'Team not found.')
        return this.store.listTeamMemberships(subject.organizationId, teamId)
    }

    createTeam(subject: AuthorizationSubject, input: { name: string; ownerMembershipId: string }, now = Date.now()): StoredTeam {
        this.requireAdmin(subject)
        return this.commit(subject, 'team.created', 'team', randomUUID(), now, (teamId) => {
            if (!this.store.membershipExists(subject.organizationId, input.ownerMembershipId)) {
                throw new TeamServiceError('not_found', 'Membership not found.')
            }
            try {
                const team = this.store.createTeam({ id: teamId, organizationId: subject.organizationId, name: input.name, createdAt: now })
                this.store.addTeamMembership({ organizationId: subject.organizationId, teamId, membershipId: input.ownerMembershipId, role: 'owner', createdAt: now })
                return team
            } catch (error) {
                throw mapConstraint(error, 'Equivalent team already exists.')
            }
        })
    }

    renameTeam(subject: AuthorizationSubject, teamId: string, name: string, now = Date.now()): void {
        this.requireAdmin(subject)
        this.commit(subject, 'team.renamed', 'team', teamId, now, () => {
            try {
                const result = this.store.renameTeam(subject.organizationId, teamId, name)
                if (result === 'archived') throw new TeamServiceError('conflict', 'Archived teams are immutable.')
                mapTeamResult(result)
            } catch (error) {
                throw mapConstraint(error, 'Equivalent team already exists.')
            }
        })
    }

    archiveTeam(subject: AuthorizationSubject, teamId: string, now = Date.now()): void {
        this.requireAdmin(subject)
        const membershipIds = this.store.listTeamMemberships(subject.organizationId, teamId).map((member) => member.membershipId)
        this.commit(subject, 'team.archived', 'team', teamId, now, () => mapTeamResult(this.store.archiveTeam(subject.organizationId, teamId, now)))
        this.onAccessLoss?.({ organizationId: subject.organizationId, membershipIds, resourceType: 'team', resourceId: teamId })
    }

    addMember(subject: AuthorizationSubject, teamId: string, input: { membershipId: string; role: 'owner' | 'member' }, now = Date.now()): void {
        this.requireTeamManager(subject, teamId)
        this.commit(subject, 'team.member-added', 'team', teamId, now, () => {
            try {
                mapTeamResult(this.store.addTeamMembership({ organizationId: subject.organizationId, teamId, ...input, createdAt: now }))
            } catch (error) {
                throw mapConstraint(error, 'Team membership already exists.')
            }
        })
    }

    updateMemberRole(subject: AuthorizationSubject, teamId: string, membershipId: string, role: 'owner' | 'member', now = Date.now()): void {
        this.requireTeamManager(subject, teamId)
        this.commit(subject, 'team.member-role-updated', 'team', teamId, now, () =>
            mapTeamResult(this.store.updateTeamMembershipRole(subject.organizationId, teamId, membershipId, role)))
    }

    removeMember(subject: AuthorizationSubject, teamId: string, membershipId: string, now = Date.now()): void {
        this.requireTeamManager(subject, teamId)
        this.commit(subject, 'team.member-removed', 'team', teamId, now, () =>
            mapTeamResult(this.store.removeTeamMembership(subject.organizationId, teamId, membershipId)))
        this.onAccessLoss?.({ organizationId: subject.organizationId, membershipIds: [membershipId], resourceType: 'team', resourceId: teamId })
    }

    transferOwnership(subject: AuthorizationSubject, teamId: string, sourceMembershipId: string, targetMembershipId: string, now = Date.now()): void {
        this.requireTeamManager(subject, teamId)
        if (subject.role !== 'admin' && sourceMembershipId !== subject.membershipId) {
            throw new TeamServiceError('forbidden', 'Team owners may transfer only their own ownership.')
        }
        this.commit(subject, 'team.ownership-transferred', 'team', teamId, now, () =>
            mapTeamResult(this.store.transferTeamOwnership(subject.organizationId, teamId, sourceMembershipId, targetMembershipId)))
    }

    createGrant(subject: AuthorizationSubject, input: Omit<StoredResourceGrant, 'id' | 'organizationId'>, now = Date.now()): StoredResourceGrant {
        if (input.resourceType === 'session' && input.capability !== 'view') {
            throw new TeamServiceError('bad_request', 'Session grants are read-only.')
        }
        if (input.expiresAt !== null && input.expiresAt <= now) {
            throw new TeamServiceError('bad_request', 'Grant expiry must be in the future.')
        }
        this.requireResourceManager(subject, input.resourceType, input.resourceId, now)
        if (input.principalType === 'user') {
            if (!this.store.membershipExists(subject.organizationId, input.principalId)) throw new TeamServiceError('not_found', 'Principal not found.')
        } else {
            const team = this.store.findTeam(subject.organizationId, input.principalId)
            if (!team || team.archivedAt !== null) throw new TeamServiceError('not_found', 'Principal not found.')
        }
        const grantId = randomUUID()
        return this.commit(subject, 'grant.created', input.resourceType, input.resourceId, now, () => {
            try {
                return this.store.createResourceGrant({ id: grantId, organizationId: subject.organizationId, ...input, createdByMembershipId: subject.membershipId, createdAt: now })
            } catch (error) {
                throw mapConstraint(error, 'Equivalent grant already exists.')
            }
        })
    }

    revokeGrant(subject: AuthorizationSubject, grantId: string, now = Date.now()): void {
        this.requireActive(subject)
        const grant = this.store.findResourceGrant(subject.organizationId, grantId)
        if (subject.role !== 'admin') {
            if (!grant) throw new TeamServiceError('forbidden', 'Not authorized.')
            try {
                this.requireResourceManager(subject, grant.resourceType, grant.resourceId, now)
            } catch (error) {
                if (error instanceof TeamServiceError && error.code === 'not_found') {
                    throw new TeamServiceError('forbidden', 'Not authorized.')
                }
                throw error
            }
        }
        if (!grant) throw new TeamServiceError('not_found', 'Grant not found.')
        this.commit(subject, 'grant.revoked', grant.resourceType, grant.resourceId, now, () => {
            if (!this.store.deleteResourceGrant(subject.organizationId, grantId)) throw new TeamServiceError('not_found', 'Grant not found.')
        })
        const membershipIds = grant.principalType === 'user'
            ? [grant.principalId]
            : this.store.listTeamMemberships(subject.organizationId, grant.principalId).map((member) => member.membershipId)
        this.onAccessLoss?.({
            organizationId: subject.organizationId,
            membershipIds,
            resourceType: grant.resourceType,
            resourceId: grant.resourceId
        })
    }

    private requireAdmin(subject: AuthorizationSubject): void {
        this.requireActive(subject)
        if (subject.role !== 'admin') throw new TeamServiceError('forbidden', 'Not authorized.')
    }

    private requireActive(subject: AuthorizationSubject): void {
        if (subject.disabled) throw new TeamServiceError('forbidden', 'Not authorized.')
    }

    private requireTeamManager(subject: AuthorizationSubject, teamId: string): void {
        this.requireActive(subject)
        if (subject.role !== 'admin' && !this.store.isTeamOwner(subject.organizationId, teamId, subject.membershipId)) {
            throw new TeamServiceError('forbidden', 'Not authorized.')
        }
    }

    private requireResourceManager(subject: AuthorizationSubject, resourceType: 'runner' | 'session', resourceId: string, now: number): void {
        this.requireActive(subject)
        const runner = resourceType === 'runner'
            ? this.store.findRunner(subject.organizationId, resourceId)
            : this.store.findSessionRunner(subject.organizationId, resourceId)
        if (!runner || runner.status !== 'active') throw new TeamServiceError('not_found', 'Resource not found.')
        const grants = this.store.resolveEffectiveGrants({ organizationId: subject.organizationId, membershipId: subject.membershipId, resourceType, resourceId, now })
        if (!this.authorization.can(subject, 'runner.manage', {
            type: 'runner', id: runner.id, organizationId: runner.organizationId, ownerMembershipId: runner.ownerMembershipId
        }, grants, now)) throw new TeamServiceError('forbidden', 'Not authorized.')
    }

    private commit<T>(subject: AuthorizationSubject, name: string, resourceType: string, resourceId: string, now: number, mutate: (resourceId: string) => T): T {
        const eventId = randomUUID()
        const value = this.store.transaction(() => {
            const result = mutate(resourceId)
            this.store.appendAuditEvent({ id: randomUUID(), organizationId: subject.organizationId, actorType: 'user', actorId: subject.membershipId, action: name, resourceType, resourceId, outcome: 'success', createdAt: now })
            this.store.appendOutboxEvent({ id: eventId, organizationId: subject.organizationId, name, resourceType, resourceId, createdAt: now })
            return result
        })
        if (this.publish) {
            try {
                this.publish({ id: eventId, name, organizationId: subject.organizationId, resourceType, resourceId })
                this.store.markOutboxEventPublished(eventId, Date.now())
            } catch {
                // The durable outbox is retried by the dispatcher.
            }
        }
        return value
    }
}

function mapTeamResult(result: string): void {
    if (result === 'updated' || result === 'archived' || result === 'added' || result === 'removed' || result === 'transferred') return
    if (result === 'same_member') throw new TeamServiceError('bad_request', 'Source and target must differ.')
    if (result === 'not_found') throw new TeamServiceError('not_found', 'Team or membership not found.')
    if (result === 'target_owner' || result === 'last_owner') throw new TeamServiceError('conflict', 'Team ownership conflict.')
    throw new TeamServiceError('conflict', 'Archived teams are immutable.')
}

function mapConstraint(error: unknown, message: string): Error {
    if (error instanceof TeamServiceError) return error
    if (error instanceof Error && /constraint|unique/i.test(error.message)) return new TeamServiceError('conflict', message)
    return error instanceof Error ? error : new Error('Unexpected persistence error.')
}
