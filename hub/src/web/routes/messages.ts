import { Hono } from 'hono'
import { AttachmentMetadataSchema } from '@hapi/protocol/schemas'
import { z } from 'zod'
import type { SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { requireSessionFromParam, requireSyncEngine } from './guards'

const querySchema = z.object({
    limit: z.coerce.number().int().min(1).max(200).optional(),
    beforeSeq: z.coerce.number().int().min(1).optional()
})

const sendMessageBodySchema = z.object({
    text: z.string(),
    localId: z.string().min(1).optional(),
    attachments: z.array(AttachmentMetadataSchema).optional()
})

export function createMessagesRoutes(getSyncEngine: () => SyncEngine | null): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.get('/sessions/:id/messages', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }

        const sessionResult = requireSessionFromParam(c, engine)
        if (sessionResult instanceof Response) {
            return sessionResult
        }
        const sessionId = sessionResult.sessionId

        const parsed = querySchema.safeParse(c.req.query())
        const limit = parsed.success ? (parsed.data.limit ?? 50) : 50
        const beforeSeq = parsed.success ? (parsed.data.beforeSeq ?? null) : null
        return c.json(engine.getMessagesPage(sessionId, { limit, beforeSeq }))
    })

    app.post('/sessions/:id/messages', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }

        const body = await c.req.json().catch(() => null)
        const parsed = sendMessageBodySchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        // Require text or attachments
        if (!parsed.data.text && (!parsed.data.attachments || parsed.data.attachments.length === 0)) {
            return c.json({ error: 'Message requires text or attachments' }, 400)
        }

        const sessionResult = requireSessionFromParam(c, engine)
        if (sessionResult instanceof Response) {
            return sessionResult
        }
        const sessionId = sessionResult.sessionId
        const session = sessionResult.session
        const namespace = c.get('namespace')
        const autoResumeEnabled = c.get('features')?.autoResume ?? false

        if (!session.active && autoResumeEnabled) {
            const enqueueResult = await engine.enqueueMessage(sessionId, {
                text: parsed.data.text,
                localId: parsed.data.localId,
                attachments: parsed.data.attachments,
                sentFrom: 'webapp'
            })

            if ('archived' in enqueueResult && enqueueResult.archived) {
                return c.json({
                    error: 'Session archived due to queue overflow',
                    archived: true,
                    reason: enqueueResult.reason
                }, 503)
            }

            if ('rejected' in enqueueResult && enqueueResult.rejected) {
                const status = enqueueResult.reason.startsWith('Duplicate localId:') ? 409 : 400
                return c.json({
                    error: 'Message enqueue rejected',
                    reason: enqueueResult.reason
                }, status)
            }

            engine.triggerResume(sessionId, namespace).catch((error) => {
                console.error(`Failed to trigger resume for session ${sessionId}:`, error)
            })

            return c.json({
                queued: true,
                resuming: true,
                sessionId,
                message: 'Message queued, session is resuming...'
            }, 202)
        }

        await engine.sendMessage(sessionId, {
            text: parsed.data.text,
            localId: parsed.data.localId,
            attachments: parsed.data.attachments,
            sentFrom: 'webapp'
        })
        return c.json({ ok: true })
    })

    return app
}
