import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { TeamChat } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'

export function useTeamChats(api: ApiClient | null): {
    teamChats: TeamChat[]
    isLoading: boolean
    error: string | null
    refetch: () => Promise<unknown>
} {
    const query = useQuery({
        queryKey: queryKeys.teamChats,
        queryFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.getTeamChats()
        },
        enabled: Boolean(api)
    })

    return {
        teamChats: query.data?.teamChats ?? [],
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load Team Chats' : null,
        refetch: query.refetch
    }
}
