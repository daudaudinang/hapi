/**
 * Auto-Resume Orchestrator for AUTO_RESUME_INACTIVE_SESSIONS
 *
 * Orchestrates automatic session resume and message delivery:
 * - Triggers resume for inactive sessions with queued messages
 * - Tracks resume attempts (max 3 per session)
 * - Handles activation timeout (15s)
 * - Processes queued messages after successful resume
 * - Archives sessions after max retry attempts
 *
 * Security features:
 * - Resume attempt limits (max 3 per session)
 * - Deduplication (prevents concurrent resume)
 * - Timeout handling (15s activation timeout)
 * - Graceful failure handling
 */

import type { Database } from 'bun:sqlite'
import type { MessagePayload, MessageQueue } from '../queue/messageQueue'
import type { PendingMessagesStore } from '../store/pendingMessages'

export type ResumeResult =
    | { status: 'success'; sessionId: string }
    | { status: 'already_active'; sessionId: string }
    | { status: 'failed'; reason: string; code?: string }

export type ResumeError =
    | { type: 'max_attempts_exceeded'; attempts: number }
    | { type: 'resume_failed'; reason: string; code?: string }
    | { type: 'activation_timeout'; duration: number }
    | { type: 'session_not_found' }
    | { type: 'access_denied' }

const ACTIVATION_TIMEOUT = 15_000 // 15 seconds
const ACTIVATION_POLL_INTERVAL = 500 // 500ms
const MAX_RESUME_ATTEMPTS = 3

export class AutoResumeOrchestrator {
    private readonly resumingSessions = new Set<string>()
    private readonly db: Database

    constructor(
        db: Database,
        private readonly messageQueue: MessageQueue,
        private readonly pendingMessages: PendingMessagesStore,
        private readonly resumeSessionFn: (sessionId: string, namespace: string) => Promise<{
            type: 'success' | 'error'
            sessionId?: string
            message?: string
            code?: string
        }>,
        private readonly getSessionFn: (sessionId: string) => {
            id: string
            active: boolean
            namespace: string
            [key: string]: any
        } | null,
        private readonly archiveSessionFn: (sessionId: string) => Promise<void>,
        private readonly deliverMessageFn: (sessionId: string, payload: MessagePayload) => Promise<void> = async () => {}
    ) {
        this.db = db
    }

    /**
     * Trigger resume for a session
     * @param sessionId - Session ID to resume
     * @param namespace - Session namespace
     * @returns ResumeResult indicating success or failure
     */
    async triggerResume(sessionId: string, namespace: string): Promise<ResumeResult> {
        // Check if already resuming (dedup)
        if (this.resumingSessions.has(sessionId)) {
            return { status: 'failed', reason: 'Already resuming' }
        }

        // Check resume attempts before starting
        const attempts = await this.getResumeAttempts(sessionId)
        if (attempts >= MAX_RESUME_ATTEMPTS) {
            await this.handleResumeFailure(sessionId, {
                type: 'max_attempts_exceeded',
                attempts
            })
            return { status: 'failed', reason: `Max resume attempts (${MAX_RESUME_ATTEMPTS}) exceeded` }
        }

        // Mark as resuming
        this.resumingSessions.add(sessionId)

        try {
            // Increment attempt counter
            await this.incrementResumeAttempts(sessionId)

            // Check if session exists
            const session = this.getSessionFn(sessionId)
            if (!session) {
                await this.handleResumeFailure(sessionId, { type: 'session_not_found' })
                return { status: 'failed', reason: 'Session not found', code: 'session_not_found' }
            }

            // Check if already active
            if (session.active) {
                await this.resetResumeAttempts(sessionId)
                return { status: 'already_active', sessionId }
            }

            // Call resumeSession
            const resumeResult = await this.resumeSessionFn(sessionId, namespace)

            if (resumeResult.type === 'error') {
                await this.handleResumeFailure(sessionId, {
                    type: 'resume_failed',
                    reason: resumeResult.message || 'Resume failed',
                    code: resumeResult.code
                })
                return {
                    status: 'failed',
                    reason: resumeResult.message || 'Resume failed',
                    code: resumeResult.code
                }
            }

            // Use canonical session id from resume path after merge.
            const canonicalSessionId = resumeResult.sessionId ?? sessionId

            // Wait for session to become active
            const becameActive = await this.waitForSessionActive(canonicalSessionId)

            if (!becameActive) {
                // Timeout - treat as failure
                await this.handleResumeFailure(sessionId, {
                    type: 'activation_timeout',
                    duration: ACTIVATION_TIMEOUT
                })
                return {
                    status: 'failed',
                    reason: `Activation timeout (${ACTIVATION_TIMEOUT}ms)`,
                    code: 'activation_timeout'
                }
            }

            // Success - reset attempt counter and process messages
            await this.resetResumeAttempts(sessionId)
            await this.processQueuedMessages(canonicalSessionId)

            return { status: 'success', sessionId: canonicalSessionId }
        } catch (error) {
            // Unexpected error
            await this.handleResumeFailure(sessionId, {
                type: 'resume_failed',
                reason: error instanceof Error ? error.message : 'Unknown error'
            })
            return {
                status: 'failed',
                reason: error instanceof Error ? error.message : 'Unknown error'
            }
        } finally {
            // Remove from resuming set
            this.resumingSessions.delete(sessionId)
        }
    }

