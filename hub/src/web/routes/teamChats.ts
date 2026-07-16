import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'

import type { SyncEngine } from '../../sync/syncEngine'
import type { TeamAuthorizationService } from '../../application/teamAuthorizationService'
import { capabilitySatisfies } from '../../auth/resourceCapability'
import { canAccessTeamChat, resolveTeamChatCapability, type TeamChatActor } from '../../auth/teamChatAuthorization'
import type { WebAppEnv } from '../middleware/auth'
import { requireSession, requireSessionFromParam, requireSyncEngine, type RestCapabilityResolver } from './guards'

const createTeamChatSchema = z.object({
    name: z.string().min(1),
    projectPath: z.string().optional().nullable()
})

const postTeamChatMessageSchema = z.object({
    authorParticipantId: z.string().min(1),
    text: z.string().trim().min(1).max(20_000),
    replyToMessageId: z.string().optional().nullable()
})

const participantRoleSchema = z.enum(['backend', 'frontend', 'tests', 'reviewer', 'docs', 'general'])

const addParticipantSchema = z.object({
    type: z.enum(['user', 'session']),
    userId: z.string().optional().nullable(),
    sessionId: z.string().optional().nullable(),
    displayName: z.string().trim().min(1).max(32),
    role: participantRoleSchema.default('general'),
    color: z.string().regex(/^#[0-9a-f]{6}$/i)
})

const updateParticipantSchema = z.object({
    displayName: z.string().trim().min(1).max(32),
    role: participantRoleSchema,
    color: z.string().regex(/^#[0-9a-f]{6}$/i)
})

const messagesQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    beforeSeq: z.coerce.number().int().min(1).optional()
})

const updateMentionStatusSchema = z.object({
    status: z.enum(['seen', 'processing', 'no_action'])
})

const reportToTeamRequestSchema = z.object({
    authorParticipantId: z.string().min(1).optional(),
    sourceSessionId: z.string().min(1).optional(),
    type: z.enum(['reply', 'progress', 'done', 'blocked', 'question', 'handoff']),
    summary: z.string().trim().min(3).max(4_000),
    details: z.string().trim().max(20_000).optional(),
    replyToMessageId: z.string().optional().nullable(),
    replyToRequestId: z.string().optional().nullable(),
    mentions: z.array(z.string().min(1)).default([]),
    files: z.array(z.string().min(1)).default([])
}).refine((input) => Boolean(input.authorParticipantId || input.sourceSessionId), {
    message: 'authorParticipantId or sourceSessionId is required'
})

function teamChatErrorResponse(c: Context<WebAppEnv>, error: unknown): Response {
    if (error instanceof Error && error.message === 'TEAM_PARTICIPANT_DISPLAY_NAME_EXISTS') {
        return c.json({ error: error.message }, 409)
    }
    if (error instanceof Error && (error.message === 'TEAM_REPORT_TOO_LOW_SIGNAL' || error.message === 'TEAM_MENTION_HOP_LIMIT')) {
        return c.json({ error: error.message }, 400)
    }
    if (error instanceof Error && error.message.startsWith('TEAM_')) {
        return c.json({ error: 'Team Chat resource not found' }, 404)
    }
    throw error
}

