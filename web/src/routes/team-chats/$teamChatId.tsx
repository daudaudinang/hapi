import { useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { TeamChatLayout } from '@/components/TeamChat/TeamChatLayout'
import { useAppContext } from '@/lib/app-context'
import { useTeamChat } from '@/hooks/queries/useTeamChat'
import { useTeamChatActions } from '@/hooks/mutations/useTeamChatActions'
import { useTeamChatMessages } from '@/hooks/queries/useTeamChatMessages'
import { useTeamChatParticipants } from '@/hooks/queries/useTeamChatParticipants'
import { useTeamChatMentionRequests } from '@/hooks/queries/useTeamChatMentionRequests'
import type { TeamChatMessage } from '@/types/api'

function mergeMessages(base: TeamChatMessage[], extra: TeamChatMessage[]): TeamChatMessage[] {
    const byId = new Map<string, TeamChatMessage>()
    for (const message of base) byId.set(message.id, message)
    for (const message of extra) byId.set(message.id, message)
    return Array.from(byId.values()).sort((a, b) => a.seq - b.seq)
}

export default function TeamChatDetailPage() {
    const { api } = useAppContext()
    const params = useParams({ strict: false }) as { teamChatId?: string }
    const teamChatId = params.teamChatId ?? null
    const { teamChat, isLoading } = useTeamChat(api, teamChatId)
    const { messages } = useTeamChatMessages(api, teamChatId)
    const { participants } = useTeamChatParticipants(api, teamChatId)
    const { requests: mentionRequests } = useTeamChatMentionRequests(api, teamChatId, participants)
    const [aroundMessages, setAroundMessages] = useState<TeamChatMessage[]>([])
    const currentParticipant = participants.find((participant) => participant.type === 'user') ?? participants[0] ?? null
    const { sendTeamMessage } = useTeamChatActions(api, teamChatId)

    if (isLoading) {
        return <div className="p-3 text-sm text-[var(--app-hint)]">Loading Team Chat…</div>
    }

    const mergedMessages = mergeMessages(messages, aroundMessages)

    return (
        <TeamChatLayout
            teamChat={teamChat}
            messages={mergedMessages}
            participants={participants}
            mentionRequests={mentionRequests}
            currentParticipantId={currentParticipant?.id ?? null}
            onSend={(text) => {
                if (!currentParticipant) return
                void sendTeamMessage({ authorParticipantId: currentParticipant.id, text })
            }}
            onLoadAround={async (messageId) => {
                if (!api || !teamChatId || !messageId) return
                const response = await api.getTeamMessagesAround(teamChatId, messageId)
                setAroundMessages((current) => mergeMessages(current, response.messages))
            }}
        />
    )
}