    /**
     * Wait for session to become active with timeout
     * @param sessionId - Session ID to wait for
     * @returns Promise<boolean> indicating if session became active
     */
    private async waitForSessionActive(sessionId: string): Promise<boolean> {
        const startTime = Date.now()

        while (Date.now() - startTime < ACTIVATION_TIMEOUT) {
            try {
                const session = this.getSessionFn(sessionId)

                if (session && session.active) {
                    return true
                }
            } catch (error) {
                // Session lookup failed, continue waiting
            }

            // Wait before next poll
            await new Promise(resolve => setTimeout(resolve, ACTIVATION_POLL_INTERVAL))
        }

        // Timeout
        return false
    }

    /**
     * Process queued messages after session becomes active
     * @param sessionId - Session ID to process messages for
     */
    async processQueuedMessages(sessionId: string): Promise<void> {
        const messages = this.pendingMessages
            .getPendingMessages(sessionId)
            .slice()
            .sort((a, b) => a.createdAt - b.createdAt)

        for (const message of messages) {
            try {
                // Parse the payload
                const payload = JSON.parse(message.payload) as MessagePayload

                await this.deliverMessageFn(sessionId, payload)
                this.pendingMessages.markAsProcessed(message.id)
            } catch (error) {
                // Mark as failed
                this.pendingMessages.markAsFailed(
                    message.id,
                    error instanceof Error ? error.message : 'Unknown error'
                )
            }
        }
    }

    /**
     * Handle resume failure
     * @param sessionId - Session ID that failed to resume
     * @param error - Resume error details
     */
    async handleResumeFailure(sessionId: string, error: ResumeError): Promise<void> {
        // Get current attempts
        const attempts = await this.getResumeAttempts(sessionId)

        // Mark all pending messages as failed
        const messages = this.pendingMessages.getPendingMessages(sessionId)
        for (const message of messages) {
            this.pendingMessages.markAsFailed(
                message.id,
                `Resume failed: ${error.type}`
            )
        }

        // Archive session if max attempts exceeded
        if (attempts >= MAX_RESUME_ATTEMPTS) {
            try {
                await this.archiveSessionFn(sessionId)
            } catch (archiveError) {
                // Log but don't throw - archive is best-effort
                console.error(`Failed to archive session ${sessionId}:`, archiveError)
            }
        }
    }

    /**
     * Get resume attempts for a session
     * @param sessionId - Session ID to check
     * @returns Promise<number> resume attempts
     */
    private async getResumeAttempts(sessionId: string): Promise<number> {
        const row = this.db.prepare(
            'SELECT resume_attempts FROM sessions WHERE id = ?'
        ).get(sessionId) as { resume_attempts: number } | undefined

        return row?.resume_attempts || 0
    }

    /**
     * Increment resume attempts counter
     * @param sessionId - Session ID to increment
     */
    private async incrementResumeAttempts(sessionId: string): Promise<void> {
        this.db.prepare(
            'UPDATE sessions SET resume_attempts = resume_attempts + 1 WHERE id = ?'
        ).run(sessionId)
    }

    /**
     * Reset resume attempts counter
     * @param sessionId - Session ID to reset
     */
    private async resetResumeAttempts(sessionId: string): Promise<void> {
        this.db.prepare(
            'UPDATE sessions SET resume_attempts = 0 WHERE id = ?'
        ).run(sessionId)
    }
}
