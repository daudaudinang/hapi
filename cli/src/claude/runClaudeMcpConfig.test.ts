import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

declare const __dirname: string

const runClaudeSource = readFileSync(resolve(__dirname, 'runClaude.ts'), 'utf8')

describe('Claude HAPI MCP configuration', () => {
    it('uses the hapi_session server name expected by the title prompt', () => {
        expect(runClaudeSource).toContain('mcp__hapi_session__')
        expect(runClaudeSource).toContain("'hapi_session'")
        expect(runClaudeSource).not.toContain('mcp__hapi__')
        expect(runClaudeSource).not.toContain("'hapi':")
    })

    it('does not advertise a local debug log file when file logging is disabled', () => {
        expect(runClaudeSource).not.toContain('Logs: ${logPath}')
        expect(runClaudeSource).toContain('Local file logs: disabled')
    })
})
