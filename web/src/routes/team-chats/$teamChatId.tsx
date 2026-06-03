import { useState } from 'react'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { TeamChatLayout } from '@/components/TeamChat/TeamChatLayout'
import { useAppContext } from '@/lib/app-context'
import { useSessions } from '@/hooks/queries/useSessions'
import { useTeamChat } from '@/hooks/queries/useTeamChat'
import { useTeamChatActions } from '@/hooks/mutations/useTeamChatActions'
import { useTeamChatMessages } from '@/hooks/queries/useTeamChatMessages'
import { useTeamChatParticipants } from '@/hooks/queries/useTeamChatParticipants'
import { useTeamChatMentionRequests } from '@/hooks/queries/useTeamChatMentionRequests'
import type { TeamChatMessage, TeamParticipant } from '@/types/api'

const PARTICIPANT_COLORS = ['#60a5fa', '#a78bfa', '#34d399', '#fbbf24', '#f87171', '#22d3ee', '#fb7185', '#818cf8']

function mergeMessages(base: TeamChatMessage[], extra: TeamChatMessage[]): TeamChatMessage[] {
    const byId = new Map<string, TeamChatMessage>()
    for (const message of base) byId.set(message.id, message)
    for (const message of extra) byId.set(message.id, message)
    return Array.from(byId.values()).sort((a, b) => a.seq - b.seq)
}

function getNextParticipantColor(participants: TeamParticipant[]): string {
    const used = new Set(participants.map((participant) => participant.color))
    return PARTICIPANT_COLORS.find((color) => !used.has(color))
        ?? PARTICIPANT_COLORS[participants.length % PARTICIPANT_COLORS.length]
}

export default function TeamChatDetailPage() {
    const { api } = useAppContext()
    const navigate = useNavigate()
    const search = useSearch({ strict: false }) as { machine?: string; project?: string }
    const params = useParams({ strict: false }) as { teamChatId?: string }
    const teamChatId = params.teamChatId ?? null
    const { teamChat, isLoading } = useTeamChat(api, teamChatId)
    const { sessions } = useSessions(api)
    const { messages } = useTeamChatMessages(api, teamChatId)
    const { participants } = useTeamChatParticipants(api, teamChatId)
    const { requests: mentionRequests } = useTeamChatMentionRequests(api, teamChatId, participants)
    const [aroundMessages, setAroundMessages] = useState<TeamChatMessage[]>([])
    const currentParticipant = participants.find((participant) => participant.type === 'user') ?? participants[0] ?? null
    const { sendTeamMessage, addTeamParticipant } = useTeamChatActions(api, teamChatId)

    if (isLoading) {
        return <div className="p-3 text-sm text-[var(--app-hint)]">Loading Team Chat…</div>
    }

    const mergedMessages = mergeMessages(messages, aroundMessages)
    const editorProject = teamChat?.projectPath ?? search.project
    const editorMachine = search.machine

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
            onOpenTeamChats={() => navigate({
                to: '/team-chats',
                search: {
                    machine: editorMachine,
                    project: editorProject
                } as never
            })}
            onOpenAgentMode={() => navigate({ to: '/sessions' })}
            onOpenEditorMode={() => navigate({
                to: '/editor',
                search: {
                    machine: editorMachine,
                    project: editorProject
                } as never
            })}
            availableSessions={sessions}
            onAddSession={(session, alias) => {
                if (!teamChatId) return
                void addTeamParticipant({
                    type: 'session',
                    sessionId: session.id,
                    displayName: alias,
                    role: 'general',
                    color: getNextParticipantColor(participants)
                })
            }}
            onLoadAround={async (messageId) => {
                if (!api || !teamChatId || !messageId) return
                const response = await api.getTeamMessagesAround(teamChatId, messageId)
                setAroundMessages((current) => mergeMessages(current, response.messages))
            }}
        />
    )
}
