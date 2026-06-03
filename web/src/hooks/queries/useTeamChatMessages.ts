import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { TeamChatMessage } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'

function mergeMessages(a: TeamChatMessage[], b: TeamChatMessage[]): TeamChatMessage[] {
    const byId = new Map<string, TeamChatMessage>()
    for (const message of a) byId.set(message.id, message)
    for (const message of b) byId.set(message.id, message)
    return Array.from(byId.values()).sort((left, right) => left.seq - right.seq)
}

export function useTeamChatMessages(api: ApiClient | null, teamChatId: string | null): {
    messages: TeamChatMessage[]
    isLoading: boolean
    error: string | null
    hasMore: boolean
    loadMore: () => Promise<unknown>
    refetch: () => Promise<unknown>
} {
    const [olderMessages, setOlderMessages] = useState<TeamChatMessage[]>([])
    const [olderPage, setOlderPage] = useState<{ nextBeforeSeq: number | null; hasMore: boolean } | null>(null)

    useEffect(() => {
        setOlderMessages([])
        setOlderPage(null)
    }, [teamChatId])

    const query = useQuery({
        queryKey: teamChatId ? queryKeys.teamMessages(teamChatId) : ['team-messages-disabled'],
        queryFn: async () => {
            if (!api || !teamChatId) throw new Error('Team Chat unavailable')
            return await api.getTeamMessages(teamChatId, { limit: 50 })
        },
        enabled: Boolean(api && teamChatId)
    })

    const effectivePage = olderPage ?? query.data?.page ?? null
    const hasMore = effectivePage?.hasMore ?? false
    const messages = useMemo(() => mergeMessages(olderMessages, query.data?.messages ?? []), [olderMessages, query.data?.messages])

    const loadMore = useCallback(async () => {
        if (!api || !teamChatId || !hasMore) return
        const response = await api.getTeamMessages(teamChatId, { limit: 50, beforeSeq: effectivePage?.nextBeforeSeq ?? null })
        setOlderMessages((current) => mergeMessages(current, response.messages))
        setOlderPage(response.page)
    }, [api, effectivePage?.nextBeforeSeq, hasMore, teamChatId])

    const refetch = useCallback(async () => {
        return await query.refetch()
    }, [query])

    return {
        messages,
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load Team Chat messages' : null,
        hasMore,
        loadMore,
        refetch
    }
}
