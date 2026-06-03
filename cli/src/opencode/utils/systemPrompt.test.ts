import { describe, expect, it } from 'vitest'
import { TITLE_INSTRUCTION } from './systemPrompt'

describe('OpenCode HAPI title prompt wording', () => {
    it('describes hapi_session tools without claiming it is the whole provider tool universe', () => {
        expect(TITLE_INSTRUCTION).toContain('The HAPI-added MCP server named "hapi_session" provides session tools: change_title and report_to_team.')
        expect(TITLE_INSTRUCTION).toContain('Use report_to_team to post structured Team Chat updates')
        expect(TITLE_INSTRUCTION).toContain('Other provider, user, project, and global tools may also be available.')
    })
})
