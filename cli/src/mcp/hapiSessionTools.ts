import { z } from 'zod'
import { ReportToTeamInputSchema } from '@hapi/protocol/schemas'

export const HAPI_SESSION_TOOL_NAMES = ['change_title', 'report_to_team'] as const

export type HapiSessionToolName = typeof HAPI_SESSION_TOOL_NAMES[number]

export type HapiSessionToolDefinition = {
    name: HapiSessionToolName
    title: string
    description: string
    inputSchema: z.ZodTypeAny
}

export const HAPI_SESSION_TOOL_DEFINITIONS: HapiSessionToolDefinition[] = [
    {
        name: 'change_title',
        title: 'Change Chat Title',
        description: 'Change the title of the current chat session',
        inputSchema: z.object({
            title: z.string().describe('The new title for the chat session')
        })
    },
    {
        name: 'report_to_team',
        title: 'Report To Team Chat',
        description: 'Post a structured status update, answer, blocker, question, or handoff into a HAPI Team Chat from the current agent session',
        inputSchema: ReportToTeamInputSchema
    }
]

export function getHapiSessionToolDefinition(name: HapiSessionToolName): HapiSessionToolDefinition {
    const definition = HAPI_SESSION_TOOL_DEFINITIONS.find((tool) => tool.name === name)
    if (!definition) throw new Error(`Unknown HAPI session tool: ${name}`)
    return definition
}
