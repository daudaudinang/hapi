import type { MiddlewareHandler } from 'hono'
import { getCookie } from 'hono/cookie'
import type { IdentityService } from '../../auth/identityService'
import type { SharedWebAppEnv } from '../sharedAuthEnv'

export const SHARED_SESSION_COOKIE = '__Host-hapi_session'
export const SHARED_CSRF_COOKIE = '__Host-hapi_csrf'

export function createSharedAuthMiddleware(identity: Pick<IdentityService, 'validateSession'>): MiddlewareHandler<SharedWebAppEnv> {
    return async (c, next) => {
        const sessionToken = getCookie(c, SHARED_SESSION_COOKIE)
        if (!sessionToken) return c.json({ error: 'authentication_required', code: 'authentication_required' }, 401)
        const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)
        const csrfToken = mutation ? c.req.header('x-csrf-token') : undefined
        const session = identity.validateSession(sessionToken, { mutation, csrfToken })
        if (!session) {
            return c.json({
                error: mutation ? 'csrf_or_session_invalid' : 'authentication_required',
                code: mutation ? 'csrf_or_session_invalid' : 'authentication_required'
            }, mutation ? 403 : 401)
        }
        c.set('membershipId', session.membershipId)
        c.set('organizationId', session.organizationId)
        c.set('organizationRole', session.role)
        // Transitional data-plane partition only. Phase 5 removes namespace guards.
        c.set('namespace', session.organizationId)
        return await next()
    }
}
