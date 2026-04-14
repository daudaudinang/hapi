/**
 * Tests for guard modifications (AUTO_RESUME_INACTIVE_SESSIONS)
 *
 * Tests:
 * - Backward compatibility: requireActive still works
 * - Auto-resume with feature flag enabled: 202 response + queued
 * - Auto-resume with feature flag disabled: 409 response
 * - Active session: no change in behavior
 * - Missing message payload: 400 error
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Hono } from 'hono'
import type { SyncEngine, Session } from '../../sync/syncEngine'
import type { EnqueueResult } from '../../queue/messageQueue'
import { requireSession, requireSessionFromParam } from './guards'
import type { WebAppEnv } from '../middleware/auth'

// Mock SyncEngine methods
const mockResolveSessionAccess = vi.fn()
const mockEnqueueMessage = vi.fn()
const mockTriggerResume = vi.fn()

const mockSyncEngine = {
	resolveSessionAccess: mockResolveSessionAccess,
	enqueueMessage: mockEnqueueMessage,
	triggerResume: mockTriggerResume
} as unknown as SyncEngine

// Mock Session
const mockActiveSession: Session = {
	id: 'active-session-id',
	namespace: 'test-namespace',
	active: true,
	createdAt: Date.now(),
	updatedAt: Date.now(),
	lastActiveAt: Date.now(),
	status: 'active',
	metadata: {
		path: '/test/path',
		flavor: 'claude',
		claudeSessionId: 'claude-session-123'
	}
}

const mockInactiveSession: Session = {
	...mockActiveSession,
	id: 'inactive-session-id',
	active: false,
	status: 'inactive'
}

// Mock context
function createMockContext(features?: { autoResume?: boolean }) {
	const mockContext = {
		get: vi.fn((key: string) => {
			if (key === 'namespace') return 'test-namespace'
			if (key === 'features') return features ?? { autoResume: false }
			return undefined
		}),
		req: {
			param: vi.fn((name: string) => {
				if (name === 'id') return 'test-session-id'
				return undefined
			})
		},
		json: vi.fn((data: any, status?: number) => {
			// Return a proper Response object
			return new Response(JSON.stringify(data), {
				status: status ?? 200,
				headers: { 'Content-Type': 'application/json' }
			})
		})
	} as unknown as Hono<WebAppEnv>

	return mockContext
}

describe('requireSession - Auto-Resume Feature', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe('Backward Compatibility', () => {
		it('should return 409 for inactive session with requireActive: true (existing behavior)', async () => {
			const c = createMockContext()
			mockResolveSessionAccess.mockReturnValue({
				ok: true,
				sessionId: 'test-session-id',
				session: mockInactiveSession
			})

			const result = requireSession(c, mockSyncEngine, 'test-session-id', {
				requireActive: true
			})

			expect(result).toBeInstanceOf(Response)
			expect(result.status).toBe(409)
			const resultData = await result.json()
			expect(resultData).toEqual({ error: 'Session is inactive' })
		})

		it('should return session object for inactive session without requireActive (default behavior - allows inactive)', () => {
			const c = createMockContext({ autoResume: false })
			mockResolveSessionAccess.mockReturnValue({
				ok: true,
				sessionId: 'test-session-id',
				session: mockInactiveSession
			})

			const result = requireSession(c, mockSyncEngine, 'test-session-id')

			// Default behavior: allow inactive sessions through
			expect(result).not.toBeInstanceOf(Response)
			if (result !== null && typeof result === 'object' && !('ok' in result)) {
				expect(result.session).toEqual(mockInactiveSession)
				expect(result.sessionId).toBe('test-session-id')
			} else {
				throw new Error('Expected session object')
			}
		})

		it('should return session object for active session (no change)', () => {
			const c = createMockContext()
			mockResolveSessionAccess.mockReturnValue({
				ok: true,
				sessionId: 'test-session-id',
				session: mockActiveSession
			})

			const result = requireSession(c, mockSyncEngine, 'test-session-id')

			expect(result).not.toBeInstanceOf(Response)
			if (result !== null && typeof result === 'object' && !('ok' in result)) {
				expect(result.session).toEqual(mockActiveSession)
				expect(result.sessionId).toBe('test-session-id')
			} else {
				throw new Error('Expected session object')
			}
		})
	})

	describe('Auto-Resume with Feature Flag Enabled', () => {
		it('should return 202 with queued message when autoResume enabled and session inactive', async () => {
			const c = createMockContext({ autoResume: true })
			mockResolveSessionAccess.mockReturnValue({
				ok: true,
				sessionId: 'test-session-id',
				session: mockInactiveSession
			})

			const mockEnqueueResult: EnqueueResult = {
				queued: true,
				messageId: 'pending-msg-123',
				queueDepth: 1
			}
			mockEnqueueMessage.mockReturnValue(mockEnqueueResult)
			mockTriggerResume.mockResolvedValue(undefined)

			const messagePayload = {
				text: 'Test message',
				localId: 'local-123',
				attachments: [],
				sentFrom: 'webapp' as const
			}

			const result = requireSession(c, mockSyncEngine, 'test-session-id', {
				autoResume: true,
				messagePayload
			})

			expect(result).toBeInstanceOf(Response)
			expect(result.status).toBe(202)
			const resultData = await result.json()
			expect(resultData).toMatchObject({
				queued: true,
				resuming: true,
				sessionId: 'test-session-id',
				message: 'Message queued, session is resuming...',
				enqueueResult: mockEnqueueResult
			})

			expect(mockEnqueueMessage).toHaveBeenCalledWith('test-session-id', messagePayload)
			expect(mockTriggerResume).toHaveBeenCalledWith('test-session-id', 'test-namespace')
		})

		it('should return 400 when autoResume enabled but no message payload provided', async () => {
			const c = createMockContext({ autoResume: true })
			mockResolveSessionAccess.mockReturnValue({
				ok: true,
				sessionId: 'test-session-id',
				session: mockInactiveSession
			})

			const result = requireSession(c, mockSyncEngine, 'test-session-id', {
				autoResume: true
			})

			expect(result).toBeInstanceOf(Response)
			expect(result.status).toBe(400)
			const resultData = await result.json()
			expect(resultData).toEqual({
				error: 'Session is inactive and no message payload provided for queuing'
			})

			expect(mockEnqueueMessage).not.toHaveBeenCalled()
			expect(mockTriggerResume).not.toHaveBeenCalled()
		})
	})

	describe('Auto-Resume with Feature Flag Disabled', () => {
		it('should ignore autoResume when feature flag disabled and allow inactive session through', () => {
			const c = createMockContext({ autoResume: false })
			mockResolveSessionAccess.mockReturnValue({
				ok: true,
				sessionId: 'test-session-id',
				session: mockInactiveSession
			})

			const result = requireSession(c, mockSyncEngine, 'test-session-id', {
				autoResume: true,
				messagePayload: {
					text: 'Test',
					sentFrom: 'webapp' as const
				}
			})

			// When feature flag is disabled, autoResume is ignored
			// and the session is allowed through (backward compatible)
			expect(result).not.toBeInstanceOf(Response)
			if (result !== null && typeof result === 'object' && !('ok' in result)) {
				expect(result.session).toEqual(mockInactiveSession)
				expect(result.sessionId).toBe('test-session-id')
			} else {
				throw new Error('Expected session object')
			}

			expect(mockEnqueueMessage).not.toHaveBeenCalled()
			expect(mockTriggerResume).not.toHaveBeenCalled()
		})
	})

	describe('Access Control', () => {
		it('should return 403 for access-denied', async () => {
			const c = createMockContext()
			mockResolveSessionAccess.mockReturnValue({
				ok: false,
				reason: 'access-denied'
			})

			const result = requireSession(c, mockSyncEngine, 'test-session-id')

			expect(result).toBeInstanceOf(Response)
			expect(result.status).toBe(403)
			const resultData = await result.json()
			expect(resultData).toEqual({ error: 'Session access denied' })
		})

		it('should return 404 for session not found', async () => {
			const c = createMockContext()
			mockResolveSessionAccess.mockReturnValue({
				ok: false,
				reason: 'not-found'
			})

			const result = requireSession(c, mockSyncEngine, 'test-session-id')

			expect(result).toBeInstanceOf(Response)
			expect(result.status).toBe(404)
			const resultData = await result.json()
			expect(resultData).toEqual({ error: 'Session not found' })
		})
	})
})

describe('requireSessionFromParam - Auto-Resume Feature', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('should extract session ID from param and call requireSession', () => {
		const c = createMockContext({ autoResume: true })
		mockResolveSessionAccess.mockReturnValue({
			ok: true,
			sessionId: 'test-session-id',
			session: mockActiveSession
		})

		const result = requireSessionFromParam(c, mockSyncEngine)

		expect(result).not.toBeInstanceOf(Response)
		if (result !== null && typeof result === 'object' && !('ok' in result)) {
			expect(result.sessionId).toBe('test-session-id')
			expect(result.session).toEqual(mockActiveSession)
		}
	})

	it('should support custom paramName', () => {
		const c = createMockContext()
		;(c.req.param as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
			if (name === 'customId') return 'custom-session-id'
			return undefined
		})

		mockResolveSessionAccess.mockReturnValue({
			ok: true,
			sessionId: 'custom-session-id',
			session: mockActiveSession
		})

		const result = requireSessionFromParam(c, mockSyncEngine, {
			paramName: 'customId'
		})

		expect(result).not.toBeInstanceOf(Response)
		if (result !== null && typeof result === 'object' && !('ok' in result)) {
			expect(result.sessionId).toBe('custom-session-id')
		}
	})

	it('should pass through autoResume options', async () => {
		const c = createMockContext({ autoResume: true })
		mockResolveSessionAccess.mockReturnValue({
			ok: true,
			sessionId: 'test-session-id',
			session: mockInactiveSession
		})

		const mockEnqueueResult: EnqueueResult = {
			queued: true,
			messageId: 'pending-123',
			queueDepth: 1
		}
		mockEnqueueMessage.mockReturnValue(mockEnqueueResult)
		mockTriggerResume.mockResolvedValue(undefined)

		const result = requireSessionFromParam(c, mockSyncEngine, {
			autoResume: true,
			messagePayload: {
				text: 'Test',
				sentFrom: 'webapp' as const
			}
		})

		expect(result).toBeInstanceOf(Response)
		expect(result.status).toBe(202)

		expect(mockEnqueueMessage).toHaveBeenCalled()
		expect(mockTriggerResume).toHaveBeenCalled()
	})
})
