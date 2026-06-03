import type { Session } from '@hapi/protocol/types'
import type { Store, StoredTeamMentionRequest } from '../store'
import type { EventPublisher } from './eventPublisher'
import type { MessageService } from './messageService'

export type TeamMentionDeliveryMode = 'invoke-agent' | 'card-only'

export function getMentionDeliveryMode(session: Pick<Session, 'active' | 'thinking' | 'agentState'>): TeamMentionDeliveryMode {
    if (!session.active) return 'card-only'
    if (session.thinking) return 'card-only'
    if (session.agentState?.controlledByUser === true) return 'card-only'
    return 'invoke-agent'
}

export class TeamMentionDeliveryService {
    constructor(
        private readonly messageService: MessageService,
        private readonly store: Store,
        private readonly publisher: Pick<EventPublisher, 'emit'>
    ) {}

    deliver(input: { namespace: string; request: StoredTeamMentionRequest; envelope: string; mode: TeamMentionDeliveryMode }): void {
        this.messageService.sendTeamMentionMessage(input.request.targetSessionId, {
            text: input.envelope,
            invokeAgent: input.mode === 'invoke-agent',
            meta: {
                sentFrom: 'team-chat',
                teamMentionRequestId: input.request.id,
                teamChatId: input.request.teamChatId,
                sourceMessageId: input.request.sourceMessageId
            }
        })
        const deliveredAt = Date.now()
        this.store.teamChats.updateMentionStatus({ namespace: input.namespace, requestId: input.request.id, status: 'delivered', deliveredAt })
        this.publisher.emit({
            type: 'team-mention-updated',
            namespace: input.namespace,
            teamChatId: input.request.teamChatId,
            requestId: input.request.id,
            sessionId: input.request.targetSessionId,
            targetSessionId: input.request.targetSessionId
        })
    }
}
