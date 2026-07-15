import { Database } from 'bun:sqlite'
import { describe, expect, it } from 'bun:test'
import { AuthorizationService } from '../auth/authorizationService'
import { SharedHubStore } from '../store/sharedHubStore'
import { AuthorizationDeniedError, AuthorizedMutationService, type CommittedMutationEvent } from './authorizedMutationService'

function setup(): { db: Database; store: SharedHubStore; events: CommittedMutationEvent[]; service: AuthorizedMutationService } {
    const db = new Database(':memory:')
    const store = new SharedHubStore(db, { organizationId: 'o1', organizationName: 'Pilot' })
    db.prepare(`INSERT INTO memberships(id, organization_id, invited_email, role, status, created_at)
        VALUES ('owner', 'o1', 'owner@example.com', 'member', 'active', 1)`).run()
    const events: CommittedMutationEvent[] = []
    return { db, store, events, service: new AuthorizedMutationService(store, new AuthorizationService(), (event) => events.push(event)) }
}

const subject = { membershipId: 'owner', organizationId: 'o1', role: 'member' as const, disabled: false }
const resource = { type: 'runner' as const, id: 'r1', organizationId: 'o1', ownerMembershipId: 'owner' }

describe('AuthorizedMutationService', () => {
    it('commits mutation and audit before publishing a sanitized event', () => {
        const { db, events, service } = setup()
        const value = service.execute({
            subject, resource, action: 'runner.manage', grants: [], eventName: 'runner.updated', now: 10,
            mutate: () => {
                db.prepare("INSERT INTO teams(id, organization_id, name, created_at) VALUES ('t1', 'o1', 'Team', 10)").run()
                return 'done'
            }
        })
        expect(value).toBe('done')
        expect(db.prepare('SELECT count(*) count FROM audit_events').get()).toEqual({ count: 1 })
        expect(events).toHaveLength(1)
        expect(events[0]).toMatchObject({ name: 'runner.updated', organizationId: 'o1', resourceType: 'runner', resourceId: 'r1' })
        expect(events[0]!.id).not.toBeEmpty()
    })

    it('does not mutate, audit, or publish when authorization is denied', () => {
        const { db, events, service } = setup()
        expect(() => service.execute({
            subject: { ...subject, membershipId: 'other' }, resource, action: 'runner.revoke', grants: [], eventName: 'runner.revoked',
            mutate: () => db.exec("INSERT INTO teams(id, organization_id, name, created_at) VALUES ('t1', 'o1', 'Team', 10)")
        })).toThrow(AuthorizationDeniedError)
        expect(db.prepare('SELECT count(*) count FROM teams').get()).toEqual({ count: 0 })
        expect(db.prepare('SELECT count(*) count FROM audit_events').get()).toEqual({ count: 0 })
        expect(events).toEqual([])
    })

    it('rolls mutation back and does not publish when audit serialization fails', () => {
        const { db, events, service } = setup()
        const circular: Record<string, unknown> = {}
        circular.self = circular
        expect(() => service.execute({
            subject, resource, action: 'runner.manage', grants: [], eventName: 'runner.updated',
            auditMetadata: circular as Readonly<Record<string, string>>,
            mutate: () => db.exec("INSERT INTO teams(id, organization_id, name, created_at) VALUES ('t1', 'o1', 'Team', 10)")
        })).toThrow()
        expect(db.prepare('SELECT count(*) count FROM teams').get()).toEqual({ count: 0 })
        expect(db.prepare('SELECT count(*) count FROM audit_events').get()).toEqual({ count: 0 })
        expect(events).toEqual([])
    })

    it('rejects Promise-like mutations before audit and rolls back synchronous work', () => {
        const { db, events, service } = setup()
        expect(() => service.execute({
            subject, resource, action: 'runner.manage', grants: [], eventName: 'runner.updated',
            mutate: () => {
                db.exec("INSERT INTO teams(id, organization_id, name, created_at) VALUES ('t1', 'o1', 'Team', 10)")
                return { then: () => undefined }
            }
        })).toThrow(/synchronous mutate/)
        expect(db.prepare('SELECT count(*) count FROM teams').get()).toEqual({ count: 0 })
        expect(db.prepare('SELECT count(*) count FROM audit_events').get()).toEqual({ count: 0 })
        expect(events).toEqual([])
    })

    it('commits to the durable outbox and retries with the same event id after publish failure', () => {
        const { db, store } = setup()
        const events: CommittedMutationEvent[] = []
        let fail = true
        const service = new AuthorizedMutationService(store, new AuthorizationService(), (event) => {
            if (fail) throw new Error('offline')
            events.push(event)
        })
        expect(service.execute({
            subject, resource, action: 'runner.manage', grants: [], eventName: 'runner.updated', now: 10,
            mutate: () => 'done'
        })).toBe('done')
        const pending = db.prepare('SELECT id, published_at FROM outbox_events').get() as { id: string; published_at: number | null }
        expect(pending.published_at).toBeNull()
        fail = false
        expect(service.flushPending()).toBe(1)
        expect(events[0]!.id).toBe(pending.id)
        expect(db.prepare('SELECT published_at FROM outbox_events').get()).not.toEqual({ published_at: null })
    })
})
