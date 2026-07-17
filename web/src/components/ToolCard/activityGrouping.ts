import type { ChatBlock, ToolCallBlock } from '@/chat/types'
import { isAskUserQuestionToolName } from '@/components/ToolCard/askUserQuestion'
import { getToolSurfaceTone } from '@/components/ToolCard/knownTools'
import { isRequestUserInputToolName } from '@/components/ToolCard/requestUserInput'

export type RoutineActivityGroup = {
    kind: 'routine-activity-group'
    id: string
    createdAt: number
    blocks: ToolCallBlock[]
}

export type HappyDisplayItem = ChatBlock | RoutineActivityGroup

export function isRoutineActivityBlock(block: ChatBlock): block is ToolCallBlock {
    if (block.kind !== 'tool-call') return false
    if (
        block.tool.name === 'Task'
        || block.tool.name === 'CodexPermission'
        || block.children.length > 0
    ) return false
    if (isAskUserQuestionToolName(block.tool.name)) return false
    if (isRequestUserInputToolName(block.tool.name)) return false
    if (block.tool.permission) return false
    return getToolSurfaceTone(block.tool.name) === 'neutral'
}

export function groupRoutineActivities(
    blocks: readonly ChatBlock[]
): HappyDisplayItem[] {
    const output: HappyDisplayItem[] = []
    let run: ToolCallBlock[] = []

    const flush = () => {
        if (run.length === 1) output.push(run[0])
        if (run.length > 1) {
            output.push({
                kind: 'routine-activity-group',
                id: `activity:${run[0].id}`,
                createdAt: run[0].createdAt,
                blocks: run
            })
        }
        run = []
    }

    for (const block of blocks) {
        if (isRoutineActivityBlock(block)) {
            run.push(block)
        } else {
            flush()
            output.push(block)
        }
    }
    flush()

    return output
}
