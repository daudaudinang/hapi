import type { Capability, OrganizationRole } from '@hapi/protocol/auth'
import type { TeamAuthorizationService } from '../application/teamAuthorizationService'

const CAPABILITY_RANK: Record<Capability, number> = {
    view: 0,
    interact: 1,
    spawn: 2,
    operate: 3,
    manage: 4
}

export type ResourceCapabilityInput = {
    organizationId: string
    membershipId: string
    role: OrganizationRole
    resourceType: 'session' | 'machine'
    resourceId: string
}

export type ResourceCapabilityResolver = (input: ResourceCapabilityInput) => Capability | null

export function resolveResourceCapability(
    teamAuthorization: TeamAuthorizationService,
    input: ResourceCapabilityInput
): Capability | null {
    const subject = teamAuthorization.resolveLiveSubject(input.organizationId, input.membershipId)
    if (!subject) return null
    return input.resourceType === 'session'
        ? teamAuthorization.resolveEffectiveCapability(subject, 'session', input.resourceId)
        : teamAuthorization.resolveMachineCapability(subject, input.resourceId)
}

export function createResourceCapabilityResolver(teamAuthorization: TeamAuthorizationService): ResourceCapabilityResolver {
    return (input) => resolveResourceCapability(teamAuthorization, input)
}

export function capabilitySatisfies(capability: Capability | null, required: Capability): boolean {
    return capability !== null && CAPABILITY_RANK[capability] >= CAPABILITY_RANK[required]
}
