import type { Context } from 'hono'
import type { Machine, Session, SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import type { Capability } from '@hapi/protocol/auth'
import { capabilitySatisfies, type ResourceCapabilityResolver } from '../../auth/resourceCapability'

export type RestCapabilityResolver = ResourceCapabilityResolver

export function requireCapability(
    c: Context<WebAppEnv>,
    resolver: RestCapabilityResolver,
    resourceType: 'session' | 'machine',
    resourceId: string,
    required: Capability
): Capability | Response {
    const capability = resolver({
        organizationId: c.get('organizationId'),
        membershipId: c.get('membershipId'),
        role: c.get('organizationRole'),
        resourceType,
        resourceId
    })
    if (!capabilitySatisfies(capability, required)) {
        return c.json({ error: 'Resource access denied', code: 'forbidden' }, 403)
    }
    return capability!
}

export function requireSyncEngine(
    c: Context<WebAppEnv>,
    getSyncEngine: () => SyncEngine | null
): SyncEngine | Response {
    const engine = getSyncEngine()
    if (!engine) {
        return c.json({ error: 'Not connected' }, 503)
    }
    return engine
}

export function requireSession(
    c: Context<WebAppEnv>,
    engine: SyncEngine,
    sessionId: string,
    options?: {
        requireActive?: boolean
        capabilityResolver?: RestCapabilityResolver
        requiredCapability?: Capability
    }
): { sessionId: string; session: Session } | Response {
    const organizationId = c.get('organizationId')
    const access = engine.resolveSessionAccess(sessionId, organizationId)
    if (!access.ok) {
        return c.json({ error: 'Session not found' }, 404)
    }
    if (options?.capabilityResolver && options.requiredCapability) {
        const capability = requireCapability(c, options.capabilityResolver, 'session', access.sessionId, options.requiredCapability)
        if (capability instanceof Response) return capability
    }
    if (options?.requireActive && !access.session.active) {
        return c.json({ error: 'Session is inactive' }, 409)
    }
    return { sessionId: access.sessionId, session: access.session }
}

export function requireSessionFromParam(
    c: Context<WebAppEnv>,
    engine: SyncEngine,
    options?: {
        paramName?: string
        requireActive?: boolean
        capabilityResolver?: RestCapabilityResolver
        requiredCapability?: Capability
    }
): { sessionId: string; session: Session } | Response {
    const paramName = options?.paramName ?? 'id'
    const sessionId = c.req.param(paramName)
    const result = requireSession(c, engine, sessionId, options)
    if (result instanceof Response) {
        return result
    }
    return result
}

export function requireMachine(
    c: Context<WebAppEnv>,
    engine: SyncEngine,
    machineId: string,
    options?: { capabilityResolver?: RestCapabilityResolver; requiredCapability?: Capability }
): Machine | Response {
    const organizationId = c.get('organizationId')
    const machine = engine.getMachine(machineId)
    if (!machine) {
        return c.json({ error: 'Machine not found' }, 404)
    }
    if (machine.namespace !== organizationId) {
        return c.json({ error: 'Machine not found' }, 404)
    }
    if (options?.capabilityResolver && options.requiredCapability) {
        const capability = requireCapability(c, options.capabilityResolver, 'machine', machineId, options.requiredCapability)
        if (capability instanceof Response) return capability
    }
    return machine
}
