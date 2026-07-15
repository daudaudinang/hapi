import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { Session } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'

export function useSession(api: ApiClient | null, sessionId: string | null): {
    session: Session | null
    userCapability: 'view' | 'interact' | 'operate' | 'manage'
    isLoading: boolean
    error: string | null
    refetch: () => Promise<unknown>
} {
    const resolvedSessionId = sessionId ?? 'unknown'
    const query = useQuery({
        queryKey: queryKeys.session(resolvedSessionId),
        queryFn: async () => {
            if (!api || !sessionId) {
                throw new Error('Session unavailable')
            }
            return await api.getSession(sessionId)
        },
        enabled: Boolean(api && sessionId),
    })

    return {
        session: query.data?.session ?? null,
        userCapability: query.data?.userCapability ?? 'interact',
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load session' : null,
        refetch: query.refetch,
    }
}
