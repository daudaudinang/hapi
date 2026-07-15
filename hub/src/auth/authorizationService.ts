import { CAPABILITY_RANK, type AuthorizationAction, type Capability, type OrganizationRole } from '@hapi/protocol/auth'

export type AuthorizationSubject = {
    membershipId: string
    organizationId: string
    role: OrganizationRole
    disabled: boolean
}

export type AuthorizationResource = {
    type: 'runner' | 'session'
    id: string
    organizationId: string
    ownerMembershipId?: string
}

export type EffectiveGrant = { capability: Capability; expiresAt: number | null; source: 'direct' | 'team' }

const ACTION_CAPABILITY: Partial<Record<AuthorizationAction, Capability>> = {
    'runner.view': 'view', 'runner.interact': 'interact', 'runner.spawn': 'spawn',
    'runner.operate': 'operate', 'runner.manage': 'manage', 'session.view': 'view',
    'session.interact': 'interact', 'session.operate': 'operate', 'terminal.open': 'operate',
    'editor.read': 'view', 'editor.write': 'operate', 'files.read': 'view', 'files.write': 'operate',
    'git.read': 'view', 'git.write': 'operate', 'rpc.invoke': 'operate',
    'permission.respond': 'interact', 'team-chat.read': 'view', 'team-chat.write': 'interact'
}

const OWNER_ONLY = new Set<AuthorizationAction>([
    'runner.transfer', 'runner.archive', 'runner.revoke', 'runner.credential.rotate'
])

export class AuthorizationService {
    can(subject: AuthorizationSubject, action: AuthorizationAction, resource: AuthorizationResource, grants: readonly EffectiveGrant[], now = Date.now()): boolean {
        if (subject.disabled || subject.organizationId !== resource.organizationId) return false
        if (action === 'organization.manage' || action === 'member.manage' || action === 'team.manage') {
            return subject.role === 'admin'
        }
        if (subject.role === 'admin') return true
        const required = ACTION_CAPABILITY[action]
        if (subject.role === 'viewer') return required === 'view'
        if (OWNER_ONLY.has(action)) return resource.ownerMembershipId === subject.membershipId
        if (!required) return false
        if (resource.ownerMembershipId === subject.membershipId) return true
        return grants.some((grant) => (grant.expiresAt === null || grant.expiresAt > now)
            && CAPABILITY_RANK[grant.capability] >= CAPABILITY_RANK[required]
            && !(resource.type === 'session' && required !== 'view'))
    }
}
