import type { Database } from 'bun:sqlite'
import { randomUUID } from 'node:crypto'

import { safeJsonParse } from './json'
import type { StoredTeamChat, StoredTeamMessage, StoredTeamMentionRequest, StoredTeamParticipant } from './types'

type TeamChatRow = {
    id: string
    namespace: string
    owner_membership_id: string | null
    name: string
    project_path: string | null
    shared_context: string | null
    archived_at: number | null
    created_at: number
    updated_at: number
}

type TeamParticipantRow = {
    id: string
    namespace: string
    team_chat_id: string
    type: StoredTeamParticipant['type']
    user_id: string | null
    session_id: string | null
    display_name: string
    role: StoredTeamParticipant['role']
    color: string
    archived_at: number | null
    joined_at: number
}

type TeamMessageRow = {
    id: string
    namespace: string
    team_chat_id: string
    seq: number
    author_participant_id: string
    text: string
    report_type: StoredTeamMessage['reportType']
    reply_to_message_id: string | null
    reply_preview: string | null
    mentions: string
    files: string
    created_at: number
}

const TEAM_MENTION_STATUS_TRANSITIONS: Record<StoredTeamMentionRequest['status'], readonly StoredTeamMentionRequest['status'][]> = {
    pending: ['pending', 'delivered', 'seen', 'processing', 'responded', 'no_action', 'failed', 'superseded'],
    delivered: ['delivered', 'seen', 'processing', 'responded', 'no_action', 'failed', 'superseded'],
    seen: ['seen', 'processing', 'responded', 'no_action', 'failed', 'superseded'],
    processing: ['processing', 'responded', 'no_action', 'failed', 'superseded'],
    no_action: ['no_action', 'responded'],
    responded: ['responded'],
    failed: ['failed'],
    superseded: ['superseded']
}

function canTransitionMentionStatus(from: StoredTeamMentionRequest['status'], to: StoredTeamMentionRequest['status']): boolean {
    return TEAM_MENTION_STATUS_TRANSITIONS[from].includes(to)
}

type TeamMentionRequestRow = {
    id: string
    namespace: string
    team_chat_id: string
    source_message_id: string
    target_session_id: string
    status: StoredTeamMentionRequest['status']
    context_snapshot: string
    hop_depth: number
    parent_request_id: string | null
    error: string | null
    created_at: number
    delivered_at: number | null
    seen_at: number | null
    processing_started_at: number | null
    resolved_at: number | null
}

export class TeamChatStore {
    constructor(private readonly db: Database) {}

    createTeamChat(input: { namespace: string; ownerMembershipId?: string | null; name: string; projectPath?: string | null }): StoredTeamChat {
        const now = Date.now()
        const id = randomUUID()
        this.db.prepare(`
            INSERT INTO team_chats (id, namespace, owner_membership_id, name, project_path, shared_context, archived_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)
        `).run(
            id,
            input.namespace,
            input.ownerMembershipId ?? null,
            input.name,
            input.projectPath ?? null,
            JSON.stringify({ decisions: [], openQuestions: [], relevantFiles: [] }),
            now,
            now
        )
        return this.getTeamChat(input.namespace, id)!
    }

    getTeamChat(namespace: string, id: string): StoredTeamChat | null {
        const row = this.db.prepare('SELECT * FROM team_chats WHERE namespace = ? AND id = ? AND archived_at IS NULL').get(namespace, id) as TeamChatRow | undefined
        return row ? toTeamChat(row) : null
    }

    listTeamChats(namespace: string): StoredTeamChat[] {
        const rows = this.db.prepare(
            'SELECT * FROM team_chats WHERE namespace = ? AND archived_at IS NULL ORDER BY updated_at DESC'
        ).all(namespace) as TeamChatRow[]
        return rows.map(toTeamChat)
    }

    archiveTeamChat(namespace: string, teamChatId: string): void {
        this.requireTeamChat(namespace, teamChatId)
        const now = Date.now()
        this.db.prepare(`
            UPDATE team_chats
            SET archived_at = COALESCE(archived_at, ?), updated_at = ?
            WHERE namespace = ? AND id = ? AND archived_at IS NULL
        `).run(now, now, namespace, teamChatId)
        this.db.prepare(`
            UPDATE team_participants
            SET archived_at = COALESCE(archived_at, ?)
            WHERE namespace = ? AND team_chat_id = ? AND archived_at IS NULL
        `).run(now, namespace, teamChatId)
        this.db.prepare(`
            UPDATE team_mention_requests
            SET status = 'superseded', resolved_at = COALESCE(resolved_at, ?)
            WHERE namespace = ?
              AND team_chat_id = ?
              AND status IN ('pending', 'delivered', 'seen', 'processing')
        `).run(now, namespace, teamChatId)
    }

