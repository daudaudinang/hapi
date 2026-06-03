import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import type { TeamChatMessage, TeamMentionRequest, TeamParticipant } from '@/types/api'
import { getParticipantAccent } from './teamColors'

function getMentionStatusLabel(status: TeamMentionRequest['status']): string {
    if (status === 'no_action') return 'seen · no action'
    if (status === 'responded') return 'replied'
    if (status === 'delivered') return 'delivered'
    if (status === 'seen') return 'seen · no reply yet'
    if (status === 'processing') return 'processing'
    if (status === 'failed') return 'failed to receive'
    if (status === 'superseded') return 'superseded'
    return 'pending'
}

function isSeenStatus(status: TeamMentionRequest['status']): boolean {
    return status === 'seen' || status === 'no_action' || status === 'processing' || status === 'responded'
}

export function TeamMessageCard(props: {
    message: TeamChatMessage
    author: TeamParticipant | null
    participants?: TeamParticipant[]
    mentionRequests?: TeamMentionRequest[]
    onReplyPreviewClick: (messageId: string) => void
}) {
    const accent = getParticipantAccent(props.author?.color)
    const participantById = new Map((props.participants ?? []).map((participant) => [participant.id, participant]))
    const requestByTargetSession = new Map(
        (props.mentionRequests ?? [])
            .filter((request) => request.sourceMessageId === props.message.id)
            .map((request) => [request.targetSessionId, request])
    )
    const reportLabel = props.message.reportType === 'blocked'
        ? 'Blocked'
        : props.message.reportType === 'done'
            ? 'Done'
            : props.message.reportType === 'reply'
                ? 'Replied'
                : props.message.reportType === 'question'
                    ? 'Needs input'
                    : props.message.reportType === 'progress'
                        ? 'Progress'
                        : props.message.reportType === 'handoff'
                            ? 'Handoff'
                            : null
    const toneClass = props.message.reportType === 'done'
        ? 'border-emerald-500/60'
        : props.message.reportType === 'blocked'
            ? 'border-red-500/60'
            : props.message.reportType === 'question'
                ? 'border-amber-500/60'
                : props.message.reportType === 'progress'
                    ? 'border-blue-500/60'
                    : props.message.reportType === 'handoff'
                        ? 'border-purple-500/60'
                        : 'border-[var(--app-border)]'

    return (
        <Card className={`border ${toneClass} bg-[var(--app-bg)] p-3 shadow-sm`} style={{ borderLeft: `3px solid ${accent}` }}>
            <div className="mb-1 flex items-center gap-2 text-xs text-[var(--app-hint)]">
                <span className="font-medium text-[var(--app-fg)]">{props.author?.displayName ?? 'Unknown'}</span>
                {reportLabel ? <Badge>{reportLabel}</Badge> : null}
            </div>
            {props.message.replyToMessageId && props.message.replyPreview ? (
                <button
                    type="button"
                    onClick={() => props.onReplyPreviewClick(props.message.replyToMessageId!)}
                    className="mb-2 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-subtle-bg)] px-2 py-1 text-left text-xs text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)]"
                >
                    Replied to {props.message.replyPreview.authorName}: {props.message.replyPreview.excerpt}
                </button>
            ) : null}
            <div className="whitespace-pre-wrap text-sm leading-6 text-[var(--app-fg)]">{props.message.text}</div>
            {props.message.mentions.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                    {props.message.mentions.map((mention) => {
                        const participant = participantById.get(mention.participantId)
                        const request = requestByTargetSession.get(mention.sessionId)
                        const status = request?.status ?? 'pending'
                        const name = participant?.displayName ?? mention.sessionId.slice(0, 8)
                        return (
                            <div
                                key={`${mention.participantId}:${mention.sessionId}`}
                                className="inline-flex items-center gap-1 rounded-full border border-[var(--app-border)] bg-[var(--app-subtle-bg)] px-2 py-0.5 text-[11px] text-[var(--app-hint)]"
                            >
                                {isSeenStatus(status) ? <span aria-label={`Seen by ${name}`}>👁</span> : null}
                                <span className="font-medium text-[var(--app-fg)]">{name}</span>
                                <span>{getMentionStatusLabel(status)}</span>
                            </div>
                        )
                    })}
                </div>
            ) : null}
        </Card>
    )
}
