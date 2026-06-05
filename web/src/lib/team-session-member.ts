import type { ApiClient } from '@/api/client'
import type { TeamParticipant } from '@/types/api'

type AddTeamParticipantInput = {
    type: 'session'
    sessionId: string
    displayName: string
    role: TeamParticipant['role']
    color: string
}

export async function configureTeamSessionMember(input: {
    api: ApiClient
    sessionId: string
    label?: string
    alias: string
    color: string
    initialTask?: string
    addTeamParticipant: (participant: AddTeamParticipantInput) => Promise<void>
}): Promise<void> {
    const label = input.label?.trim()
    if (label) {
        await input.api.renameSession(input.sessionId, label)
    }

    await input.addTeamParticipant({
        type: 'session',
        sessionId: input.sessionId,
        displayName: input.alias,
        role: 'general',
        color: input.color
    })

    const initialTask = input.initialTask?.trim()
    if (initialTask) {
        await input.api.sendMessage(input.sessionId, initialTask)
    }
}
