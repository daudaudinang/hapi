import type { Store } from '../store'
import type { StoredTeamMessage, StoredTeamMentionRequest, StoredTeamParticipant } from '../store/types'
import type { EventPublisher } from './eventPublisher'
import { parseTeamMentions } from './teamMentions'
import { getMentionDeliveryMode, type TeamMentionDeliveryService } from './teamMentionDeliveryService'
import type { Session } from '@hapi/protocol/types'

type TeamMessagePage = {
    messages: StoredTeamMessage[]
    page: {
        limit: number
        beforeSeq: number | null
        nextBeforeSeq: number | null
        hasMore: boolean
    }
}

export class TeamChatService {
    constructor(
        private readonly store: Store,
        private readonly publisher: Pick<EventPublisher, 'emit'>,
        private readonly mentionDelivery?: Pick<TeamMentionDeliveryService, 'deliver'>,
        private readonly resolveSession?: (namespace: string, sessionId: string) => Pick<Session, 'active' | 'thinking' | 'agentState'> | undefined
    ) {}

    createTeamChat(input: { namespace: string; ownerMembershipId?: string | null; name: string; projectPath?: string | null }) {
        const chat = this.store.teamChats.createTeamChat(input)
        this.publisher.emit({ type: 'team-chat-updated', namespace: input.namespace, teamChatId: chat.id })
        return chat
    }

    listTeamChats(namespace: string) {
        return this.store.teamChats.listTeamChats(namespace)
    }

    getTeamChat(namespace: string, id: string) {
        return this.store.teamChats.getTeamChat(namespace, id)
    }

    archiveTeamChat(namespace: string, teamChatId: string): void {
        const participants = this.store.teamChats.listParticipants(namespace, teamChatId)
        this.requireTeamChat(namespace, teamChatId)
        this.store.teamChats.archiveTeamChat(namespace, teamChatId)
        this.publisher.emit({ type: 'team-chat-updated', namespace, teamChatId })
        for (const participant of participants) {
            this.publisher.emit({ type: 'team-participant-updated', namespace, teamChatId, participantId: participant.id })
        }
    }

    listParticipants(namespace: string, teamChatId: string) {
        this.requireTeamChat(namespace, teamChatId)
        return this.store.teamChats.listParticipants(namespace, teamChatId)
    }

