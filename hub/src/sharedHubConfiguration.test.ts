import { describe, expect, it } from 'bun:test'
import { loadSharedHubConfiguration } from './sharedHubConfiguration'

const valid = {
    HAPI_OIDC_ISSUER: 'https://id.example.com/realms/pilot/',
    HAPI_OIDC_CLIENT_ID: 'hapi',
    HAPI_BOOTSTRAP_ADMIN_EMAIL: 'Admin@Example.com',
    HAPI_AUTH_PEPPER: 'p'.repeat(32),
    HAPI_ORGANIZATION_ID: 'pilot',
    HAPI_ORGANIZATION_NAME: 'Pilot'
}

describe('loadSharedHubConfiguration', () => {
    it('loads normalized mandatory settings and exact callback URL', () => {
        expect(loadSharedHubConfiguration(valid, 'https://hub.example.com')).toEqual({
            organizationId: 'pilot', organizationName: 'Pilot',
            oidcIssuer: 'https://id.example.com/realms/pilot', oidcClientId: 'hapi',
            bootstrapAdminEmail: 'admin@example.com', authPepper: 'p'.repeat(32),
            callbackUrl: 'https://hub.example.com/api/auth/callback', appUrl: 'https://hub.example.com/'
        })
    })

    it('fails closed for missing, weak, or non-HTTPS settings without echoing secrets', () => {
        expect(() => loadSharedHubConfiguration({ ...valid, HAPI_OIDC_CLIENT_ID: '' }, 'https://hub.example.com')).toThrow(/HAPI_OIDC_CLIENT_ID/)
        expect(() => loadSharedHubConfiguration({ ...valid, HAPI_AUTH_PEPPER: 'secret-value' }, 'https://hub.example.com')).toThrow(/at least 32/)
        expect(() => loadSharedHubConfiguration(valid, 'http://localhost:3006')).toThrow(/HTTPS/)
        try {
            loadSharedHubConfiguration({ ...valid, HAPI_AUTH_PEPPER: 'secret-value' }, 'https://hub.example.com')
        } catch (error) {
            expect(String(error)).not.toContain('secret-value')
        }
    })
})
