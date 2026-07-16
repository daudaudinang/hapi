import type { SharedHubStore, StoredOutboxEvent } from '../store/sharedHubStore'

type TimerHandle = ReturnType<typeof setTimeout>

export type OutboxDispatcherOptions = {
    batchSize?: number
    idleMs?: number
    retryBaseMs?: number
    retryMaxMs?: number
    now?: () => number
    schedule?: (callback: () => void, delayMs: number) => TimerHandle
    cancel?: (handle: TimerHandle) => void
}

export class OutboxDispatcher {
    private readonly batchSize: number
    private readonly idleMs: number
    private readonly retryBaseMs: number
    private readonly retryMaxMs: number
    private readonly now: () => number
    private readonly scheduleTimer: (callback: () => void, delayMs: number) => TimerHandle
    private readonly cancelTimer: (handle: TimerHandle) => void
    private timer: TimerHandle | null = null
    private running = false
    private stopped = true
    private consecutiveFailures = 0

    constructor(
        private readonly store: SharedHubStore,
        private readonly publish: (event: StoredOutboxEvent) => void | Promise<void>,
        options: OutboxDispatcherOptions = {}
    ) {
        this.batchSize = options.batchSize ?? 100
        this.idleMs = options.idleMs ?? 1_000
        this.retryBaseMs = options.retryBaseMs ?? 250
        this.retryMaxMs = options.retryMaxMs ?? 30_000
        this.now = options.now ?? Date.now
        this.scheduleTimer = options.schedule ?? setTimeout
        this.cancelTimer = options.cancel ?? clearTimeout
    }

    start(): void {
        if (!this.stopped) return
        this.stopped = false
        this.schedule(0)
    }

    stop(): void {
        this.stopped = true
        if (this.timer) this.cancelTimer(this.timer)
        this.timer = null
    }

    async flushOnce(): Promise<{ published: number; failed: boolean }> {
        if (this.running) return { published: 0, failed: false }
        this.running = true
        let published = 0
        try {
            for (const event of this.store.listPendingOutboxEvents(this.batchSize)) {
                try {
                    await this.publish(event)
                    this.store.markOutboxEventPublished(event.id, this.now())
                    published++
                } catch {
                    this.consecutiveFailures++
                    return { published, failed: true }
                }
            }
            this.consecutiveFailures = 0
            return { published, failed: false }
        } finally {
            this.running = false
        }
    }

    private schedule(delayMs: number): void {
        if (this.stopped) return
        if (this.timer) this.cancelTimer(this.timer)
        this.timer = this.scheduleTimer(() => {
            this.timer = null
            void this.runScheduled()
        }, delayMs)
    }

    private async runScheduled(): Promise<void> {
        if (this.stopped) return
        const result = await this.flushOnce()
        if (this.stopped) return
        if (result.failed) {
            const exponent = Math.max(0, this.consecutiveFailures - 1)
            this.schedule(Math.min(this.retryMaxMs, this.retryBaseMs * 2 ** exponent))
            return
        }
        this.schedule(result.published === this.batchSize ? 0 : this.idleMs)
    }
}
