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
    app.route('/cli', createCliRoutes(() => engine as unknown as SyncEngine))
    return app
}

describe('CLI Team Chat report routes', () => {
    beforeAll(async () => {
        process.env.HAPI_HOME = mkdtempSync(join(tmpdir(), 'hapi-cli-team-reports-'))
        const configuration = await createConfiguration()
        configuration._setCliApiToken('cli-test-token', 'env', false)
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
                authorization: 'Bearer cli-test-token:ns-a',
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
            namespace: 'ns-a',
            sourceSessionId: 'session-1',
            teamChatId: 'team-1',
            type: 'done',
            summary: 'Implemented the route',
            mentions: [],
            files: []
        }])
    })
})
