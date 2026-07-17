import { useEffect, useId, useState, type FC, type PropsWithChildren } from 'react'
import { useMessage } from '@assistant-ui/react'
import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/use-translation'
import { defaultComponents, MARKDOWN_PLUGINS, MARKDOWN_REHYPE_PLUGINS } from '@/components/assistant-ui/markdown-text'

function ChevronIcon(props: { className?: string; open?: boolean }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
            className={cn(
                'transition-transform duration-200 motion-reduce:transition-none',
                props.open ? 'rotate-90' : '',
                props.className
            )}
        >
            <polyline points="9 18 15 12 9 6" />
        </svg>
    )
}

function ShimmerDot() {
    return (
        <span
            aria-hidden="true"
            className="inline-block h-1.5 w-1.5 rounded-full bg-current animate-pulse motion-reduce:animate-none"
        />
    )
}

/**
 * Renders individual reasoning message part content with markdown support.
 */
export const Reasoning: FC = () => {
    return (
        <MarkdownTextPrimitive
            remarkPlugins={MARKDOWN_PLUGINS}
            rehypePlugins={MARKDOWN_REHYPE_PLUGINS}
            components={defaultComponents}
            className={cn('aui-reasoning-content min-w-0 max-w-full break-words text-sm text-[var(--app-hint)]')}
        />
    )
}

/**
 * Wraps consecutive reasoning parts in a collapsible container.
 * Shows shimmer effect while reasoning is streaming.
 */
export const ReasoningGroup: FC<PropsWithChildren> = ({ children }) => {
    const { t } = useTranslation()
    const [isOpen, setIsOpen] = useState(false)
    const contentId = useId()

    // Check if reasoning is still streaming
    const message = useMessage()
    const isStreaming = message.status?.type === 'running'
        && message.content.length > 0
        && message.content[message.content.length - 1]?.type === 'reasoning'

    // Auto-expand while streaming
    useEffect(() => {
        if (isStreaming) {
            setIsOpen(true)
        }
    }, [isStreaming])

    return (
        <div className="aui-reasoning-group my-1">
            <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={contentId}
                aria-label={isStreaming ? t('reasoning.streaming') : t('reasoning.toggle')}
                onClick={() => setIsOpen((value) => !value)}
                className="inline-flex min-h-8 cursor-pointer select-none items-center gap-1.5 rounded-md px-1 text-xs font-medium text-[var(--app-hint)] transition-colors hover:bg-[var(--app-subtle-bg)] hover:text-[var(--app-fg)] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-link)]"
            >
                <ChevronIcon open={isOpen} />
                <span>{t('tool.title.reasoning')}</span>
                {isStreaming ? <ShimmerDot /> : null}
            </button>

            <div
                id={contentId}
                hidden={!isOpen}
                data-reasoning-body
                className={cn(
                    'overflow-hidden transition-all duration-200 motion-reduce:transition-none',
                    isOpen ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0'
                )}
            >
                <div className="pl-4 pt-1">{children}</div>
            </div>
        </div>
    )
}
