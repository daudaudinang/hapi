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

type UpdateTeamParticipantInput = {
    participantId: string
    sessionId?: string | null
    displayName: string
    role: TeamParticipant['role']
    color: string
}

type RemoveTeamParticipantInput = {
    participantId: string
    sessionId?: string | null
}

export function useTeamChatActions(api: ApiClient | null, teamChatId: string | null): {
    createTeamChat: (input: { name: string; projectPath?: string | null }) => Promise<string>
    sendTeamMessage: (input: { authorParticipantId: string; text: string; replyToMessageId?: string | null }) => Promise<void>
    addTeamParticipant: (input: AddTeamParticipantInput) => Promise<void>
    addTeamParticipantTo: (targetTeamChatId: string, input: AddTeamParticipantInput) => Promise<void>
    updateTeamParticipant: (input: UpdateTeamParticipantInput) => Promise<void>
    removeTeamParticipant: (input: RemoveTeamParticipantInput) => Promise<void>
    deleteTeamChat: (targetTeamChatId: string) => Promise<void>
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
        mutationFn: async (payload: { teamChatId: string; input: AddTeamParticipantInput }) => {
            if (!api) throw new Error('API unavailable')
            await api.addTeamParticipant(payload.teamChatId, payload.input)
        },
        onSuccess: async (_data, payload) => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: queryKeys.teamParticipants(payload.teamChatId) }),
                queryClient.invalidateQueries({ queryKey: queryKeys.teamChat(payload.teamChatId) }),
                queryClient.invalidateQueries({ queryKey: queryKeys.teamMentionRequestsBase })
            ])
            if (payload.input.sessionId) {
                await queryClient.invalidateQueries({ queryKey: queryKeys.sessionTeamMemberships(payload.input.sessionId) })
            }
        }
    })

    const updateParticipantMutation = useMutation({
        mutationFn: async (payload: { teamChatId: string; input: UpdateTeamParticipantInput }) => {
            if (!api) throw new Error('API unavailable')
            await api.updateTeamParticipant(payload.teamChatId, payload.input.participantId, {
                displayName: payload.input.displayName,
                role: payload.input.role,
                color: payload.input.color
            })
        },
        onSuccess: async (_data, payload) => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: queryKeys.teamParticipants(payload.teamChatId) }),
                queryClient.invalidateQueries({ queryKey: queryKeys.teamChat(payload.teamChatId) }),
                queryClient.invalidateQueries({ queryKey: queryKeys.teamMentionRequestsBase })
            ])
            if (payload.input.sessionId) {
                await queryClient.invalidateQueries({ queryKey: queryKeys.sessionTeamMemberships(payload.input.sessionId) })
            }
        }
    })

    const removeParticipantMutation = useMutation({
        mutationFn: async (payload: { teamChatId: string; input: RemoveTeamParticipantInput }) => {
            if (!api) throw new Error('API unavailable')
            await api.deleteTeamParticipant(payload.teamChatId, payload.input.participantId)
        },
        onSuccess: async (_data, payload) => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: queryKeys.teamParticipants(payload.teamChatId) }),
                queryClient.invalidateQueries({ queryKey: queryKeys.teamChat(payload.teamChatId) }),
                queryClient.invalidateQueries({ queryKey: queryKeys.teamMentionRequestsBase }),
                queryClient.invalidateQueries({ queryKey: queryKeys.sessionTeamMembershipsBase })
            ])
            if (payload.input.sessionId) {
                await queryClient.invalidateQueries({ queryKey: queryKeys.sessionTeamMemberships(payload.input.sessionId) })
            }
        }
    })

    const deleteMutation = useMutation({
        mutationFn: async (targetTeamChatId: string) => {
            if (!api) throw new Error('API unavailable')
            await api.deleteTeamChat(targetTeamChatId)
        },
        onSuccess: async (_data, targetTeamChatId) => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: queryKeys.teamChats }),
                queryClient.invalidateQueries({ queryKey: queryKeys.teamChat(targetTeamChatId) }),
                queryClient.invalidateQueries({ queryKey: queryKeys.teamParticipants(targetTeamChatId) }),
                queryClient.invalidateQueries({ queryKey: queryKeys.teamMentionRequestsBase }),
                queryClient.invalidateQueries({ queryKey: queryKeys.sessionTeamMembershipsBase })
            ])
        }
    })

    return {
        createTeamChat: async (input) => {
            const response = await createMutation.mutateAsync(input)
            return response.teamChat.id
        },
        sendTeamMessage: sendMutation.mutateAsync,
        addTeamParticipant: async (input) => {
            if (!teamChatId) throw new Error('Team Chat unavailable')
            await addParticipantMutation.mutateAsync({ teamChatId, input })
        },
        addTeamParticipantTo: async (targetTeamChatId, input) => {
            await addParticipantMutation.mutateAsync({ teamChatId: targetTeamChatId, input })
        },
        updateTeamParticipant: async (input) => {
            if (!teamChatId) throw new Error('Team Chat unavailable')
            await updateParticipantMutation.mutateAsync({ teamChatId, input })
        },
        removeTeamParticipant: async (input) => {
            if (!teamChatId) throw new Error('Team Chat unavailable')
            await removeParticipantMutation.mutateAsync({ teamChatId, input })
        },
        deleteTeamChat: deleteMutation.mutateAsync,
        isPending: createMutation.isPending
            || sendMutation.isPending
            || addParticipantMutation.isPending
            || updateParticipantMutation.isPending
            || removeParticipantMutation.isPending
            || deleteMutation.isPending
    }
}
