import { describe, expect, it } from 'vitest'
import { reduceChatBlocks } from './reducer'
import type { NormalizedMessage } from './types'

function goalMessage(id: string, status: 'active' | 'paused', tokensUsed: number): NormalizedMessage {
    return {
        id,
        localId: null,
        createdAt: tokensUsed,
        role: 'event',
        isSidechain: false,
        content: {
            type: 'codex-goal',
            action: 'updated',
            goal: {
                threadId: 'thread-1',
                objective: 'ship it',
                status,
                tokenBudget: 200000,
                tokensUsed,
                timeUsedSeconds: 90,
                createdAt: 1776272400,
                updatedAt: 1776272490
            }
        }
    }
}

describe('reduceChatBlocks Codex goal state', () => {
    it('keeps the latest goal progress from loaded events', () => {
        const reduced = reduceChatBlocks([
            goalMessage('g1', 'active', 1000),
            goalMessage('g2', 'paused', 12000)
        ], null)

        expect((reduced as any).latestGoal).toMatchObject({
            objective: 'ship it',
            status: 'paused',
            tokensUsed: 12000
        })
    })

    it('clears latest goal after a cleared event', () => {
        const reduced = reduceChatBlocks([
            goalMessage('g1', 'active', 1000),
            {
                id: 'g-clear',
                localId: null,
                createdAt: 2,
                role: 'event',
                isSidechain: false,
                content: { type: 'codex-goal', action: 'cleared', threadId: 'thread-1' }
            }
        ], null)

        expect((reduced as any).latestGoal).toBeNull()
    })
})
