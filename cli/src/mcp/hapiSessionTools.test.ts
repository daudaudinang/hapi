import { describe, expect, it } from 'vitest'
import { HAPI_SESSION_TOOL_DEFINITIONS, HAPI_SESSION_TOOL_NAMES } from './hapiSessionTools'

describe('HAPI session MCP tools', () => {
    it('exposes title and ReportToTeam tools', () => {
        expect(HAPI_SESSION_TOOL_NAMES).toEqual(['change_title', 'report_to_team'])
    })

    it('validates ReportToTeam input with protocol defaults', () => {
        const reportTool = HAPI_SESSION_TOOL_DEFINITIONS.find((tool) => tool.name === 'report_to_team')

        const parsed = reportTool?.inputSchema.parse({
            teamChatId: 'team-1',
            type: 'done',
            summary: 'Implemented the report tool'
        })

        expect(parsed).toEqual({
            teamChatId: 'team-1',
            type: 'done',
            summary: 'Implemented the report tool',
            mentions: [],
            files: []
        })
    })
})
