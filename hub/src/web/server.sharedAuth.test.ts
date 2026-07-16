import { describe, expect, it } from 'bun:test'
import { createWebApp } from './server'

describe('createWebApp Shared Hub auth assembly', () => {
    function create(authenticated = false) {
        return createWebApp({
            getSyncEngine: () => null,
            getSseManager: () => null,
            getVisibilityTracker: () => null,
            store: {} as never,
            vapidPublicKey: 'unused',
            corsOrigins: ['https://hub.example.com'],
            embeddedAssetMap: null,
            relayMode: true,
            officialWebUrl: 'https://hub.example.com',
            sharedAuth: {
                routes: {
                    organizationId: 'o1', bootstrapAdminEmail: 'admin@example.com',
                    callbackUrl: 'https://hub.example.com/api/auth/callback', appUrl: 'https://hub.example.com/',
                    oidc: {
                        startLogin: async () => ({ authorizationUrl: 'https://id.example.com/authorize', state: 'state' }),
                        completeLogin: async () => ({
                            identity: { issuer: 'https://id.example.com', subject: 's', email: 'u@example.com', emailVerified: true },
                            invitationTokenHash: null
                        })
                    } as never,
                    identity: {
                        completeBrowserLogin: () => null,
                        validateSession: () => null,
                        revokeSession: () => false
                    } as never
                },
                identity: { validateSession: () => authenticated ? {
                    membershipId: 'admin', organizationId: 'o1', role: 'admin'
                } : null } as never
            },
            teamAuthorization: { listTeams: () => [] } as never,
            runnerAuthenticator: { authenticateAny: () => null } as never,
            authorizeRunnerSession: () => false,
            runnerEnrollment: {
                exchange: () => ({ organizationId: 'o1', runnerId: 'r1', credential: { credentialId: 'c1', secret: 'x'.repeat(32) }, generation: 1, hubUrl: 'https://hub.example.com' }),
                list: () => ({ enrollments: [] })
            } as never,
            runnerLifecycle: {} as never
        })
    }

    it('mounts Shared Hub login publicly and protects all other API routes', async () => {
        const app = create()
        expect((await app.request('/api/auth/login')).status).toBe(302)
        const protectedResponse = await app.request('/api/sessions')
        expect(protectedResponse.status).toBe(401)
        expect(await protectedResponse.json()).toEqual({ error: 'authentication_required', code: 'authentication_required' })
    })

    it('uses credentialed CORS without accepting authorization headers', async () => {
        const response = await create().request('/api/sessions', {
            method: 'OPTIONS',
            headers: {
                origin: 'https://hub.example.com',
                'access-control-request-method': 'GET',
                'access-control-request-headers': 'x-csrf-token'
            }
        })
        expect(response.headers.get('access-control-allow-credentials')).toBe('true')
        expect(response.headers.get('access-control-allow-headers')).toContain('x-csrf-token')
        expect(response.headers.get('access-control-allow-headers')).not.toContain('authorization')
        expect(response.headers.get('content-security-policy')).toContain("default-src 'self'")
    })

    it('rejects untrusted origins before authentication', async () => {
        const response = await create().request('/api/sessions', {
            headers: { origin: 'https://evil.example.com' }
        })
        expect(response.status).toBe(403)
        expect(await response.json()).toEqual({ error: 'origin_not_allowed', code: 'origin_not_allowed' })
    })

    it('rate limits sensitive public endpoints', async () => {
        const app = create()
        let response: Response | null = null
        for (let index = 0; index <= 30; index++) {
            response = await app.request('/api/auth/login', { headers: { 'x-real-ip': '192.0.2.10' } })
        }
        expect(response?.status).toBe(429)
        expect(response?.headers.get('retry-after')).not.toBeNull()
    })

    it('mounts Team routes behind opaque-session authentication', async () => {
        const response = await create(true).request('/api/teams', {
            headers: { cookie: '__Host-hapi_session=opaque' }
        })
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ teams: [] })
    })

    it('mounts exchange before auth and management after auth', async () => {
        const app = create()
        const exchange = await app.request('/api/runner-enrollments/exchange', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ code: '0123456789abcdef', profile: 'p1', machine: { id: 'm1', name: 'M', platform: 'linux', arch: 'x64' } })
        })
        expect(exchange.status).toBe(201)
        expect((await app.request('/api/runner-enrollments')).status).toBe(401)
    })


})
