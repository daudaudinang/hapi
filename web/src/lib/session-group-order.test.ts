import { describe, expect, it } from 'vitest'
import { compareSessionGroupOrder, getSessionGroupRecencyBucket } from './session-group-order'

const hour = 60 * 60 * 1000
const now = Date.UTC(2026, 4, 2, 10, 0, 0)

describe('session group ordering', () => {
    it('places groups in coarse recency buckets to avoid exact timestamp churn', () => {
        expect(getSessionGroupRecencyBucket(now - 30 * 60 * 1000, now)).toBe(0)
        expect(getSessionGroupRecencyBucket(now - 90 * 60 * 1000, now)).toBe(1)
        expect(getSessionGroupRecencyBucket(now - 3 * hour, now)).toBe(2)
        expect(getSessionGroupRecencyBucket(now - 6 * hour, now)).toBe(3)
        expect(getSessionGroupRecencyBucket(now - 12 * hour, now)).toBe(4)
        expect(getSessionGroupRecencyBucket(now - 2 * 24 * hour, now)).toBe(5)
        expect(getSessionGroupRecencyBucket(now - 5 * 24 * hour, now)).toBe(6)
        expect(getSessionGroupRecencyBucket(now - 10 * 24 * hour, now)).toBe(7)
    })

    it('keeps groups in the same recency bucket stable by label instead of exact update time', () => {
        const groups = [
            { label: 'zeta', latestUpdatedAt: now - 10 * 60 * 1000 },
            { label: 'alpha', latestUpdatedAt: now - 50 * 60 * 1000 },
            { label: 'middle', latestUpdatedAt: now - 3 * hour },
        ]

        const sorted = [...groups].sort((a, b) => compareSessionGroupOrder(a, b, now))

        expect(sorted.map((group) => group.label)).toEqual(['alpha', 'zeta', 'middle'])
    })

    it('keeps pinned and active groups above recency buckets', () => {
        const groups = [
            { label: 'recent', latestUpdatedAt: now - 10 * 60 * 1000 },
            { label: 'active-old', latestUpdatedAt: now - 10 * 24 * hour, hasActiveSession: true },
            { label: 'pinned-old', latestUpdatedAt: now - 10 * 24 * hour, hasPinnedSession: true },
        ]

        const sorted = [...groups].sort((a, b) => compareSessionGroupOrder(a, b, now))

        expect(sorted.map((group) => group.label)).toEqual(['pinned-old', 'active-old', 'recent'])
    })
})
