import { describe, expect, it } from 'vitest'
import { shouldReconnectOnVisibilityRestore } from './useSSE'

describe('SSE visibility recovery', () => {
    it('does not reconnect just because the app returned from a hidden state when the stream is fresh', () => {
        expect(shouldReconnectOnVisibilityRestore({
            hiddenAt: 1_000,
            lastActivityAt: 9_000,
            now: 10_000,
            heartbeatStaleMs: 90_000,
        })).toBe(false)
    })

    it('reconnects when heartbeat is stale even if the hidden transition was missed', () => {
        expect(shouldReconnectOnVisibilityRestore({
            hiddenAt: null,
            lastActivityAt: 1_000,
            now: 100_000,
            heartbeatStaleMs: 90_000,
        })).toBe(true)
    })

    it('keeps a fresh visible connection open', () => {
        expect(shouldReconnectOnVisibilityRestore({
            hiddenAt: null,
            lastActivityAt: 95_000,
            now: 100_000,
            heartbeatStaleMs: 90_000,
        })).toBe(false)
    })
})
