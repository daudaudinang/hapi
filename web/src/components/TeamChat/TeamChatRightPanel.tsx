import { useMemo, useState } from 'react'
import type { Machine, SessionSummary, TeamChatMessage, TeamMentionRequest, TeamParticipant } from '@/types/api'
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

function suggestSessionAlias(session: SessionSummary): string {
    const displayName = getSessionDisplayName(session).trim()
    if (displayName.length <= 32) return displayName
    const pathName = getPathBasename(session.metadata?.path)?.trim()
    if (pathName && pathName.length <= 32) return pathName
    return displayName.slice(0, 32).trim()
}

function normalizeAlias(alias: string): string {
    return alias.trim().replace(/\s+/g, ' ')
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

function getSessionDetails(session: SessionSummary): string {
    return [
        session.model,
        session.effort ? `${session.effort} effort` : null,
        session.todoProgress ? `${session.todoProgress.completed}/${session.todoProgress.total} todo` : null,
        session.pendingRequestsCount > 0 ? `${session.pendingRequestsCount} request${session.pendingRequestsCount === 1 ? '' : 's'}` : null
    ].filter((item): item is string => Boolean(item)).join(' · ')
}

function sortSessionsForPicker(sessions: SessionSummary[]): SessionSummary[] {
    return [...sessions].sort((a, b) => {
        const statusA = getSessionStatus(a)
        const statusB = getSessionStatus(b)
        if (statusA.rank !== statusB.rank) return statusA.rank - statusB.rank
        return b.updatedAt - a.updatedAt
    })
}

function getMachineDisplayName(machine: Machine): string {
    return machine.metadata?.displayName
        ?? machine.metadata?.host
        ?? machine.id.slice(0, 8)
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
    machines?: Machine[]
    defaultMachineId?: string | null
    defaultProjectPath?: string | null
    onAddSession?: (session: SessionSummary, alias: string) => Promise<void> | void
    onCreateSessionMember?: (input: { alias: string; machineId: string; projectPath: string; initialTask?: string }) => Promise<void> | void
    onOpenSession?: (participant: TeamParticipant) => void
    className?: string
}) {
    const [isAddingMember, setIsAddingMember] = useState(false)
    const [addMemberTab, setAddMemberTab] = useState<'existing' | 'new'>('existing')
    const [selectedSessionId, setSelectedSessionId] = useState('')
    const [alias, setAlias] = useState('')
    const [newAlias, setNewAlias] = useState('')
    const [newMachineId, setNewMachineId] = useState('')
    const [newProjectPath, setNewProjectPath] = useState('')
    const [newInitialTask, setNewInitialTask] = useState('')
    const [dialogError, setDialogError] = useState<string | null>(null)
    const [isSubmittingMember, setIsSubmittingMember] = useState(false)
    const attentionItems = getAttentionItems(props.messages ?? [], props.mentionRequests ?? [])
    const sessionsById = useMemo(() => new Map((props.availableSessions ?? []).map((session) => [session.id, session])), [props.availableSessions])
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
    const machineOptions = useMemo(() => {
        const options = (props.machines ?? []).map((machine) => ({
            id: machine.id,
            label: getMachineDisplayName(machine)
        }))
        if (props.defaultMachineId && !options.some((machine) => machine.id === props.defaultMachineId)) {
            options.unshift({
                id: props.defaultMachineId,
                label: props.defaultMachineId.slice(0, 8)
            })
        }
        return options
    }, [props.defaultMachineId, props.machines])

    const selectedSession = sortedAddableSessions.find((session) => session.id === selectedSessionId) ?? sortedAddableSessions[0] ?? null
    const normalizedAlias = normalizeAlias(alias)
    const aliasExists = props.participants.some((participant) => participant.displayName.toLowerCase() === normalizedAlias.toLowerCase())
    const aliasError = !normalizedAlias
        ? 'Alias is required.'
        : normalizedAlias.length > 32
            ? 'Alias must be 32 characters or fewer.'
            : aliasExists
                ? 'Alias already used in this Team Chat.'
                : null
    const normalizedNewAlias = normalizeAlias(newAlias)
    const newAliasExists = props.participants.some((participant) => participant.displayName.toLowerCase() === normalizedNewAlias.toLowerCase())
    const newAliasError = !normalizedNewAlias
        ? 'Alias is required.'
        : normalizedNewAlias.length > 32
            ? 'Alias must be 32 characters or fewer.'
            : newAliasExists
                ? 'Alias already used in this Team Chat.'
                : null
    const normalizedNewProjectPath = newProjectPath.trim()
    const normalizedInitialTask = newInitialTask.trim()
    const canAddMembers = Boolean(props.onAddSession || props.onCreateSessionMember)

    const handleStartAdding = () => {
        const firstSession = sortedAddableSessions[0] ?? null
        const firstMachineId = props.defaultMachineId
            ?? machineOptions[0]?.id
            ?? firstSession?.metadata?.machineId
            ?? ''
        const firstProjectPath = props.defaultProjectPath
            ?? firstSession?.metadata?.path
            ?? ''
        setSelectedSessionId(firstSession?.id ?? '')
        setAlias(firstSession ? suggestSessionAlias(firstSession) : '')
        setNewAlias('')
        setNewMachineId(firstMachineId)
        setNewProjectPath(firstProjectPath)
        setNewInitialTask('')
        setDialogError(null)
        setAddMemberTab(props.onAddSession && firstSession ? 'existing' : 'new')
        setIsAddingMember(true)
    }

    const handleSelectSession = (sessionId: string) => {
        setSelectedSessionId(sessionId)
        const session = sortedAddableSessions.find((item) => item.id === sessionId)
        setAlias(session ? suggestSessionAlias(session) : '')
    }

    const handleAddSelectedSession = async () => {
        if (!selectedSession || aliasError) return
        setDialogError(null)
        setIsSubmittingMember(true)
        try {
            await props.onAddSession?.(selectedSession, normalizedAlias)
            setIsAddingMember(false)
            setSelectedSessionId('')
            setAlias('')
        } catch (error) {
            setDialogError(error instanceof Error ? error.message : 'Failed to add member.')
        } finally {
            setIsSubmittingMember(false)
        }
    }

    const handleCreateSessionMember = async () => {
        if (!props.onCreateSessionMember || newAliasError || !newMachineId || !normalizedNewProjectPath) return
        setDialogError(null)
        setIsSubmittingMember(true)
        try {
            await props.onCreateSessionMember({
                alias: normalizedNewAlias,
                machineId: newMachineId,
                projectPath: normalizedNewProjectPath,
                initialTask: normalizedInitialTask || undefined
            })
            setIsAddingMember(false)
            setNewAlias('')
            setNewInitialTask('')
        } catch (error) {
            setDialogError(error instanceof Error ? error.message : 'Failed to create session member.')
        } finally {
            setIsSubmittingMember(false)
        }
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
                {canAddMembers ? (
                    <button
                        type="button"
                        onClick={handleStartAdding}
                        className="rounded-md border border-[var(--app-border)] bg-[var(--app-card-bg,var(--app-bg))] px-2 py-1 text-xs font-medium text-[var(--app-fg)] transition-colors hover:bg-[var(--app-secondary-bg)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        + Add member
                    </button>
                ) : null}
            </div>
            {isAddingMember ? (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="Add member"
                    className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/45 p-0 backdrop-blur-sm sm:items-center sm:p-4"
                >
                    <div className="flex h-full w-full flex-col border border-[var(--app-border)] bg-[var(--app-bg)] text-[var(--app-fg)] shadow-2xl sm:h-auto sm:max-h-[calc(100vh-32px)] sm:max-w-3xl sm:rounded-2xl lg:max-w-5xl">
                        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--app-border)] px-4 py-3">
                            <div>
                                <div className="text-base font-semibold">Add member</div>
                                <div className="mt-0.5 text-xs text-[var(--app-hint)]">Add an existing session or create a new one with a Team alias.</div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsAddingMember(false)}
                                className="rounded-md border border-[var(--app-border)] px-2.5 py-1 text-sm text-[var(--app-fg)] transition-colors hover:bg-[var(--app-secondary-bg)]"
                            >
                                Close
                            </button>
                        </div>
                        <div className="flex shrink-0 gap-2 border-b border-[var(--app-border)] px-4 py-2" role="tablist" aria-label="Add member mode">
                            {props.onAddSession ? (
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={addMemberTab === 'existing'}
                                    onClick={() => setAddMemberTab('existing')}
                                    className={cn(
                                        'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                                        addMemberTab === 'existing'
                                            ? 'bg-[var(--app-button)] text-[var(--app-button-text)]'
                                            : 'text-[var(--app-hint)] hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]'
                                    )}
                                >
                                    Existing session
                                </button>
                            ) : null}
                            {props.onCreateSessionMember ? (
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={addMemberTab === 'new'}
                                    onClick={() => setAddMemberTab('new')}
                                    className={cn(
                                        'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                                        addMemberTab === 'new'
                                            ? 'bg-[var(--app-button)] text-[var(--app-button-text)]'
                                            : 'text-[var(--app-hint)] hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]'
                                    )}
                                >
                                    New session
                                </button>
                            ) : null}
                        </div>
                        <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
                            {addMemberTab === 'existing' && props.onAddSession ? (
                                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
                                    <div>
                                        <div className="text-xs font-semibold uppercase tracking-wide text-[var(--app-hint)]">Existing sessions</div>
                                        <div className="mt-1 text-xs text-[var(--app-hint)]">Grouped by project. Working and active sessions stay on top.</div>
                                        <div className="mt-3">
                                            {sessionGroups.length > 0 ? (
                                                <SessionPickerTree
                                                    groups={sessionGroups}
                                                    selectedSessionId={selectedSession?.id ?? ''}
                                                    onSelectSession={handleSelectSession}
                                                />
                                            ) : (
                                                <div className="rounded-lg border border-dashed border-[var(--app-border)] p-3 text-sm text-[var(--app-hint)]">
                                                    No existing sessions available. Use New session to create one for this Team Chat.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-card-bg,var(--app-bg))] p-3">
                                        <label htmlFor="team-chat-member-alias" className="mb-1 block text-xs font-medium text-[var(--app-hint)]">
                                            Team alias
                                        </label>
                                        <input
                                            id="team-chat-member-alias"
                                            aria-label="Team alias"
                                            value={alias}
                                            maxLength={64}
                                            onChange={(event) => setAlias(event.target.value)}
                                            className="w-full rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] px-2 py-1.5 text-sm text-[var(--app-fg)] outline-none focus:border-[var(--app-link)]"
                                            placeholder="Backend, UI, Tester…"
                                        />
                                        <div className="mt-1 flex items-center justify-between gap-2 text-[11px]">
                                            <span className="truncate text-[var(--app-hint)]">
                                                Tag preview: <span className="font-mono">@{normalizedAlias || 'alias'}</span>
                                            </span>
                                            <span className="text-[var(--app-hint)]">{normalizedAlias.length}/32</span>
                                        </div>
                                        {aliasError ? <div className="mt-1 text-xs text-red-600">{aliasError}</div> : null}
                                        <div className="mt-3 min-w-0 truncate text-xs text-[var(--app-hint)]">
                                            {selectedSession ? `Selected: ${getSessionDisplayName(selectedSession)}` : 'Pick a session'}
                                        </div>
                                    </div>
                                </div>
                            ) : null}
                            {addMemberTab === 'new' && props.onCreateSessionMember ? (
                                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
                                    <div className="space-y-3">
                                        <div>
                                            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--app-hint)]">New session</div>
                                            <div className="mt-1 text-xs text-[var(--app-hint)]">Creates a Codex session and immediately adds it to this Team Chat.</div>
                                        </div>
                                        <div>
                                            <label htmlFor="team-chat-new-machine" className="mb-1 block text-xs font-medium text-[var(--app-hint)]">Machine</label>
                                            <select
                                                id="team-chat-new-machine"
                                                aria-label="Machine"
                                                value={newMachineId}
                                                onChange={(event) => setNewMachineId(event.target.value)}
                                                className="w-full rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] px-2 py-2 text-sm text-[var(--app-fg)] outline-none focus:border-[var(--app-link)]"
                                            >
                                                {machineOptions.map((machine) => (
                                                    <option key={machine.id} value={machine.id}>{machine.label}</option>
                                                ))}
                                            </select>
                                            {machineOptions.length === 0 ? <div className="mt-1 text-xs text-red-600">No machine available to create a session.</div> : null}
                                        </div>
                                        <div>
                                            <label htmlFor="team-chat-new-project" className="mb-1 block text-xs font-medium text-[var(--app-hint)]">Project path</label>
                                            <input
                                                id="team-chat-new-project"
                                                aria-label="Project path"
                                                value={newProjectPath}
                                                onChange={(event) => setNewProjectPath(event.target.value)}
                                                className="w-full rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] px-2 py-2 text-sm text-[var(--app-fg)] outline-none focus:border-[var(--app-link)]"
                                                placeholder="/home/me/project"
                                            />
                                        </div>
                                        <div>
                                            <label htmlFor="team-chat-new-initial-task" className="mb-1 block text-xs font-medium text-[var(--app-hint)]">Initial task</label>
                                            <textarea
                                                id="team-chat-new-initial-task"
                                                aria-label="Initial task"
                                                value={newInitialTask}
                                                onChange={(event) => setNewInitialTask(event.target.value)}
                                                rows={5}
                                                className="w-full resize-none rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] px-2 py-2 text-sm text-[var(--app-fg)] outline-none focus:border-[var(--app-link)]"
                                                placeholder="Optional. Send the first instruction to this new session."
                                            />
                                        </div>
                                    </div>
                                    <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-card-bg,var(--app-bg))] p-3">
                                        <label htmlFor="team-chat-new-alias" className="mb-1 block text-xs font-medium text-[var(--app-hint)]">
                                            Team alias
                                        </label>
                                        <input
                                            id="team-chat-new-alias"
                                            aria-label="Team alias"
                                            value={newAlias}
                                            maxLength={64}
                                            onChange={(event) => setNewAlias(event.target.value)}
                                            className="w-full rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] px-2 py-1.5 text-sm text-[var(--app-fg)] outline-none focus:border-[var(--app-link)]"
                                            placeholder="Backend API"
                                        />
                                        <div className="mt-1 flex items-center justify-between gap-2 text-[11px]">
                                            <span className="truncate text-[var(--app-hint)]">
                                                Tag preview: <span className="font-mono">@{normalizedNewAlias || 'alias'}</span>
                                            </span>
                                            <span className="text-[var(--app-hint)]">{normalizedNewAlias.length}/32</span>
                                        </div>
                                        {newAliasError ? <div className="mt-1 text-xs text-red-600">{newAliasError}</div> : null}
                                        <div className="mt-3 rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-2 text-xs text-[var(--app-hint)]">
                                            New member will use Codex and the alias visible only inside this Team Chat.
                                        </div>
                                    </div>
                                </div>
                            ) : null}
                            {dialogError ? <div className="mt-3 rounded-lg bg-red-500/10 p-2 text-sm text-red-600 dark:text-red-400">{dialogError}</div> : null}
                        </div>
                        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--app-border)] bg-[var(--app-bg)] px-4 py-3">
                            <div className="min-w-0 truncate text-xs text-[var(--app-hint)]">
                                {addMemberTab === 'new'
                                    ? 'Creates a new session; the session itself is not tied permanently to this room.'
                                    : 'Adds the selected session with a room-specific alias.'}
                            </div>
                            <div className="flex shrink-0 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setIsAddingMember(false)}
                                    disabled={isSubmittingMember}
                                    className="rounded-md border border-[var(--app-border)] px-3 py-1.5 text-sm text-[var(--app-fg)] transition-colors hover:bg-[var(--app-secondary-bg)] disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                {addMemberTab === 'new' ? (
                                    <button
                                        type="button"
                                        onClick={() => void handleCreateSessionMember()}
                                        disabled={isSubmittingMember || Boolean(newAliasError) || !newMachineId || !normalizedNewProjectPath}
                                        className="rounded-md bg-[var(--app-button)] px-3 py-1.5 text-sm font-medium text-[var(--app-button-text)] transition-opacity hover:opacity-90 disabled:opacity-50"
                                    >
                                        {isSubmittingMember ? 'Creating…' : 'Create session & add to Team'}
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => void handleAddSelectedSession()}
                                        disabled={isSubmittingMember || !selectedSession || Boolean(aliasError)}
                                        className="rounded-md bg-[var(--app-button)] px-3 py-1.5 text-sm font-medium text-[var(--app-button-text)] transition-opacity hover:opacity-90 disabled:opacity-50"
                                    >
                                        {isSubmittingMember ? 'Adding…' : 'Add to Team'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            ) : props.onAddSession && addableSessions.length === 0 ? (
                <div className="mt-2 text-xs text-[var(--app-hint)]">All available sessions are already in this Team Chat.</div>
            ) : null}
            <div className="mt-3 space-y-2">
                {props.participants.map((participant) => {
                    const backingSession = participant.sessionId ? sessionsById.get(participant.sessionId) : null
                    const backingName = backingSession ? getSessionDisplayName(backingSession) : null
                    const secondary = backingName && backingName !== participant.displayName ? backingName : participant.role
                    const status = backingSession ? getSessionStatus(backingSession) : null
                    const details = backingSession ? getSessionDetails(backingSession) : ''
                    const canOpenSession = participant.type === 'session' && Boolean(participant.sessionId && props.onOpenSession)
                    const content = (
                        <>
                            <div className="relative shrink-0">
                                <span className="block h-3 w-3 rounded-full" style={{ backgroundColor: getParticipantAccent(participant.color) }} />
                                {status ? (
                                    <span
                                        aria-hidden="true"
                                        className={cn(
                                            'absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-[var(--app-card-bg,var(--app-bg))]',
                                            status.dotClassName,
                                            backingSession?.thinking ? 'animate-pulse' : ''
                                        )}
                                    />
                                ) : null}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium text-[var(--app-fg)]">@{participant.displayName}</div>
                                <div className="truncate text-xs text-[var(--app-hint)]">{secondary}</div>
                                {details ? <div className="truncate text-[11px] text-[var(--app-hint)]">{details}</div> : null}
                            </div>
                            {status ? (
                                <span className={cn('shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium', status.pillClassName)}>
                                    {status.label}
                                </span>
                            ) : null}
                        </>
                    )
                    if (canOpenSession) {
                        return (
                            <button
                                key={participant.id}
                                type="button"
                                aria-label={`Open @${participant.displayName} direct chat${status ? ` ${status.label}` : ''}`}
                                onClick={() => props.onOpenSession?.(participant)}
                                className="flex w-full items-center gap-2 rounded-xl border border-[var(--app-border)] bg-[var(--app-card-bg,var(--app-bg))] p-2 text-left transition-colors hover:border-[var(--app-link)] hover:bg-[var(--app-secondary-bg)] focus:outline-none focus:ring-2 focus:ring-[var(--app-link)]/40"
                            >
                                {content}
                            </button>
                        )
                    }
                    return (
                        <div key={participant.id} className="flex items-center gap-2 rounded-xl border border-[var(--app-border)] bg-[var(--app-card-bg,var(--app-bg))] p-2">
                            {content}
                        </div>
                    )
                })}
            </div>
        </aside>
    )
}
