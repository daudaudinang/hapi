import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

declare const __dirname: string

const indexCss = readFileSync(resolve(__dirname, '../../index.css'), 'utf8')

describe('editor chat compact CSS', () => {
    it('scopes smaller chat markdown only to desktop editor chat', () => {
        expect(indexCss).toMatch(/@media \(min-width:\s*768px\)[\s\S]*\.editor-chat--compact\s+\.aui-md\s*\{[\s\S]*font-size:\s*0\.875rem;/)
        expect(indexCss).toMatch(/@media \(min-width:\s*768px\)[\s\S]*\.editor-chat--compact\s+\.text-base\s*\{[\s\S]*font-size:\s*0\.875rem\s*!important;/)
        expect(indexCss).not.toContain('\n.aui-md {\n        font-size: 0.875rem;')
    })
})
