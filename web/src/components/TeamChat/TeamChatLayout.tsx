import type { SessionSummary, TeamChat, TeamChatMessage, TeamMentionRequest, TeamParticipant } from '@/types/api'
import { TeamChatComposer } from './TeamChatComposer'
import { TeamChatMobileLayout } from './TeamChatMobileLayout'
import { TeamChatRightPanel } from './TeamChatRightPanel'
import { TeamChatTimeline } from './TeamChatTimeline'

export function TeamChatLayout(props: {
    teamChat: TeamChat | null
    messages: TeamChatMessage[]
    participants: TeamParticipant[]
    mentionRequests?: TeamMentionRequest[]
    currentParticipantId: string | null
    onSend: (text: string) => void
    onLoadAround: (messageId?: string) => Promise<unknown> | void
    onOpenTeamChats?: () => void
    onOpenAgentMode?: () => void
    onOpenEditorMode?: () => void
    availableSessions?: SessionSummary[]
    onAddSession?: (session: SessionSummary, alias: string) => void
}) {
    const composer = (
        <TeamChatComposer
            participants={props.participants}
            disabled={!props.currentParticipantId}
            onSend={props.onSend}
        />
    )
    const timeline = <TeamChatTimeline messages={props.messages} participants={props.participants} mentionRequests={props.mentionRequests} onLoadAround={props.onLoadAround} />
    const memberList = <TeamChatRightPanel
        participants={props.participants}
        messages={props.messages}
        mentionRequests={props.mentionRequests}
        availableSessions={props.availableSessions}
        onAddSession={props.onAddSession}
    />
    const mobileMemberList = <TeamChatRightPanel
        participants={props.participants}
        messages={props.messages}
        mentionRequests={props.mentionRequests}
        availableSessions={props.availableSessions}
        onAddSession={props.onAddSession}
        className="block h-full w-full border-0 lg:hidden"
    />
    const contextPanel = (
        <div className="p-3 text-sm text-[var(--app-hint)]">
            Default context includes goal, decisions, recent updates, reply preview, and files.
        </div>
    )

    return (
        <div className="flex h-full min-h-0 flex-col bg-[var(--app-bg)] text-[var(--app-fg)]">
            <div className="border-b border-[var(--app-border)] bg-[var(--app-subtle-bg)] px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={props.onOpenTeamChats}
                        className="rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] px-2.5 py-1 text-xs font-medium text-[var(--app-fg)] transition-colors hover:bg-[var(--app-secondary-bg)] disabled:pointer-events-none disabled:opacity-60"
                        disabled={!props.onOpenTeamChats}
                    >
                        ← Team Chats
                    </button>
                    <span className="rounded-full border border-[var(--app-border)] bg-[var(--app-bg)] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--app-hint)]">
                        Team Chat
                    </span>
                    <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{props.teamChat?.name ?? 'Team Chat'}</div>
                        <div className="truncate text-xs text-[var(--app-hint)]">
                            {props.participants.length} members · {props.messages.length} messages
                            {props.teamChat?.projectPath ? ` · ${props.teamChat.projectPath}` : ''}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {props.onOpenAgentMode ? (
                            <button
                                type="button"
                                onClick={props.onOpenAgentMode}
                                className="rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] px-2.5 py-1 text-xs font-medium text-[var(--app-fg)] transition-colors hover:bg-[var(--app-secondary-bg)]"
                            >
                                Agent Mode
                            </button>
                        ) : null}
                        {props.onOpenEditorMode ? (
                            <button
                                type="button"
                                onClick={props.onOpenEditorMode}
                                className="rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] px-2.5 py-1 text-xs font-medium text-[var(--app-fg)] transition-colors hover:bg-[var(--app-secondary-bg)]"
                            >
                                Editor
                            </button>
                        ) : null}
                    </div>
                </div>
            </div>
            <div className="hidden min-h-0 flex-1 lg:flex">
                <div className="flex min-w-0 flex-1 flex-col">
                    {timeline}
                    {composer}
                </div>
                {memberList}
            </div>
            <TeamChatMobileLayout
                chat={<div className="flex h-full min-h-0 flex-col">{timeline}{composer}</div>}
                sessions={<div className="h-full min-h-0 overflow-auto">{mobileMemberList}</div>}
                context={contextPanel}
            />
        </div>
    )
}
