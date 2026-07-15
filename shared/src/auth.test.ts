import { describe, expect, it } from 'bun:test'
import { ActorSchema, AuthorizationActionSchema, ResourceGrantSchema } from './auth'

describe('Shared Hub authorization contracts', () => {
    it('requires organization scope and rejects unknown fields', () => {
        expect(ActorSchema.safeParse({ type: 'user', id: 'u1' }).success).toBeFalse()
        expect(ActorSchema.safeParse({ type: 'user', id: 'u1', organizationId: 'o1', token: 'secret' }).success).toBeFalse()
    })

    it('uses a closed action catalog', () => {
        expect(AuthorizationActionSchema.parse('runner.operate')).toBe('runner.operate')
        expect(AuthorizationActionSchema.safeParse('runner.root').success).toBeFalse()
    })

    it('allows only read-only session grants', () => {
        const base = { id: 'g1', organizationId: 'o1', principalType: 'user', principalId: 'u1', resourceType: 'session', resourceId: 's1', expiresAt: null }
        expect(ResourceGrantSchema.safeParse({ ...base, capability: 'view' }).success).toBeTrue()
    })
})
