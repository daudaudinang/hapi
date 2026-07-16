import { beforeAll, describe, expect, it } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Hono } from 'hono'
import { createConfiguration } from '../../configuration'
import type { SyncEngine } from '../../sync/syncEngine'
import { createCliRoutes } from './cli'

function createApp(engine: Record<string, unknown>) {
    const app = new Hono()
    app.route('/cli', createCliRoutes(
        () => engine as unknown as SyncEngine,
        { authenticateAny: () => ({ id: 'r1', organizationId: 'o1', machineId: 'm1', status: 'active' }) } as never,
        () => true
    ))
    return app
}

describe('CLI Team Chat report routes', () => {
    beforeAll(async () => {
        process.env.HAPI_HOME = mkdtempSync(join(tmpdir(), 'hapi-cli-team-reports-'))
        await createConfiguration()
    })

    it('posts ReportToTeam through the authenticated source session', async () => {
        const calls: unknown[] = []
        const engine = {
            resolveSessionAccess: (sessionId: string, namespace: string) => ({
                ok: true,
                sessionId,
                session: { id: sessionId, namespace }
            }),
            reportToTeam: (input: unknown) => {
                calls.push(input)
                return {
                    message: {
                        id: 'msg-report',
                        teamChatId: 'team-1',
                        seq: 1,
                        authorParticipantId: 'p1',
                        text: 'Implemented the route',
                        reportType: 'done',
                        replyToMessageId: null,
                        replyPreview: null,
                        mentions: [],
                        files: [],
                        createdAt: 1
                    }
                }
            }
        }
        const app = createApp(engine)

        const response = await app.request('/cli/sessions/session-1/team-reports', {
            method: 'POST',
            headers: {
                authorization: `Runner cred.${'x'.repeat(32)}`,
                'x-hapi-machine-id': 'm1',
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                teamChatId: 'team-1',
                type: 'done',
                summary: 'Implemented the route'
            })
        })

        expect(response.status).toBe(201)
        expect(calls).toEqual([{
            namespace: 'o1',
            sourceSessionId: 'session-1',
            teamChatId: 'team-1',
            type: 'done',
            summary: 'Implemented the route',
            mentions: [],
            files: []
        }])
    })
})

    it('marks a Team mention no-action through the authenticated source session', async () => {
        const calls: unknown[] = []
        const engine = {
            resolveSessionAccess: (sessionId: string, namespace: string) => ({
                ok: true,
                sessionId,
                session: { id: sessionId, namespace }
            }),
            updateTeamMentionStatus: (input: unknown) => {
                calls.push(input)
                return {
                    id: 'req-1',
                    teamChatId: 'team-1',
                    sourceMessageId: 'msg-1',
                    targetSessionId: 'session-1',
                    status: 'no_action',
                    contextSnapshot: {
                        originalText: '@Backend check this',
                        sharedContext: { goal: '', decisions: [], openQuestions: [] },
                        attachedFiles: []
                    },
                    hopDepth: 0,
                    createdAt: 1,
                    resolvedAt: 2
                }
            }
        }
        const app = createApp(engine)

        const response = await app.request('/cli/sessions/session-1/team-mentions/req-1/no-action', {
            method: 'POST',
            headers: {
                authorization: `Runner cred.${'x'.repeat(32)}`,
                'x-hapi-machine-id': 'm1'
            }
        })

        expect(response.status).toBe(200)
        expect(calls).toEqual([{
            namespace: 'o1',
            sessionId: 'session-1',
            requestId: 'req-1',
            status: 'no_action'
        }])
        await expect(response.json()).resolves.toMatchObject({
            request: {
                id: 'req-1',
                status: 'no_action'
            }
        })
    })
