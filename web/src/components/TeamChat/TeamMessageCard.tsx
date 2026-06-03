import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import type { TeamChatMessage, TeamParticipant } from '@/types/api'
import { getParticipantAccent } from './teamColors'

export function TeamMessageCard(props: {
    message: TeamChatMessage
    author: TeamParticipant | null
    onReplyPreviewClick: (messageId: string) => void
}) {
    const accent = getParticipantAccent(props.author?.color)
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

    return (
        <Card className="border border-[var(--app-border)] bg-[var(--app-bg)] p-3 shadow-sm" style={{ borderLeft: `3px solid ${accent}` }}>
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
        </Card>
    )
}
