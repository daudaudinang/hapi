import { useMemo, useState } from 'react'
import type { SessionSummary, TeamChatMessage, TeamMentionRequest, TeamParticipant } from '@/types/api'
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

function getPathBasename(path?: string | null): string | null {
    if (!path) return null
    const parts = path.split(/[\\/]/).filter(Boolean)
    return parts.at(-1) ?? path
}

function getSessionDisplayName(session: SessionSummary): string {
    return session.metadata?.name
        ?? session.metadata?.summary?.text
        ?? getPathBasename(session.metadata?.path)
        ?? session.id.slice(0, 8)
}

export function TeamChatRightPanel(props: {
    participants: TeamParticipant[]
    messages?: TeamChatMessage[]
    mentionRequests?: TeamMentionRequest[]
    availableSessions?: SessionSummary[]
    onAddSession?: (session: SessionSummary) => void
    className?: string
}) {
    const [isAddingMember, setIsAddingMember] = useState(false)
    const [selectedSessionId, setSelectedSessionId] = useState('')
    const attentionItems = getAttentionItems(props.messages ?? [], props.mentionRequests ?? [])
    const addableSessions = useMemo(() => {
        const existingSessionIds = new Set(
            props.participants
                .map((participant) => participant.sessionId)
                .filter((sessionId): sessionId is string => Boolean(sessionId))
        )
        return (props.availableSessions ?? []).filter((session) => !existingSessionIds.has(session.id))
    }, [props.availableSessions, props.participants])

    const selectedSession = addableSessions.find((session) => session.id === selectedSessionId) ?? addableSessions[0] ?? null

    const handleStartAdding = () => {
        setSelectedSessionId(addableSessions[0]?.id ?? '')
        setIsAddingMember(true)
    }

    const handleAddSelectedSession = () => {
        if (!selectedSession) return
        props.onAddSession?.(selectedSession)
        setIsAddingMember(false)
        setSelectedSessionId('')
    }

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
            <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-[var(--app-hint)]">Members</div>
                {props.onAddSession ? (
                    <button
                        type="button"
                        onClick={handleStartAdding}
                        disabled={addableSessions.length === 0}
                        className="rounded-md border border-[var(--app-border)] bg-[var(--app-card-bg,var(--app-bg))] px-2 py-1 text-xs font-medium text-[var(--app-fg)] transition-colors hover:bg-[var(--app-secondary-bg)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        + Add member
                    </button>
                ) : null}
            </div>
            {isAddingMember && props.onAddSession ? (
                <div className="mt-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-card-bg,var(--app-bg))] p-2">
                    <label htmlFor="team-chat-session-to-add" className="mb-1 block text-xs font-medium text-[var(--app-hint)]">
                        Session to add
                    </label>
                    <select
                        id="team-chat-session-to-add"
                        aria-label="Session to add"
                        value={selectedSession?.id ?? ''}
                        onChange={(event) => setSelectedSessionId(event.target.value)}
                        className="w-full rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] px-2 py-1.5 text-sm text-[var(--app-fg)] outline-none focus:border-[var(--app-link)]"
                    >
                        {addableSessions.map((session) => (
                            <option key={session.id} value={session.id}>{getSessionDisplayName(session)}</option>
                        ))}
                    </select>
                    <div className="mt-2 flex items-center justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => setIsAddingMember(false)}
                            className="rounded-md px-2 py-1 text-xs text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleAddSelectedSession}
                            disabled={!selectedSession}
                            className="rounded-md bg-[var(--app-button)] px-2 py-1 text-xs font-medium text-[var(--app-button-text)] transition-opacity hover:opacity-90 disabled:opacity-50"
                        >
                            Add to Team
                        </button>
                    </div>
                </div>
            ) : props.onAddSession && addableSessions.length === 0 ? (
                <div className="mt-2 text-xs text-[var(--app-hint)]">All available sessions are already in this Team Chat.</div>
            ) : null}
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
