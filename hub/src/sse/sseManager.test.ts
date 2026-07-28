import { describe, expect, it } from 'bun:test'
import { SSEManager } from './sseManager'
import type { SyncEvent } from '../sync/syncEngine'
import { VisibilityTracker } from '../visibility/visibilityTracker'

describe('SSEManager namespace filtering', () => {
    it('routes events to matching namespace', () => {
        const manager = new SSEManager(0, new VisibilityTracker())
        const receivedAlpha: SyncEvent[] = []
        const receivedBeta: SyncEvent[] = []

        manager.subscribe({
            id: 'alpha',
            namespace: 'alpha',
            all: true,
            send: (event) => {
                receivedAlpha.push(event)
            },
            sendHeartbeat: () => {}
        })

        manager.subscribe({
            id: 'beta',
            namespace: 'beta',
            all: true,
            send: (event) => {
                receivedBeta.push(event)
            },
            sendHeartbeat: () => {}
        })

        manager.broadcast({ type: 'session-updated', sessionId: 's1', namespace: 'alpha' })

        expect(receivedAlpha).toHaveLength(1)
        expect(receivedBeta).toHaveLength(0)
    })

    it('broadcasts connection-changed to all namespaces', () => {
        const manager = new SSEManager(0, new VisibilityTracker())
        const received: Array<{ id: string; event: SyncEvent }> = []

        manager.subscribe({
            id: 'alpha',
            namespace: 'alpha',
            all: true,
            send: (event) => {
                received.push({ id: 'alpha', event })
            },
            sendHeartbeat: () => {}
        })

        manager.subscribe({
            id: 'beta',
            namespace: 'beta',
            all: true,
            send: (event) => {
                received.push({ id: 'beta', event })
            },
            sendHeartbeat: () => {}
        })

        manager.broadcast({ type: 'connection-changed', data: { status: 'connected' } })

        expect(received).toHaveLength(2)
        expect(received.map((entry) => entry.id).sort()).toEqual(['alpha', 'beta'])
    })

    it('sends toast only to visible connections in a namespace', async () => {
        const manager = new SSEManager(0, new VisibilityTracker())
        const received: Array<{ id: string; event: SyncEvent }> = []

        manager.subscribe({
            id: 'visible',
            namespace: 'alpha',
            all: true,
            visibility: 'visible',
            send: (event) => {
                received.push({ id: 'visible', event })
            },
            sendHeartbeat: () => {}
        })

        manager.subscribe({
            id: 'hidden',
            namespace: 'alpha',
            all: true,
            visibility: 'hidden',
            send: (event) => {
                received.push({ id: 'hidden', event })
            },
            sendHeartbeat: () => {}
        })

        manager.subscribe({
            id: 'other',
            namespace: 'beta',
            all: true,
            visibility: 'visible',
            send: (event) => {
                received.push({ id: 'other', event })
            },
            sendHeartbeat: () => {}
        })

        const toastEvent: Extract<SyncEvent, { type: 'toast' }> = {
            type: 'toast',
            data: {
                title: 'Test',
                body: 'Toast body',
                sessionId: 'session-1',
                url: '/sessions/session-1'
            }
        }

        const delivered = await manager.sendToast('alpha', toastEvent)

        expect(delivered).toBe(1)
        expect(received).toHaveLength(1)
        expect(received[0]?.id).toBe('visible')
    })

    it('delivers terminal snippet invalidations to every scoped connection in the matching namespace', () => {
        const manager = new SSEManager(0, new VisibilityTracker())
        const received: string[] = []

        for (const subscription of [
            { id: 'all', namespace: 'alpha', all: true },
            { id: 'session', namespace: 'alpha', sessionId: 'session-1' },
            { id: 'machine', namespace: 'alpha', machineId: 'machine-1' },
            { id: 'other-namespace', namespace: 'beta', all: true }
        ]) {
            manager.subscribe({
                ...subscription,
                send: () => {
                    received.push(subscription.id)
                },
                sendHeartbeat: () => {}
            })
        }

        manager.broadcast({
            type: 'terminal-snippets-updated',
            namespace: 'alpha'
        })

        expect(received.sort()).toEqual(['all', 'machine', 'session'])
    })

    it('contains synchronous send failures, removes the connection, and continues delivery', () => {
        const manager = new SSEManager(0, new VisibilityTracker())
        let failedCalls = 0
        const received: SyncEvent[] = []

        manager.subscribe({
            id: 'sync-failure',
            namespace: 'alpha',
            all: true,
            send: () => {
                failedCalls += 1
                throw new Error('send failed')
            },
            sendHeartbeat: () => {}
        })
        manager.subscribe({
            id: 'healthy',
            namespace: 'alpha',
            all: true,
            send: (event) => {
                received.push(event)
            },
            sendHeartbeat: () => {}
        })

        expect(() => manager.broadcast({
            type: 'terminal-snippets-updated',
            namespace: 'alpha'
        })).not.toThrow()
        manager.broadcast({
            type: 'terminal-snippets-updated',
            namespace: 'alpha'
        })

        expect(failedCalls).toBe(1)
        expect(received).toHaveLength(2)
    })

    it('contains asynchronous send failures, removes the connection, and continues delivery', async () => {
        const manager = new SSEManager(0, new VisibilityTracker())
        let failedCalls = 0
        const received: SyncEvent[] = []

        manager.subscribe({
            id: 'async-failure',
            namespace: 'alpha',
            all: true,
            send: async () => {
                failedCalls += 1
                throw new Error('send failed')
            },
            sendHeartbeat: () => {}
        })
        manager.subscribe({
            id: 'healthy',
            namespace: 'alpha',
            all: true,
            send: (event) => {
                received.push(event)
            },
            sendHeartbeat: () => {}
        })

        expect(() => manager.broadcast({
            type: 'terminal-snippets-updated',
            namespace: 'alpha'
        })).not.toThrow()
        await Promise.resolve()
        manager.broadcast({
            type: 'terminal-snippets-updated',
            namespace: 'alpha'
        })

        expect(failedCalls).toBe(1)
        expect(received).toHaveLength(2)
    })
})
