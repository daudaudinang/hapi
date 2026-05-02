import { describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '@/api/client'
import type { DecryptedMessage } from '@/types/api'
import {
    clearMessageWindow,
    fetchLatestMessages,
    getMessageWindowState,
    ingestIncomingMessages,
    setAtBottom,
} from './message-window-store'

function message(id: string, seq: number): DecryptedMessage {
    return {
        id,
        seq,
        localId: null,
        createdAt: seq,
        content: {
            role: 'assistant',
            content: [{ type: 'text', text: id }]
        }
    }
}

describe('message window reconnect reconciliation', () => {
    it('merges latest messages into the visible window during reconnect even when scrolled away from bottom', async () => {
        const sessionId = 'reconnect-session'
        clearMessageWindow(sessionId)
        ingestIncomingMessages(sessionId, [message('tool-call', 1)])
        setAtBottom(sessionId, false)

        const api = {
            getMessages: vi.fn().mockResolvedValue({
                messages: [message('tool-result', 2)],
                page: { limit: 50, beforeSeq: null, nextBeforeSeq: 2, hasMore: false }
            })
        } as unknown as ApiClient

        await fetchLatestMessages(api, sessionId, { mergeStrategy: 'visible' })

        const state = getMessageWindowState(sessionId)
        expect(state.messages.map((item) => item.id)).toEqual(['tool-call', 'tool-result'])
        expect(state.pending).toEqual([])
        expect(state.pendingCount).toBe(0)
    })
})
