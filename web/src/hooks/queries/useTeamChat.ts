import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { TeamChat } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'

export function useTeamChat(api: ApiClient | null, teamChatId: string | null): {
    teamChat: TeamChat | null
    isLoading: boolean
    error: string | null
    refetch: () => Promise<unknown>
} {
    const query = useQuery({
        queryKey: teamChatId ? queryKeys.teamChat(teamChatId) : ['team-chat-disabled'],
        queryFn: async () => {
            if (!api || !teamChatId) throw new Error('Team Chat unavailable')
            return await api.getTeamChat(teamChatId)
        },
        enabled: Boolean(api && teamChatId)
    })

    return {
        teamChat: query.data?.teamChat ?? null,
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load Team Chat' : null,
        refetch: query.refetch
    }
}