export function createTeamChatsRoutes(
    getSyncEngine: () => SyncEngine | null,
    teamAuthorization: Pick<TeamAuthorizationService, 'resolveLiveSubject'>,
    resourceCapabilityResolver: RestCapabilityResolver
): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    const actor = (c: Context<WebAppEnv>): TeamChatActor | null =>
        teamAuthorization.resolveLiveSubject(c.get('organizationId'), c.get('membershipId'))

    const requireChat = (c: Context<WebAppEnv>, engine: SyncEngine, teamChatId: string, required: 'view' | 'interact' | 'operate' | 'manage') => {
        const liveActor = actor(c)
        if (!liveActor) return c.json({ error: 'Resource access denied', code: 'forbidden' }, 403)
        const chat = engine.getTeamChat(liveActor.organizationId, teamChatId)
        if (!chat) return c.json({ error: 'Team Chat not found' }, 404)
        if (!capabilitySatisfies(resolveTeamChatCapability(engine, liveActor, teamChatId), required)) {
            return c.json({ error: 'Resource access denied', code: 'forbidden' }, 403)
        }
        return liveActor
    }

    const requireAuthor = (c: Context<WebAppEnv>, engine: SyncEngine, teamChatId: string, participantId: string) => {
        const liveActor = requireChat(c, engine, teamChatId, 'interact')
        if (liveActor instanceof Response) return liveActor
        const participant = engine.listTeamParticipants(liveActor.organizationId, teamChatId)
            .find((candidate) => candidate.id === participantId && candidate.type === 'user')
        if (!participant || participant.userId !== liveActor.membershipId) {
            return c.json({ error: 'Team Chat resource not found' }, 404)
        }
        return liveActor
    }

    const requireMention = (c: Context<WebAppEnv>, engine: SyncEngine, sessionId: string, requestId: string) => {
        const request = engine.listSessionTeamMentions(c.get('organizationId'), sessionId)
            .find((candidate) => candidate.id === requestId)
        if (!request) return c.json({ error: 'Team Chat resource not found' }, 404)
        const access = requireChat(c, engine, request.teamChatId, 'interact')
        if (access instanceof Response) return access
        return request
    }

    app.get('/team-chats', (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine
        const liveActor = actor(c)
        if (!liveActor) return c.json({ teamChats: [] })
        return c.json({ teamChats: engine.listTeamChats(liveActor.organizationId).filter((chat) =>
            capabilitySatisfies(resolveTeamChatCapability(engine, liveActor, chat.id), 'view')) })
    })

    app.post('/team-chats', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine
        const body = await c.req.json().catch(() => null)
        const parsed = createTeamChatSchema.safeParse(body)
        if (!parsed.success) return c.json({ error: 'Invalid body' }, 400)
        const liveActor = actor(c)
        if (!liveActor || liveActor.role !== 'admin') return c.json({ error: 'Resource access denied', code: 'forbidden' }, 403)
        const teamChat = engine.createTeamChat({
            namespace: liveActor.organizationId,
            ownerMembershipId: liveActor.membershipId,
            name: parsed.data.name,
            projectPath: parsed.data.projectPath ?? null
        })
        return c.json({ teamChat }, 201)
    })

    app.get('/team-chats/:id', (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine
        const access = requireChat(c, engine, c.req.param('id'), 'view')
        if (access instanceof Response) return access
        return c.json({ teamChat: engine.getTeamChat(access.organizationId, c.req.param('id'))! })
    })

    app.delete('/team-chats/:id', (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine
        const access = requireChat(c, engine, c.req.param('id'), 'manage')
        if (access instanceof Response) return access
        try {
            engine.archiveTeamChat(c.get('organizationId'), c.req.param('id'))
            return c.json({ ok: true })
        } catch (error) {
            return teamChatErrorResponse(c, error)
        }
    })

    app.get('/team-chats/:id/messages', (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine
        const parsed = messagesQuerySchema.safeParse(c.req.query())
        if (!parsed.success) return c.json({ error: 'Invalid query' }, 400)
        const limit = parsed.data.limit ?? 50
        const beforeSeq = parsed.data.beforeSeq ?? null
        const access = requireChat(c, engine, c.req.param('id'), 'view')
        if (access instanceof Response) return access
        try {
            return c.json(engine.getTeamMessages(c.get('organizationId'), c.req.param('id'), { limit, beforeSeq }))
        } catch (error) {
            return teamChatErrorResponse(c, error)
        }
    })

    app.get('/team-chats/:id/messages/:messageId/context', (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine
        const access = requireChat(c, engine, c.req.param('id'), 'view')
        if (access instanceof Response) return access
        try {
            return c.json(engine.getTeamMessagesAround(c.get('organizationId'), c.req.param('id'), c.req.param('messageId'), { before: 20, after: 20 }))
        } catch (error) {
            return teamChatErrorResponse(c, error)
        }
    })

    app.post('/team-chats/:id/messages', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine
        const body = await c.req.json().catch(() => null)
        const parsed = postTeamChatMessageSchema.safeParse(body)
        if (!parsed.success) return c.json({ error: 'Invalid body' }, 400)
        const access = requireAuthor(c, engine, c.req.param('id'), parsed.data.authorParticipantId)
        if (access instanceof Response) return access
        try {
            return c.json(engine.postTeamMessage({
                namespace: c.get('organizationId'),
                teamChatId: c.req.param('id'),
                ...parsed.data
            }), 201)
        } catch (error) {
            return teamChatErrorResponse(c, error)
        }
    })

    app.post('/team-chats/:id/reports', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine
        const body = await c.req.json().catch(() => null)
        const parsed = reportToTeamRequestSchema.safeParse(body)
        if (!parsed.success) return c.json({ error: 'Invalid body' }, 400)
        const chatAccess = parsed.data.authorParticipantId
            ? requireAuthor(c, engine, c.req.param('id'), parsed.data.authorParticipantId)
            : requireChat(c, engine, c.req.param('id'), 'interact')
        if (chatAccess instanceof Response) return chatAccess
        if (parsed.data.sourceSessionId) {
            const sessionResult = requireSession(c, engine, parsed.data.sourceSessionId, {
                requireActive: true,
                capabilityResolver: resourceCapabilityResolver,
                requiredCapability: 'interact'
            })
            if (sessionResult instanceof Response) return sessionResult
        }
        try {
            return c.json(engine.reportToTeam({
                namespace: c.get('organizationId'),
                teamChatId: c.req.param('id'),
                ...parsed.data
            }), 201)
        } catch (error) {
            return teamChatErrorResponse(c, error)
        }
    })

    app.get('/team-chats/:id/participants', (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine
        const access = requireChat(c, engine, c.req.param('id'), 'view')
        if (access instanceof Response) return access
        try {
            return c.json({ participants: engine.listTeamParticipants(c.get('organizationId'), c.req.param('id')) })
        } catch (error) {
            return teamChatErrorResponse(c, error)
        }
    })

    app.post('/team-chats/:id/participants', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine
        const body = await c.req.json().catch(() => null)
        const parsed = addParticipantSchema.safeParse(body)
        if (!parsed.success) return c.json({ error: 'Invalid body' }, 400)
        const access = requireChat(c, engine, c.req.param('id'), 'operate')
        if (access instanceof Response) return access
        if (parsed.data.type === 'user' && (!parsed.data.userId || !teamAuthorization.resolveLiveSubject(access.organizationId, parsed.data.userId))) {
            return c.json({ error: 'Team Chat participant not found' }, 404)
        }
        try {
            return c.json({ participant: engine.addTeamParticipant({
                namespace: c.get('organizationId'),
                teamChatId: c.req.param('id'),
                ...parsed.data
            }) }, 201)
        } catch (error) {
            return teamChatErrorResponse(c, error)
        }
    })

    app.patch('/team-chats/:id/participants/:participantId', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine
        const body = await c.req.json().catch(() => null)
        const parsed = updateParticipantSchema.safeParse(body)
        if (!parsed.success) return c.json({ error: 'Invalid body' }, 400)
        const access = requireChat(c, engine, c.req.param('id'), 'operate')
        if (access instanceof Response) return access
        try {
            return c.json({ participant: engine.updateTeamParticipant({
                namespace: c.get('organizationId'),
                teamChatId: c.req.param('id'),
                participantId: c.req.param('participantId'),
                ...parsed.data
            }) })
        } catch (error) {
            return teamChatErrorResponse(c, error)
        }
    })

    app.delete('/team-chats/:id/participants/:participantId', (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine
        const access = requireChat(c, engine, c.req.param('id'), 'manage')
        if (access instanceof Response) return access
        try {
            engine.archiveTeamParticipant(c.get('organizationId'), c.req.param('id'), c.req.param('participantId'))
            return c.json({ ok: true })
        } catch (error) {
            return teamChatErrorResponse(c, error)
        }
    })

    app.get('/sessions/:id/team-mentions', (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine
        const sessionResult = requireSessionFromParam(c, engine, { requireActive: true, capabilityResolver: resourceCapabilityResolver, requiredCapability: 'view' })
        if (sessionResult instanceof Response) return sessionResult
        try {
            const liveActor = actor(c)
            const requests = liveActor
                ? engine.listSessionTeamMentions(c.get('organizationId'), sessionResult.sessionId)
                    .filter((request) => canAccessTeamChat(engine, liveActor, request.teamChatId, 'view'))
                : []
            return c.json({ requests })
        } catch (error) {
            return teamChatErrorResponse(c, error)
        }
    })

    app.get('/sessions/:id/team-memberships', (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine
        const sessionResult = requireSessionFromParam(c, engine, { requireActive: true, capabilityResolver: resourceCapabilityResolver, requiredCapability: 'view' })
        if (sessionResult instanceof Response) return sessionResult
        try {
            const liveActor = actor(c)
            const memberships = liveActor
                ? engine.listSessionTeamMemberships(c.get('organizationId'), sessionResult.sessionId)
                    .filter((membership) => canAccessTeamChat(engine, liveActor, membership.teamChat.id, 'view'))
                : []
            return c.json({ memberships })
        } catch (error) {
            return teamChatErrorResponse(c, error)
        }
    })

    app.post('/sessions/:id/team-mentions/:requestId/seen', (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine
        const sessionResult = requireSessionFromParam(c, engine, { requireActive: true, capabilityResolver: resourceCapabilityResolver, requiredCapability: 'interact' })
        if (sessionResult instanceof Response) return sessionResult
        const mention = requireMention(c, engine, sessionResult.sessionId, c.req.param('requestId'))
        if (mention instanceof Response) return mention
        try {
            const request = engine.updateTeamMentionStatus({
                namespace: c.get('organizationId'),
                sessionId: sessionResult.sessionId,
                requestId: c.req.param('requestId'),
                status: 'seen'
            })
            return c.json({ request })
        } catch (error) {
            return teamChatErrorResponse(c, error)
        }
    })

    app.patch('/sessions/:id/team-mentions/:requestId', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine
        const sessionResult = requireSessionFromParam(c, engine, { requireActive: true, capabilityResolver: resourceCapabilityResolver, requiredCapability: 'interact' })
        if (sessionResult instanceof Response) return sessionResult
        const mention = requireMention(c, engine, sessionResult.sessionId, c.req.param('requestId'))
        if (mention instanceof Response) return mention
        const body = await c.req.json().catch(() => null)
        const parsed = updateMentionStatusSchema.safeParse(body)
        if (!parsed.success) return c.json({ error: 'Invalid body' }, 400)
        try {
            const request = engine.updateTeamMentionStatus({
                namespace: c.get('organizationId'),
                sessionId: sessionResult.sessionId,
                requestId: c.req.param('requestId'),
                status: parsed.data.status
            })
            return c.json({ request })
        } catch (error) {
            return teamChatErrorResponse(c, error)
        }
    })

    return app
}
