import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { TeamChatMessage } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'

export function useTeamChatMessages(api: ApiClient | null, teamChatId: string | null): {
    messages: TeamChatMessage[]
    isLoading: boolean
    error: string | null
    hasMore: boolean
    loadMore: () => Promise<unknown>
    refetch: () => Promise<unknown>
} {
    const query = useQuery({
        queryKey: teamChatId ? queryKeys.teamMessages(teamChatId) : ['team-messages-disabled'],
        queryFn: async () => {
            if (!api || !teamChatId) throw new Error('Team Chat unavailable')
            return await api.getTeamMessages(teamChatId, { limit: 50 })
        },
        enabled: Boolean(api && teamChatId)
    })

    const loadMore = useCallback(async () => {
        if (!api || !teamChatId || !query.data?.page.hasMore) return
        await api.getTeamMessages(teamChatId, { limit: 50, beforeSeq: query.data.page.nextBeforeSeq })
        await query.refetch()
    }, [api, query, teamChatId])

    return {
        messages: query.data?.messages ?? [],
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load Team Chat messages' : null,
        hasMore: query.data?.page.hasMore ?? false,
        loadMore,
        refetch: query.refetch
    }
}