    listSessionTeamMemberships(namespace: string, sessionId: string) {
        return this.store.teamChats.listSessionTeamMemberships(namespace, sessionId)
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
    }) {
        this.requireTeamChat(input.namespace, input.teamChatId)
        const participant = this.store.teamChats.addParticipant(input)
        this.publisher.emit({
            type: 'team-participant-updated',
            namespace: input.namespace,
            teamChatId: input.teamChatId,
            participantId: participant.id
        })
        return participant
    }

    updateParticipant(input: {
        namespace: string
        teamChatId: string
        participantId: string
        displayName: string
        role: StoredTeamParticipant['role']
        color: string
    }) {
        this.requireTeamParticipant(input.namespace, input.teamChatId, input.participantId)
        const participant = this.store.teamChats.updateParticipant(input)
        this.publisher.emit({
            type: 'team-participant-updated',
            namespace: input.namespace,
            teamChatId: input.teamChatId,
            participantId: input.participantId
        })
        return participant
    }

    archiveParticipant(namespace: string, teamChatId: string, participantId: string): void {
        this.requireTeamParticipant(namespace, teamChatId, participantId)
        this.store.teamChats.archiveParticipant(namespace, teamChatId, participantId)
        this.publisher.emit({ type: 'team-participant-updated', namespace, teamChatId, participantId })
    }

    postMessage(input: {
        namespace: string
        teamChatId: string
        authorParticipantId: string
        text: string
        reportType?: StoredTeamMessage['reportType']
        replyToMessageId?: string | null
        mentions?: unknown[]
        files?: string[]
    }) {
        this.requireTeamChat(input.namespace, input.teamChatId)
        this.requireTeamParticipant(input.namespace, input.teamChatId, input.authorParticipantId)
        const parsedMentions = parseTeamMentions(input.text, this.store.teamChats.listParticipants(input.namespace, input.teamChatId))
        const replyPreview = input.replyToMessageId
            ? this.buildReplyPreview(input.namespace, input.teamChatId, input.replyToMessageId)
            : null
        const message = this.store.teamChats.addMessage({
            namespace: input.namespace,
            teamChatId: input.teamChatId,
            authorParticipantId: input.authorParticipantId,
            text: input.text,
            reportType: input.reportType ?? null,
            replyToMessageId: input.replyToMessageId ?? null,
            replyPreview,
            mentions: input.mentions ?? parsedMentions.map((mention) => ({
                participantId: mention.participantId,
                sessionId: mention.sessionId
            })),
            files: input.files ?? []
        })
        for (const mention of parsedMentions) {
            const contextSnapshot = this.buildMentionContextSnapshot(input.namespace, input.teamChatId, message.id, input.text)
            const request = this.store.teamChats.addMentionRequest({
                namespace: input.namespace,
                teamChatId: input.teamChatId,
                sourceMessageId: message.id,
                targetSessionId: mention.sessionId,
                contextSnapshot,
                hopDepth: 0
            })
            const session = this.resolveSession?.(input.namespace, mention.sessionId)
            if (this.mentionDelivery && session?.active) {
                this.mentionDelivery.deliver({
                    namespace: input.namespace,
                    request,
                    envelope: this.buildMentionEnvelope(request, input.text, contextSnapshot),
                    mode: getMentionDeliveryMode(session)
                })
            }
        }
        this.publisher.emit({
            type: 'team-message-created',
            namespace: input.namespace,
            teamChatId: input.teamChatId,
            messageId: message.id
        })
        return { message }
    }

    getMessages(namespace: string, teamChatId: string, options: { limit: number; beforeSeq: number | null }): TeamMessagePage {
        this.requireTeamChat(namespace, teamChatId)
        const messages = this.store.teamChats.getMessages(namespace, teamChatId, options.limit, options.beforeSeq ?? undefined)
        const oldestSeq = messages.reduce<number | null>((oldest, message) => {
            if (oldest === null || message.seq < oldest) return message.seq
            return oldest
        }, null)
        const hasMore = oldestSeq !== null && this.store.teamChats.getMessages(namespace, teamChatId, 1, oldestSeq).length > 0
        return {
            messages,
            page: {
                limit: options.limit,
                beforeSeq: options.beforeSeq,
                nextBeforeSeq: oldestSeq,
                hasMore
            }
        }
    }

    getMessagesAround(namespace: string, teamChatId: string, messageId: string, options: { before: number; after: number }): TeamMessagePage {
        this.requireTeamChat(namespace, teamChatId)
        this.requireTeamMessage(namespace, teamChatId, messageId)
        const result = this.store.teamChats.getMessagesAround({ namespace, teamChatId, messageId, before: options.before, after: options.after })
        return {
            messages: result.messages,
            page: {
                limit: options.before + options.after + 1,
                beforeSeq: null,
                nextBeforeSeq: result.messages[0]?.seq ?? null,
                hasMore: false
            }
        }
    }

    getMentionRequest(namespace: string, requestId: string, expectedSessionId?: string): StoredTeamMentionRequest {
        return this.requireTeamMentionRequest(namespace, requestId, expectedSessionId)
    }

    autoReportSessionReply(input: { namespace: string; sessionId: string; text: string; requestId?: string | null }): { message: StoredTeamMessage } | null {
        const summary = input.text.trim().slice(0, 4_000)
        if (!summary) return null
        const request = input.requestId
            ? this.store.teamChats.getMentionRequest(input.namespace, input.requestId)
            : this.store.teamChats.listPendingMentionRequests(input.namespace, input.sessionId).at(-1)
        if (!request || request.targetSessionId !== input.sessionId) return null
        if (!['pending', 'delivered', 'seen', 'processing'].includes(request.status)) return null
        return this.reportToTeam({
            namespace: input.namespace,
            teamChatId: request.teamChatId,
            sourceSessionId: input.sessionId,
            type: 'reply',
            summary,
            replyToRequestId: request.id
        })
    }

    reportToTeam(input: {
        namespace: string
        teamChatId: string
        authorParticipantId?: string
        sourceSessionId?: string
        type: NonNullable<StoredTeamMessage['reportType']>
        summary: string
        details?: string
        replyToMessageId?: string | null
        replyToRequestId?: string | null
        mentions?: string[]
        files?: string[]
    }) {
        this.requireTeamChat(input.namespace, input.teamChatId)
        const authorParticipant = this.resolveReportAuthorParticipant(input)
        const text = input.details ? `${input.summary}\n\n${input.details}` : input.summary
        if (/^(ok|okay|noted|thanks|done)$/i.test(text.trim()) && !input.replyToRequestId) {
            throw new Error('TEAM_REPORT_TOO_LOW_SIGNAL')
        }
        const parentRequest = input.replyToRequestId ? this.requireTeamMentionRequest(input.namespace, input.replyToRequestId) : null
        if (parentRequest && parentRequest.teamChatId !== input.teamChatId) {
            throw new Error('TEAM_MENTION_NOT_FOUND')
        }
        if (parentRequest && input.sourceSessionId && parentRequest.targetSessionId !== input.sourceSessionId) {
            throw new Error('TEAM_MENTION_NOT_FOUND')
        }
        const hopDepth = parentRequest ? parentRequest.hopDepth + 1 : 0
        if (hopDepth > 3) throw new Error('TEAM_MENTION_HOP_LIMIT')
        const replyToMessageId = input.replyToMessageId ?? parentRequest?.sourceMessageId ?? null
        const participants = this.store.teamChats.listParticipants(input.namespace, input.teamChatId)
        const parsedMentions = parseTeamMentions(text, participants)
        const message = this.store.teamChats.addMessage({
            namespace: input.namespace,
            teamChatId: input.teamChatId,
            authorParticipantId: authorParticipant.id,
            text,
            reportType: input.type,
            replyToMessageId,
            replyPreview: replyToMessageId ? this.buildReplyPreview(input.namespace, input.teamChatId, replyToMessageId) : null,
            mentions: parsedMentions.map((mention) => ({
                participantId: mention.participantId,
                sessionId: mention.sessionId
            })),
            files: input.files ?? []
        })

        for (const mention of parsedMentions) {
            const contextSnapshot = this.buildMentionContextSnapshot(input.namespace, input.teamChatId, message.id, text)
            const request = this.store.teamChats.addMentionRequest({
                namespace: input.namespace,
                teamChatId: input.teamChatId,
                sourceMessageId: message.id,
                targetSessionId: mention.sessionId,
                contextSnapshot,
                hopDepth,
                parentRequestId: input.replyToRequestId ?? null
            })
            const session = this.resolveSession?.(input.namespace, mention.sessionId)
            if (this.mentionDelivery && session?.active) {
                this.mentionDelivery.deliver({
                    namespace: input.namespace,
                    request,
                    envelope: this.buildMentionEnvelope(request, text, contextSnapshot),
                    mode: getMentionDeliveryMode(session)
                })
            }
        }

        if (input.replyToRequestId) {
            const updated = this.store.teamChats.updateMentionStatus({
                namespace: input.namespace,
                requestId: input.replyToRequestId,
                status: 'responded',
                resolvedAt: Date.now()
            })
            if (updated) this.emitMentionUpdated(input.namespace, updated)
        }
        this.publisher.emit({ type: 'team-message-created', namespace: input.namespace, teamChatId: input.teamChatId, messageId: message.id })
        return { message }
    }

    private resolveReportAuthorParticipant(input: {
        namespace: string
        teamChatId: string
        authorParticipantId?: string
        sourceSessionId?: string
    }): StoredTeamParticipant {
        if (input.sourceSessionId) {
            const participant = this.store.teamChats.getActiveSessionParticipant(input.namespace, input.teamChatId, input.sourceSessionId)
            if (!participant) throw new Error('TEAM_PARTICIPANT_NOT_FOUND')
            if (input.authorParticipantId && input.authorParticipantId !== participant.id) {
                throw new Error('TEAM_PARTICIPANT_NOT_FOUND')
            }
            return participant
        }
        if (!input.authorParticipantId) throw new Error('TEAM_PARTICIPANT_NOT_FOUND')
        return this.requireTeamParticipant(input.namespace, input.teamChatId, input.authorParticipantId)
    }

    markMentionNoAction(input: { namespace: string; sessionId: string; requestId: string }): StoredTeamMentionRequest {
        return this.updateMentionStatus({
            namespace: input.namespace,
            sessionId: input.sessionId,
            requestId: input.requestId,
            status: 'no_action'
        })
    }

    listSessionMentionRequests(namespace: string, sessionId: string): StoredTeamMentionRequest[] {
        return this.store.teamChats.listSessionMentionRequests(namespace, sessionId)
    }

    updateMentionStatus(input: {
        namespace: string
        sessionId: string
        requestId: string
        status: StoredTeamMentionRequest['status']
    }): StoredTeamMentionRequest {
        const request = this.requireTeamMentionRequest(input.namespace, input.requestId, input.sessionId)
        const now = Date.now()
        const updated = this.store.teamChats.updateMentionStatus({
            namespace: input.namespace,
            requestId: request.id,
            status: input.status,
            seenAt: input.status === 'seen' ? now : undefined,
            processingStartedAt: input.status === 'processing' ? now : undefined,
            resolvedAt: ['responded', 'no_action', 'superseded', 'failed'].includes(input.status) ? now : undefined
        })
        if (!updated) throw new Error('TEAM_MENTION_NOT_FOUND')
        this.emitMentionUpdated(input.namespace, updated)
        return updated
    }

    private emitMentionUpdated(namespace: string, request: StoredTeamMentionRequest): void {
        this.publisher.emit({
            type: 'team-mention-updated',
            namespace,
            teamChatId: request.teamChatId,
            requestId: request.id,
            sessionId: request.targetSessionId,
            targetSessionId: request.targetSessionId
        })
    }

    private buildReplyPreview(namespace: string, teamChatId: string, messageId: string): { authorName: string; excerpt: string } {
        const message = this.requireTeamMessage(namespace, teamChatId, messageId)
        const author = this.store.teamChats.getParticipant(namespace, message.authorParticipantId)
        return {
            authorName: author?.displayName ?? 'Unknown',
            excerpt: message.text.slice(0, 160)
        }
    }

    private buildMentionContextSnapshot(namespace: string, teamChatId: string, messageId: string, originalText: string) {
        const chat = this.requireTeamChat(namespace, teamChatId)
        const sharedContext = (chat.sharedContext && typeof chat.sharedContext === 'object')
            ? chat.sharedContext
            : { decisions: [], openQuestions: [], relevantFiles: [] }
        const recentUpdates = this.store.teamChats.getMessages(namespace, teamChatId, 20)
            .filter((message) => message.id !== messageId)
            .map((message) => {
                const author = this.store.teamChats.getParticipant(namespace, message.authorParticipantId)
                return {
                    messageId: message.id,
                    authorName: author?.displayName ?? 'Unknown',
                    reportType: message.reportType,
                    text: message.text.slice(0, 2_000),
                    excerpt: message.text.slice(0, 240)
                }
            })
        const participants = this.store.teamChats.listParticipants(namespace, teamChatId).map((participant) => ({
            participantId: participant.id,
            type: participant.type,
            sessionId: participant.sessionId,
            displayName: participant.displayName,
            role: participant.role
        }))
        return {
            originalText,
            sharedContext,
            participants,
            recentUpdates,
            recentTeamMessages: recentUpdates,
            attachedFiles: []
        }
    }

    private buildMentionEnvelope(request: StoredTeamMentionRequest, text: string, contextSnapshot: unknown): string {
        return [
            '[HAPI_TEAM_MENTION]',
            `requestId=${request.id}`,
            `teamChatId=${request.teamChatId}`,
            `sourceMessageId=${request.sourceMessageId}`,
            '',
            'Reply behavior:',
            '- You were mentioned in a HAPI Team Chat.',
            '- Answer the Team Chat request using the context below.',
            '- If you send a normal text answer, HAPI will post it back to the Team Chat automatically.',
            `- For structured updates, call hapi_session.report_to_team with teamChatId=${request.teamChatId} and replyToRequestId=${request.id}.`,
            `- If no reply is needed, call hapi_session.mark_team_mention_no_action with requestId=${request.id}.`,
            '',
            `From Team Chat: ${text}`,
            '',
            'Context:',
            JSON.stringify(contextSnapshot)
        ].join('\n')
    }

    private requireTeamChat(namespace: string, teamChatId: string) {
        const chat = this.store.teamChats.getTeamChat(namespace, teamChatId)
        if (!chat) throw new Error('TEAM_CHAT_NOT_FOUND')
        return chat
    }

    private requireTeamParticipant(namespace: string, teamChatId: string, participantId: string) {
        const participant = this.store.teamChats.getParticipant(namespace, participantId)
        if (!participant || participant.teamChatId !== teamChatId || participant.archivedAt) throw new Error('TEAM_PARTICIPANT_NOT_FOUND')
        return participant
    }

    private requireTeamMessage(namespace: string, teamChatId: string, messageId: string) {
        const message = this.store.teamChats.getMessage(namespace, messageId)
        if (!message || message.teamChatId !== teamChatId) throw new Error('TEAM_MESSAGE_NOT_FOUND')
        return message
    }

    private requireTeamMentionRequest(namespace: string, requestId: string, expectedSessionId?: string) {
        const request = this.store.teamChats.getMentionRequest(namespace, requestId)
        if (!request || (expectedSessionId && request.targetSessionId !== expectedSessionId)) throw new Error('TEAM_MENTION_NOT_FOUND')
        return request
    }
}
