import type { Store } from '../store'
import type { StoredTeamMessage, StoredTeamMentionRequest, StoredTeamParticipant } from '../store/types'
import type { EventPublisher } from './eventPublisher'

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
        private readonly publisher: Pick<EventPublisher, 'emit'>
    ) {}

    createTeamChat(input: { namespace: string; name: string; projectPath?: string | null }) {
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

    listParticipants(namespace: string, teamChatId: string) {
        this.requireTeamChat(namespace, teamChatId)
        return this.store.teamChats.listParticipants(namespace, teamChatId)
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
            mentions: input.mentions ?? [],
            files: input.files ?? []
        })
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

    private buildReplyPreview(namespace: string, teamChatId: string, messageId: string): { authorName: string; excerpt: string } {
        const message = this.requireTeamMessage(namespace, teamChatId, messageId)
        const author = this.store.teamChats.getParticipant(namespace, message.authorParticipantId)
        return {
            authorName: author?.displayName ?? 'Unknown',
            excerpt: message.text.slice(0, 160)
        }
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
