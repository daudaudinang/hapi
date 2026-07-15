import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'
import { SharedHubStore } from '../store/sharedHubStore'
import { keyedHash, randomOpaqueToken, safeHashEquals, sha256Base64Url } from './identityCrypto'
import type { VerifiedIdentity } from './identityService'

export type OidcDiscovery = {
    issuer: string
    authorization_endpoint: string
    token_endpoint: string
    jwks_uri: string
}

export type OidcServiceOptions = {
    issuer: string
    clientId: string
    allowedRedirectUris: readonly string[]
    pepper: string
    transactionTtlMs?: number
    fetch?: typeof globalThis.fetch
    verifyIdToken?: (idToken: string, discovery: OidcDiscovery, clientId: string) => Promise<JWTPayload>
    requestTimeoutMs?: number
}

export type CompletedOidcLogin = { identity: VerifiedIdentity; invitationTokenHash: string | null }

export class OidcProtocolError extends Error {
    constructor(readonly code: string) {
        super(code)
        this.name = 'OidcProtocolError'
    }
}

export class OidcService {
    private readonly fetcher: typeof globalThis.fetch
    private readonly transactionTtlMs: number

    constructor(private readonly store: SharedHubStore, private readonly options: OidcServiceOptions) {
        if (options.pepper.length < 32) throw new Error('OIDC pepper must contain at least 32 characters.')
        this.fetcher = options.fetch ?? globalThis.fetch
        this.transactionTtlMs = options.transactionTtlMs ?? 10 * 60 * 1000
    }

    async startLogin(redirectUri: string, now = Date.now(), invitationToken?: string): Promise<{ authorizationUrl: string; state: string }> {
        if (!this.options.allowedRedirectUris.includes(redirectUri)) throw new OidcProtocolError('invalid_redirect_uri')
        const discovery = await this.discover()
        const state = randomOpaqueToken()
        const nonce = randomOpaqueToken()
        const codeVerifier = randomOpaqueToken(48)
        this.store.createOidcTransaction({
            stateHash: keyedHash(state, this.options.pepper),
            nonceHash: keyedHash(nonce, this.options.pepper),
            codeVerifier,
            redirectUri,
            expiresAt: now + this.transactionTtlMs,
            createdAt: now,
            invitationTokenHash: invitationToken ? keyedHash(invitationToken, this.options.pepper) : undefined
        })
        const url = new URL(discovery.authorization_endpoint)
        url.searchParams.set('response_type', 'code')
        url.searchParams.set('client_id', this.options.clientId)
        url.searchParams.set('redirect_uri', redirectUri)
        url.searchParams.set('scope', 'openid email profile')
        url.searchParams.set('state', state)
        url.searchParams.set('nonce', nonce)
        url.searchParams.set('code_challenge', sha256Base64Url(codeVerifier))
        url.searchParams.set('code_challenge_method', 'S256')
        return { authorizationUrl: url.toString(), state }
    }

    async completeLogin(input: { state: string; code: string }, now = Date.now()): Promise<CompletedOidcLogin> {
        const transaction = this.store.consumeOidcTransaction(keyedHash(input.state, this.options.pepper), now)
        if (!transaction) throw new OidcProtocolError('invalid_or_expired_state')
        const discovery = await this.discover()
        const body = new URLSearchParams({
            grant_type: 'authorization_code', code: input.code,
            client_id: this.options.clientId, redirect_uri: transaction.redirectUri,
            code_verifier: transaction.codeVerifier
        })
        const response = await this.fetcher(discovery.token_endpoint, {
            method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body,
            signal: AbortSignal.timeout(this.options.requestTimeoutMs ?? 10_000)
        })
        if (!response.ok) throw new OidcProtocolError('token_exchange_failed')
        const token = await response.json() as { id_token?: unknown }
        if (typeof token.id_token !== 'string') throw new OidcProtocolError('missing_id_token')
        const payload = await (this.options.verifyIdToken ?? verifyIdToken)(token.id_token, discovery, this.options.clientId)
        if (typeof payload.nonce !== 'string'
            || !safeHashEquals(transaction.nonceHash, keyedHash(payload.nonce, this.options.pepper))) {
            throw new OidcProtocolError('nonce_mismatch')
        }
        if (typeof payload.sub !== 'string' || typeof payload.email !== 'string' || payload.email_verified !== true) {
            throw new OidcProtocolError('verified_email_required')
        }
        return {
            identity: { issuer: discovery.issuer, subject: payload.sub, email: payload.email, emailVerified: true },
            invitationTokenHash: transaction.invitationTokenHash
        }
    }

    async discover(): Promise<OidcDiscovery> {
        const issuer = this.options.issuer.replace(/\/$/, '')
        assertHttps(issuer)
        const response = await this.fetcher(`${issuer}/.well-known/openid-configuration`, {
            signal: AbortSignal.timeout(this.options.requestTimeoutMs ?? 10_000)
        })
        if (!response.ok) throw new OidcProtocolError('discovery_failed')
        const value = await response.json() as Partial<OidcDiscovery>
        if (value.issuer !== issuer
            || typeof value.authorization_endpoint !== 'string'
            || typeof value.token_endpoint !== 'string'
            || typeof value.jwks_uri !== 'string') {
            throw new OidcProtocolError('invalid_discovery')
        }
        assertHttps(value.authorization_endpoint)
        assertHttps(value.token_endpoint)
        assertHttps(value.jwks_uri)
        return value as OidcDiscovery
    }
}

async function verifyIdToken(idToken: string, discovery: OidcDiscovery, clientId: string): Promise<JWTPayload> {
    const jwks = createRemoteJWKSet(new URL(discovery.jwks_uri), { timeoutDuration: 10_000 })
    const verified = await jwtVerify(idToken, jwks, {
        issuer: discovery.issuer,
        audience: clientId,
        algorithms: ['RS256', 'PS256', 'ES256']
    })
    return verified.payload
}

function assertHttps(value: string): void {
    let url: URL
    try {
        url = new URL(value)
    } catch {
        throw new OidcProtocolError('https_endpoint_required')
    }
    if (url.protocol !== 'https:') throw new OidcProtocolError('https_endpoint_required')
}
