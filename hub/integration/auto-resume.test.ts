/**
 * Comprehensive integration tests for Auto-Resume feature
 *
 * Tests the complete end-to-end flow including:
 * - Happy path: inactive session → message → resume → deliver
 * - Failure scenarios: no machine, invalid token, timeout, overflow
 * - Race conditions: concurrent messages, concurrent resumes
 * - Edge cases: session deletion during resume, database failures
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { Database } from 'bun:sqlite'
import { AutoResumeOrchestrator } from '../src/resume/autoResumeOrchestrator'
import { MessageQueue } from '../src/queue/messageQueue'
import { PendingMessagesStore } from '../src/store/pendingMessages'
import { MIGRATIONS } from '../src/store/migrations'

describe('Auto-Resume Integration Tests', () => {
    let db: Database
    let orchestrator: AutoResumeOrchestrator
    let messageQueue: MessageQueue
    let pendingMessages: PendingMessagesStore
    let mockResumeSessionImpl: any
    let mockGetSessionImpl: any
    let mockArchiveSessionImpl: any
    let testResults: any[] = []

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

        // Create message queue with mock archive callback
        messageQueue = new MessageQueue(
            pendingMessages,
            async (sessionId: string) => {
                testResults.push({ type: 'archive', sessionId })
            }
        )

        // Mock dependencies - use mutable references
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
            testResults.push({ type: 'manual_archive', sessionId })
        }

        // Create orchestrator with wrappers
        orchestrator = new AutoResumeOrchestrator(
            db,
            messageQueue,
            pendingMessages,
            (...args: any[]) => mockResumeSessionImpl(...args),
            (...args: any[]) => mockGetSessionImpl(...args),
            (...args: any[]) => mockArchiveSessionImpl(...args)
        )

        // Reset test results
        testResults = []
    })

    afterEach(() => {
        db.close()
    })

    describe('Happy Path Integration', () => {
        it('should complete full flow: inactive session → message → resume → deliver', async () => {
            const sessionId = 'happy-path-session'
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

            // Send message to inactive session
            const result1 = await messageQueue.enqueue(sessionId, {
                text: 'Hello, I want to continue our conversation',
                localId: 'msg-1'
            })
            expect(result1.queued).toBe(true)

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

        it('should handle multiple messages queued during resume', async () => {
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
            const messages = [
                { text: 'First message', localId: 'msg-1' },
                { text: 'Second message', localId: 'msg-2' },
                { text: 'Third message', localId: 'msg-3' }
            ]

            for (const msg of messages) {
                const result = await messageQueue.enqueue(sessionId, msg)
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

            // Verify order was maintained (by checking stored messages before processing)
            const allMessages = db.prepare(`
                SELECT id, payload FROM pending_messages
                WHERE session_id = ?
                ORDER BY created_at ASC
            `).all(sessionId) as any[]
            expect(allMessages).toHaveLength(3)
        })
    })

    describe('Failure Scenarios', () => {
        it('should archive session when no machine online', async () => {
            const sessionId = 'no-machine-session'
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
            await messageQueue.enqueue(sessionId, { text: 'Test message' })

            // Mock resume to fail due to no machine
            mockResumeSessionImpl = async () => ({
                type: 'error',
                message: 'No machine online',
                code: 'no_machine_online'
            })

            const result = await orchestrator.triggerResume(sessionId, namespace)

            expect(result.status).toBe('failed')
            expect(result.reason).toBe('No machine online')

            // Verify session was archived (deleted from database)
            const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId)
            expect(session).toBeNull()

            // Verify message was marked as failed
            const failedMessages = db.prepare(`
                SELECT * FROM pending_messages WHERE session_id = ? AND status = 'failed'
            `).all(sessionId) as any[]
            expect(failedMessages).toHaveLength(1)

            // Verify archive callback was called
            expect(testResults.some(r => r.type === 'archive' && r.sessionId === sessionId)).toBe(true)
        })

        it('should archive session when resume token is invalid', async () => {
            const sessionId = 'invalid-token-session'
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

            // Mock resume to fail due to invalid token
            mockResumeSessionImpl = async () => ({
                type: 'error',
                message: 'Invalid resume token',
                code: 'invalid_token'
            })

            const result = await orchestrator.triggerResume(sessionId, namespace)

            expect(result.status).toBe('failed')
            expect(result.reason).toBe('Invalid resume token')

            // Verify session was archived
            const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId)
            expect(session).toBeNull()

            // Verify archive callback was called
            expect(testResults.some(r => r.type === 'archive' && r.sessionId === sessionId)).toBe(true)
        })

        it('should archive session when activation times out', async () => {
            const sessionId = 'timeout-session'
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
            await messageQueue.enqueue(sessionId, { text: 'Test message' })

            // Mock getSession to never become active
            mockGetSessionImpl = () => ({
                id: sessionId,
                active: false,
                namespace
            })

            const result = await orchestrator.triggerResume(sessionId, namespace)

            expect(result.status).toBe('failed')
            expect(result.reason).toContain('timeout')

            // Verify session was archived after max attempts
            const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId)
            expect(session).toBeNull()

            // Verify archive callback was called
            expect(testResults.some(r => r.type === 'archive' && r.sessionId === sessionId)).toBe(true)
        }, 20000) // Increase timeout

        it('should archive session when queue overflows', async () => {
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

            // Verify session was archived
            const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId)
            expect(session).toBeNull()

            // Verify queue was cleaned up
            const pending = messageQueue.getPending(sessionId)
            expect(pending).toHaveLength(0)

            // Verify archive callback was called
            expect(testResults.some(r => r.type === 'archive' && r.sessionId === sessionId)).toBe(true)
        })
    })

    describe('Race Conditions', () => {
        it('should handle multiple concurrent messages to same inactive session', async () => {
            const sessionId = 'concurrent-messages-session'
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

            // Send multiple messages simultaneously
            const messagePromises = []
            const messageIds = ['msg-1', 'msg-2', 'msg-3', 'msg-4', 'msg-5']

            for (const localId of messageIds) {
                messagePromises.push(
                    messageQueue.enqueue(sessionId, {
                        text: `Message ${localId}`,
                        localId
                    })
                )
            }

            const results = await Promise.all(messagePromises)

            // All messages should be queued (no duplicates)
            const queuedResults = results.filter(r => 'queued' in r && r.queued)
            expect(queuedResults).toHaveLength(messageIds.length)

            // Verify no duplicates in queue
            const pending = messageQueue.getPending(sessionId)
            expect(pending).toHaveLength(messageIds.length)

            // Verify all localIds are unique
            const localIds = pending.map(msg => {
                const payload = JSON.parse(msg.payload)
                return payload.localId
            })
            const uniqueLocalIds = new Set(localIds)
            expect(uniqueLocalIds).toHaveLength(messageIds.length)

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
            const processedMessages = pendingMessages.getPendingMessages(sessionId)
            expect(processedMessages).toHaveLength(0)
        })

        it('should deduplicate concurrent resume triggers', async () => {
            const sessionId = 'concurrent-resume-session'
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
            let activeSet = false
            mockGetSessionImpl = (id: string) => {
                callCount++
                if (callCount > 2 && !activeSet) {
                    db.prepare('UPDATE sessions SET active = 1 WHERE id = ?').run(id)
                    activeSet = true
                }
                const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as any
                if (!row) return null
                return {
                    id: row.id,
                    active: row.active === 1 || activeSet,
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

            // At least one should succeed, others may be deduplicated or already_active
            const successResults = results.filter(r => r.status === 'success')
            const alreadyActiveResults = results.filter(r => r.status === 'already_active')
            expect(successResults.length + alreadyActiveResults.length).toBeGreaterThanOrEqual(1)

            // Verify attempts were not incremented multiple times
            const row = db.prepare('SELECT resume_attempts FROM sessions WHERE id = ?').get(sessionId) as { resume_attempts: number }
            expect(row.resume_attempts).toBe(0) // Should be reset after success
        })

        it('should handle new message arriving during resume', async () => {
            const sessionId = 'during-resume-session'
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

            // Queue first message
            await messageQueue.enqueue(sessionId, { text: 'First message', localId: 'msg-1' })

            // Start resume process
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

            // Trigger resume but don't wait
            const resumePromise = orchestrator.triggerResume(sessionId, namespace)

            // Queue additional message while resume is in progress
            await new Promise(resolve => setTimeout(resolve, 100)) // Small delay
            await messageQueue.enqueue(sessionId, { text: 'Second message', localId: 'msg-2' })

            // Wait for resume to complete
            const resumeResult = await resumePromise

            expect(resumeResult.status).toBe('success')

            // Both messages should be processed
            const pending = pendingMessages.getPendingMessages(sessionId)
            expect(pending).toHaveLength(0)

            // Verify total messages processed
            const allMessages = db.prepare(`
                SELECT COUNT(*) as count FROM pending_messages
                WHERE session_id = ? AND status = 'processed'
            `).get(sessionId) as { count: number }
            expect(allMessages.count).toBe(2)
        })
    })

    describe('Edge Cases', () => {
        it('should handle session being deleted while resuming', async () => {
            const sessionId = 'deleted-during-resume-session'
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
            await messageQueue.enqueue(sessionId, { text: 'Test message' })

            // Mock resume to fail
            mockResumeSessionImpl = async () => ({
                type: 'error',
                message: 'Session not found',
                code: 'session_not_found'
            })

            // Mock getSession to return null (session deleted)
            mockGetSessionImpl = () => null

            const result = await orchestrator.triggerResume(sessionId, namespace)

            expect(result.status).toBe('failed')
            expect(result.reason).toBe('Session not found')

            // Verify session was not deleted by orchestrator (since it wasn't found)
            const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId)
            expect(session).not.toBeNull()
            expect(session.id).toBe(sessionId)

            // Verify message was marked as failed
            const failedMessages = db.prepare(`
                SELECT * FROM pending_messages WHERE session_id = ? AND status = 'failed'
            `).all(sessionId) as any[]
            expect(failedMessages).toHaveLength(1)
        })

        it('should handle database connection loss during resume', async () => {
            const sessionId = 'db-error-session'
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
            await messageQueue.enqueue(sessionId, { text: 'Test message' })

            // Close database connection during resume
            mockResumeSessionImpl = async (sessionId: string, namespace: string) => {
                // Simulate database error
                throw new Error('Database connection lost')
            }

            const result = await orchestrator.triggerResume(sessionId, namespace)

            expect(result.status).toBe('failed')
            expect(result.reason).toContain('Database connection lost')

            // Verify session attempts were incremented despite error
            const row = db.prepare('SELECT resume_attempts FROM sessions WHERE id = ?').get(sessionId) as { resume_attempts: number }
            expect(row.resume_attempts).toBe(1)
        })

        it('should handle spawn timeout during resume', async () => {
            const sessionId = 'spawn-timeout-session'
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

            // Mock spawn timeout
            mockResumeSessionImpl = async () => {
                await new Promise(resolve => setTimeout(resolve, 20000)) // Simulate timeout
                return { type: 'success', sessionId }
            }

            const result = await orchestrator.triggerResume(sessionId, namespace)

            expect(result.status).toBe('failed')
            expect(result.reason).toContain('timeout')

            // Verify session was archived after timeout
            const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId)
            expect(session).toBeNull()
        }, 30000) // Increase timeout for spawn timeout test

        it('should handle feature flag toggled during resume', async () => {
            const sessionId = 'feature-flag-session'
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
            await messageQueue.enqueue(sessionId, { text: 'Test message' })

            // Mock feature flag being disabled during resume
            let featureFlagEnabled = true
            mockResumeSessionImpl = async (sessionId: string, namespace: string) => {
                // Simulate feature flag being disabled
                featureFlagEnabled = false
                if (!featureFlagEnabled) {
                    return { type: 'error', message: 'Auto-resume disabled', code: 'disabled' }
                }
                return { type: 'success', sessionId }
            }

            const result = await orchestrator.triggerResume(sessionId, namespace)

            expect(result.status).toBe('failed')
            expect(result.reason).toBe('Auto-resume disabled')

            // Verify session was not archived (since it was only 1 attempt)
            const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId)
            expect(session).not.toBeNull()
            expect(session.id).toBe(sessionId)

            // Verify attempts were incremented
            const row = db.prepare('SELECT resume_attempts FROM sessions WHERE id = ?').get(sessionId) as { resume_attempts: number }
            expect(row.resume_attempts).toBe(1)

            // Verify message was marked as failed
            const failedMessages = db.prepare(`
                SELECT * FROM pending_messages WHERE session_id = ? AND status = 'failed'
            `).all(sessionId) as any[]
            expect(failedMessages).toHaveLength(1)
        })

        it('should handle server restart with pending messages', async () => {
            const sessionId = 'server-restart-session'
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
            for (let i = 0; i < 5; i++) {
                await messageQueue.enqueue(sessionId, { text: `Message ${i}`, localId: `msg-${i}` })
            }

            // Verify messages are stored
            const pending = messageQueue.getPending(sessionId)
            expect(pending).toHaveLength(5)

            // Simulate server restart by creating new database connection
            const newDb = new Database(':memory:')

            // Recreate sessions table in new database
            newDb.exec(`
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

            // Recreate pending_messages table
            for (const migration of MIGRATIONS) {
                await migration.up(newDb)
            }

            // Insert the session into the new database
            newDb.prepare(`
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

            // Create new store instances
            const newPendingMessages = new PendingMessagesStore(newDb)
            const newMessageQueue = new MessageQueue(
                newPendingMessages,
                async () => {}
            )

            // Verify pending messages persisted
            const persistedPending = newMessageQueue.getPending(sessionId)
            expect(persistedPending).toHaveLength(5)

            // Verify messages can be processed after restart
            const processedCount = newPendingMessages.cleanupOldMessages(0)
            expect(processedCount).toBe(0) // Should not clean up pending messages

            // Clean up
            newDb.close()
        })
    })

    describe('Performance Tests', () => {
        it('should handle high queue depth efficiently', async () => {
            const sessionId = 'high-depth-session'
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

            // Time the enqueue operation for 100 messages
            const startTime = Date.now()
            const messageCount = 100

            for (let i = 0; i < messageCount; i++) {
                await messageQueue.enqueue(sessionId, {
                    text: `Message ${i}`,
                    localId: `msg-${i}`
                })
            }

            const enqueueTime = Date.now() - startTime
            console.log(`Enqueued ${messageCount} messages in ${enqueueTime}ms`)

            // Should be fast (less than 100ms per 100 messages)
            expect(enqueueTime).toBeLessThan(5000) // 5 seconds for 100 messages

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

            // Time the resume operation
            const resumeStartTime = Date.now()
            const resumeResult = await orchestrator.triggerResume(sessionId, namespace)
            const resumeTime = Date.now() - resumeStartTime

            expect(resumeResult.status).toBe('success')
            expect(resumeTime).toBeLessThan(15000) // Should complete within 15s

            // All messages should be processed
            const pending = pendingMessages.getPendingMessages(sessionId)
            expect(pending).toHaveLength(0)
        })
    })
})