    addParticipant(input: {
        namespace: string
        teamChatId: string
        type: 'user' | 'session'
        userId?: string | null
        sessionId?: string | null
        displayName: string
        role: StoredTeamParticipant['role']
        color: string
    }): StoredTeamParticipant {
        this.requireTeamChat(input.namespace, input.teamChatId)
        const displayName = input.displayName.trim()
        if (!displayName) throw new Error('TEAM_PARTICIPANT_DISPLAY_NAME_INVALID')
        if (input.sessionId) {
            this.requireSession(input.namespace, input.sessionId)
            if (input.type === 'session') {
                const existing = this.getActiveSessionParticipant(input.namespace, input.teamChatId, input.sessionId)
                if (existing) return existing
            }
        }
        const duplicate = this.db.prepare(`
            SELECT id FROM team_participants
            WHERE namespace = ? AND team_chat_id = ? AND archived_at IS NULL AND lower(display_name) = lower(?)
            LIMIT 1
        `).get(input.namespace, input.teamChatId, displayName) as { id: string } | undefined
        if (duplicate) throw new Error('TEAM_PARTICIPANT_DISPLAY_NAME_EXISTS')
        const id = randomUUID()
        const now = Date.now()
        this.db.prepare(`
            INSERT INTO team_participants (id, namespace, team_chat_id, type, user_id, session_id, display_name, role, color, archived_at, joined_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
        `).run(
            id,
            input.namespace,
            input.teamChatId,
            input.type,
            input.userId ?? null,
            input.sessionId ?? null,
            displayName,
            input.role,
            input.color,
            now
        )
        return this.getParticipant(input.namespace, id)!
    }

    getParticipant(namespace: string, id: string): StoredTeamParticipant | null {
        const row = this.db.prepare('SELECT * FROM team_participants WHERE namespace = ? AND id = ?').get(namespace, id) as TeamParticipantRow | undefined
        return row ? toParticipant(row) : null
    }

    getActiveSessionParticipant(namespace: string, teamChatId: string, sessionId: string): StoredTeamParticipant | null {
        const row = this.db.prepare(`
            SELECT * FROM team_participants
            WHERE namespace = ? AND team_chat_id = ? AND session_id = ? AND type = 'session' AND archived_at IS NULL
            ORDER BY joined_at DESC
            LIMIT 1
        `).get(namespace, teamChatId, sessionId) as TeamParticipantRow | undefined
        return row ? toParticipant(row) : null
    }

    listParticipants(namespace: string, teamChatId: string): StoredTeamParticipant[] {
        const rows = this.db.prepare(`
            SELECT p.* FROM team_participants p
            INNER JOIN team_chats c ON c.namespace = p.namespace AND c.id = p.team_chat_id
            WHERE p.namespace = ?
              AND p.team_chat_id = ?
              AND p.archived_at IS NULL
              AND c.archived_at IS NULL
            ORDER BY p.joined_at ASC
        `).all(namespace, teamChatId) as TeamParticipantRow[]
        return rows.map(toParticipant)
    }

    updateParticipant(input: {
        namespace: string
        teamChatId: string
        participantId: string
        displayName: string
        role: StoredTeamParticipant['role']
        color: string
    }): StoredTeamParticipant {
        this.requireParticipant(input.namespace, input.teamChatId, input.participantId)
        const displayName = input.displayName.trim()
        if (!displayName) throw new Error('TEAM_PARTICIPANT_DISPLAY_NAME_INVALID')
        const duplicate = this.db.prepare(`
            SELECT id FROM team_participants
            WHERE namespace = ?
              AND team_chat_id = ?
              AND archived_at IS NULL
              AND lower(display_name) = lower(?)
              AND id != ?
            LIMIT 1
        `).get(input.namespace, input.teamChatId, displayName, input.participantId) as { id: string } | undefined
        if (duplicate) throw new Error('TEAM_PARTICIPANT_DISPLAY_NAME_EXISTS')
        this.db.prepare(`
            UPDATE team_participants
            SET display_name = ?, role = ?, color = ?
            WHERE namespace = ? AND team_chat_id = ? AND id = ? AND archived_at IS NULL
        `).run(displayName, input.role, input.color, input.namespace, input.teamChatId, input.participantId)
        return this.getParticipant(input.namespace, input.participantId)!
    }

