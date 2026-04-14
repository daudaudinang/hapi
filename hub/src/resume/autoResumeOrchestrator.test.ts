/**
 * Unit tests for AutoResumeOrchestrator
 */

import { describe, it, expect, beforeEach } from 'bun:test'
import { Database } from 'bun:sqlite'
import { AutoResumeOrchestrator } from './autoResumeOrchestrator'

describe('AutoResumeOrchestrator', () => {
    let db: Database
    let orchestrator: AutoResumeOrchestrator
    let mockResumeSessionImpl: any
    let mockGetSessionImpl: any
    let mockArchiveSessionImpl: any
    let mockPendingMessagesImpl: any

    beforeEach(() => {
        // Create in-memory database
        db = new Database(':memory:')

        // Create sessions table with resume_attempts column
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

        // Mock dependencies - use mutable references
        mockResumeSessionImpl = async () => ({ type: 'success', sessionId: 'test-session' })
        mockGetSessionImpl = (id: string) => ({
            id: 'test-session',
            active: false,
            namespace: 'default'
        })
        mockArchiveSessionImpl = async () => {}
        mockPendingMessagesImpl = {
            getPendingMessages: () => [],
            markAsProcessed: () => {},
            markAsFailed: () => {}
        }

        // Create orchestrator with wrappers that call the mutable implementations
        orchestrator = new AutoResumeOrchestrator(
            db,
            {} as any, // mockMessageQueue
            mockPendingMessagesImpl,
            (...args: any[]) => mockResumeSessionImpl(...args),
            (...args: any[]) => mockGetSessionImpl(...args),
            (...args: any[]) => mockArchiveSessionImpl(...args)
        )
    })

    describe('triggerResume', () => {
        it('should successfully resume an inactive session', async () => {
            // Insert test session
            db.prepare(`
                INSERT INTO sessions (id, tag, namespace, created_at, updated_at, active, resume_attempts)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run('test-session', 'test', 'default', Date.now(), Date.now(), 0, 0)

            // Mock session to become active after resume
            let callCount = 0
            mockGetSessionImpl = (id: string) => {
                callCount++
                if (callCount > 2) {
                    return { id: 'test-session', active: true, namespace: 'default' }
                }
                return { id: 'test-session', active: false, namespace: 'default' }
            }

            const result = await orchestrator.triggerResume('test-session', 'default')

            expect(result.status).toBe('success')
            expect(result.sessionId).toBe('test-session')
        })

        it('should return already_active if session is already active', async () => {
            db.prepare(`
                INSERT INTO sessions (id, tag, namespace, created_at, updated_at, active, resume_attempts)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run('test-session', 'test', 'default', Date.now(), Date.now(), 1, 0)

            // Update mock to return active session
            mockGetSessionImpl = (id: string) => ({
                id: 'test-session',
                active: true,
                namespace: 'default'
            })

            const result = await orchestrator.triggerResume('test-session', 'default')

            expect(result.status).toBe('already_active')
            expect(result.sessionId).toBe('test-session')
        })

        it('should fail if session not found', async () => {
            mockGetSessionImpl = () => null as any

            const result = await orchestrator.triggerResume('nonexistent-session', 'default')

            expect(result.status).toBe('failed')
            expect(result.reason).toBe('Session not found')
            expect(result.code).toBe('session_not_found')
        })

        it('should handle resume failure from syncEngine', async () => {
            db.prepare(`
                INSERT INTO sessions (id, tag, namespace, created_at, updated_at, active, resume_attempts)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run('test-session', 'test', 'default', Date.now(), Date.now(), 0, 0)

            mockResumeSessionImpl = async () => ({
                type: 'error',
                message: 'No machine online',
                code: 'no_machine_online'
            })

            const result = await orchestrator.triggerResume('test-session', 'default')

            expect(result.status).toBe('failed')
            expect(result.reason).toBe('No machine online')
            expect(result.code).toBe('no_machine_online')
        })

        it('should increment resume attempts on failure', async () => {
            db.prepare(`
                INSERT INTO sessions (id, tag, namespace, created_at, updated_at, active, resume_attempts)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run('test-session', 'test', 'default', Date.now(), Date.now(), 0, 0)

            mockResumeSessionImpl = async () => ({
                type: 'error',
                message: 'Resume failed',
                code: 'resume_failed'
            })

            await orchestrator.triggerResume('test-session', 'default')

            const row = db.prepare('SELECT resume_attempts FROM sessions WHERE id = ?').get('test-session') as { resume_attempts: number }
            expect(row.resume_attempts).toBe(1)
        })

        it('should fail immediately if max attempts exceeded', async () => {
            db.prepare(`
                INSERT INTO sessions (id, tag, namespace, created_at, updated_at, active, resume_attempts)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run('test-session', 'test', 'default', Date.now(), Date.now(), 0, 3)

            const result = await orchestrator.triggerResume('test-session', 'default')

            expect(result.status).toBe('failed')
            expect(result.reason).toContain('Max resume attempts')
        })

        it('should reset attempts on successful resume', async () => {
            db.prepare(`
                INSERT INTO sessions (id, tag, namespace, created_at, updated_at, active, resume_attempts)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run('test-session', 'test', 'default', Date.now(), Date.now(), 0, 2)

            // Make session active after resume
            let callCount = 0
            mockGetSessionImpl = (id: string) => {
                callCount++
                if (callCount > 2) {
                    return { id: 'test-session', active: true, namespace: 'default' }
                }
                return { id: 'test-session', active: false, namespace: 'default' }
            }

            await orchestrator.triggerResume('test-session', 'default')

            const row = db.prepare('SELECT resume_attempts FROM sessions WHERE id = ?').get('test-session') as { resume_attempts: number }
            expect(row.resume_attempts).toBe(0)
        })
    })

    describe('waitForSessionActive', () => {
        it('should return true when session becomes active', async () => {
            db.prepare(`
                INSERT INTO sessions (id, tag, namespace, created_at, updated_at, active, resume_attempts)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run('test-session', 'test', 'default', Date.now(), Date.now(), 0, 0)

            let callCount = 0
            mockGetSessionImpl = (id: string) => {
                callCount++
                // Make session active after 2 calls
                return { id: 'test-session', active: callCount >= 2, namespace: 'default' }
            }

            await orchestrator.triggerResume('test-session', 'default')

            expect(callCount).toBeGreaterThanOrEqual(2)
        })

        it('should timeout after 15s', async () => {
            mockGetSessionImpl = () => ({ id: 'test-session', active: false, namespace: 'default' })

            db.prepare(`
                INSERT INTO sessions (id, tag, namespace, created_at, updated_at, active, resume_attempts)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run('test-session', 'test', 'default', Date.now(), Date.now(), 0, 0)

            const result = await orchestrator.triggerResume('test-session', 'default')

            expect(result.status).toBe('failed')
            expect(result.reason).toContain('timeout')
        }, 20000) // Increase timeout to 20s
    })

    describe('processQueuedMessages', () => {
        it('should process pending messages in order', async () => {
            const mockMessages = [
                { id: 'msg1', sessionId: 'test-session', payload: '{"text":"msg1"}', createdAt: Date.now() - 2000, processedAt: null, error: null, retryCount: 0, status: 'pending' as const },
                { id: 'msg2', sessionId: 'test-session', payload: '{"text":"msg2"}', createdAt: Date.now() - 1000, processedAt: null, error: null, retryCount: 0, status: 'pending' as const },
                { id: 'msg3', sessionId: 'test-session', payload: '{"text":"msg3"}', createdAt: Date.now(), processedAt: null, error: null, retryCount: 0, status: 'pending' as const }
            ]

            const processedOrder: string[] = []
            mockPendingMessagesImpl = {
                getPendingMessages: () => mockMessages,
                markAsProcessed: (id: string) => { processedOrder.push(id) },
                markAsFailed: () => {}
            }

            const testOrchestrator = new AutoResumeOrchestrator(
                db,
                {} as any,
                mockPendingMessagesImpl,
                (...args: any[]) => mockResumeSessionImpl(...args),
                (...args: any[]) => mockGetSessionImpl(...args),
                (...args: any[]) => mockArchiveSessionImpl(...args)
            )

            db.prepare(`
                INSERT INTO sessions (id, tag, namespace, created_at, updated_at, active, resume_attempts)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run('test-session', 'test', 'default', Date.now(), Date.now(), 1, 0)

            await testOrchestrator.processQueuedMessages('test-session')

            expect(processedOrder).toEqual(['msg1', 'msg2', 'msg3'])
        })

        it('should mark malformed messages as failed', async () => {
            const mockMessages = [
                { id: 'msg1', sessionId: 'test-session', payload: 'invalid json', createdAt: Date.now(), processedAt: null, error: null, retryCount: 0, status: 'pending' as const }
            ]

            const failedMessages: string[] = []
            mockPendingMessagesImpl = {
                getPendingMessages: () => mockMessages,
                markAsProcessed: () => {},
                markAsFailed: (id: string, error: string) => { failedMessages.push(id) }
            }

            const testOrchestrator = new AutoResumeOrchestrator(
                db,
                {} as any,
                mockPendingMessagesImpl,
                (...args: any[]) => mockResumeSessionImpl(...args),
                (...args: any[]) => mockGetSessionImpl(...args),
                (...args: any[]) => mockArchiveSessionImpl(...args)
            )

            db.prepare(`
                INSERT INTO sessions (id, tag, namespace, created_at, updated_at, active, resume_attempts)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run('test-session', 'test', 'default', Date.now(), Date.now(), 1, 0)

            await testOrchestrator.processQueuedMessages('test-session')

            expect(failedMessages).toEqual(['msg1'])
        })
    })

    describe('handleResumeFailure', () => {
        it('should mark all pending messages as failed', async () => {
            const mockMessages = [
                { id: 'msg1', sessionId: 'test-session', payload: '{"text":"msg1"}', createdAt: Date.now(), processedAt: null, error: null, retryCount: 0, status: 'pending' as const },
                { id: 'msg2', sessionId: 'test-session', payload: '{"text":"msg2"}', createdAt: Date.now(), processedAt: null, error: null, retryCount: 0, status: 'pending' as const }
            ]

            const failedMessages: string[] = []
            mockPendingMessagesImpl = {
                getPendingMessages: () => mockMessages,
                markAsProcessed: () => {},
                markAsFailed: (id: string, error: string) => { failedMessages.push(id) }
            }

            const testOrchestrator = new AutoResumeOrchestrator(
                db,
                {} as any,
                mockPendingMessagesImpl,
                (...args: any[]) => mockResumeSessionImpl(...args),
                (...args: any[]) => mockGetSessionImpl(...args),
                (...args: any[]) => mockArchiveSessionImpl(...args)
            )

            db.prepare(`
                INSERT INTO sessions (id, tag, namespace, created_at, updated_at, active, resume_attempts)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run('test-session', 'test', 'default', Date.now(), Date.now(), 0, 1)

            await testOrchestrator.handleResumeFailure('test-session', { type: 'resume_failed', reason: 'Test failure' })

            expect(failedMessages).toEqual(['msg1', 'msg2'])
        })

        it('should archive session after max attempts', async () => {
            let archived = false
            mockArchiveSessionImpl = async (sessionId: string) => {
                archived = sessionId === 'test-session'
            }

            mockPendingMessagesImpl = {
                getPendingMessages: () => [],
                markAsProcessed: () => {},
                markAsFailed: () => {}
            }

            const testOrchestrator = new AutoResumeOrchestrator(
                db,
                {} as any,
                mockPendingMessagesImpl,
                (...args: any[]) => mockResumeSessionImpl(...args),
                (...args: any[]) => mockGetSessionImpl(...args),
                (...args: any[]) => mockArchiveSessionImpl(...args)
            )

            db.prepare(`
                INSERT INTO sessions (id, tag, namespace, created_at, updated_at, active, resume_attempts)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run('test-session', 'test', 'default', Date.now(), Date.now(), 0, 3)

            await testOrchestrator.handleResumeFailure('test-session', { type: 'max_attempts_exceeded', attempts: 3 })

            expect(archived).toBe(true)
        })

        it('should not archive session if below max attempts', async () => {
            let archived = false
            mockArchiveSessionImpl = async () => { archived = true }

            mockPendingMessagesImpl = {
                getPendingMessages: () => [],
                markAsProcessed: () => {},
                markAsFailed: () => {}
            }

            const testOrchestrator = new AutoResumeOrchestrator(
                db,
                {} as any,
                mockPendingMessagesImpl,
                (...args: any[]) => mockResumeSessionImpl(...args),
                (...args: any[]) => mockGetSessionImpl(...args),
                (...args: any[]) => mockArchiveSessionImpl(...args)
            )

            db.prepare(`
                INSERT INTO sessions (id, tag, namespace, created_at, updated_at, active, resume_attempts)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run('test-session', 'test', 'default', Date.now(), Date.now(), 0, 1)

            await testOrchestrator.handleResumeFailure('test-session', { type: 'resume_failed', reason: 'Test failure' })

            expect(archived).toBe(false)
        })
    })
})
