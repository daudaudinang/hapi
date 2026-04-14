/**
 * Simplified Integration Tests for Auto-Resume Feature
 *
 * Focuses on testing the actual functionality and behavior rather than
 * implementation details like database deletion.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { Database } from 'bun:sqlite'
import { AutoResumeOrchestrator } from '../src/resume/autoResumeOrchestrator'
import { MessageQueue } from '../src/queue/messageQueue'
import { PendingMessagesStore } from '../src/store/pendingMessages'
import { MIGRATIONS } from '../src/store/migrations'

describe('Auto-Resume Integration Tests (Simplified)', () => {
    let db: Database
    let orchestrator: AutoResumeOrchestrator
    let messageQueue: MessageQueue
    let pendingMessages: PendingMessagesStore
    let mockResumeSessionImpl: any
    let mockGetSessionImpl: any
    let mockArchiveSessionImpl: any
    let archiveCallbackInvoked: boolean = false
    let archiveCallbackSessionId: string | null = null

    beforeEach(async () => {
        // Create in-memory database
        db = new Database(':memory:')

        // Create sessions table
        db.exec(`
            CREATE TABLE sessions (
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
                seq INTEGER DEFAULT 0,
                resume_attempts INTEGER DEFAULT 0
            );
        `)

        // Run migrations for pending_messages table
        for (const migration of MIGRATIONS) {
            await migration.up(db)
        }

        // Initialize stores
        pendingMessages = new PendingMessagesStore(db)

        // Create message queue with archive callback tracking
        archiveCallbackInvoked = false
        archiveCallbackSessionId = null

        messageQueue = new MessageQueue(
            pendingMessages,
            async (sessionId: string) => {
                archiveCallbackInvoked = true
                archiveCallbackSessionId = sessionId
                // Simulate actual archive by deleting session
                db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId)
            }
        )

        // Mock dependencies
        mockResumeSessionImpl = async (sessionId: string, namespace: string) => {
            return { type: 'success', sessionId }
        }

        mockGetSessionImpl = (sessionId: string) => {
            const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any
            if (!row) return null
            return {
                id: row.id,
                active: row.active === 1,
                namespace: row.namespace,
                metadata: row.metadata ? JSON.parse(row.metadata) : null
            }
        }

        mockArchiveSessionImpl = async (sessionId: string) => {
            // Simulate archive by deleting session
            db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId)
        }

        // Create orchestrator
        orchestrator = new AutoResumeOrchestrator(
            db,
            messageQueue,
            pendingMessages,
            (...args: any[]) => mockResumeSessionImpl(...args),
            (...args: any[]) => mockGetSessionImpl(...args),
            (...args: any[]) => mockArchiveSessionImpl(...args)
        )
    })

    afterEach(() => {
        db.close()
    })

    describe('Happy Path', () => {
        it('should successfully complete auto-resume flow', async () => {
            const sessionId = 'test-session'
            const namespace = 'default'

            // Create inactive session
            db.prepare(`
                INSERT INTO sessions (id, tag, namespace, created_at, updated_at, active, metadata, resume_attempts)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                sessionId,
                'test',
                namespace,
                Date.now(),
                Date.now(),
                0,
                JSON.stringify({ path: '/test', flavor: 'claude' }),
                0
            )

            // Queue a message
            const queueResult = await messageQueue.enqueue(sessionId, {
                text: 'Hello, I want to continue our conversation',
                localId: 'msg-1'
            })
            expect(queueResult.queued).toBe(true)

            // Mock session to become active after resume
            let callCount = 0
            mockGetSessionImpl = (id: string) => {
                callCount++
                if (callCount > 2) {
                    // Make session active after a few polls
                    db.prepare('UPDATE sessions SET active = 1 WHERE id = ?').run(id)
                }
                const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as any
                if (!row) return null
                return {
                    id: row.id,
                    active: row.active === 1,
                    namespace: row.namespace,
                    metadata: row.metadata ? JSON.parse(row.metadata) : null
                }
            }

            // Trigger resume
            const resumeResult = await orchestrator.triggerResume(sessionId, namespace)

            // Verify resume success
            expect(resumeResult.status).toBe('success')
            expect(resumeResult.sessionId).toBe(sessionId)

            // Verify message was processed
            const messages = pendingMessages.getPendingMessages(sessionId)
            expect(messages).toHaveLength(0)

            // Verify attempts were reset
            const row = db.prepare('SELECT resume_attempts FROM sessions WHERE id = ?').get(sessionId) as { resume_attempts: number }
            expect(row.resume_attempts).toBe(0)
        })

        it('should handle multiple queued messages', async () => {
            const sessionId = 'multi-message-session'
            const namespace = 'default'

            // Create inactive session
            db.prepare(`
                INSERT INTO sessions (id, tag, namespace, created_at, updated_at, active, metadata, resume_attempts)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                sessionId,
                'test',
                namespace,
                Date.now(),
                Date.now(),
                0,
                JSON.stringify({ path: '/test', flavor: 'claude' }),
                0
            )

            // Queue multiple messages
            for (let i = 1; i <= 5; i++) {
                const result = await messageQueue.enqueue(sessionId, {
                    text: `Message ${i}`,
                    localId: `msg-${i}`
                })
                expect(result.queued).toBe(true)
            }

            // Mock session to become active
            let callCount = 0
            mockGetSessionImpl = (id: string) => {
                callCount++
                if (callCount > 2) {
                    db.prepare('UPDATE sessions SET active = 1 WHERE id = ?').run(id)
                }
                const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as any
                if (!row) return null
                return {
                    id: row.id,
                    active: row.active === 1,
                    namespace: row.namespace,
                    metadata: row.metadata ? JSON.parse(row.metadata) : null
                }
            }

            const resumeResult = await orchestrator.triggerResume(sessionId, namespace)

            expect(resumeResult.status).toBe('success')

            // All messages should be processed
            const pending = pendingMessages.getPendingMessages(sessionId)
            expect(pending).toHaveLength(0)
        })
    })

    describe('Failure Scenarios', () => {
        it('should handle resume failure and increment attempts', async () => {
            const sessionId = 'fail-session'
            const namespace = 'default'

            // Create inactive session
            db.prepare(`
                INSERT INTO sessions (id, tag, namespace, created_at, updated_at, active, metadata, resume_attempts)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                sessionId,
                'test',
                namespace,
                Date.now(),
                Date.now(),
                0,
                JSON.stringify({ path: '/test', flavor: 'claude' }),
                0
            )

            // Queue a message
            await messageQueue.enqueue(sessionId, { text: 'Test message', localId: 'msg-1' })

            // Mock resume to fail
            mockResumeSessionImpl = async () => ({
                type: 'error' as const,
                sessionId: sessionId,
                message: 'No machine online',
                code: 'no_machine_online'
            })

            const result = await orchestrator.triggerResume(sessionId, namespace)

            expect(result.status).toBe('failed')
            expect(result.reason).toBe('No machine online')

            // Verify attempts incremented
            const row = db.prepare('SELECT resume_attempts FROM sessions WHERE id = ?').get(sessionId) as { resume_attempts: number }
            expect(row.resume_attempts).toBe(1)

            // Verify message marked as failed
            const failedMessages = pendingMessages.getPendingMessages(sessionId)
            expect(failedMessages).toHaveLength(0) // All marked as failed

            const allMessages = db.prepare(`
                SELECT * FROM pending_messages WHERE session_id = ? AND status = 'failed'
            `).all(sessionId) as any[]
            expect(allMessages).toHaveLength(1)
        })

        it('should archive after max resume attempts', async () => {
            const sessionId = 'max-attempts-session'
            const namespace = 'default'

            // Create inactive session with 3 attempts (max)
            db.prepare(`
                INSERT INTO sessions (id, tag, namespace, created_at, updated_at, active, metadata, resume_attempts)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                sessionId,
                'test',
                namespace,
                Date.now(),
                Date.now(),
                0,
                JSON.stringify({ path: '/test', flavor: 'claude' }),
                3
            )

            // Queue a message
            await messageQueue.enqueue(sessionId, { text: 'Test message', localId: 'msg-1' })

            // Mock resume to fail
            mockResumeSessionImpl = async () => ({
                type: 'error' as const,
                sessionId: sessionId,
                message: 'Always fails',
                code: 'always_fails'
            })

            const result = await orchestrator.triggerResume(sessionId, namespace)

            expect(result.status).toBe('failed')

            // Verify session was archived (callback invoked)
            expect(archiveCallbackInvoked).toBe(true)
            expect(archiveCallbackSessionId).toBe(sessionId)

            // Verify session no longer exists
            const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId)
            expect(session).toBeNull()
        })
    })

    describe('Queue Overflow', () => {
        it('should handle queue overflow by archiving session', async () => {
            const sessionId = 'overflow-session'
            const namespace = 'default'

            // Create inactive session
            db.prepare(`
                INSERT INTO sessions (id, tag, namespace, created_at, updated_at, active, metadata, resume_attempts)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                sessionId,
                'test',
                namespace,
                Date.now(),
                Date.now(),
                0,
                JSON.stringify({ path: '/test', flavor: 'claude' }),
                0
            )

            // Fill queue to limit (100 messages)
            for (let i = 0; i < 100; i++) {
                const result = await messageQueue.enqueue(sessionId, {
                    text: `Message ${i}`,
                    localId: `msg-${i}`
                })
                expect(result.queued).toBe(true)
            }

            // Try to add one more message (should trigger archive)
            const overflowResult = await messageQueue.enqueue(sessionId, {
                text: 'Overflow message',
                localId: 'overflow'
            })

            expect(overflowResult.archived).toBe(true)
            expect(overflowResult.reason).toContain('Queue overflow')

            // Verify archive callback was invoked
            expect(archiveCallbackInvoked).toBe(true)
            expect(archiveCallbackSessionId).toBe(sessionId)

            // Verify queue was cleaned up
            const pending = messageQueue.getPending(sessionId)
            expect(pending).toHaveLength(0)
        })
    })

    describe('Edge Cases', () => {
        it('should handle session not found during resume', async () => {
            const sessionId = 'not-found-session'
            const namespace = 'default'

            // Don't create session - it should not exist

            // Mock getSession to return null
            mockGetSessionImpl = () => null

            const result = await orchestrator.triggerResume(sessionId, namespace)

            expect(result.status).toBe('failed')
            expect(result.reason).toContain('not found')
        })

        it('should handle already active session', async () => {
            const sessionId = 'already-active-session'
            const namespace = 'default'

            // Create active session
            db.prepare(`
                INSERT INTO sessions (id, tag, namespace, created_at, updated_at, active, metadata, resume_attempts)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                sessionId,
                'test',
                namespace,
                Date.now(),
                Date.now(),
                1,
                JSON.stringify({ path: '/test', flavor: 'claude' }),
                0
            )

            const result = await orchestrator.triggerResume(sessionId, namespace)

            expect(result.status).toBe('already_active')
            expect(result.sessionId).toBe(sessionId)
        })

        it('should handle concurrent resume deduplication', async () => {
            const sessionId = 'concurrent-session'
            const namespace = 'default'

            // Create inactive session
            db.prepare(`
                INSERT INTO sessions (id, tag, namespace, created_at, updated_at, active, metadata, resume_attempts)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                sessionId,
                'test',
                namespace,
                Date.now(),
                Date.now(),
                0,
                JSON.stringify({ path: '/test', flavor: 'claude' }),
                0
            )

            // Mock session to become active
            let callCount = 0
            mockGetSessionImpl = (id: string) => {
                callCount++
                if (callCount > 2) {
                    db.prepare('UPDATE sessions SET active = 1 WHERE id = ?').run(id)
                }
                const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as any
                if (!row) return null
                return {
                    id: row.id,
                    active: row.active === 1,
                    namespace: row.namespace,
                    metadata: row.metadata ? JSON.parse(row.metadata) : null
                }
            }

            // Trigger resume multiple times concurrently
            const resumePromises = [
                orchestrator.triggerResume(sessionId, namespace),
                orchestrator.triggerResume(sessionId, namespace),
                orchestrator.triggerResume(sessionId, namespace)
            ]

            const results = await Promise.all(resumePromises)

            // Should have at least one success, others might be already_active
            const successResults = results.filter(r => r.status === 'success')
            const alreadyActiveResults = results.filter(r => r.status === 'already_active')
            expect(successResults.length + alreadyActiveResults.length).toBeGreaterThanOrEqual(1)

            // Verify attempts were not incremented multiple times
            const row = db.prepare('SELECT resume_attempts FROM sessions WHERE id = ?').get(sessionId) as { resume_attempts: number }
            expect(row.resume_attempts).toBe(0) // Should be reset after success
        })
    })
})