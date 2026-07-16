import type { Capability, OrganizationRole } from '@hapi/protocol/auth'
import { capabilitySatisfies } from './resourceCapability'
import type { StoredTeamChat, StoredTeamParticipant } from '../store'

export type TeamChatActor = {
    organizationId: string
    membershipId: string
    role: OrganizationRole
}

export type TeamChatResourceReader = {
    getTeamChat(namespace: string, id: string): StoredTeamChat | null
    listTeamParticipants(namespace: string, teamChatId: string): StoredTeamParticipant[]
}

export function resolveTeamChatCapability(
    reader: TeamChatResourceReader,
    actor: TeamChatActor,
    teamChatId: string
): Capability | null {
    const chat = reader.getTeamChat(actor.organizationId, teamChatId)
    if (!chat) return null
    if (actor.role === 'admin' || chat.ownerMembershipId === actor.membershipId) return 'manage'
    const participant = reader.listTeamParticipants(actor.organizationId, teamChatId).find((candidate) =>
        candidate.type === 'user' && candidate.userId === actor.membershipId && candidate.archivedAt === null)
    return participant ? 'interact' : null
}

export function canAccessTeamChat(
    reader: TeamChatResourceReader,
    actor: TeamChatActor,
    teamChatId: string,
    required: Capability
): boolean {
    return capabilitySatisfies(resolveTeamChatCapability(reader, actor, teamChatId), required)
}
