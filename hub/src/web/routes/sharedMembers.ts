import { z } from 'zod'
import { Hono, type Context } from 'hono'
import type { AuthorizationSubject } from '../../auth/authorizationService'
import type { IdentityService } from '../../auth/identityService'
import { MemberServiceError } from '../../auth/identityService'
import type { SharedWebAppEnv } from '../sharedAuthEnv'

type MemberBoundary = Pick<IdentityService,
    'listMembers' | 'getMember' | 'updateMemberRole' | 'disableMember' | 'enableMember' |
    'issueInvitation' | 'listInvitations' | 'cancelInvitation'>

const id = z.string().trim().min(1)
const roleInput = z.object({ role: z.enum(['admin', 'member', 'viewer']) }).strict()
const statusInput = z.object({ status: z.enum(['active', 'disabled']) }).strict()
const invitationInput = z.object({
    email: z.string().trim().email().max(320),
    role: z.enum(['admin', 'member', 'viewer'])
}).strict()

export function createSharedMembersRoutes(
    identity: MemberBoundary,
    onMemberDisabled?: (organizationId: string, membershipId: string) => void
): Hono<SharedWebAppEnv> {
    const app = new Hono<SharedWebAppEnv>()

    app.get('/members', (c) => handle(c, () => {
        const actor = subject(c)
        requireAdmin(actor)
        return c.json({ members: identity.listMembers(actor.organizationId) })
    }))

    app.get('/members/:membershipId', (c) => handle(c, () => {
        const actor = subject(c)
        requireAdmin(actor)
        const member = identity.getMember(actor.organizationId, c.req.param('membershipId'))
        if (!member) return c.json({ error: 'Not found.', code: 'not_found' }, 404)
        return c.json(member)
    }))

    app.get('/invitations', (c) => handle(c, () => {
        const actor = subject(c)
        return c.json({ invitations: identity.listInvitations(actor) })
    }))

    app.post('/invitations', async (c) => {
        const body = await parse(c.req.raw, invitationInput)
        if (!body.ok) return invalid(c)
        return handle(c, () => {
            c.header('Cache-Control', 'no-store')
            return c.json(identity.issueInvitation(subject(c), body.value), 201)
        })
    })

    app.delete('/invitations/:invitationId', (c) => handle(c, () => {
        identity.cancelInvitation(subject(c), c.req.param('invitationId'))
        return c.body(null, 204)
    }))

    app.patch('/members/:membershipId/role', async (c) => {
        const body = await parse(c.req.raw, roleInput)
        if (!body.ok) return invalid(c)
        return handle(c, () => {
            const actor = subject(c)
            requireAdmin(actor)
            identity.updateMemberRole(actor.organizationId, c.req.param('membershipId'), body.value.role, actor.membershipId)
            onMemberDisabled?.(actor.organizationId, c.req.param('membershipId'))
            return c.body(null, 204)
        })
    })

    app.patch('/members/:membershipId/status', async (c) => {
        const body = await parse(c.req.raw, statusInput)
        if (!body.ok) return invalid(c)
        return handle(c, () => {
            const actor = subject(c)
            requireAdmin(actor)
            if (body.value.status === 'disabled') {
                const membershipId = c.req.param('membershipId')
                identity.disableMember(actor.organizationId, membershipId, actor.membershipId)
                onMemberDisabled?.(actor.organizationId, membershipId)
            } else {
                identity.enableMember(actor.organizationId, c.req.param('membershipId'), actor.membershipId)
            }
            return c.body(null, 204)
        })
    })

    return app
}

function requireAdmin(subject: AuthorizationSubject): void {
    if (subject.disabled || subject.role !== 'admin') {
        throw new MemberServiceError('forbidden', 'Not authorized.')
    }
}

function subject(c: Context<SharedWebAppEnv>): AuthorizationSubject {
    return {
        membershipId: c.get('membershipId'),
        organizationId: c.get('organizationId'),
        role: c.get('organizationRole'),
        disabled: false
    }
}

async function parse<T>(request: Request, schema: z.ZodType<T>): Promise<{ ok: true; value: T } | { ok: false }> {
    const value: unknown = await request.json().catch(() => null)
    const parsed = schema.safeParse(value)
    return parsed.success ? { ok: true, value: parsed.data } : { ok: false }
}

function invalid(c: Context<SharedWebAppEnv>) {
    return c.json({ error: 'invalid_request', code: 'bad_request' }, 400)
}

function handle<T>(c: Context<SharedWebAppEnv>, operation: () => T): T | Response {
    try {
        return operation()
    } catch (error) {
        if (!(error instanceof MemberServiceError)) throw error
        const status = error.code === 'bad_request' ? 400
            : error.code === 'forbidden' ? 403
                : error.code === 'not_found' ? 404 : 409
        return c.json({ error: error.message, code: error.code }, status)
    }
}
