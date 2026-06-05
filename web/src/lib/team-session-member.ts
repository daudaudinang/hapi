import type { ApiClient } from '@/api/client'
import type { TeamParticipant } from '@/types/api'

type AddTeamParticipantInput = {
    type: 'session'
    sessionId: string
    displayName: string
    role: TeamParticipant['role']
    color: string
}

export async function createTeamSessionMember(input: {
    api: ApiClient
    machineId: string
    projectPath: string
    alias: string
    color: string
    initialTask?: string
    addTeamParticipant: (participant: AddTeamParticipantInput) => Promise<void>
}): Promise<string> {
    const result = await input.api.spawnSession(input.machineId, input.projectPath, 'codex')
    if (result.type === 'error') {
        throw new Error(result.message)
    }

    await input.addTeamParticipant({
        type: 'session',
        sessionId: result.sessionId,
        displayName: input.alias,
        role: 'general',
        color: input.color
    })

    const initialTask = input.initialTask?.trim()
    if (initialTask) {
        await input.api.sendMessage(result.sessionId, initialTask)
    }

    return result.sessionId
}
