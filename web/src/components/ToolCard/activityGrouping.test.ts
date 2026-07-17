import { describe, expect, it } from 'vitest'
import type { ChatBlock, ToolCallBlock } from '@/chat/types'
import {
    groupRoutineActivities,
    isRoutineActivityBlock
} from './activityGrouping'

function makeTool(
    id: string,
    name: string,
    overrides: Partial<ToolCallBlock['tool']> = {},
    children: ChatBlock[] = []
): ToolCallBlock {
    return {
        kind: 'tool-call',
        id,
        localId: null,
        createdAt: 1,
        children,
        tool: {
            id: `tool:${id}`,
            name,
            input: {},
            state: 'completed',
            createdAt: 1,
            startedAt: 1,
            completedAt: 2,
            description: null,
            result: null,
            ...overrides
        }
    }
}

describe('routine activity grouping', () => {
    it('groups two or more consecutive eligible neutral tools without reordering them', () => {
        const read = makeTool('read', 'Read')
        const bash = makeTool('bash', 'CodexBash')
        const result = groupRoutineActivities([read, bash])

        expect(result).toHaveLength(1)
        expect(result[0]).toMatchObject({
            kind: 'routine-activity-group',
            id: 'activity:read',
            blocks: [read, bash]
        })
    })

    it('keeps a singleton neutral tool as a normal tool block', () => {
        const read = makeTool('read', 'Read')
        expect(groupRoutineActivities([read])).toEqual([read])
    })

    it.each([
        'update_plan',
        'TodoWrite',
        'ExitPlanMode',
        'CodexDiff',
        'Edit',
        'Write',
        'CodexPermission'
    ])('does not group artifact or permission tool %s', (name) => {
        expect(isRoutineActivityBlock(makeTool(name, name))).toBe(false)
    })

    it('breaks runs around non-routine blocks', () => {
        const text: ChatBlock = {
            kind: 'agent-text',
            id: 'text',
            localId: null,
            createdAt: 2,
            text: 'boundary'
        }
        const reasoning: ChatBlock = {
            kind: 'agent-reasoning',
            id: 'reasoning-message',
            localId: null,
            createdAt: 2,
            text: 'boundary'
        }
        const permission = makeTool('permission', 'Read', {
            permission: { id: 'permission', status: 'approved' }
        })
        const askQuestion = makeTool('ask-question', 'AskUserQuestion')
        const requestInput = makeTool('request-input', 'request_user_input')
        const task = makeTool('task', 'Task')
        const childParent = makeTool('parent', 'Read', {}, [makeTool('child', 'Read')])
        const result = groupRoutineActivities([
            makeTool('read', 'Read'), text,
            makeTool('bash', 'CodexBash'), reasoning,
            makeTool('glob', 'Glob'), permission,
            makeTool('find', 'Glob'), askQuestion,
            makeTool('grep', 'Grep'), requestInput,
            makeTool('ls', 'LS'), task,
            makeTool('last', 'Read'), childParent
        ])

        expect(result.every((item) => item.kind !== 'routine-activity-group')).toBe(true)
    })

    it.each(['running', 'completed', 'error'] as const)(
        'keeps %s neutral tools eligible',
        (state) => expect(isRoutineActivityBlock(
            makeTool(state, 'CodexBash', { state })
        )).toBe(true)
    )

    it('keeps CodexReasoning as routine tool activity', () => {
        expect(isRoutineActivityBlock(makeTool('reasoning', 'CodexReasoning'))).toBe(true)
    })

    it('groups Apply changes with adjacent neutral activity', () => {
        const patch = makeTool('patch', 'CodexPatch', {
            input: { changes: [{ path: '/workspace/docs/plan.md' }] }
        })
        const read = makeTool('read', 'Read')

        expect(groupRoutineActivities([patch, read])).toMatchObject([{
            kind: 'routine-activity-group',
            blocks: [patch, read]
        }])
    })
})
