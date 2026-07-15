import { Hono } from 'hono'
import { z } from 'zod'
import { PROTOCOL_VERSION } from '@hapi/protocol'
import { MarkTeamMentionNoActionInputSchema, ReportToTeamInputSchema } from '@hapi/protocol/schemas'
import { configuration } from '../../configuration'
import { constantTimeEquals } from '../../utils/crypto'
import { parseAccessToken } from '../../utils/accessToken'
import type { Machine, Session, SyncEngine } from '../../sync/syncEngine'
import type { RunnerAuthenticator } from '../../auth/runnerAuthenticator'

const bearerSchema = z.string().regex(/^(Bearer|Runner)\s+(.+)$/i)

const createOrLoadSessionSchema = z.object({
    tag: z.string().min(1),
    metadata: z.unknown(),
    agentState: z.unknown().nullable().optional(),
    model: z.string().optional(),
    modelReasoningEffort: z.string().optional(),
    effort: z.string().optional()
})

const createOrLoadMachineSchema = z.object({
    id: z.string().min(1),
    metadata: z.unknown(),
    runnerState: z.unknown().nullable().optional()
})

const getMessagesQuerySchema = z.object({
    afterSeq: z.coerce.number().int().min(0),
    limit: z.coerce.number().int().min(1).max(200).optional()
})

type CliEnv = {
    Variables: {
        namespace: string
        authenticatedMachineId?: string
    }
}

function resolveSessionForNamespace(
    engine: SyncEngine,
    sessionId: string,
    namespace: string
): { ok: true; session: Session; sessionId: string } | { ok: false; status: 403 | 404; error: string } {
    const access = engine.resolveSessionAccess(sessionId, namespace)
    if (access.ok) {
        return { ok: true, session: access.session, sessionId: access.sessionId }
    }
    return {
        ok: false,
        status: access.reason === 'access-denied' ? 403 : 404,
        error: access.reason === 'access-denied' ? 'Session access denied' : 'Session not found'
    }
}

function resolveMachineForNamespace(
    engine: SyncEngine,
    machineId: string,
    namespace: string
): { ok: true; machine: Machine } | { ok: false; status: 403 | 404; error: string } {
    const machine = engine.getMachineByNamespace(machineId, namespace)
    if (machine) {
        return { ok: true, machine }
    }
    if (engine.getMachine(machineId)) {
        return { ok: false, status: 403, error: 'Machine access denied' }
    }
    return { ok: false, status: 404, error: 'Machine not found' }
}

