import type { TeamMentionRequest } from '@/types/api'

const ACTIVE_STATUSES = new Set<TeamMentionRequest['status']>(['pending', 'delivered', 'seen', 'processing'])

export function getActiveTeamMentionRequests(requests: readonly TeamMentionRequest[]): TeamMentionRequest[] {
    return requests
        .filter((request) => ACTIVE_STATUSES.has(request.status))
        .sort((a, b) => a.createdAt - b.createdAt)
}

function summarizeStatus(requests: readonly TeamMentionRequest[]): string {
    const seenCount = requests.filter((request) => request.status === 'seen').length
    const processingCount = requests.filter((request) => request.status === 'processing').length
    const parts: string[] = []
    if (processingCount > 0) parts.push(`${processingCount} processing`)
    if (seenCount > 0) parts.push(`${seenCount} seen`)
    return parts.join(' · ')
}

export function TeamMentionQueueBar(props: {
    requests: readonly TeamMentionRequest[]
    onReviewFirst: (requestId: string) => void
    onOpenTeamChat: (teamChatId: string) => void
}) {
    const activeRequests = getActiveTeamMentionRequests(props.requests)
    if (activeRequests.length <= 1) return null

    const first = activeRequests[0]
    const latest = activeRequests[activeRequests.length - 1]
    const statusSummary = summarizeStatus(activeRequests)

    return (
        <div
            aria-label="Pending Team mentions"
            className="mx-auto mb-2 flex w-full max-w-content items-center gap-2 rounded-xl border border-[var(--app-border)] bg-[var(--app-card-bg,var(--app-bg))] px-3 py-2 text-xs text-[var(--app-fg)] shadow-sm"
        >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--app-secondary-bg)] text-[13px]">@</div>
            <div className="min-w-0 flex-1">
                <div className="font-medium">{activeRequests.length} Team mentions waiting</div>
                {statusSummary ? <div className="mt-0.5 text-[var(--app-hint)]">{statusSummary}</div> : null}
            </div>
            <button
                type="button"
                className="shrink-0 rounded-md bg-[var(--app-button)] px-2.5 py-1.5 font-medium text-[var(--app-button-text)]"
                onClick={() => props.onReviewFirst(first.id)}
            >
                Review first
            </button>
            <button
                type="button"
                className="hidden shrink-0 rounded-md border border-[var(--app-border)] px-2.5 py-1.5 text-[var(--app-fg)] sm:inline-flex"
                onClick={() => props.onOpenTeamChat(latest.teamChatId)}
            >
                Open Team
            </button>
        </div>
    )
}
