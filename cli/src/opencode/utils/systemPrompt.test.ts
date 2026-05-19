import { describe, expect, it } from 'vitest'
import { TITLE_INSTRUCTION } from './systemPrompt'

describe('OpenCode HAPI title prompt wording', () => {
    it('describes hapi_session as HAPI-added, not the whole provider tool universe', () => {
        expect(TITLE_INSTRUCTION).toContain('The HAPI-added MCP server named "hapi_session" provides exactly one tool: change_title.')
        expect(TITLE_INSTRUCTION).toContain('Other provider, user, project, and global tools may also be available.')
    })
})
