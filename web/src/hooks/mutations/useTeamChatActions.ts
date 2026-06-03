import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { TeamParticipant } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'

type AddTeamParticipantInput = {
    type: 'user' | 'session'
    userId?: string | null
    sessionId?: string | null
    displayName: string
    role: TeamParticipant['role']
    color: string
}

export function useTeamChatActions(api: ApiClient | null, teamChatId: string | null): {
    createTeamChat: (input: { name: string; projectPath?: string | null }) => Promise<string>
    sendTeamMessage: (input: { authorParticipantId: string; text: string; replyToMessageId?: string | null }) => Promise<void>
    addTeamParticipant: (input: AddTeamParticipantInput) => Promise<void>
    isPending: boolean
} {
    const queryClient = useQueryClient()

    const createMutation = useMutation({
        mutationFn: async (input: { name: string; projectPath?: string | null }) => {
            if (!api) throw new Error('API unavailable')
            return await api.createTeamChat(input)
        },
        onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.teamChats })
    })

    const sendMutation = useMutation({
        mutationFn: async (input: { authorParticipantId: string; text: string; replyToMessageId?: string | null }) => {
            if (!api || !teamChatId) throw new Error('Team Chat unavailable')
            await api.sendTeamMessage(teamChatId, input)
        },
        onSuccess: async () => {
            if (teamChatId) {
                await queryClient.invalidateQueries({ queryKey: queryKeys.teamMessages(teamChatId) })
            }
        }
    })

    const addParticipantMutation = useMutation({
        mutationFn: async (input: AddTeamParticipantInput) => {
            if (!api || !teamChatId) throw new Error('Team Chat unavailable')
            await api.addTeamParticipant(teamChatId, input)
        },
        onSuccess: async () => {
            if (teamChatId) {
                await Promise.all([
                    queryClient.invalidateQueries({ queryKey: queryKeys.teamParticipants(teamChatId) }),
                    queryClient.invalidateQueries({ queryKey: queryKeys.teamChat(teamChatId) }),
                    queryClient.invalidateQueries({ queryKey: queryKeys.teamMentionRequestsBase })
                ])
            }
        }
    })

    return {
        createTeamChat: async (input) => {
            const response = await createMutation.mutateAsync(input)
            return response.teamChat.id
        },
        sendTeamMessage: sendMutation.mutateAsync,
        addTeamParticipant: addParticipantMutation.mutateAsync,
        isPending: createMutation.isPending || sendMutation.isPending || addParticipantMutation.isPending
    }
}
