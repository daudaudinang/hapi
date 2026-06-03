import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { TeamMentionRequest } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'

export function useSessionTeamMentions(api: ApiClient | null, sessionId: string | null): {
    requests: TeamMentionRequest[]
    isLoading: boolean
    error: string | null
    refetch: () => Promise<unknown>
} {
    const query = useQuery({
        queryKey: sessionId ? queryKeys.sessionTeamMentions(sessionId) : ['session-team-mentions-disabled'],
        queryFn: async () => {
            if (!api || !sessionId) throw new Error('Session unavailable')
            return await api.getSessionTeamMentions(sessionId)
        },
        enabled: Boolean(api && sessionId)
    })

    return {
        requests: query.data?.requests ?? [],
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load Team mentions' : null,
        refetch: query.refetch
    }
}
