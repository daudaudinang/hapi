import { Database } from 'bun:sqlite'

export type StoredPendingMessage = {
    id: string
    sessionId: string
    payload: string
    createdAt: number
    processedAt: number | null
    error: string | null
    retryCount: number
    status: 'pending' | 'processed' | 'failed'
}

// Database row type with snake_case column names
type DbPendingMessageRow = {
    id: string
    session_id: string
    payload: string
    created_at: number
    processed_at: number | null
    error: string | null
    retry_count: number
    status: 'pending' | 'processed' | 'failed'
}

function toStoredPendingMessage(row: DbPendingMessageRow): StoredPendingMessage {
    return {
        id: row.id,
        sessionId: row.session_id,
        payload: row.payload,
        createdAt: row.created_at,
        processedAt: row.processed_at,
        error: row.error,
        retryCount: row.retry_count,
        status: row.status
    }
}

export class PendingMessagesStore {
    private db: Database

    constructor(db: Database) {
        this.db = db
    }

    addPendingMessage(message: Omit<StoredPendingMessage, 'retryCount'>): void {
        const stmt = this.db.prepare(`
            INSERT INTO pending_messages (id, session_id, payload, created_at, processed_at, error, retry_count, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        stmt.run(
            message.id,
            message.sessionId,
            message.payload,
            message.createdAt,
            message.processedAt,
            message.error,
            0,
            message.status
        )
    }

    getPendingMessages(sessionId: string): StoredPendingMessage[] {
        const stmt = this.db.prepare(`
            SELECT * FROM pending_messages
            WHERE session_id = ? AND status = 'pending'
            ORDER BY created_at ASC
        `)
        const rows = stmt.all(sessionId) as DbPendingMessageRow[]
        return rows.map(toStoredPendingMessage)
    }

    getPendingMessage(messageId: string): StoredPendingMessage | null {
        const stmt = this.db.prepare(`
            SELECT * FROM pending_messages WHERE id = ?
        `)
        const row = stmt.get(messageId) as DbPendingMessageRow | undefined
        return row ? toStoredPendingMessage(row) : null
    }

    markAsProcessed(messageId: string): void {
        const stmt = this.db.prepare(`
            UPDATE pending_messages
            SET status = 'processed', processed_at = ?
            WHERE id = ?
        `)
        stmt.run(Date.now(), messageId)
    }

    markAsFailed(messageId: string, error: string): void {
        const stmt = this.db.prepare(`
            UPDATE pending_messages
            SET status = 'failed', error = ?, processed_at = ?
            WHERE id = ?
        `)
        stmt.run(error, Date.now(), messageId)
    }

    getPendingCount(sessionId: string): number {
        const stmt = this.db.prepare(`
            SELECT COUNT(*) as count FROM pending_messages
            WHERE session_id = ? AND status = 'pending'
        `)
        const result = stmt.get(sessionId) as { count: number }
        return result.count
    }

    cleanupOldMessages(olderThanMs: number): number {
        const cutoff = Date.now() - olderThanMs
        const stmt = this.db.prepare(`
            DELETE FROM pending_messages
            WHERE created_at < ? AND (status = 'processed' OR status = 'failed')
        `)
        const result = stmt.run(cutoff)
        return result.changes
    }

    deleteBySessionId(sessionId: string): number {
        const stmt = this.db.prepare(`
            DELETE FROM pending_messages WHERE session_id = ?
        `)
        const result = stmt.run(sessionId)
        return result.changes
    }

    incrementRetryCount(messageId: string): void {
        const stmt = this.db.prepare(`
            UPDATE pending_messages
            SET retry_count = retry_count + 1
            WHERE id = ?
        `)
        stmt.run(messageId)
    }
}
