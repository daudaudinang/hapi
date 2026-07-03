import { describe, expect, it } from 'vitest'
import type { SessionSummary } from '@/types/api'
import {
    getArchiveAllDescription,
    getArchiveSessionDescription,
    getKnownLiveTerminalCount,
    getTotalKnownTerminalLiveCount
} from './archiveConfirmation'

const messages: Record<string, string> = {
    'dialog.archive.description': 'Archive "{name}"? You can still find it in archived sessions.',
    'dialog.archive.terminalImpact': 'Archiving will stop all running terminals in this session.',
    'dialog.archive.terminalCount': 'Running terminals: {n}/{max}',
    'dialog.archiveAll.description': 'Archive {n} session(s)?',
    'dialog.archiveAll.terminalImpact': 'Archiving these sessions will stop their running terminals.',
    'dialog.archiveAll.terminalCount': 'Running terminals: {n}'
}

function t(key: string, params?: Record<string, string | number>): string {
    let value = messages[key] ?? key
    for (const [param, replacement] of Object.entries(params ?? {})) {
        value = value.replace(`{${param}}`, String(replacement))
    }
    return value
}

function session(id: string, terminalLiveCount?: number): Pick<SessionSummary, 'terminalLiveCount'> & { id: string } {
    return { id, terminalLiveCount }
}

describe('archive confirmation copy', () => {
    it('includes terminal impact and n/3 count when session terminal count is known and positive', () => {
        const copy = getArchiveSessionDescription(t, { name: 'Build', terminalLiveCount: 2 })

        expect(copy).toContain('Archive "Build"?')
        expect(copy).toContain('Archiving will stop all running terminals in this session.')
        expect(copy).toContain('Running terminals: 2/3')
        expect(copy).not.toContain('terminal:close-all')
    })

    it('does not show a misleading terminal count for zero or unknown counts', () => {
        for (const value of [0, undefined, Number.NaN, -1, 1.5]) {
            const copy = getArchiveSessionDescription(t, { name: 'Build', terminalLiveCount: value })
            expect(copy).toContain('Archive "Build"?')
            expect(copy).not.toContain('Running terminals:')
            expect(copy).not.toContain('Archiving will stop all running terminals')
        }
    })

    it('sums only known counts for archive-all copy without inventing per-session max', () => {
        const total = getTotalKnownTerminalLiveCount([
            session('a', 2),
            session('b'),
            session('c', 1)
        ])
        const copy = getArchiveAllDescription(t, { sessionCount: 3, terminalLiveCount: total })

        expect(copy).toContain('Archive 3 session(s)?')
        expect(copy).toContain('Archiving these sessions will stop their running terminals.')
        expect(copy).toContain('Running terminals: 3')
        expect(copy).not.toContain('/3')
        expect(copy).not.toContain('terminal:close-all')
    })

    it('omits archive-all terminal count when all counts are unknown or zero', () => {
        expect(getKnownLiveTerminalCount(undefined)).toBeNull()
        expect(getKnownLiveTerminalCount(0)).toBeNull()
        expect(getTotalKnownTerminalLiveCount([session('a'), session('b')])).toBeUndefined()
        expect(getArchiveAllDescription(t, { sessionCount: 2, terminalLiveCount: 0 })).not.toContain('Running terminals:')
    })
})
