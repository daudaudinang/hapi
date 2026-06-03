import { useMemo, useState } from 'react'
import type { SessionSummary, TeamChatMessage, TeamMentionRequest, TeamParticipant } from '@/types/api'
import { compareSessionGroupOrder } from '@/lib/session-group-order'
import { cn } from '@/lib/utils'
import { getParticipantAccent } from './teamColors'

type AttentionItem =
    | { kind: 'blocked' | 'question'; message: TeamChatMessage; createdAt: number }
    | { kind: 'failed-delivery' | 'needs-user-input'; request: TeamMentionRequest; createdAt: number }

type SessionPickerGroup = {
    key: string
    directory: string
    displayName: string
    machineId: string | null
    sessions: SessionSummary[]
    latestUpdatedAt: number
    hasActiveSession: boolean
    workingCount: number
    activeCount: number
}

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

function getGroupDisplayName(directory: string): string {
    if (directory === 'Other') return directory
    const parts = directory.split(/[\\/]+/).filter(Boolean)
    if (parts.length === 0) return directory
    if (parts.length === 1) return parts[0]
    return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`
}

function getSessionDisplayName(session: SessionSummary): string {
    return session.metadata?.name
        ?? session.metadata?.summary?.text
        ?? getPathBasename(session.metadata?.path)
        ?? session.id.slice(0, 8)
}

function getSessionProjectPath(session: SessionSummary): string {
    return session.metadata?.worktree?.basePath ?? session.metadata?.path ?? 'Other'
}

function getSessionStatus(session: SessionSummary): {
    label: string
    rank: number
    dotClassName: string
    pillClassName: string
} {
    if (session.pendingRequestsCount > 0) {
        return {
            label: 'Needs input',
            rank: 0,
            dotClassName: 'bg-amber-400',
            pillClassName: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
        }
    }
    if (session.thinking) {
        return {
            label: 'Working',
            rank: 1,
            dotClassName: 'bg-sky-400',
            pillClassName: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300'
        }
    }
    if (session.active) {
        return {
            label: 'Active',
            rank: 2,
            dotClassName: 'bg-emerald-400',
            pillClassName: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
        }
    }
    return {
        label: 'Idle',
        rank: 3,
        dotClassName: 'bg-[var(--app-border)]',
        pillClassName: 'border-[var(--app-border)] bg-[var(--app-secondary-bg)] text-[var(--app-hint)]'
    }
}

function sortSessionsForPicker(sessions: SessionSummary[]): SessionSummary[] {
    return [...sessions].sort((a, b) => {
        const statusA = getSessionStatus(a)
        const statusB = getSessionStatus(b)
        if (statusA.rank !== statusB.rank) return statusA.rank - statusB.rank
        return b.updatedAt - a.updatedAt
    })
}

function groupSessionsForPicker(sessions: SessionSummary[]): SessionPickerGroup[] {
    const groups = new Map<string, { directory: string; machineId: string | null; sessions: SessionSummary[] }>()

    for (const session of sessions) {
        const directory = getSessionProjectPath(session)
        const machineId = session.metadata?.machineId ?? null
        const key = `${machineId ?? 'unknown'}::${directory}`
        const existing = groups.get(key)
        if (existing) {
            existing.sessions.push(session)
        } else {
            groups.set(key, { directory, machineId, sessions: [session] })
        }
    }

    return Array.from(groups.entries())
        .map(([key, group]) => {
            const sortedSessions = sortSessionsForPicker(group.sessions)
            const latestUpdatedAt = group.sessions.reduce((max, session) => Math.max(max, session.updatedAt), 0)
            const hasActiveSession = group.sessions.some((session) => session.active)
            return {
                key,
                directory: group.directory,
                displayName: getGroupDisplayName(group.directory),
                machineId: group.machineId,
                sessions: sortedSessions,
                latestUpdatedAt,
                hasActiveSession,
                workingCount: group.sessions.filter((session) => session.thinking).length,
                activeCount: group.sessions.filter((session) => session.active).length
            }
        })
        .sort((a, b) => compareSessionGroupOrder({
            label: a.displayName,
            latestUpdatedAt: a.latestUpdatedAt,
            hasActiveSession: a.hasActiveSession
        }, {
            label: b.displayName,
            latestUpdatedAt: b.latestUpdatedAt,
            hasActiveSession: b.hasActiveSession
        }))
}

function SessionPickerTree(props: {
    groups: SessionPickerGroup[]
    selectedSessionId: string
    onSelectSession: (sessionId: string) => void
}) {
    return (
        <div
            role="tree"
            aria-label="Available sessions"
            className="app-scroll-y max-h-72 space-y-2 rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-2"
        >
            {props.groups.map((group) => (
                <div key={group.key}>
                    <div
                        role="treeitem"
                        aria-expanded="true"
                        title={group.directory}
                        className="flex min-w-0 items-center gap-2 rounded-md px-1 py-1 text-xs text-[var(--app-hint)]"
                    >
                        <span aria-hidden="true" className="text-[10px]">▾</span>
                        <div className="min-w-0 flex-1">
                            <div className="truncate font-semibold text-[var(--app-fg)]">{group.displayName}</div>
                            <div className="truncate">
                                {group.sessions.length} session{group.sessions.length === 1 ? '' : 's'}
                                {group.activeCount > 0 ? ` · ${group.activeCount} active` : ''}
                                {group.workingCount > 0 ? ` · ${group.workingCount} working` : ''}
                                {group.machineId ? ` · ${group.machineId.slice(0, 8)}` : ''}
                            </div>
                        </div>
                    </div>
                    <div role="group" className="ml-2 space-y-1 border-l border-[var(--app-border)] pl-2">
                        {group.sessions.map((session) => {
                            const status = getSessionStatus(session)
                            const isSelected = session.id === props.selectedSessionId
                            const displayName = getSessionDisplayName(session)
                            return (
                                <button
                                    key={session.id}
                                    type="button"
                                    aria-label={`${displayName} ${status.label}`}
                                    aria-pressed={isSelected}
                                    onClick={() => props.onSelectSession(session.id)}
                                    className={cn(
                                        'flex w-full min-w-0 items-center gap-2 rounded-lg border px-2 py-2 text-left transition-colors',
                                        isSelected
                                            ? 'border-[var(--app-link)] bg-[var(--app-link)]/10'
                                            : 'border-transparent hover:border-[var(--app-border)] hover:bg-[var(--app-secondary-bg)]'
                                    )}
                                >
                                    <span
                                        aria-hidden="true"
                                        className={cn('h-2 w-2 shrink-0 rounded-full', status.dotClassName, session.thinking ? 'animate-pulse' : '')}
                                    />
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-sm font-medium text-[var(--app-fg)]">{displayName}</div>
                                        <div className="truncate text-[11px] text-[var(--app-hint)]">
                                            {session.model ?? 'auto model'}{session.metadata?.lastUserRequest ? ` · ${session.metadata.lastUserRequest}` : ''}
                                        </div>
                                    </div>
                                    <span className={cn('shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium', status.pillClassName)}>
                                        {status.label}
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                </div>
            ))}
        </div>
    )
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
    const sessionGroups = useMemo(() => groupSessionsForPicker(addableSessions), [addableSessions])
    const sortedAddableSessions = useMemo(() => sessionGroups.flatMap((group) => group.sessions), [sessionGroups])

    const selectedSession = sortedAddableSessions.find((session) => session.id === selectedSessionId) ?? sortedAddableSessions[0] ?? null

    const handleStartAdding = () => {
        setSelectedSessionId(sortedAddableSessions[0]?.id ?? '')
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
                    <div className="mb-2 flex items-start justify-between gap-2">
                        <div>
                            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--app-hint)]">Add session</div>
                            <div className="mt-0.5 text-xs text-[var(--app-hint)]">Grouped by project. Working and active sessions stay on top.</div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsAddingMember(false)}
                            className="shrink-0 rounded-md px-2 py-1 text-xs text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]"
                        >
                            Cancel
                        </button>
                    </div>
                    {sessionGroups.length > 0 ? (
                        <SessionPickerTree
                            groups={sessionGroups}
                            selectedSessionId={selectedSession?.id ?? ''}
                            onSelectSession={setSelectedSessionId}
                        />
                    ) : (
                        <div className="rounded-lg border border-dashed border-[var(--app-border)] p-3 text-xs text-[var(--app-hint)]">
                            No sessions available to add.
                        </div>
                    )}
                    <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="min-w-0 truncate text-xs text-[var(--app-hint)]">
                            {selectedSession ? `Selected: ${getSessionDisplayName(selectedSession)}` : 'Pick a session'}
                        </div>
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
