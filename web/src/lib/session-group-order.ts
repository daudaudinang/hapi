export type SessionGroupOrderInput = {
    label: string
    latestUpdatedAt: number
    hasPinnedSession?: boolean
    hasActiveSession?: boolean
}

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const RECENCY_BUCKET_LIMITS_MS = [
    HOUR_MS,
    2 * HOUR_MS,
    4 * HOUR_MS,
    8 * HOUR_MS,
    DAY_MS,
    3 * DAY_MS,
    7 * DAY_MS,
] as const

export function getSessionGroupRecencyBucket(updatedAt: number, now = Date.now()): number {
    const age = Math.max(0, now - updatedAt)
    const bucket = RECENCY_BUCKET_LIMITS_MS.findIndex((limit) => age <= limit)
    return bucket >= 0 ? bucket : RECENCY_BUCKET_LIMITS_MS.length
}

export function compareSessionGroupOrder(
    left: SessionGroupOrderInput,
    right: SessionGroupOrderInput,
    now = Date.now()
): number {
    const leftPinned = left.hasPinnedSession === true
    const rightPinned = right.hasPinnedSession === true
    if (leftPinned !== rightPinned) return leftPinned ? -1 : 1

    const leftActive = left.hasActiveSession === true
    const rightActive = right.hasActiveSession === true
    if (leftActive !== rightActive) return leftActive ? -1 : 1

    const leftBucket = getSessionGroupRecencyBucket(left.latestUpdatedAt, now)
    const rightBucket = getSessionGroupRecencyBucket(right.latestUpdatedAt, now)
    if (leftBucket !== rightBucket) return leftBucket - rightBucket

    return left.label.localeCompare(right.label)
}
