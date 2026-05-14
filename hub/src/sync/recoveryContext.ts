import type { StoredMessage } from '../store/types'

interface ParsedTurn {
    userText: string
    agentTexts: string[]
}

const HEADER = '[Previous session context - recovered after crash]'
const FOOTER = '--- End of recovered context ---'

export function buildRecoveryContext(messages: StoredMessage[]): string | null {
    const turns: ParsedTurn[] = []
    let currentTurn: ParsedTurn | null = null

    for (const message of messages) {
        try {
            const content = message.content
            if (content === null || content === undefined || typeof content !== 'object') continue

            const record = content as Record<string, unknown>
            const role = typeof record.role === 'string' ? record.role : undefined
            if (!role) continue

            if (role === 'user') {
                const innerContent = record.content
                if (!innerContent || typeof innerContent !== 'object') continue
                const innerType = (innerContent as Record<string, unknown>).type
                if (innerType !== 'text') continue
                const text = typeof (innerContent as Record<string, unknown>).text === 'string'
                    ? (innerContent as Record<string, unknown>).text as string
                    : undefined
                if (!text) continue

                currentTurn = { userText: text, agentTexts: [] }
                turns.push(currentTurn)
                continue
            }

            if (role === 'agent') {
                if (!currentTurn) continue

                const innerContent = record.content
                if (!innerContent || typeof innerContent !== 'object') continue
                const innerRecord = innerContent as Record<string, unknown>
                const innerType = innerRecord.type

                if (innerType === 'codex' || innerType === 'event') {
                    const data = innerRecord.data
                    if (!data || typeof data !== 'object') continue
                    const dataType = (data as Record<string, unknown>).type
                    if (dataType !== 'message') continue
                    const text = typeof (data as Record<string, unknown>).text === 'string'
                        ? (data as Record<string, unknown>).text as string
                        : undefined
                    if (!text) continue
                    currentTurn.agentTexts.push(text)
                }
            }
        } catch {
            // Malformed message — silently skip
        }
    }

    if (turns.length === 0) return null

    let ctx = `${HEADER}\n\n`
    for (const turn of turns) {
        ctx += `User:\n${turn.userText}\n\n`
        if (turn.agentTexts.length > 0) {
            ctx += `Agent:\n${turn.agentTexts.join('\n')}\n\n`
        }
    }
    ctx += FOOTER

    return ctx
}
