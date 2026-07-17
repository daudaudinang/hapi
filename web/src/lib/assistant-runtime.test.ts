import { describe, expect, it } from 'vitest'
import type { ToolCallBlock } from '@/chat/types'
import {
    groupRoutineActivities,
    type RoutineActivityGroup
} from '@/components/ToolCard/activityGrouping'
import {
    toThreadMessageLike,
    type HappyChatMessageMetadata
} from './assistant-runtime'

function makeTool(id: string, name: string): ToolCallBlock {
    return {
        kind: 'tool-call',
        id,
        localId: null,
        createdAt: 1,
        children: [],
        tool: {
            id: `tool:${id}`,
            name,
            input: {},
            state: 'completed',
            createdAt: 1,
            startedAt: 1,
            completedAt: 2,
            description: null,
            result: null
        }
    }
}

describe('assistant runtime display messages', () => {
    it('converts an activity group into one assistant message with intact blocks', () => {
        const first = makeTool('one', 'Read')
        const second = makeTool('two', 'CodexBash')
        const group: RoutineActivityGroup = {
            kind: 'routine-activity-group',
            id: 'activity:one',
            createdAt: first.createdAt,
            blocks: [first, second]
        }

        const message = toThreadMessageLike(group)
        const custom = message.metadata?.custom as HappyChatMessageMetadata | undefined

        expect(message.id).toBe('activity:one')
        expect(message.role).toBe('assistant')
        expect(custom).toMatchObject({
            kind: 'activity-group',
            activityBlocks: [first, second]
        })
    })

    it('does not mutate source tool blocks while grouping display messages', () => {
        const blocks = [makeTool('one', 'Read'), makeTool('two', 'CodexBash')]
        const snapshot = structuredClone(blocks)

        groupRoutineActivities(blocks)

        expect(blocks).toEqual(snapshot)
    })
})
