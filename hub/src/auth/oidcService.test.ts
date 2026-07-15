import { Database } from 'bun:sqlite'
import { describe, expect, it } from 'bun:test'
import { SharedHubStore } from '../store/sharedHubStore'
import { OidcProtocolError, OidcService, type OidcDiscovery } from './oidcService'

const ISSUER = 'https://id.example.com/realms/pilot'
const REDIRECT = 'https://hub.example.com/api/auth/callback'
const PEPPER = 'p'.repeat(32)
const discovery: OidcDiscovery = {
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/protocol/openid-connect/auth`,
    token_endpoint: `${ISSUER}/protocol/openid-connect/token`,
    jwks_uri: `${ISSUER}/protocol/openid-connect/certs`
}

function response(value: unknown, status = 200): Response {
    return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
}

function setup(fetcher: typeof fetch, verifyIdToken?: NonNullable<ConstructorParameters<typeof OidcService>[1]['verifyIdToken']>) {
    const db = new Database(':memory:')
    const store = new SharedHubStore(db, { organizationId: 'o1', organizationName: 'Pilot' })
    return { db, service: new OidcService(store, {
        issuer: ISSUER, clientId: 'hapi', allowedRedirectUris: [REDIRECT], pepper: PEPPER,
        transactionTtlMs: 100, fetch: fetcher, verifyIdToken
    }) }
}

describe('OidcService', () => {
    it('creates S256 authorization request and completes a verified login', async () => {
        let tokenBody = ''
        const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
            const url = String(input)
            if (url.endsWith('/.well-known/openid-configuration')) return response(discovery)
            tokenBody = String(init?.body)
            return response({ id_token: 'signed-id-token' })
        }) as typeof fetch
        let expectedNonce = ''
        const { db, service } = setup(fetcher, async () => ({
            iss: ISSUER, sub: 'subject-1', aud: 'hapi', nonce: expectedNonce,
            email: 'user@example.com', email_verified: true
        }))
        const started = await service.startLogin(REDIRECT, 1)
        const authorization = new URL(started.authorizationUrl)
        expectedNonce = authorization.searchParams.get('nonce')!
        expect(authorization.searchParams.get('code_challenge_method')).toBe('S256')
        expect(authorization.searchParams.get('code_challenge')).not.toBeEmpty()
        expect(authorization.searchParams.get('state')).toBe(started.state)
        expect(JSON.stringify(db.prepare('SELECT * FROM oidc_transactions').get())).not.toContain(started.state)
        const identity = await service.completeLogin({ state: started.state, code: 'auth-code' }, 2)
        expect(identity).toEqual({
            identity: { issuer: ISSUER, subject: 'subject-1', email: 'user@example.com', emailVerified: true },
            invitationTokenHash: null
        })
        expect(tokenBody).toContain('code_verifier=')
        expect(tokenBody).toContain(`redirect_uri=${encodeURIComponent(REDIRECT)}`)
    })

    it('binds only an invitation hash to the one-time OIDC state', async () => {
        const fetcher = (async (input: string | URL | Request) => String(input).endsWith('/.well-known/openid-configuration')
            ? response(discovery) : response({ id_token: 'token' })) as typeof fetch
        let nonce = ''
        const { db, service } = setup(fetcher, async () => ({ sub: 's', nonce, email: 'u@example.com', email_verified: true }))
        const started = await service.startLogin(REDIRECT, 1, 'invitation-secret-value')
        nonce = new URL(started.authorizationUrl).searchParams.get('nonce')!
        expect(started.authorizationUrl).not.toContain('invitation-secret-value')
        expect(JSON.stringify(db.prepare('SELECT * FROM oidc_transactions').get())).not.toContain('invitation-secret-value')
        expect((await service.completeLogin({ state: started.state, code: 'code' }, 2)).invitationTokenHash).not.toBeNull()
    })

    it('rejects replay/expiry before token exchange', async () => {
        let tokenCalls = 0
        const fetcher = (async (input: string | URL | Request) => {
            if (String(input).endsWith('/.well-known/openid-configuration')) return response(discovery)
            tokenCalls++
            return response({ id_token: 'token' })
        }) as typeof fetch
        let nonce = ''
        const { service } = setup(fetcher, async () => ({ sub: 's', nonce, email: 'u@example.com', email_verified: true }))
        const started = await service.startLogin(REDIRECT, 1)
        nonce = new URL(started.authorizationUrl).searchParams.get('nonce')!
        await service.completeLogin({ state: started.state, code: 'code' }, 2)
        await expect(service.completeLogin({ state: started.state, code: 'code' }, 3)).rejects.toMatchObject({ code: 'invalid_or_expired_state' })
        const expired = await service.startLogin(REDIRECT, 10)
        await expect(service.completeLogin({ state: expired.state, code: 'code' }, 110)).rejects.toMatchObject({ code: 'invalid_or_expired_state' })
        expect(tokenCalls).toBe(1)
    })

    it('fails closed on discovery mismatch, nonce mismatch and unverified email', async () => {
        const mismatchFetch = (async () => response({ ...discovery, issuer: 'https://evil.example.com' })) as unknown as typeof fetch
        await expect(setup(mismatchFetch).service.startLogin(REDIRECT)).rejects.toBeInstanceOf(OidcProtocolError)

        const fetcher = (async (input: string | URL | Request) => String(input).endsWith('/.well-known/openid-configuration')
            ? response(discovery) : response({ id_token: 'token' })) as typeof fetch
        const nonceMismatch = setup(fetcher, async () => ({ sub: 's', nonce: 'wrong', email: 'u@example.com', email_verified: true })).service
        const started = await nonceMismatch.startLogin(REDIRECT, 1)
        await expect(nonceMismatch.completeLogin({ state: started.state, code: 'code' }, 2)).rejects.toMatchObject({ code: 'nonce_mismatch' })

        let nonce = ''
        const unverified = setup(fetcher, async () => ({ sub: 's', nonce, email: 'u@example.com', email_verified: false })).service
        const unverifiedStart = await unverified.startLogin(REDIRECT, 1)
        nonce = new URL(unverifiedStart.authorizationUrl).searchParams.get('nonce')!
        await expect(unverified.completeLogin({ state: unverifiedStart.state, code: 'code' }, 2)).rejects.toMatchObject({ code: 'verified_email_required' })
    })
})
