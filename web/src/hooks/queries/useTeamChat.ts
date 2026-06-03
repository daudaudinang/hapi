import { useMemo } from 'react'
import type { ApiClient } from '@/api/client'
import type { TeamChat } from '@/types/api'
import { useTeamChats } from './useTeamChats'

export function useTeamChat(api: ApiClient | null, teamChatId: string | null): {
    teamChat: TeamChat | null
    isLoading: boolean
    error: string | null
    refetch: () => Promise<unknown>
} {
    const query = useTeamChats(api)
    const teamChat = useMemo(() => {
        if (!teamChatId) return null
        return query.teamChats.find((chat) => chat.id === teamChatId) ?? null
    }, [query.teamChats, teamChatId])

    return {
        teamChat,
        isLoading: query.isLoading,
        error: query.error,
        refetch: query.refetch
    }
}
