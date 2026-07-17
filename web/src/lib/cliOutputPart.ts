import { isObject } from '@hapi/protocol'
import type { CliOutputBlock } from '@/chat/types'

export const CLI_OUTPUT_TOOL_NAME = 'HapiCliOutput' as const

export function isCliOutputBlock(value: unknown): value is CliOutputBlock {
    return isObject(value)
        && value.kind === 'cli-output'
        && typeof value.id === 'string'
        && typeof value.text === 'string'
        && (value.source === 'user' || value.source === 'assistant')
}
