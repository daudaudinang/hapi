import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { Database } from 'bun:sqlite'
import { PendingMessagesStore } from './pendingMessages'
import type { StoredPendingMessage } from './pendingMessages'

describe('PendingMessagesStore', () => {
  let db: Database
  let store: PendingMessagesStore

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

    store = new PendingMessagesStore(db)
  })

  afterEach(() => {
    db.close()
  })

  describe('addPendingMessage', () => {
    it('should add a new pending message', () => {
      createSession('session-1')

      const message: Omit<StoredPendingMessage, 'retryCount'> = {
        id: 'msg-1',
        sessionId: 'session-1',
        payload: JSON.stringify({ content: 'Hello' }),
        createdAt: Date.now(),
        processedAt: null,
        error: null,
        status: 'pending'
      }

      store.addPendingMessage(message)

      const retrieved = store.getPendingMessage('msg-1')
      expect(retrieved).toBeDefined()
      expect(retrieved?.id).toBe('msg-1')
      expect(retrieved?.sessionId).toBe('session-1')
      expect(retrieved?.retryCount).toBe(0)
    })

    it('should add message with processed status', () => {
      createSession('session-1')

      const message: Omit<StoredPendingMessage, 'retryCount'> = {
        id: 'msg-2',
        sessionId: 'session-1',
        payload: JSON.stringify({ content: 'Test' }),
        createdAt: Date.now(),
        processedAt: Date.now(),
        error: null,
        status: 'processed'
      }

      store.addPendingMessage(message)

      const retrieved = store.getPendingMessage('msg-2')
      expect(retrieved?.status).toBe('processed')
      expect(retrieved?.processedAt).toBeDefined()
    })

    it('should add message with failed status and error', () => {
      createSession('session-1')

      const message: Omit<StoredPendingMessage, 'retryCount'> = {
        id: 'msg-3',
        sessionId: 'session-1',
        payload: JSON.stringify({ content: 'Test' }),
        createdAt: Date.now(),
        processedAt: Date.now(),
        error: 'Connection timeout',
        status: 'failed'
      }

      store.addPendingMessage(message)

      const retrieved = store.getPendingMessage('msg-3')
      expect(retrieved?.status).toBe('failed')
      expect(retrieved?.error).toBe('Connection timeout')
    })
  })

  describe('getPendingMessage', () => {
    it('should retrieve a message by id', () => {
      createSession('session-2')

      const message: Omit<StoredPendingMessage, 'retryCount'> = {
        id: 'msg-4',
        sessionId: 'session-2',
        payload: JSON.stringify({ content: 'Retrieve me' }),
        createdAt: Date.now(),
        processedAt: null,
        error: null,
        status: 'pending'
      }

      store.addPendingMessage(message)

      const retrieved = store.getPendingMessage('msg-4')
      expect(retrieved).toBeDefined()
      expect(retrieved?.payload).toBe(JSON.stringify({ content: 'Retrieve me' }))
    })

    it('should return null for non-existent message', () => {
      const retrieved = store.getPendingMessage('non-existent')
      expect(retrieved).toBeNull()
    })
  })

  describe('getPendingMessages', () => {
    it('should retrieve all pending messages for a session', () => {
      createSession('session-3')
      const now = Date.now()

      // Add multiple pending messages
      store.addPendingMessage({
        id: 'msg-5',
        sessionId: 'session-3',
        payload: JSON.stringify({ content: 'First' }),
        createdAt: now - 2000,
        processedAt: null,
        error: null,
        status: 'pending'
      })

      store.addPendingMessage({
        id: 'msg-6',
        sessionId: 'session-3',
        payload: JSON.stringify({ content: 'Second' }),
        createdAt: now - 1000,
        processedAt: null,
        error: null,
        status: 'pending'
      })

      store.addPendingMessage({
        id: 'msg-7',
        sessionId: 'session-3',
        payload: JSON.stringify({ content: 'Third' }),
        createdAt: now,
        processedAt: null,
        error: null,
        status: 'processed' // Not pending
      })

      const pending = store.getPendingMessages('session-3')
      expect(pending).toHaveLength(2)
      expect(pending[0].id).toBe('msg-5') // Oldest first
      expect(pending[1].id).toBe('msg-6')
    })

    it('should not retrieve messages from other sessions', () => {
      createSession('session-4')

      store.addPendingMessage({
        id: 'msg-8',
        sessionId: 'session-4',
        payload: JSON.stringify({ content: 'Session 4' }),
        createdAt: Date.now(),
        processedAt: null,
        error: null,
        status: 'pending'
      })

      const pending = store.getPendingMessages('session-5')
      expect(pending).toHaveLength(0)
    })

    it('should not retrieve processed or failed messages', () => {
      createSession('session-6')

      store.addPendingMessage({
        id: 'msg-9',
        sessionId: 'session-6',
        payload: JSON.stringify({ content: 'Processed' }),
        createdAt: Date.now(),
        processedAt: Date.now(),
        error: null,
        status: 'processed'
      })

      store.addPendingMessage({
        id: 'msg-10',
        sessionId: 'session-6',
        payload: JSON.stringify({ content: 'Failed' }),
        createdAt: Date.now(),
        processedAt: Date.now(),
        error: 'Error',
        status: 'failed'
      })

      const pending = store.getPendingMessages('session-6')
      expect(pending).toHaveLength(0)
    })
  })

  describe('markAsProcessed', () => {
    it('should mark a message as processed', () => {
      createSession('session-7')

      store.addPendingMessage({
        id: 'msg-11',
        sessionId: 'session-7',
        payload: JSON.stringify({ content: 'Process me' }),
        createdAt: Date.now(),
        processedAt: null,
        error: null,
        status: 'pending'
      })

      store.markAsProcessed('msg-11')

      const message = store.getPendingMessage('msg-11')
      expect(message?.status).toBe('processed')
      expect(message?.processedAt).toBeDefined()
      expect(message?.processedAt).toBeGreaterThan(0)
    })
  })

  describe('markAsFailed', () => {
    it('should mark a message as failed with error', () => {
      createSession('session-8')

      store.addPendingMessage({
        id: 'msg-12',
        sessionId: 'session-8',
        payload: JSON.stringify({ content: 'Fail me' }),
        createdAt: Date.now(),
        processedAt: null,
        error: null,
        status: 'pending'
      })

      const error = 'Session timeout'
      store.markAsFailed('msg-12', error)

      const message = store.getPendingMessage('msg-12')
      expect(message?.status).toBe('failed')
      expect(message?.error).toBe(error)
      expect(message?.processedAt).toBeDefined()
    })
  })

  describe('getPendingCount', () => {
    it('should count pending messages for a session', () => {
      createSession('session-9')

      store.addPendingMessage({
        id: 'msg-13',
        sessionId: 'session-9',
        payload: JSON.stringify({ content: 'Pending 1' }),
        createdAt: Date.now(),
        processedAt: null,
        error: null,
        status: 'pending'
      })

      store.addPendingMessage({
        id: 'msg-14',
        sessionId: 'session-9',
        payload: JSON.stringify({ content: 'Pending 2' }),
        createdAt: Date.now(),
        processedAt: null,
        error: null,
        status: 'pending'
      })

      store.addPendingMessage({
        id: 'msg-15',
        sessionId: 'session-9',
        payload: JSON.stringify({ content: 'Processed' }),
        createdAt: Date.now(),
        processedAt: Date.now(),
        error: null,
        status: 'processed'
      })

      const count = store.getPendingCount('session-9')
      expect(count).toBe(2)
    })

    it('should return 0 for session with no pending messages', () => {
      const count = store.getPendingCount('non-existent-session')
      expect(count).toBe(0)
    })
  })

  describe('cleanupOldMessages', () => {
    it('should delete old processed messages', () => {
      createSession('session-10')
      const oldTimestamp = Date.now() - 100000 // 100 seconds ago

      store.addPendingMessage({
        id: 'msg-16',
        sessionId: 'session-10',
        payload: JSON.stringify({ content: 'Old processed' }),
        createdAt: oldTimestamp,
        processedAt: oldTimestamp,
        error: null,
        status: 'processed'
      })

      const deleted = store.cleanupOldMessages(50000) // 50 seconds

      expect(deleted).toBe(1)

      const message = store.getPendingMessage('msg-16')
      expect(message).toBeNull()
    })

    it('should delete old failed messages', () => {
      createSession('session-11')
      const oldTimestamp = Date.now() - 100000

      store.addPendingMessage({
        id: 'msg-17',
        sessionId: 'session-11',
        payload: JSON.stringify({ content: 'Old failed' }),
        createdAt: oldTimestamp,
        processedAt: oldTimestamp,
        error: 'Error',
        status: 'failed'
      })

      const deleted = store.cleanupOldMessages(50000)

      expect(deleted).toBe(1)
    })

    it('should not delete pending messages', () => {
      createSession('session-12')
      const oldTimestamp = Date.now() - 100000

      store.addPendingMessage({
        id: 'msg-18',
        sessionId: 'session-12',
        payload: JSON.stringify({ content: 'Old pending' }),
        createdAt: oldTimestamp,
        processedAt: null,
        error: null,
        status: 'pending'
      })

      const deleted = store.cleanupOldMessages(50000)

      expect(deleted).toBe(0)

      const message = store.getPendingMessage('msg-18')
      expect(message).toBeDefined()
    })

    it('should not delete recent processed messages', () => {
      createSession('session-13')
      const recentTimestamp = Date.now() - 1000 // 1 second ago

      store.addPendingMessage({
        id: 'msg-19',
        sessionId: 'session-13',
        payload: JSON.stringify({ content: 'Recent processed' }),
        createdAt: recentTimestamp,
        processedAt: recentTimestamp,
        error: null,
        status: 'processed'
      })

      const deleted = store.cleanupOldMessages(50000)

      expect(deleted).toBe(0)

      const message = store.getPendingMessage('msg-19')
      expect(message).toBeDefined()
    })
  })

  describe('deleteBySessionId', () => {
    it('should delete all messages for a session', () => {
      createSession('session-14')

      store.addPendingMessage({
        id: 'msg-20',
        sessionId: 'session-14',
        payload: JSON.stringify({ content: 'Message 1' }),
        createdAt: Date.now(),
        processedAt: null,
        error: null,
        status: 'pending'
      })

      store.addPendingMessage({
        id: 'msg-21',
        sessionId: 'session-14',
        payload: JSON.stringify({ content: 'Message 2' }),
        createdAt: Date.now(),
        processedAt: null,
        error: null,
        status: 'processed'
      })

      const deleted = store.deleteBySessionId('session-14')

      expect(deleted).toBe(2)

      expect(store.getPendingMessage('msg-20')).toBeNull()
      expect(store.getPendingMessage('msg-21')).toBeNull()
    })

    it('should return 0 for non-existent session', () => {
      const deleted = store.deleteBySessionId('non-existent-session')
      expect(deleted).toBe(0)
    })
  })

  describe('incrementRetryCount', () => {
    it('should increment retry count for a message', () => {
      createSession('session-15')

      store.addPendingMessage({
        id: 'msg-22',
        sessionId: 'session-15',
        payload: JSON.stringify({ content: 'Retry me' }),
        createdAt: Date.now(),
        processedAt: null,
        error: null,
        status: 'pending'
      })

      store.incrementRetryCount('msg-22')

      const message = store.getPendingMessage('msg-22')
      expect(message?.retryCount).toBe(1)

      store.incrementRetryCount('msg-22')

      const updated = store.getPendingMessage('msg-22')
      expect(updated?.retryCount).toBe(2)
    })
  })
})