export function createCliRoutes(getSyncEngine: () => SyncEngine | null, runnerAuthenticator?: RunnerAuthenticator): Hono<CliEnv> {
    const app = new Hono<CliEnv>()

    app.use('*', async (c, next) => {
        c.header('X-Hapi-Protocol-Version', String(PROTOCOL_VERSION))

        const raw = c.req.header('authorization')
        if (!raw) {
            return c.json({ error: 'Missing Authorization header' }, 401)
        }

        const parsed = bearerSchema.safeParse(raw)
        if (!parsed.success) {
            return c.json({ error: 'Invalid Authorization header' }, 401)
        }

        const authorization=parsed.data
        const runnerMatch=/^Runner\s+([^.\s]+)\.([^\s]+)$/i.exec(authorization)
        const machineRoute=c.req.path==='/machines'||c.req.path.startsWith('/machines/')
        if(machineRoute){const machineId=c.req.header('x-hapi-machine-id');const runner=runnerMatch&&runnerAuthenticator?runnerAuthenticator.authenticateAny({credentialId:runnerMatch[1],secret:runnerMatch[2]}):null;if(!runner)return c.json({error:'Invalid Runner credential'},401);if(!machineId||machineId!==runner.machineId)return c.json({error:'Machine binding mismatch'},403);c.set('namespace',runner.organizationId);c.set('authenticatedMachineId',runner.machineId);return await next()}
        const token = authorization.replace(/^Bearer\s+/i, '')
        const parsedToken = parseAccessToken(token)
        if (!parsedToken || !constantTimeEquals(parsedToken.baseToken, configuration.cliApiToken)) {
            return c.json({ error: 'Invalid token' }, 401)
        }

        c.set('namespace', parsedToken.namespace)
        return await next()
    })

    app.post('/sessions', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not ready' }, 503)
        }
        const json = await c.req.json().catch(() => null)
        const parsed = createOrLoadSessionSchema.safeParse(json)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }
        const namespace = c.get('namespace')
        const session = engine.getOrCreateSession(
            parsed.data.tag,
            parsed.data.metadata,
            parsed.data.agentState ?? null,
            namespace,
            parsed.data.model,
            parsed.data.effort,
            parsed.data.modelReasoningEffort
        )
        return c.json({ session })
    })

    app.get('/sessions/:id', (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not ready' }, 503)
        }
        const sessionId = c.req.param('id')
        const namespace = c.get('namespace')
        const resolved = resolveSessionForNamespace(engine, sessionId, namespace)
        if (!resolved.ok) {
            return c.json({ error: resolved.error }, resolved.status)
        }
        return c.json({ session: resolved.session })
    })

    app.get('/sessions/:id/messages', (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not ready' }, 503)
        }
        const sessionId = c.req.param('id')
        const namespace = c.get('namespace')
        const resolved = resolveSessionForNamespace(engine, sessionId, namespace)
        if (!resolved.ok) {
            return c.json({ error: resolved.error }, resolved.status)
        }

        const parsed = getMessagesQuerySchema.safeParse(c.req.query())
        if (!parsed.success) {
            return c.json({ error: 'Invalid query' }, 400)
        }

        const limit = parsed.data.limit ?? 200
        const messages = engine.getMessagesAfter(resolved.sessionId, { afterSeq: parsed.data.afterSeq, limit })
        return c.json({ messages })
    })

    app.post('/sessions/:id/team-reports', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not ready' }, 503)
        }
        const sessionId = c.req.param('id')
        const namespace = c.get('namespace')
        const resolved = resolveSessionForNamespace(engine, sessionId, namespace)
        if (!resolved.ok) {
            return c.json({ error: resolved.error }, resolved.status)
        }

        const body = await c.req.json().catch(() => null)
        const parsed = ReportToTeamInputSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }
        try {
            return c.json(engine.reportToTeam({
                namespace,
                sourceSessionId: resolved.sessionId,
                ...parsed.data
            }), 201)
        } catch (error) {
            if (error instanceof Error && (error.message === 'TEAM_REPORT_TOO_LOW_SIGNAL' || error.message === 'TEAM_MENTION_HOP_LIMIT')) {
                return c.json({ error: error.message }, 400)
            }
            if (error instanceof Error && error.message.startsWith('TEAM_')) {
                return c.json({ error: 'Team Chat resource not found' }, 404)
            }
            throw error
        }
    })

    app.post('/sessions/:id/team-mentions/:requestId/no-action', (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not ready' }, 503)
        }
        const sessionId = c.req.param('id')
        const namespace = c.get('namespace')
        const resolved = resolveSessionForNamespace(engine, sessionId, namespace)
        if (!resolved.ok) {
            return c.json({ error: resolved.error }, resolved.status)
        }

        const parsed = MarkTeamMentionNoActionInputSchema.safeParse({ requestId: c.req.param('requestId') })
        if (!parsed.success) {
            return c.json({ error: 'Invalid request id' }, 400)
        }

        try {
            const request = engine.updateTeamMentionStatus({
                namespace,
                sessionId: resolved.sessionId,
                requestId: parsed.data.requestId,
                status: 'no_action'
            })
            return c.json({ request })
        } catch (error) {
            if (error instanceof Error && error.message.startsWith('TEAM_')) {
                return c.json({ error: 'Team mention not found' }, 404)
            }
            throw error
        }
    })

    app.post('/machines', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not ready' }, 503)
        }
        const json = await c.req.json().catch(() => null)
        const parsed = createOrLoadMachineSchema.safeParse(json)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }
        if(parsed.data.id!==c.get('authenticatedMachineId'))return c.json({error:'Machine binding mismatch'},403)

        const namespace = c.get('namespace')
        const existing = engine.getMachine(parsed.data.id)
        if (existing && existing.namespace !== namespace) {
            return c.json({ error: 'Machine access denied' }, 403)
        }
        const machine = engine.getOrCreateMachine(parsed.data.id, parsed.data.metadata, parsed.data.runnerState ?? null, namespace)
        return c.json({ machine })
    })

    app.get('/machines/:id', (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not ready' }, 503)
        }
        const machineId = c.req.param('id')
        if(machineId!==c.get('authenticatedMachineId'))return c.json({error:'Machine binding mismatch'},403)
        const namespace = c.get('namespace')
        const resolved = resolveMachineForNamespace(engine, machineId, namespace)
        if (!resolved.ok) {
            return c.json({ error: resolved.error }, resolved.status)
        }
        return c.json({ machine: resolved.machine })
    })

    return app
}
