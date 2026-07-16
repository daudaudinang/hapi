import { Database } from 'bun:sqlite'
import { describe, expect, it } from 'bun:test'
import { SharedHubStore, type StoredOutboxEvent } from '../store/sharedHubStore'
import { OutboxDispatcher } from './outboxDispatcher'

function setup() {
    const db = new Database(':memory:')
    const store = new SharedHubStore(db, { organizationId: 'o1', organizationName: 'Pilot' })
    const append = (id: string, createdAt: number) => store.appendOutboxEvent({
        id, organizationId: 'o1', name: 'member.updated', resourceType: 'membership', resourceId: id, createdAt
    })
    return { db, store, append }
}

describe('OutboxDispatcher', () => {
    it('publishes restart-pending events in order and marks them afterwards', async () => {
        const { db, store, append } = setup()
        append('e2', 2)
        append('e1', 1)
        const delivered: string[] = []
        const dispatcher = new OutboxDispatcher(store, async (event) => { delivered.push(event.id) }, { now: () => 10 })

        expect(await dispatcher.flushOnce()).toEqual({ published: 2, failed: false })
        expect(delivered).toEqual(['e1', 'e2'])
        expect(db.prepare('SELECT id, published_at FROM outbox_events ORDER BY created_at').all()).toEqual([
            { id: 'e1', published_at: 10 }, { id: 'e2', published_at: 10 }
        ])
    })

    it('keeps a failed event pending and retries the same id before later events', async () => {
        const { db, store, append } = setup()
        append('e1', 1)
        append('e2', 2)
        const attempts: string[] = []
        let fail = true
        const dispatcher = new OutboxDispatcher(store, (event) => {
            attempts.push(event.id)
            if (fail) throw new Error('offline')
        })

        expect(await dispatcher.flushOnce()).toEqual({ published: 0, failed: true })
        expect(attempts).toEqual(['e1'])
        expect(db.prepare('SELECT count(*) count FROM outbox_events WHERE published_at IS NULL').get()).toEqual({ count: 2 })
        fail = false
        expect(await dispatcher.flushOnce()).toEqual({ published: 2, failed: false })
        expect(attempts).toEqual(['e1', 'e1', 'e2'])
    })

    it('uses bounded exponential retry and cancels scheduling on stop', async () => {
        const { store, append } = setup()
        append('e1', 1)
        const scheduled: Array<{ callback: () => void; delay: number; handle: TimerHandle }> = []
        type TimerHandle = ReturnType<typeof setTimeout>
        const dispatcher = new OutboxDispatcher(store, (_event: StoredOutboxEvent) => { throw new Error('offline') }, {
            retryBaseMs: 5,
            retryMaxMs: 8,
            schedule: (callback, delay) => {
                const handle = 1 as unknown as TimerHandle
                scheduled.push({ callback, delay, handle })
                return handle
            },
            cancel: () => undefined
        })

        dispatcher.start()
        expect(scheduled.map((item) => item.delay)).toEqual([0])
        scheduled.shift()!.callback()
        await new Promise(resolve => setTimeout(resolve, 0))
        expect(scheduled.map((item) => item.delay)).toEqual([5])
        scheduled.shift()!.callback()
        await new Promise(resolve => setTimeout(resolve, 0))
        expect(scheduled.map((item) => item.delay)).toEqual([8])
        dispatcher.stop()
        scheduled.shift()!.callback()
        await new Promise(resolve => setTimeout(resolve, 0))
        expect(scheduled).toEqual([])
    })
})
