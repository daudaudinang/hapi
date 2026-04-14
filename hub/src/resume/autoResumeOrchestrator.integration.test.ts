/**
 * Integration tests for AutoResumeOrchestrator
 *
 * Tests the complete flow:
 * - Success path: resume → active → process messages
 * - Timeout path: resume → timeout → increment attempts
 * - Failure path: resume → fail → archive after max attempts
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { Database } from 'bun:sqlite'
import { AutoResumeOrchestrator } from './autoResumeOrchestrator'
import { MessageQueue } from '../queue/messageQueue'
import { PendingMessagesStore } from '../store/pendingMessages'
import { MIGRATIONS } from '../store/migrations'

describe('AutoResumeOrchestrator Integration Tests', () => {
    let db: Database
    let orchestrator: AutoResumeOrchestrator
    let messageQueue: MessageQueue
    let pendingMessages: PendingMessagesStore
    let mockResumeSessionImpl: any
    let mockGetSessionImpl: any
    let mockArchiveSessionImpl: any

    beforeEach(async () => {
        // Create in-memory database
        db = new Database(':memory:')

        // Create sessions table manually (migrations don't create it, it already exists in prod)
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
            async () => {} // Mock archive callback
        )

        // Mock dependencies - use mutable references
        mockResumeSessionImpl = async (sessionId: string, namespace: string) => {
            // Simulate successful resume
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

        // Create orchestrator with wrappers
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

    describe('Success Path', () => {
        it('should complete full resume flow and process messages', async () => {
            // Create inactive session
            const sessionId = 'test-session-success'
            const namespace = 'default'

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

            // Queue some messages
            const result1 = await messageQueue.enqueue(sessionId, {
                text: 'Message 1',
                localId: 'local-1'
            })
            expect(result1.queued).toBe(true)

            const result2 = await messageQueue.enqueue(sessionId, {
                text: 'Message 2',
                localId: 'local-2'
            })
            expect(result2.queued).toBe(true)

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

            const resumeResult = await orchestrator.triggerResume(sessionId, namespace)

            // Verify resume success
            expect(resumeResult.status).toBe('success')
            expect(resumeResult.sessionId).toBe(sessionId)

            // Verify messages were processed
            const messages = pendingMessages.getPendingMessages(sessionId)
            expect(messages).toHaveLength(0)

            // Verify attempts were reset
            const row = db.prepare('SELECT resume_attempts FROM sessions WHERE id = ?').get(sessionId) as { resume_attempts: number }
            expect(row.resume_attempts).toBe(0)
        })

        it('should handle already-active session', async () => {
            const sessionId = 'test-session-already-active'
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
                JSON.stringify({ path: '/test' }),
                0
            )

            const result = await orchestrator.triggerResume(sessionId, namespace)

            expect(result.status).toBe('already_active')
            expect(result.sessionId).toBe(sessionId)
        })
    })

    describe('Timeout Path', () => {
        it('should timeout and increment attempts', async () => {
            const sessionId = 'test-session-timeout'
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

            // Mock getSession to never become active
            mockGetSessionImpl = () => ({
                id: sessionId,
                active: false,
                namespace
            })

            const result = await orchestrator.triggerResume(sessionId, namespace)

            expect(result.status).toBe('failed')
            expect(result.reason).toContain('timeout')

            // Verify attempts incremented
            const row = db.prepare('SELECT resume_attempts FROM sessions WHERE id = ?').get(sessionId) as { resume_attempts: number }
            expect(row.resume_attempts).toBe(1)

            // Verify messages marked as failed
            const messages = pendingMessages.getPendingMessages(sessionId)
            expect(messages).toHaveLength(0) // All marked as failed
        }, 20000) // Increase timeout to 20s

        it('should archive after 3 timeout attempts', async () => {
            const sessionId = 'test-session-max-timeouts'
            const namespace = 'default'

            // Create inactive session with 2 attempts
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
                2
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

            // Verify session was archived
            const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId)
            expect(session).toBeNull()
        }, 20000) // Increase timeout to 20s
    })

    describe('Failure Path', () => {
        it('should handle resume failure and increment attempts', async () => {
            const sessionId = 'test-session-resume-fail'
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

            // Mock resumeSession to fail
            mockResumeSessionImpl = async () => ({
                type: 'error',
                message: 'No machine online',
                code: 'no_machine_online'
            })

            const result = await orchestrator.triggerResume(sessionId, namespace)

            expect(result.status).toBe('failed')
            expect(result.reason).toBe('No machine online')
            expect(result.code).toBe('no_machine_online')

            // Verify attempts incremented
            const row = db.prepare('SELECT resume_attempts FROM sessions WHERE id = ?').get(sessionId) as { resume_attempts: number }
            expect(row.resume_attempts).toBe(1)
        })

        it('should archive after 3 failed attempts', async () => {
            const sessionId = 'test-session-max-failures'
            const namespace = 'default'

            // Create inactive session with 2 attempts
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
                2
            )

            // Mock resumeSession to fail
            mockResumeSessionImpl = async () => ({
                type: 'error',
                message: 'Resume failed',
                code: 'resume_failed'
            })

            const result = await orchestrator.triggerResume(sessionId, namespace)

            expect(result.status).toBe('failed')

            // Verify session was archived
            const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId)
            expect(session).toBeNull()
        })

        it('should fail immediately if already at max attempts', async () => {
            const sessionId = 'test-session-already-max'
            const namespace = 'default'

            // Create inactive session with 3 attempts
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

            const result = await orchestrator.triggerResume(sessionId, namespace)

            expect(result.status).toBe('failed')
            expect(result.reason).toContain('Max resume attempts')

            // Verify session was archived
            const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId)
            expect(session).toBeNull()
        })
    })

    describe('Message Processing', () => {
        it('should process messages in order after resume', async () => {
            const sessionId = 'test-message-order'
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

            // Queue messages with specific order
            await messageQueue.enqueue(sessionId, { text: 'First', localId: '1' })
            await new Promise(resolve => setTimeout(resolve, 10)) // Small delay
            await messageQueue.enqueue(sessionId, { text: 'Second', localId: '2' })
            await new Promise(resolve => setTimeout(resolve, 10))
            await messageQueue.enqueue(sessionId, { text: 'Third', localId: '3' })

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

            const result = await orchestrator.triggerResume(sessionId, namespace)

            expect(result.status).toBe('success')

            // All messages should be processed
            const messages = pendingMessages.getPendingMessages(sessionId)
            expect(messages).toHaveLength(0)
        })
    })
})
