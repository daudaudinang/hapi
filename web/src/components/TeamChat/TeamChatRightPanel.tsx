import type { TeamChatMessage, TeamMentionRequest, TeamParticipant } from '@/types/api'
import { cn } from '@/lib/utils'
import { getParticipantAccent } from './teamColors'

type AttentionItem =
    | { kind: 'blocked' | 'question'; message: TeamChatMessage; createdAt: number }
    | { kind: 'failed-delivery' | 'needs-user-input'; request: TeamMentionRequest; createdAt: number }

function getAttentionItems(messages: TeamChatMessage[], mentionRequests: TeamMentionRequest[]): AttentionItem[] {
    return [
        ...messages
            .filter((message) => message.reportType === 'blocked' || message.reportType === 'question')
            .map((message) => ({ kind: message.reportType as 'blocked' | 'question', message, createdAt: message.createdAt })),
        ...mentionRequests
            .filter((request) => request.status === 'failed' || request.status === 'pending')
            .map((request) => ({
                kind: request.status === 'failed' ? 'failed-delivery' : 'needs-user-input',
                request,
                createdAt: request.createdAt
            } as AttentionItem))
    ].sort((a, b) => b.createdAt - a.createdAt)
}

function getAttentionLabel(item: AttentionItem): string {
    if (item.kind === 'blocked') return 'Blocked'
    if (item.kind === 'question') return 'Question'
    if (item.kind === 'failed-delivery') return 'Failed delivery'
    return 'Waiting for response'
}

export function TeamChatRightPanel(props: {
    participants: TeamParticipant[]
    messages?: TeamChatMessage[]
    mentionRequests?: TeamMentionRequest[]
    className?: string
}) {
    const attentionItems = getAttentionItems(props.messages ?? [], props.mentionRequests ?? [])
    return (
        <aside className={cn('hidden w-72 shrink-0 border-l border-[var(--app-border)] bg-[var(--app-bg)] p-3 lg:block', props.className)}>
            {attentionItems.length > 0 ? (
                <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">Needs attention</div>
                    <div className="mt-2 space-y-2">
                        {attentionItems.slice(0, 4).map((item) => (
                            <div key={`${item.kind}:${item.createdAt}`} className="rounded-lg bg-[var(--app-bg)] px-2 py-1.5 text-xs">
                                <div className="font-medium text-[var(--app-fg)]">{getAttentionLabel(item)}</div>
                                {'message' in item ? (
                                    <div className="mt-0.5 line-clamp-2 text-[var(--app-hint)]">{item.message.text}</div>
                                ) : (
                                    <div className="mt-0.5 text-[var(--app-hint)]">Mention request {item.request.id.slice(0, 8)}</div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--app-hint)]">Members</div>
            <div className="mt-3 space-y-2">
                {props.participants.map((participant) => (
                    <div key={participant.id} className="flex items-center gap-2 rounded-xl border border-[var(--app-border)] p-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: getParticipantAccent(participant.color) }} />
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">{participant.displayName}</div>
                            <div className="text-xs capitalize text-[var(--app-hint)]">{participant.role}</div>
                        </div>
                    </div>
                ))}
            </div>
        </aside>
    )
}
