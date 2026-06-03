import { useParams } from '@tanstack/react-router'
import { useAppContext } from '@/lib/app-context'
import { useTeamChat } from '@/hooks/queries/useTeamChat'
import { useTeamChatMessages } from '@/hooks/queries/useTeamChatMessages'
import { useTeamChatParticipants } from '@/hooks/queries/useTeamChatParticipants'

export default function TeamChatDetailPage() {
    const { api } = useAppContext()
    const params = useParams({ strict: false }) as { teamChatId?: string }
    const teamChatId = params.teamChatId ?? null
    const { teamChat, isLoading } = useTeamChat(api, teamChatId)
    const { messages } = useTeamChatMessages(api, teamChatId)
    const { participants } = useTeamChatParticipants(api, teamChatId)
    const participantById = new Map(participants.map((participant) => [participant.id, participant]))

    if (isLoading) {
        return <div className="p-3 text-sm text-[var(--app-hint)]">Loading Team Chat…</div>
    }

    return (
        <div className="flex h-full min-h-0 flex-col bg-[var(--app-bg)] text-[var(--app-fg)]">
            <div className="border-b border-[var(--app-border)] p-3">
                <div className="text-base font-semibold">{teamChat?.name ?? 'Team Chat'}</div>
                <div className="text-xs text-[var(--app-hint)]">{participants.length} members · {messages.length} messages</div>
            </div>
            <div className="app-scroll-y flex-1 min-h-0 space-y-2 p-3">
                {messages.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[var(--app-border)] p-4 text-sm text-[var(--app-hint)]">
                        No messages yet.
                    </div>
                ) : messages.map((message) => {
                    const author = participantById.get(message.authorParticipantId)
                    return (
                        <div key={message.id} className="rounded-xl border border-[var(--app-border)] p-3 text-sm">
                            <div className="mb-1 text-xs font-medium text-[var(--app-hint)]">{author?.displayName ?? 'Unknown'}</div>
                            <div className="whitespace-pre-wrap">{message.text}</div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
