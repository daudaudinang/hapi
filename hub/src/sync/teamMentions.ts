export type MentionableParticipant = { id: string; sessionId: string | null; displayName: string; archivedAt?: number | null }
export type ParsedTeamMention = { participantId: string; sessionId: string; displayName: string }
type ParsedTeamMentionWithIndex = ParsedTeamMention & { index: number }

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
    return a.start < b.end && b.start < a.end
}

export function parseTeamMentions(text: string, participants: MentionableParticipant[]): ParsedTeamMention[] {
    const ranges: Array<{ start: number; end: number }> = []
    const seenParticipants = new Set<string>()
    const matches: ParsedTeamMentionWithIndex[] = []
    const candidates = participants
        .filter((participant): participant is MentionableParticipant & { sessionId: string } => Boolean(participant.sessionId) && !participant.archivedAt)
        .sort((a, b) => b.displayName.length - a.displayName.length)

    for (const participant of candidates) {
        const pattern = new RegExp(`(^|\\s)@${escapeRegex(participant.displayName)}(?=$|[\\s,.;:!?\\)])`, 'gi')
        for (const match of text.matchAll(pattern)) {
            if (seenParticipants.has(participant.id)) continue
            const prefix = match[1] ?? ''
            const start = match.index! + prefix.length
            const end = start + participant.displayName.length + 1
            const next = text[end]
            if (next && !/[\s,.;:!?)]/.test(next)) continue
            if (isLongerDisplayNameNearMiss(text, end, participant.displayName, candidates)) continue
            if (ranges.some((range) => overlaps(range, { start, end }))) continue
            ranges.push({ start, end })
            seenParticipants.add(participant.id)
            matches.push({ participantId: participant.id, sessionId: participant.sessionId, displayName: participant.displayName, index: start })
        }
    }

    return matches.sort((a, b) => a.index - b.index).map(({ index: _index, ...mention }) => mention)
}

function isLongerDisplayNameNearMiss(text: string, end: number, displayName: string, candidates: MentionableParticipant[]): boolean {
    if (text[end] !== ' ') return false
    const after = text.slice(end + 1)
    const nextToken = after.match(/^\S+/)?.[0] ?? ''
    if (!nextToken) return false
    const prefix = `${displayName} `
    return candidates.some((candidate) => {
        if (candidate.displayName.length <= displayName.length) return false
        if (!candidate.displayName.toLowerCase().startsWith(prefix.toLowerCase())) return false
        const suffixFirstToken = candidate.displayName.slice(prefix.length).split(/\s+/)[0]
        return suffixFirstToken.length > 0 && nextToken.toLowerCase().startsWith(suffixFirstToken.toLowerCase())
    })
}
