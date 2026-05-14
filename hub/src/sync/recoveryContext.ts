import type { StoredMessage } from '../store/types'
import { isObject } from '@hapi/protocol'
import { unwrapRoleWrappedRecordEnvelope } from '@hapi/protocol/messages'

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
            const record = unwrapRoleWrappedRecordEnvelope(message.content)
            if (!record) continue

            const role = record.role
            if (role === 'user') {
                const innerContent = record.content
                if (!isObject(innerContent)) continue
                if (innerContent.type !== 'text') continue
                const text = typeof innerContent.text === 'string' ? innerContent.text : undefined
                if (!text) continue

                currentTurn = { userText: text, agentTexts: [] }
                turns.push(currentTurn)
                continue
            }

            if (role === 'agent' || role === 'assistant') {
                if (!currentTurn) continue

                const innerContent = record.content
                if (!isObject(innerContent)) continue
                const innerType = innerContent.type

                if (innerType === 'codex' || innerType === 'event') {
                    const data = innerContent.data
                    if (!isObject(data)) continue
                    if (data.type !== 'message') continue
                    const text = typeof data.text === 'string' ? data.text : undefined
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
