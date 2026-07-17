import type { ToolCallMessagePartProps } from '@assistant-ui/react'
import { CliOutputBlock } from '@/components/CliOutputBlock'
import { isCliOutputBlock } from '@/lib/cliOutputPart'

export function CliOutputMessagePart(props: ToolCallMessagePartProps) {
    if (!isCliOutputBlock(props.artifact)) return null

    return (
        <div data-cli-output-part className="py-1 min-w-0 max-w-full overflow-x-hidden">
            <CliOutputBlock text={props.artifact.text} />
        </div>
    )
}
