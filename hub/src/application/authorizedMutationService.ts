import { randomUUID } from 'node:crypto'
import type { AuthorizationAction } from '@hapi/protocol/auth'
import {
    AuthorizationService,
    type AuthorizationResource,
    type AuthorizationSubject,
    type EffectiveGrant
} from '../auth/authorizationService'
import { SharedHubStore } from '../store/sharedHubStore'

export class AuthorizationDeniedError extends Error {
    readonly code = 'authorization_denied'

    constructor() {
        super('The actor is not authorized for this action.')
        this.name = 'AuthorizationDeniedError'
    }
}

export type CommittedMutationEvent = {
    id: string
    name: string
    organizationId: string
    resourceType: AuthorizationResource['type']
    resourceId: string
}

export class AuthorizedMutationService {
    constructor(
        private readonly store: SharedHubStore,
        private readonly authorization: AuthorizationService,
        private readonly publish: (event: CommittedMutationEvent) => void
    ) {}

    execute<T>(input: {
        subject: AuthorizationSubject
        action: AuthorizationAction
        resource: AuthorizationResource
        grants: readonly EffectiveGrant[]
        eventName: string
        mutate: () => T
        auditMetadata?: Readonly<Record<string, string | number | boolean | null>>
        now?: number
    }): T {
        const now = input.now ?? Date.now()
        const outboxId = randomUUID()
        const result = this.store.transaction(() => {
            if (!this.authorization.can(input.subject, input.action, input.resource, input.grants, now)) {
                throw new AuthorizationDeniedError()
            }
            const value = input.mutate()
            if (isPromiseLike(value)) throw new Error('AuthorizedMutationService.execute requires a synchronous mutate callback.')
            this.store.appendAuditEvent({
                id: randomUUID(),
                organizationId: input.subject.organizationId,
                actorType: 'user',
                actorId: input.subject.membershipId,
                action: input.action,
                resourceType: input.resource.type,
                resourceId: input.resource.id,
                outcome: 'success',
                metadata: input.auditMetadata,
                createdAt: now
            })
            this.store.appendOutboxEvent({
                id: outboxId,
                organizationId: input.subject.organizationId,
                name: input.eventName,
                resourceType: input.resource.type,
                resourceId: input.resource.id,
                createdAt: now
            })
            return value
        })
        try {
            this.publish({
                id: outboxId,
                name: input.eventName,
                organizationId: input.subject.organizationId,
                resourceType: input.resource.type,
                resourceId: input.resource.id
            })
            this.store.markOutboxEventPublished(outboxId, Date.now())
        } catch {
            // Durable outbox remains pending for the dispatcher; mutation already committed.
        }
        return result
    }

    flushPending(limit = 100): number {
        let published = 0
        for (const event of this.store.listPendingOutboxEvents(limit)) {
            try {
                this.publish(event as CommittedMutationEvent)
                this.store.markOutboxEventPublished(event.id, Date.now())
                published++
            } catch {
                break
            }
        }
        return published
    }
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
    return typeof value === 'object' && value !== null && 'then' in value
        && typeof (value as { then?: unknown }).then === 'function'
}
