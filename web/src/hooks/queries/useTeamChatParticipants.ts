import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { TeamParticipant } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'

export function useTeamChatParticipants(api: ApiClient | null, teamChatId: string | null): {
    participants: TeamParticipant[]
    isLoading: boolean
    error: string | null
    refetch: () => Promise<unknown>
} {
    const query = useQuery({
        queryKey: teamChatId ? queryKeys.teamParticipants(teamChatId) : ['team-chat-participants-disabled'],
        queryFn: async () => {
            if (!api || !teamChatId) throw new Error('Team Chat unavailable')
            return await api.getTeamParticipants(teamChatId)
        },
        enabled: Boolean(api && teamChatId)
    })

    return {
        participants: query.data?.participants ?? [],
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load Team Chat participants' : null,
        refetch: query.refetch
    }
}
