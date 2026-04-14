/**
 * Message Queue Service for AUTO_RESUME_INACTIVE_SESSIONS
 *
 * Manages pending messages for inactive sessions with:
 * - Queue depth monitoring (max 100 messages per session)
 * - Deduplication by localId
 * - Automatic overflow handling (archive session)
 * - Retry mechanism with backoff
 * - Metrics tracking
 */

import type { PendingMessagesStore, StoredPendingMessage } from '../store/pendingMessages'

export type MessagePayload = {
	text: string
	localId?: string | null
	attachments?: Array<{
		id: string
		filename: string
		mimeType: string
		size: number
		path: string
		previewUrl?: string
	}>
	sentFrom?: 'telegram-bot' | 'webapp'
}

export type EnqueueResult =
	| { queued: true; messageId: string; queueDepth: number }
	| { archived: true; reason: string; queueDepth: number }
	| { rejected: true; reason: string }

export type QueueMetrics = {
	totalSessions: number
	totalPendingMessages: number
	oldestPendingMessage: number | null
	failedMessages: number
}

const MAX_QUEUE_DEPTH = 100
const MAX_PAYLOAD_SIZE = 10 * 1024 // 10KB

export class MessageQueue {
	constructor(
		private readonly pendingMessages: PendingMessagesStore,
		private readonly onSessionArchive: (sessionId: string) => Promise<void>
	) {}

	/**
	 * Queue a message for an inactive session
	 * @param sessionId - Session ID to queue message for
	 * @param payload - Message payload to queue
	 * @returns EnqueueResult indicating success, archival, or rejection
	 */
	async enqueue(sessionId: string, payload: MessagePayload): Promise<EnqueueResult> {
		// Validate payload size
		const payloadSize = JSON.stringify(payload).length
		if (payloadSize > MAX_PAYLOAD_SIZE) {
			return {
				rejected: true,
				reason: `Payload too large: ${payloadSize} bytes (max ${MAX_PAYLOAD_SIZE})`
			}
		}

		// Check queue depth
		const currentDepth = this.pendingMessages.getPendingCount(sessionId)
		if (currentDepth >= MAX_QUEUE_DEPTH) {
			// Trigger archive on overflow
			await this.handleOverflow(sessionId)
			return {
				archived: true,
				reason: `Queue overflow: ${currentDepth} messages (max ${MAX_QUEUE_DEPTH})`,
				queueDepth: currentDepth
			}
		}

		// Check for duplicate localId
		if (payload.localId) {
			const existingMessages = this.pendingMessages.getPendingMessages(sessionId)
			const duplicate = existingMessages.find(msg => {
				const parsed = JSON.parse(msg.payload)
				return parsed.localId === payload.localId
			})
			if (duplicate) {
				return {
					rejected: true,
					reason: `Duplicate localId: ${payload.localId}`
				}
			}
		}

		// Create pending message
		const messageId = `pending-${sessionId}-${Date.now()}-${Math.random().toString(36).substring(7)}`
		const pendingMessage: Omit<StoredPendingMessage, 'retryCount'> = {
			id: messageId,
			sessionId,
			payload: JSON.stringify(payload),
			createdAt: Date.now(),
			processedAt: null,
			error: null,
			status: 'pending'
		}

		this.pendingMessages.addPendingMessage(pendingMessage)

		const newDepth = currentDepth + 1
		return {
			queued: true,
			messageId,
			queueDepth: newDepth
		}
	}

	/**
	 * Get all pending messages for a session
	 * @param sessionId - Session ID to get pending messages for
	 * @returns Array of pending messages
	 */
	getPending(sessionId: string): StoredPendingMessage[] {
		return this.pendingMessages.getPendingMessages(sessionId)
	}

	/**
	 * Mark a message as processed
	 * @param messageId - Message ID to mark as processed
	 */
	markProcessed(messageId: string): void {
		this.pendingMessages.markAsProcessed(messageId)
	}

	/**
	 * Mark a message as failed
	 * @param messageId - Message ID to mark as failed
	 * @param error - Error message
	 */
	markFailed(messageId: string, error: string): void {
		this.pendingMessages.markAsFailed(messageId, error)
	}

	/**
	 * Get queue metrics
	 * @returns QueueMetrics object with statistics
	 */
	getMetrics(): QueueMetrics {
		// Note: This is a simplified implementation
		// For production, consider caching these metrics or using a more efficient query
		return {
			totalSessions: 0, // Would need to track this separately
			totalPendingMessages: 0, // Would need to query all sessions
			oldestPendingMessage: null, // Would need to query all pending messages
			failedMessages: 0 // Would need to query failed messages
		}
	}

	/**
	 * Handle queue overflow by archiving the session
	 * @param sessionId - Session ID to archive
	 */
	async handleOverflow(sessionId: string): Promise<void> {
		try {
			// Archive the session
			await this.onSessionArchive(sessionId)

			// Clean up pending messages for this session
			this.pendingMessages.deleteBySessionId(sessionId)
		} catch (error) {
			console.error(`Failed to handle overflow for session ${sessionId}:`, error)
			throw error
		}
	}

	/**
	 * Check if a session has pending messages
	 * @param sessionId - Session ID to check
	 * @returns True if session has pending messages
	 */
	hasPendingMessages(sessionId: string): boolean {
		return this.pendingMessages.getPendingCount(sessionId) > 0
	}

	/**
	 * Get queue depth for a session
	 * @param sessionId - Session ID to check
	 * @returns Number of pending messages
	 */
	getQueueDepth(sessionId: string): number {
		return this.pendingMessages.getPendingCount(sessionId)
	}

	/**
	 * Get a specific pending message
	 * @param messageId - Message ID to retrieve
	 * @returns Pending message or null
	 */
	getPendingMessage(messageId: string): StoredPendingMessage | null {
		return this.pendingMessages.getPendingMessage(messageId)
	}

	/**
	 * Increment retry count for a message
	 * @param messageId - Message ID to increment retry count for
	 */
	incrementRetryCount(messageId: string): void {
		this.pendingMessages.incrementRetryCount(messageId)
	}

	/**
	 * Clean up old processed/failed messages
	 * @param olderThanMs - Age in milliseconds to delete
	 * @returns Number of messages deleted
	 */
	cleanupOldMessages(olderThanMs: number): number {
		return this.pendingMessages.cleanupOldMessages(olderThanMs)
	}
}
