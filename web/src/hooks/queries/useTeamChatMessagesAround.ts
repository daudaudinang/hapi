import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import { queryKeys } from '@/lib/query-keys'

export function useTeamChatMessagesAround(api: ApiClient | null, teamChatId: string, messageId: string | null) {
    return useQuery({
        queryKey: messageId ? queryKeys.teamMessagesAround(teamChatId, messageId) : ['team-messages-around-disabled'],
        queryFn: async () => {
            if (!api || !messageId) throw new Error('Reply target unavailable')
            return await api.getTeamMessagesAround(teamChatId, messageId)
        },
        enabled: Boolean(api && teamChatId && messageId)
    })
}
