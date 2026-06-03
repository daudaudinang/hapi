import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { SessionTeamMembership } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'

export function useSessionTeamMemberships(api: ApiClient | null, sessionId: string | null): {
    memberships: SessionTeamMembership[]
    isLoading: boolean
    error: string | null
    refetch: () => Promise<unknown>
} {
    const query = useQuery({
        queryKey: sessionId ? queryKeys.sessionTeamMemberships(sessionId) : ['session-team-memberships-disabled'],
        queryFn: async () => {
            if (!api || !sessionId) throw new Error('Session unavailable')
            return await api.getSessionTeamMemberships(sessionId)
        },
        enabled: Boolean(api && sessionId)
    })

    return {
        memberships: query.data?.memberships ?? [],
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load Team Chat memberships' : null,
        refetch: query.refetch
    }
}
