import type { SessionSummary } from '@/types/api'

export const MAX_SESSION_TERMINALS = 3

type Translate = (key: string, params?: Record<string, string | number>) => string

type TerminalCountCarrier = {
    terminalLiveCount?: number
}

export function getKnownLiveTerminalCount(value: unknown): number | null {
    if (typeof value !== 'number') return null
    if (!Number.isInteger(value) || value <= 0) return null
    return value
}

export function getArchiveSessionDescription(
    t: Translate,
    input: { name: string; terminalLiveCount?: number }
): string {
    const lines = [t('dialog.archive.description', { name: input.name })]
    const count = getKnownLiveTerminalCount(input.terminalLiveCount)
    if (count !== null) {
        lines.push(t('dialog.archive.terminalImpact'))
        lines.push(t('dialog.archive.terminalCount', { n: count, max: MAX_SESSION_TERMINALS }))
    }
    return lines.join('\n')
}

export function getArchiveAllDescription(
    t: Translate,
    input: { sessionCount: number; terminalLiveCount?: number }
): string {
    const lines = [t('dialog.archiveAll.description', { n: input.sessionCount })]
    const count = getKnownLiveTerminalCount(input.terminalLiveCount)
    if (count !== null) {
        lines.push(t('dialog.archiveAll.terminalImpact'))
        lines.push(t('dialog.archiveAll.terminalCount', { n: count }))
    }
    return lines.join('\n')
}

export function getSessionTerminalLiveCount(session: TerminalCountCarrier): number | undefined {
    return typeof session.terminalLiveCount === 'number' && Number.isFinite(session.terminalLiveCount) && session.terminalLiveCount >= 0
        ? session.terminalLiveCount
        : undefined
}

export function getTotalKnownTerminalLiveCount(sessions: Array<Pick<SessionSummary, 'terminalLiveCount'>>): number | undefined {
    let total = 0
    let hasKnownCount = false
    for (const session of sessions) {
        const count = getSessionTerminalLiveCount(session)
        if (count === undefined) continue
        hasKnownCount = true
        total += count
    }
    return hasKnownCount ? total : undefined
}
