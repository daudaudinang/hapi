import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

declare const __dirname: string

const dashboardCss = readFileSync(resolve(__dirname, 'dashboard.css'), 'utf8')
const indexCss = readFileSync(resolve(__dirname, '../../index.css'), 'utf8')

describe('mobile dashboard CSS', () => {
    it('replaces the mobile Mission Control title area with the Editor action', () => {
        expect(dashboardCss).toMatch(/@media \(max-width: 600px\)[\s\S]*\.db__topbar-left\s*\{[\s\S]*display:\s*none;/)
        expect(dashboardCss).toMatch(/@media \(max-width: 600px\)[\s\S]*\.db__topbar-btn--editor\s*\{[\s\S]*display:\s*flex;[\s\S]*order:\s*-1;/)
        expect(dashboardCss).toMatch(/@media \(max-width: 600px\)[\s\S]*\.db__topbar-btn--editor\s+\.db__label\s*\{[\s\S]*display:\s*inline;/)
    })

    it('uses the adjusted font scales as the defaults', () => {
        expect(indexCss).toContain('font-size: calc(120% * var(--app-font-scale, 1));')
        expect(indexCss).toContain('font-size: calc(105% * var(--app-font-scale, 1));')
        expect(indexCss).not.toContain('font-size: calc(95% * var(--app-font-scale, 1));')
        expect(indexCss).not.toContain('font-size: calc(87.5% * var(--app-font-scale, 1));')
    })
})
