import {
    Children,
    Fragment,
    useEffect,
    useId,
    useState,
    type PropsWithChildren
} from 'react'
import { useAssistantState } from '@assistant-ui/react'
import type { ToolCallBlock } from '@/chat/types'
import { useHappyChatContext } from '@/components/AssistantChat/context'
import { getToolPresentation } from '@/components/ToolCard/knownTools'
import {
    getToolRunDurationMs,
    partitionToolRunParts
} from '@/components/ToolCard/toolRunModel'
import { ToolRunLayoutProvider } from '@/components/ToolCard/toolRunContext'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/use-translation'

function ChevronIcon(props: { open: boolean }) {
    return (
        <span
            aria-hidden="true"
            className={cn(
                'transition-transform motion-reduce:transition-none',
                props.open && 'rotate-90'
            )}
        >
            ›
        </span>
    )
}

function useRunClock(active: boolean): number {
    const [now, setNow] = useState(() => Date.now())

    useEffect(() => {
        if (!active) return
        const timer = window.setInterval(() => setNow(Date.now()), 1000)
        return () => window.clearInterval(timer)
    }, [active])

    return now
}

function RoutineToolRun(props: PropsWithChildren<{
    id: string
    blocks: ToolCallBlock[]
}>) {
    const { t } = useTranslation()
    const { metadata } = useHappyChatContext()
    const running = props.blocks.some((block) =>
        block.tool.state === 'running' || block.tool.state === 'pending'
    )
    const [open, setOpen] = useState(() => running)
    const regionId = useId()
    const now = useRunClock(running)
    const durationMs = getToolRunDurationMs(props.blocks, now)
    const duration = durationMs === null
        ? null
        : durationMs < 1000
            ? '<1s'
            : `${Math.round(durationMs / 1000)}s`
    const titles = props.blocks.map((block) => getToolPresentation({
        toolName: block.tool.name,
        input: block.tool.input,
        result: block.tool.result,
        childrenCount: block.children.length,
        description: block.tool.description,
        metadata,
        t
    }).title)
    const statusLabel = t(
        running ? 'tool.group.actionsRunning' : 'tool.group.actionsCompleted',
        { count: props.blocks.length }
    )

    return (
        <div
            data-testid="tool-run-group"
            data-tool-run-group
            data-tool-run-id={props.id}
            className="my-2 w-full max-w-[600px] min-w-0 overflow-hidden rounded-lg border border-[var(--app-border)] bg-[var(--app-secondary-bg)]"
        >
            <button
                type="button"
                aria-expanded={open}
                aria-controls={regionId}
                aria-label={t('tool.group.toggle', { status: statusLabel })}
                onClick={() => setOpen((value) => !value)}
                className="flex min-h-11 w-full min-w-0 items-center gap-2 px-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-link)]"
            >
                <ChevronIcon open={open} />
                <span className="shrink-0 text-xs font-semibold">{statusLabel}</span>
                {duration ? (
                    <span
                        aria-label={t('tool.group.duration', { duration })}
                        className="shrink-0 rounded-full bg-[var(--app-subtle-bg)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--app-hint)]"
                    >
                        {duration}
                    </span>
                ) : null}
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-[var(--app-hint)]">
                    {titles.join(' · ')}
                </span>
                <span
                    aria-hidden="true"
                    className={cn(
                        'h-2 w-2 shrink-0 rounded-full',
                        running ? 'bg-amber-500' : 'bg-emerald-500'
                    )}
                />
            </button>
            <div
                id={regionId}
                hidden={!open}
                className="min-w-0 border-t border-[var(--app-border)] p-2"
            >
                <ToolRunLayoutProvider>{props.children}</ToolRunLayoutProvider>
            </div>
        </div>
    )
}

export function ToolRunGroup({
    startIndex,
    endIndex,
    children
}: PropsWithChildren<{
    startIndex: number
    endIndex: number
}>) {
    const content = useAssistantState(({ message }) => message.content)
    const parts = content
        .slice(startIndex, endIndex + 1)
        .map((part) => ({
            artifact: part.type === 'tool-call' ? part.artifact : undefined
        }))
    const childArray = Children.toArray(children)
    const segments = partitionToolRunParts(parts)

    return segments.map((segment) => {
        if (segment.kind === 'single') {
            return (
                <Fragment key={`single:${startIndex + segment.startOffset}`}>
                    {childArray[segment.startOffset]}
                </Fragment>
            )
        }

        return (
            <RoutineToolRun key={segment.id} id={segment.id} blocks={segment.blocks}>
                {childArray.slice(segment.startOffset, segment.endOffset + 1)}
            </RoutineToolRun>
        )
    })
}
