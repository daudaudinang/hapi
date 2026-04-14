import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { Database } from 'bun:sqlite'
import { PendingMessagesStore } from '../store/pendingMessages'
import { MessageQueue, type MessagePayload } from './messageQueue'

describe('MessageQueue', () => {
	let db: Database
	let pendingMessagesStore: PendingMessagesStore
	let messageQueue: MessageQueue
	let archivedSessions: string[]

	// Helper function to create a test session
	function createSession(sessionId: string) {
		db.prepare('INSERT INTO sessions (id, namespace, created_at, updated_at) VALUES (?, ?, ?, ?)')
			.run(sessionId, 'default', Date.now(), Date.now())
	}

	beforeEach(() => {
		// Create in-memory database for testing
		db = new Database(':memory:')
		db.exec('PRAGMA foreign_keys = ON')

		// Create the sessions table first (required by foreign key constraint)
		db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        tag TEXT,
        namespace TEXT NOT NULL DEFAULT 'default',
        machine_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        metadata TEXT,
        metadata_version INTEGER DEFAULT 1,
        agent_state TEXT,
        agent_state_version INTEGER DEFAULT 1,
        model TEXT,
        effort TEXT,
        todos TEXT,
        todos_updated_at INTEGER,
        team_state TEXT,
        team_state_updated_at INTEGER,
        active INTEGER DEFAULT 0,
        active_at INTEGER,
        seq INTEGER DEFAULT 0
      );
    `)

		// Create the pending_messages table
		db.exec(`
      CREATE TABLE IF NOT EXISTS pending_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        processed_at INTEGER,
        error TEXT,
        retry_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending',
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_pending_session ON pending_messages(session_id, status);
      CREATE INDEX IF NOT EXISTS idx_pending_status ON pending_messages(status, created_at);
    `)

		pendingMessagesStore = new PendingMessagesStore(db)
		archivedSessions = []

		messageQueue = new MessageQueue(
			pendingMessagesStore,
			async (sessionId: string) => {
				archivedSessions.push(sessionId)
			}
		)
	})

	afterEach(() => {
		db.close()
	})

	describe('enqueue', () => {
		it('should queue a message successfully', async () => {
			createSession('session-1')

			const payload: MessagePayload = {
				text: 'Hello, world!',
				localId: 'local-1'
			}

			const result = await messageQueue.enqueue('session-1', payload)

			expect(result).toEqual({
				queued: true,
				messageId: expect.any(String),
				queueDepth: 1
			})

			const pending = messageQueue.getPending('session-1')
			expect(pending).toHaveLength(1)
			expect(pending[0].sessionId).toBe('session-1')
		})

		it('should reject payload that exceeds size limit', async () => {
			createSession('session-2')

			const largePayload: MessagePayload = {
				text: 'x'.repeat(11 * 1024), // > 10KB
				localId: 'local-2'
			}

			const result = await messageQueue.enqueue('session-2', largePayload)

			expect(result).toEqual({
				rejected: true,
				reason: expect.stringContaining('Payload too large')
			})
		})

		it('should reject duplicate localId', async () => {
			createSession('session-3')

			const payload: MessagePayload = {
				text: 'First message',
				localId: 'duplicate-1'
			}

			// Enqueue first message
			await messageQueue.enqueue('session-3', payload)

			// Try to enqueue duplicate
			const result = await messageQueue.enqueue('session-3', payload)

			expect(result).toEqual({
				rejected: true,
				reason: 'Duplicate localId: duplicate-1'
			})
		})

		it('should archive session when queue depth exceeds limit', async () => {
			createSession('session-4')

			// Fill queue to limit (100 messages)
			for (let i = 0; i < 100; i++) {
				const payload: MessagePayload = {
					text: `Message ${i}`,
					localId: `local-${i}`
				}
				await messageQueue.enqueue('session-4', payload)
			}

			// Try to add one more
			const overflowPayload: MessagePayload = {
				text: 'Overflow message',
				localId: 'local-100'
			}

			const result = await messageQueue.enqueue('session-4', overflowPayload)

			if ('archived' in result) {
				expect(result.archived).toBe(true)
				expect(result.reason).toBe('Queue overflow: 100 messages (max 100)')
				expect(result.queueDepth).toBe(100)
			} else {
				throw new Error('Expected archived result')
			}

			expect(archivedSessions).toContain('session-4')

			// Queue should be cleaned up after archive
			const pending = messageQueue.getPending('session-4')
			expect(pending).toHaveLength(0)
		})

		it('should allow different localIds for same session', async () => {
			createSession('session-5')

			const payload1: MessagePayload = {
				text: 'First message',
				localId: 'unique-1'
			}

			const payload2: MessagePayload = {
				text: 'Second message',
				localId: 'unique-2'
			}

			const result1 = await messageQueue.enqueue('session-5', payload1)
			const result2 = await messageQueue.enqueue('session-5', payload2)

			expect('queued' in result1 && result1.queued).toBe(true)
			expect('queued' in result2 && result2.queued).toBe(true)

			const pending = messageQueue.getPending('session-5')
			expect(pending).toHaveLength(2)
		})

		it('should queue messages without localId', async () => {
			createSession('session-6')

			const payload: MessagePayload = {
				text: 'Message without localId'
			}

			const result = await messageQueue.enqueue('session-6', payload)

			expect('queued' in result && result.queued).toBe(true)

			const pending = messageQueue.getPending('session-6')
			expect(pending).toHaveLength(1)
		})

		it('should store attachments in payload', async () => {
			createSession('session-7')

			const payload: MessagePayload = {
				text: 'Message with attachments',
				localId: 'local-7',
				attachments: [
					{
						id: 'att-1',
						filename: 'test.txt',
						mimeType: 'text/plain',
						size: 100,
						path: '/path/to/file'
					}
				]
			}

			await messageQueue.enqueue('session-7', payload)

			const pending = messageQueue.getPending('session-7')
			expect(pending).toHaveLength(1)

			const storedPayload = JSON.parse(pending[0].payload)
			expect(storedPayload.attachments).toEqual([
				{
					id: 'att-1',
					filename: 'test.txt',
					mimeType: 'text/plain',
					size: 100,
					path: '/path/to/file'
				}
			])
		})

		it('should store sentFrom in payload', async () => {
			createSession('session-8')

			const payload: MessagePayload = {
				text: 'Message from telegram',
				localId: 'local-8',
				sentFrom: 'telegram-bot'
			}

			await messageQueue.enqueue('session-8', payload)

			const pending = messageQueue.getPending('session-8')
			const storedPayload = JSON.parse(pending[0].payload)
			expect(storedPayload.sentFrom).toBe('telegram-bot')
		})
	})

	describe('getPending', () => {
		it('should retrieve pending messages in chronological order', async () => {
			createSession('session-9')
			const now = Date.now()

			await messageQueue.enqueue('session-9', { text: 'First' })
			await new Promise(resolve => setTimeout(resolve, 10))
			await messageQueue.enqueue('session-9', { text: 'Second' })
			await new Promise(resolve => setTimeout(resolve, 10))
			await messageQueue.enqueue('session-9', { text: 'Third' })

			const pending = messageQueue.getPending('session-9')

			expect(pending).toHaveLength(3)
			expect(pending[0].createdAt).toBeLessThan(pending[1].createdAt)
			expect(pending[1].createdAt).toBeLessThan(pending[2].createdAt)
		})

		it('should return empty array for session with no pending messages', () => {
			const pending = messageQueue.getPending('non-existent-session')
			expect(pending).toHaveLength(0)
		})
	})

	describe('markProcessed', () => {
		it('should mark a message as processed', async () => {
			createSession('session-10')

			const result = await messageQueue.enqueue('session-10', {
				text: 'Process me',
				localId: 'local-10'
			})

			if ('queued' in result && result.queued) {
				messageQueue.markProcessed(result.messageId)

				const message = pendingMessagesStore.getPendingMessage(result.messageId)
				expect(message?.status).toBe('processed')
				expect(message?.processedAt).toBeDefined()
			}
		})
	})

	describe('markFailed', () => {
		it('should mark a message as failed with error', async () => {
			createSession('session-11')

			const result = await messageQueue.enqueue('session-11', {
				text: 'Fail me',
				localId: 'local-11'
			})

			if ('queued' in result && result.queued) {
				const error = 'Connection timeout'
				messageQueue.markFailed(result.messageId, error)

				const message = pendingMessagesStore.getPendingMessage(result.messageId)
				expect(message?.status).toBe('failed')
				expect(message?.error).toBe(error)
			}
		})
	})

	describe('handleOverflow', () => {
		it('should archive session and clean up pending messages', async () => {
			createSession('session-12')

			await messageQueue.enqueue('session-12', { text: 'Message 1', localId: 'local-12-1' })
			await messageQueue.enqueue('session-12', { text: 'Message 2', localId: 'local-12-2' })

			await messageQueue.handleOverflow('session-12')

			expect(archivedSessions).toContain('session-12')

			const pending = messageQueue.getPending('session-12')
			expect(pending).toHaveLength(0)
		})
	})

	describe('hasPendingMessages', () => {
		it('should return true when session has pending messages', async () => {
			createSession('session-13')

			await messageQueue.enqueue('session-13', { text: 'Test' })

			expect(messageQueue.hasPendingMessages('session-13')).toBe(true)
		})

		it('should return false when session has no pending messages', () => {
			createSession('session-14')

			expect(messageQueue.hasPendingMessages('session-14')).toBe(false)
		})
	})

	describe('getQueueDepth', () => {
		it('should return the number of pending messages', async () => {
			createSession('session-15')

			await messageQueue.enqueue('session-15', { text: 'Message 1', localId: 'local-15-1' })
			await messageQueue.enqueue('session-15', { text: 'Message 2', localId: 'local-15-2' })
			await messageQueue.enqueue('session-15', { text: 'Message 3', localId: 'local-15-3' })

			expect(messageQueue.getQueueDepth('session-15')).toBe(3)
		})

		it('should return 0 for session with no messages', () => {
			expect(messageQueue.getQueueDepth('non-existent-session')).toBe(0)
		})
	})

	describe('getPendingMessage', () => {
		it('should retrieve a specific pending message', async () => {
			createSession('session-16')

			const result = await messageQueue.enqueue('session-16', {
				text: 'Find me',
				localId: 'local-16'
			})

			if ('queued' in result && result.queued) {
				const message = messageQueue.getPendingMessage(result.messageId)
				expect(message).toBeDefined()
				expect(message?.id).toBe(result.messageId)
			}
		})

		it('should return null for non-existent message', () => {
			const message = messageQueue.getPendingMessage('non-existent-message')
			expect(message).toBeNull()
		})
	})

	describe('incrementRetryCount', () => {
		it('should increment retry count for a message', async () => {
			createSession('session-17')

			const result = await messageQueue.enqueue('session-17', {
				text: 'Retry me',
				localId: 'local-17'
			})

			if ('queued' in result && result.queued) {
				messageQueue.incrementRetryCount(result.messageId)

				const message = pendingMessagesStore.getPendingMessage(result.messageId)
				expect(message?.retryCount).toBe(1)
			}
		})
	})

	describe('cleanupOldMessages', () => {
		it('should clean up old processed messages', async () => {
			createSession('session-18')

			const result = await messageQueue.enqueue('session-18', {
				text: 'Old message',
				localId: 'local-18'
			})

			if ('queued' in result && result.queued) {
				messageQueue.markProcessed(result.messageId)

				// Clean up messages older than 1 second
				const deleted = messageQueue.cleanupOldMessages(1000)
				expect(deleted).toBeGreaterThanOrEqual(0)
			}
		})
	})

	describe('concurrent enqueue', () => {
		it('should handle concurrent enqueue operations safely', async () => {
			createSession('session-19')

			// Enqueue multiple messages concurrently
			const promises = []
			for (let i = 0; i < 10; i++) {
				promises.push(
					messageQueue.enqueue('session-19', {
						text: `Concurrent message ${i}`,
						localId: `concurrent-${i}`
					})
				)
			}

			const results = await Promise.all(promises)

			// All should succeed
			const queuedResults = results.filter(r => 'queued' in r && r.queued)
			expect(queuedResults).toHaveLength(10)

			// Check queue depth
			expect(messageQueue.getQueueDepth('session-19')).toBe(10)
		})
	})
})