    listSessionTeamMemberships(namespace: string, sessionId: string): Array<{ teamChat: StoredTeamChat; participant: StoredTeamParticipant }> {
        const participantRows = this.db.prepare(`
            SELECT p.* FROM team_participants p
            INNER JOIN team_chats c ON c.namespace = p.namespace AND c.id = p.team_chat_id
            WHERE p.namespace = ?
              AND p.session_id = ?
              AND p.type = 'session'
              AND p.archived_at IS NULL
              AND c.archived_at IS NULL
            ORDER BY c.updated_at DESC, p.joined_at ASC
        `).all(namespace, sessionId) as TeamParticipantRow[]

        return participantRows.flatMap((row) => {
            const teamChat = this.getTeamChat(namespace, row.team_chat_id)
            if (!teamChat) return []
            return [{ teamChat, participant: toParticipant(row) }]
        })
    }

    addMessage(input: {
        namespace: string
        teamChatId: string
        authorParticipantId: string
        text: string
        reportType?: StoredTeamMessage['reportType']
        replyToMessageId?: string | null
        replyPreview?: unknown | null
        mentions: unknown[]
        files?: string[]
    }): StoredTeamMessage {
        this.requireTeamChat(input.namespace, input.teamChatId)
        this.requireParticipant(input.namespace, input.teamChatId, input.authorParticipantId)
        if (input.replyToMessageId) {
            this.requireMessage(input.namespace, input.teamChatId, input.replyToMessageId)
        }
        const id = randomUUID()
        const now = Date.now()
        const seqRow = this.db.prepare(
            'SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq FROM team_messages WHERE team_chat_id = ?'
        ).get(input.teamChatId) as { next_seq: number }
        this.db.prepare(`
            INSERT INTO team_messages (
                id, namespace, team_chat_id, seq, author_participant_id, text, report_type,
                reply_to_message_id, reply_preview, mentions, files, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            id,
            input.namespace,
            input.teamChatId,
            seqRow.next_seq,
            input.authorParticipantId,
            input.text,
            input.reportType ?? null,
            input.replyToMessageId ?? null,
            JSON.stringify(input.replyPreview ?? null),
            JSON.stringify(input.mentions),
            JSON.stringify(input.files ?? []),
            now
        )
        this.db.prepare('UPDATE team_chats SET updated_at = ? WHERE namespace = ? AND id = ?').run(now, input.namespace, input.teamChatId)
        return this.getMessage(input.namespace, id)!
    }

    getMessage(namespace: string, id: string): StoredTeamMessage | null {
        const row = this.db.prepare('SELECT * FROM team_messages WHERE namespace = ? AND id = ?').get(namespace, id) as TeamMessageRow | undefined
        return row ? toMessage(row) : null
    }

    getMessages(namespace: string, teamChatId: string, limit: number, beforeSeq?: number): StoredTeamMessage[] {
        const rows = beforeSeq
            ? this.db.prepare(`
                SELECT * FROM team_messages
                WHERE namespace = ? AND team_chat_id = ? AND seq < ?
                ORDER BY seq DESC LIMIT ?
            `).all(namespace, teamChatId, beforeSeq, limit) as TeamMessageRow[]
            : this.db.prepare(`
                SELECT * FROM team_messages
                WHERE namespace = ? AND team_chat_id = ?
                ORDER BY seq DESC LIMIT ?
            `).all(namespace, teamChatId, limit) as TeamMessageRow[]
        return rows.map(toMessage).reverse()
    }

    getMessagesAround(input: { namespace: string; teamChatId: string; messageId: string; before: number; after: number }): { messages: StoredTeamMessage[] } {
        const anchor = this.getMessage(input.namespace, input.messageId)
        if (!anchor || anchor.teamChatId !== input.teamChatId) return { messages: [] }
        const rows = this.db.prepare(`
            SELECT * FROM team_messages
            WHERE namespace = ? AND team_chat_id = ? AND seq BETWEEN ? AND ?
            ORDER BY seq ASC
        `).all(input.namespace, input.teamChatId, anchor.seq - input.before, anchor.seq + input.after) as TeamMessageRow[]
        return { messages: rows.map(toMessage) }
    }

    addMentionRequest(input: {
        namespace: string
        teamChatId: string
        sourceMessageId: string
        targetSessionId: string
        status?: StoredTeamMentionRequest['status']
        contextSnapshot: unknown
        hopDepth: number
        parentRequestId?: string | null
    }): StoredTeamMentionRequest {
        this.requireTeamChat(input.namespace, input.teamChatId)
        this.requireMessage(input.namespace, input.teamChatId, input.sourceMessageId)
        this.requireSession(input.namespace, input.targetSessionId)
        if (input.parentRequestId) {
            this.requireMentionRequest(input.namespace, input.teamChatId, input.parentRequestId)
        }
        const id = randomUUID()
        const now = Date.now()
        this.db.prepare(`
            INSERT INTO team_mention_requests (
                id, namespace, team_chat_id, source_message_id, target_session_id, status,
                context_snapshot, hop_depth, parent_request_id, error, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
        `).run(
            id,
            input.namespace,
            input.teamChatId,
            input.sourceMessageId,
            input.targetSessionId,
            input.status ?? 'pending',
            JSON.stringify(input.contextSnapshot),
            input.hopDepth,
            input.parentRequestId ?? null,
            now
        )
        return this.getMentionRequest(input.namespace, id)!
    }

    getMentionRequest(namespace: string, id: string): StoredTeamMentionRequest | null {
        const row = this.db.prepare(
            'SELECT * FROM team_mention_requests WHERE namespace = ? AND id = ?'
        ).get(namespace, id) as TeamMentionRequestRow | undefined
        return row ? toMentionRequest(row) : null
    }

    listPendingMentionRequests(namespace: string, targetSessionId: string): StoredTeamMentionRequest[] {
        const rows = this.db.prepare(`
            SELECT r.* FROM team_mention_requests r
            INNER JOIN team_chats c ON c.namespace = r.namespace AND c.id = r.team_chat_id
            WHERE r.namespace = ?
              AND r.target_session_id = ?
              AND r.status IN ('pending', 'delivered', 'seen')
              AND c.archived_at IS NULL
            ORDER BY r.created_at ASC
        `).all(namespace, targetSessionId) as TeamMentionRequestRow[]
        return rows.map(toMentionRequest)
    }

    listSessionMentionRequests(namespace: string, targetSessionId: string): StoredTeamMentionRequest[] {
        const rows = this.db.prepare(`
            SELECT r.* FROM team_mention_requests r
            INNER JOIN team_chats c ON c.namespace = r.namespace AND c.id = r.team_chat_id
            WHERE r.namespace = ?
              AND r.target_session_id = ?
              AND c.archived_at IS NULL
            ORDER BY r.created_at ASC
        `).all(namespace, targetSessionId) as TeamMentionRequestRow[]
        return rows.map(toMentionRequest)
    }

    updateMentionStatus(input: {
        namespace: string
        requestId: string
        status: StoredTeamMentionRequest['status']
        deliveredAt?: number | null
        seenAt?: number | null
        processingStartedAt?: number | null
        resolvedAt?: number | null
        error?: string | null
    }): StoredTeamMentionRequest | null {
        const current = this.getMentionRequest(input.namespace, input.requestId)
        if (!current) return null
        if (!canTransitionMentionStatus(current.status, input.status)) return current

        this.db.prepare(`
            UPDATE team_mention_requests
            SET status = ?,
                delivered_at = COALESCE(?, delivered_at),
                seen_at = COALESCE(?, seen_at),
                processing_started_at = COALESCE(?, processing_started_at),
                resolved_at = COALESCE(?, resolved_at),
                error = COALESCE(?, error)
            WHERE namespace = ? AND id = ?
        `).run(
            input.status,
            input.deliveredAt ?? null,
            input.seenAt ?? null,
            input.processingStartedAt ?? null,
            input.resolvedAt ?? null,
            input.error ?? null,
            input.namespace,
            input.requestId
        )
        return this.getMentionRequest(input.namespace, input.requestId)
    }

    archiveParticipant(namespace: string, teamChatId: string, participantId: string): void {
        this.db.prepare('UPDATE team_participants SET archived_at = ? WHERE namespace = ? AND team_chat_id = ? AND id = ?')
            .run(Date.now(), namespace, teamChatId, participantId)
    }

    private requireTeamChat(namespace: string, teamChatId: string): void {
        const row = this.db.prepare('SELECT id FROM team_chats WHERE namespace = ? AND id = ? AND archived_at IS NULL').get(namespace, teamChatId) as { id: string } | undefined
        if (!row) throw new Error('TEAM_CHAT_NOT_FOUND')
    }

    private requireParticipant(namespace: string, teamChatId: string, participantId: string): void {
        const row = this.db.prepare(`
            SELECT id FROM team_participants
            WHERE namespace = ? AND team_chat_id = ? AND id = ? AND archived_at IS NULL
        `).get(namespace, teamChatId, participantId) as { id: string } | undefined
        if (!row) throw new Error('TEAM_PARTICIPANT_NOT_FOUND')
    }

    private requireMessage(namespace: string, teamChatId: string, messageId: string): void {
        const row = this.db.prepare(`
            SELECT id FROM team_messages
            WHERE namespace = ? AND team_chat_id = ? AND id = ?
        `).get(namespace, teamChatId, messageId) as { id: string } | undefined
        if (!row) throw new Error('TEAM_MESSAGE_NOT_FOUND')
    }

    private requireMentionRequest(namespace: string, teamChatId: string, requestId: string): void {
        const row = this.db.prepare(`
            SELECT id FROM team_mention_requests
            WHERE namespace = ? AND team_chat_id = ? AND id = ?
        `).get(namespace, teamChatId, requestId) as { id: string } | undefined
        if (!row) throw new Error('TEAM_MENTION_NOT_FOUND')
    }

    private requireSession(namespace: string, sessionId: string): void {
        const row = this.db.prepare('SELECT id FROM sessions WHERE namespace = ? AND id = ?').get(namespace, sessionId) as { id: string } | undefined
        if (!row) throw new Error('TEAM_SESSION_NOT_FOUND')
    }
}

function toTeamChat(row: TeamChatRow): StoredTeamChat {
    return {
        id: row.id,
        namespace: row.namespace,
        ownerMembershipId: row.owner_membership_id,
        name: row.name,
        projectPath: row.project_path,
        sharedContext: safeJsonParse(row.shared_context),
        archivedAt: row.archived_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    }
}

function toParticipant(row: TeamParticipantRow): StoredTeamParticipant {
    return {
        id: row.id,
        namespace: row.namespace,
        teamChatId: row.team_chat_id,
        type: row.type,
        userId: row.user_id,
        sessionId: row.session_id,
        displayName: row.display_name,
        role: row.role,
        color: row.color,
        archivedAt: row.archived_at,
        joinedAt: row.joined_at
    }
}

function toMessage(row: TeamMessageRow): StoredTeamMessage {
    return {
        id: row.id,
        namespace: row.namespace,
        teamChatId: row.team_chat_id,
        seq: row.seq,
        authorParticipantId: row.author_participant_id,
        text: row.text,
        reportType: row.report_type,
        replyToMessageId: row.reply_to_message_id,
        replyPreview: safeJsonParse(row.reply_preview),
        mentions: safeJsonParse(row.mentions) ?? [],
        files: safeJsonParse(row.files) ?? [],
        createdAt: row.created_at
    }
}

function toMentionRequest(row: TeamMentionRequestRow): StoredTeamMentionRequest {
    return {
        id: row.id,
        namespace: row.namespace,
        teamChatId: row.team_chat_id,
        sourceMessageId: row.source_message_id,
        targetSessionId: row.target_session_id,
        status: row.status,
        contextSnapshot: safeJsonParse(row.context_snapshot),
        hopDepth: row.hop_depth,
        parentRequestId: row.parent_request_id,
        error: row.error,
        createdAt: row.created_at,
        deliveredAt: row.delivered_at,
        seenAt: row.seen_at,
        processingStartedAt: row.processing_started_at,
        resolvedAt: row.resolved_at
    }
}
