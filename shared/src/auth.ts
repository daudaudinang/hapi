import { z } from 'zod'

export const OrganizationRoleSchema = z.enum(['admin', 'member', 'viewer'])
export const TeamRoleSchema = z.enum(['owner', 'member'])
export const CapabilitySchema = z.enum(['view', 'interact', 'spawn', 'operate', 'manage'])
export const ResourceTypeSchema = z.enum(['runner', 'session'])
export const PrincipalTypeSchema = z.enum(['user', 'team'])

export const ActorSchema = z.object({
    type: z.enum(['user', 'runner']),
    id: z.string().min(1),
    organizationId: z.string().min(1),
    role: OrganizationRoleSchema.optional()
}).strict()

export const AuthorizationActionSchema = z.enum([
    'organization.manage', 'member.manage', 'team.manage',
    'runner.view', 'runner.interact', 'runner.spawn', 'runner.operate', 'runner.manage',
    'runner.transfer', 'runner.archive', 'runner.revoke', 'runner.credential.rotate',
    'session.view', 'session.interact', 'session.operate',
    'terminal.open', 'editor.read', 'editor.write', 'files.read', 'files.write',
    'git.read', 'git.write', 'rpc.invoke', 'permission.respond', 'team-chat.read', 'team-chat.write'
])

export const ResourceGrantSchema = z.object({
    id: z.string().min(1),
    organizationId: z.string().min(1),
    principalType: PrincipalTypeSchema,
    principalId: z.string().min(1),
    resourceType: ResourceTypeSchema,
    resourceId: z.string().min(1),
    capability: CapabilitySchema,
    expiresAt: z.number().int().positive().nullable()
}).strict()

export type Actor = z.infer<typeof ActorSchema>
export type AuthorizationAction = z.infer<typeof AuthorizationActionSchema>
export type Capability = z.infer<typeof CapabilitySchema>
export type OrganizationRole = z.infer<typeof OrganizationRoleSchema>
export type ResourceGrant = z.infer<typeof ResourceGrantSchema>

export const CAPABILITY_RANK: Readonly<Record<Capability, number>> = {
    view: 0,
    interact: 1,
    spawn: 2,
    operate: 3,
    manage: 4
}
