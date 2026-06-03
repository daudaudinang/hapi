import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import { queryKeys } from '@/lib/query-keys'
import type { TeamMentionRequest, TeamParticipant } from '@/types/api'

export function useTeamChatMentionRequests(api: ApiClient | null, teamChatId: string | null, participants: TeamParticipant[]): {
    requests: TeamMentionRequest[]
    isLoading: boolean
    error: string | null
} {
    const sessionIds = useMemo(() => (
        participants
            .map((participant) => participant.sessionId)
            .filter((sessionId): sessionId is string => Boolean(sessionId))
            .sort()
    ), [participants])

    const query = useQuery({
        queryKey: teamChatId ? queryKeys.teamMentionRequests(teamChatId, sessionIds) : ['team-mention-requests-disabled'],
        queryFn: async () => {
            if (!api || !teamChatId) throw new Error('Team Chat unavailable')
            const responses = await Promise.all(sessionIds.map((sessionId) => api.getSessionTeamMentions(sessionId)))
            return responses.flatMap((response) => response.requests).filter((request) => request.teamChatId === teamChatId)
        },
        enabled: Boolean(api && teamChatId && sessionIds.length > 0)
    })

    return {
        requests: query.data ?? [],
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load Team mentions' : null
    }
}
