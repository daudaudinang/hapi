import { useState, useEffect, type FC, type PropsWithChildren } from 'react'
import { useMessage } from '@assistant-ui/react'
import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown'
import { cn } from '@/lib/utils'
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
        <span className="inline-block w-1.5 h-1.5 bg-current rounded-full animate-pulse" />
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
    const [isOpen, setIsOpen] = useState(false)

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
        <div className="aui-reasoning-group my-2">
            <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    'flex min-h-10 w-full items-center gap-2 rounded-md border border-[var(--app-border)]',
                    'bg-[var(--app-bg)] px-2.5 py-2 text-left text-xs font-medium',
                    'text-[var(--app-hint)] hover:bg-[var(--app-subtle-bg)] hover:text-[var(--app-fg)]',
                    'cursor-pointer select-none transition-colors motion-reduce:transition-none',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-link)]'
                )}
            >
                <ChevronIcon open={isOpen} />
                <span>Reasoning</span>
                {isStreaming && (
                    <span className="flex items-center gap-1 ml-1 text-[var(--app-hint)]">
                        <ShimmerDot />
                    </span>
                )}
            </button>

            <div
                className={cn(
                    'overflow-hidden transition-all duration-200 ease-in-out motion-reduce:transition-none',
                    isOpen ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0'
                )}
            >
                <div className="pl-4 pt-2 border-l-2 border-[var(--app-border)] ml-0.5">
                    {children}
                </div>
            </div>
        </div>
    )
}
