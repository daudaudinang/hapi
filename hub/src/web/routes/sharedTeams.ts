import { z } from 'zod'
import { Hono, type Context } from 'hono'
import type { AuthorizationSubject } from '../../auth/authorizationService'
import { TeamAuthorizationService, TeamServiceError } from '../../application/teamAuthorizationService'
import type { SharedWebAppEnv } from '../sharedAuthEnv'

const id = z.string().trim().min(1)
const teamInput = z.object({ name: z.string().trim().min(1).max(120), ownerMembershipId: id }).strict()
const renameInput = z.object({ name: z.string().trim().min(1).max(120) }).strict()
const memberInput = z.object({ membershipId: id, role: z.enum(['owner', 'member']) }).strict()
const roleInput = z.object({ role: z.enum(['owner', 'member']) }).strict()
const transferInput = z.object({ sourceMembershipId: id, targetMembershipId: id }).strict()
const grantInput = z.object({
    principalType: z.enum(['user', 'team']),
    principalId: id,
    resourceType: z.enum(['runner', 'session']),
    resourceId: id,
    capability: z.enum(['view', 'interact', 'spawn', 'operate', 'manage']),
    expiresAt: z.number().int().positive().nullable()
}).strict()

export function createSharedTeamsRoutes(service: TeamAuthorizationService): Hono<SharedWebAppEnv> {
    const app = new Hono<SharedWebAppEnv>()

    app.get('/teams', (c) => handle(c, () => c.json({ teams: service.listTeams(subject(c)) })))
    app.post('/teams', async (c) => {
        const body = await parse(c.req.raw, teamInput)
        if (!body.ok) return invalid(c)
        return handle(c, () => c.json(service.createTeam(subject(c), body.value), 201))
    })
    app.patch('/teams/:teamId', async (c) => {
        const body = await parse(c.req.raw, renameInput)
        if (!body.ok) return invalid(c)
        return handle(c, () => {
            service.renameTeam(subject(c), c.req.param('teamId'), body.value.name)
            return c.body(null, 204)
        })
    })
    app.delete('/teams/:teamId', (c) => handle(c, () => {
        service.archiveTeam(subject(c), c.req.param('teamId'))
        return c.body(null, 204)
    }))
    app.get('/teams/:teamId/members', (c) => handle(c, () =>
        c.json({ members: service.listMembers(subject(c), c.req.param('teamId')) })))
    app.post('/teams/:teamId/members', async (c) => {
        const body = await parse(c.req.raw, memberInput)
        if (!body.ok) return invalid(c)
        return handle(c, () => {
            service.addMember(subject(c), c.req.param('teamId'), body.value)
            return c.body(null, 204)
        })
    })
    app.patch('/teams/:teamId/members/:membershipId', async (c) => {
        const body = await parse(c.req.raw, roleInput)
        if (!body.ok) return invalid(c)
        return handle(c, () => {
            service.updateMemberRole(subject(c), c.req.param('teamId'), c.req.param('membershipId'), body.value.role)
            return c.body(null, 204)
        })
    })
    app.delete('/teams/:teamId/members/:membershipId', (c) => handle(c, () => {
        service.removeMember(subject(c), c.req.param('teamId'), c.req.param('membershipId'))
        return c.body(null, 204)
    }))
    app.post('/teams/:teamId/ownership-transfer', async (c) => {
        const body = await parse(c.req.raw, transferInput)
        if (!body.ok) return invalid(c)
        return handle(c, () => {
            service.transferOwnership(subject(c), c.req.param('teamId'), body.value.sourceMembershipId, body.value.targetMembershipId)
            return c.body(null, 204)
        })
    })
    app.post('/grants', async (c) => {
        const body = await parse(c.req.raw, grantInput)
        if (!body.ok) return invalid(c)
        return handle(c, () => c.json(service.createGrant(subject(c), body.value), 201))
    })
    app.get('/grants', (c) => handle(c, () => c.json({ grants: service.listGrants(subject(c)) })))
    app.delete('/grants/:grantId', (c) => handle(c, () => {
        service.revokeGrant(subject(c), c.req.param('grantId'))
        return c.body(null, 204)
    }))
    app.get('/audit-events', (c) => {
        const limit = Number(c.req.query('limit') ?? '100')
        if (!Number.isInteger(limit) || limit < 1 || limit > 200) return invalid(c)
        return handle(c, () => c.json({ events: service.listAuditEvents(subject(c), limit) }))
    })

    return app
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
        if (!(error instanceof TeamServiceError)) throw error
        const status = error.code === 'bad_request' ? 400
            : error.code === 'forbidden' ? 403
                : error.code === 'not_found' ? 404 : 409
        return c.json({ error: error.message, code: error.code }, status)
    }
}
