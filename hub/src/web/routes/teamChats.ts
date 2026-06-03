import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'

import type { SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { requireSyncEngine } from './guards'

const createTeamChatSchema = z.object({
    name: z.string().min(1),
    projectPath: z.string().optional().nullable()
})

const postTeamChatMessageSchema = z.object({
    authorParticipantId: z.string().min(1),
    text: z.string().trim().min(1).max(20_000),
    replyToMessageId: z.string().optional().nullable()
})

const addParticipantSchema = z.object({
    type: z.enum(['user', 'session']),
    userId: z.string().optional().nullable(),
    sessionId: z.string().optional().nullable(),
    displayName: z.string().min(1),
    role: z.enum(['backend', 'frontend', 'tests', 'reviewer', 'docs', 'general']).default('general'),
    color: z.string().regex(/^#[0-9a-f]{6}$/i)
})

const messagesQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    beforeSeq: z.coerce.number().int().min(1).optional()
})

function teamChatErrorResponse(c: Context<WebAppEnv>, error: unknown): Response {
    if (error instanceof Error && error.message.startsWith('TEAM_')) {
        return c.json({ error: 'Team Chat resource not found' }, 404)
    }
    throw error
}

export function createTeamChatsRoutes(getSyncEngine: () => SyncEngine | null): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.get('/team-chats', (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine
        return c.json({ teamChats: engine.listTeamChats(c.get('namespace')) })
    })

    app.post('/team-chats', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine
        const body = await c.req.json().catch(() => null)
        const parsed = createTeamChatSchema.safeParse(body)
        if (!parsed.success) return c.json({ error: 'Invalid body' }, 400)
        const teamChat = engine.createTeamChat({
            namespace: c.get('namespace'),
            name: parsed.data.name,
            projectPath: parsed.data.projectPath ?? null
        })
        return c.json({ teamChat }, 201)
    })

    app.get('/team-chats/:id', (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine
        const teamChat = engine.getTeamChat(c.get('namespace'), c.req.param('id'))
        return teamChat ? c.json({ teamChat }) : c.json({ error: 'Team Chat not found' }, 404)
    })

    app.get('/team-chats/:id/messages', (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine
        const parsed = messagesQuerySchema.safeParse(c.req.query())
        const limit = parsed.success ? parsed.data.limit ?? 50 : 50
        const beforeSeq = parsed.success ? parsed.data.beforeSeq ?? null : null
        try {
            return c.json(engine.getTeamMessages(c.get('namespace'), c.req.param('id'), { limit, beforeSeq }))
        } catch (error) {
            return teamChatErrorResponse(c, error)
        }
    })

    app.get('/team-chats/:id/messages/:messageId/context', (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine
        try {
            return c.json(engine.getTeamMessagesAround(c.get('namespace'), c.req.param('id'), c.req.param('messageId'), { before: 20, after: 20 }))
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
        try {
            return c.json(engine.postTeamMessage({
                namespace: c.get('namespace'),
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
        try {
            return c.json({ participants: engine.listTeamParticipants(c.get('namespace'), c.req.param('id')) })
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
        try {
            return c.json({ participant: engine.addTeamParticipant({
                namespace: c.get('namespace'),
                teamChatId: c.req.param('id'),
                ...parsed.data
            }) }, 201)
        } catch (error) {
            return teamChatErrorResponse(c, error)
        }
    })

    app.delete('/team-chats/:id/participants/:participantId', (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine
        try {
            engine.archiveTeamParticipant(c.get('namespace'), c.req.param('id'), c.req.param('participantId'))
            return c.json({ ok: true })
        } catch (error) {
            return teamChatErrorResponse(c, error)
        }
    })

    return app
}
