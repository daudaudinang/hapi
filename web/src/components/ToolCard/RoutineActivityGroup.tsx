import { useId, useState } from 'react'
import type { ToolCallBlock } from '@/chat/types'
import { useHappyChatContext } from '@/components/AssistantChat/context'
import { getToolPresentation } from '@/components/ToolCard/knownTools'
import { ToolCard } from '@/components/ToolCard/ToolCard'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/use-translation'

export function RoutineActivityGroup(props: { blocks: ToolCallBlock[] }) {
    const [open, setOpen] = useState(true)
    const { t } = useTranslation()
    const context = useHappyChatContext()
    const contentId = useId()
    const label = t('tool.backgroundActions', { count: props.blocks.length })
    const titles = props.blocks
        .slice(0, 3)
        .map((block) => getToolPresentation({
            toolName: block.tool.name,
            input: block.tool.input,
            result: block.tool.result,
            childrenCount: block.children.length,
            description: block.tool.description,
            metadata: context.metadata
        }).title)
        .join(', ')

    return (
        <section className="my-2 min-w-0 max-w-full">
            <button
                type="button"
                aria-expanded={open}
                aria-controls={contentId}
                onClick={() => setOpen((value) => !value)}
                className="flex min-h-9 w-full items-center gap-2 rounded-md px-1 text-left text-xs text-[var(--app-hint)] transition-colors hover:bg-[var(--app-subtle-bg)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-link)]"
            >
                <svg
                    aria-hidden="true"
                    className={cn(
                        'h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none',
                        open && 'rotate-90'
                    )}
                    viewBox="0 0 16 16"
                    fill="none"
                >
                    <path
                        d="M6 3l5 5-5 5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
                <span className="shrink-0 font-semibold text-[var(--app-fg)]">
                    {label}
                </span>
                <span className="min-w-0 truncate">{titles}</span>
            </button>
            {open ? (
                <div
                    id={contentId}
                    role="region"
                    aria-label={label}
                    className="ml-2 min-w-0 border-l border-[var(--app-border)] pl-2"
                >
                    {props.blocks.map((block) => (
                        <ToolCard
                            key={block.id}
                            displayMode="activity-row"
                            api={context.api}
                            sessionId={context.sessionId}
                            metadata={context.metadata}
                            disabled={context.disabled}
                            onDone={context.onRefresh}
                            block={block}
                        />
                    ))}
                </div>
            ) : null}
        </section>
    )
}
