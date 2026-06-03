import type { TeamChat, TeamChatMessage, TeamMentionRequest, TeamParticipant } from '@/types/api'
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
}) {
    const composer = (
        <TeamChatComposer
            participants={props.participants}
            disabled={!props.currentParticipantId}
            onSend={props.onSend}
        />
    )
    const timeline = <TeamChatTimeline messages={props.messages} participants={props.participants} onLoadAround={props.onLoadAround} />
    const memberList = <TeamChatRightPanel participants={props.participants} messages={props.messages} mentionRequests={props.mentionRequests} />
    const mobileMemberList = <TeamChatRightPanel participants={props.participants} messages={props.messages} mentionRequests={props.mentionRequests} className="block h-full w-full border-0 lg:hidden" />
    const contextPanel = (
        <div className="p-3 text-sm text-[var(--app-hint)]">
            Default context includes goal, decisions, recent updates, reply preview, and files.
        </div>
    )

    return (
        <div className="flex h-full min-h-0 flex-col bg-[var(--app-bg)] text-[var(--app-fg)]">
            <div className="border-b border-[var(--app-border)] p-3">
                <div className="text-base font-semibold">{props.teamChat?.name ?? 'Team Chat'}</div>
                <div className="text-xs text-[var(--app-hint)]">{props.participants.length} members · {props.messages.length} messages</div>
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
