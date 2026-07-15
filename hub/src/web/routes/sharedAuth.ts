import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { IdentityService } from '../../auth/identityService'
import type { OidcService } from '../../auth/oidcService'
import { SHARED_CSRF_COOKIE, SHARED_SESSION_COOKIE } from '../middleware/sharedAuth'
import type { SharedWebAppEnv } from '../sharedAuthEnv'

type OidcBoundary = Pick<OidcService, 'startLogin' | 'completeLogin'>
type IdentityBoundary = Pick<IdentityService,
    'completeBrowserLogin' | 'validateSession' | 'revokeSession'
    | 'listMembers' | 'getMember' | 'updateMemberRole' | 'disableMember' | 'enableMember'>

export type SharedAuthRouteOptions = {
    oidc: OidcBoundary
    identity: IdentityBoundary
    organizationId: string
    bootstrapAdminEmail: string
    callbackUrl: string
    appUrl: string
}

export function createSharedAuthRoutes(options: SharedAuthRouteOptions): Hono<SharedWebAppEnv> {
    const app = new Hono<SharedWebAppEnv>()

    app.use('*', async (c, next) => {
        await next()
        c.header('Cache-Control', 'no-store')
        c.header('Pragma', 'no-cache')
    })

    app.get('/auth/login', async (c) => {
        try {
            const started = await options.oidc.startLogin(options.callbackUrl)
            return c.redirect(started.authorizationUrl, 302)
        } catch {
            return c.json({ error: 'oidc_login_unavailable', code: 'oidc_login_unavailable' }, 503)
        }
    })

    app.post('/auth/login', async (c) => {
        const body = await c.req.json().catch(() => null) as { invitationToken?: unknown } | null
        if (!body || typeof body.invitationToken !== 'string' || body.invitationToken.length < 16) {
            return c.json({ error: 'invalid_invitation', code: 'invalid_invitation' }, 400)
        }
        try {
            const started = await options.oidc.startLogin(options.callbackUrl, Date.now(), body.invitationToken)
            return c.json({ authorizationUrl: started.authorizationUrl })
        } catch {
            return c.json({ error: 'oidc_login_unavailable', code: 'oidc_login_unavailable' }, 503)
        }
    })

    app.get('/auth/callback', async (c) => {
        const state = c.req.query('state')
        const code = c.req.query('code')
        if (!state || !code) return c.json({ error: 'invalid_callback', code: 'invalid_callback' }, 400)
        let completed
        try {
            completed = await options.oidc.completeLogin({ state, code })
        } catch {
            return c.json({ error: 'oidc_callback_rejected', code: 'oidc_callback_rejected' }, 401)
        }
        const session = options.identity.completeBrowserLogin({
            organizationId: options.organizationId,
            bootstrapAdminEmail: options.bootstrapAdminEmail,
            identity: completed.identity,
            invitationTokenHash: completed.invitationTokenHash
        })
        if (!session) return c.json({ error: 'invitation_required', code: 'invitation_required' }, 403)
        const maxAge = Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000))
        setCookie(c, SHARED_SESSION_COOKIE, session.sessionToken, secureCookie({ httpOnly: true, sameSite: 'Lax', maxAge }))
        setCookie(c, SHARED_CSRF_COOKIE, session.csrfToken, secureCookie({ httpOnly: false, sameSite: 'Strict', maxAge }))
        return c.redirect(options.appUrl, 302)
    })

    app.get('/auth/session', (c) => {
        const sessionToken = getCookie(c, SHARED_SESSION_COOKIE)
        if (!sessionToken) return c.json({ error: 'authentication_required', code: 'authentication_required' }, 401)
        const session = options.identity.validateSession(sessionToken, { mutation: false })
        if (!session) return c.json({ error: 'authentication_required', code: 'authentication_required' }, 401)
        return c.json({
            membershipId: session.membershipId,
            organizationId: session.organizationId,
            role: session.role
        })
    })

    app.post('/auth/logout', (c) => {
        const sessionToken = getCookie(c, SHARED_SESSION_COOKIE)
        const csrfToken = c.req.header('x-csrf-token')
        deleteCookie(c, SHARED_SESSION_COOKIE, secureCookie({ httpOnly: true, sameSite: 'Lax' }))
        deleteCookie(c, SHARED_CSRF_COOKIE, secureCookie({ httpOnly: false, sameSite: 'Strict' }))
        if (!sessionToken || !csrfToken
            || !options.identity.validateSession(sessionToken, { mutation: true, csrfToken })) {
            return c.json({ error: 'csrf_or_session_invalid', code: 'csrf_or_session_invalid' }, 403)
        }
        options.identity.revokeSession(sessionToken)
        return c.body(null, 204)
    })

    return app
}

function secureCookie(input: {
    httpOnly: boolean
    sameSite: 'Lax' | 'Strict'
    maxAge?: number
}) {
    return { path: '/', secure: true, httpOnly: input.httpOnly, sameSite: input.sameSite, maxAge: input.maxAge }
}
