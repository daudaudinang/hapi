import { useMemo, useState } from 'react'
import { useTranslation } from '@/lib/use-translation'
import type { TerminalHistoryState } from './useTerminalHistory'

export type TerminalHistoryPanelProps = {
    state: TerminalHistoryState
    disabled: boolean
    onRefresh: () => void
    onClose: () => void
    onInsert: (command: string) => boolean
    onInserted?: () => void
}

function IconButton(props: {
    label: string
    disabled?: boolean
    onClick: () => void
    children: React.ReactNode
}) {
    return (
        <button
            type="button"
            aria-label={props.label}
            disabled={props.disabled}
            onClick={props.onClick}
            className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-lg border border-transparent text-sm font-semibold text-[var(--app-hint)] transition-colors motion-reduce:transition-none hover:border-[var(--app-border)] hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
            {props.children}
        </button>
    )
}

export function TerminalHistoryPanel(props: TerminalHistoryPanelProps) {
    const { t, locale } = useTranslation()
    const [query, setQuery] = useState('')
    const [insertStatus, setInsertStatus] = useState<'success' | 'error' | null>(null)
    const entries = props.state.status === 'ready' ? props.state.entries : []
    const normalizedQuery = query.trim().toLocaleLowerCase(locale)
    const filteredEntries = useMemo(() => {
        if (!normalizedQuery) {
            return entries
        }
        return entries.filter((entry) => (
            entry.command.toLocaleLowerCase(locale).includes(normalizedQuery)
        ))
    }, [entries, locale, normalizedQuery])

    const insert = (command: string) => {
        if (props.disabled) {
            return
        }
        setInsertStatus(null)
        if (!props.onInsert(command)) {
            setInsertStatus('error')
            return
        }
        setInsertStatus('success')
        props.onInserted?.()
        props.onClose()
    }

    const stateContent = () => {
        if (props.state.status === 'idle' || props.state.status === 'loading') {
            return <p role="status">{t('terminal.history.loading')}</p>
        }
        if (props.state.status === 'unsupported') {
            return <p>{t('terminal.history.unsupported')}</p>
        }
        if (props.state.status === 'error') {
            return (
                <div className="flex flex-col items-center gap-3">
                    <p role="alert">
                        {props.state.message === 'not_ready'
                            ? t('terminal.history.notReady')
                            : t('terminal.history.error')}
                    </p>
                    <button
                        type="button"
                        onClick={props.onRefresh}
                        className="min-h-11 rounded-lg border border-[var(--app-border)] bg-[var(--app-secondary-bg)] px-4 text-xs font-semibold text-[var(--app-fg)] transition-colors motion-reduce:transition-none hover:border-violet-500/40 hover:text-violet-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:hover:text-violet-300"
                    >
                        {t('terminal.history.retry')}
                    </button>
                </div>
            )
        }
        if (props.state.status === 'ready' && entries.length === 0) {
            return <p>{t('terminal.history.empty')}</p>
        }
        return null
    }

    return (
        <section
            role="region"
            aria-label={t('terminal.history.title')}
            aria-busy={props.state.status === 'loading'}
            className="flex max-h-[min(48dvh,32rem)] min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-[var(--app-border)] bg-[var(--app-bg)] text-[var(--app-fg)] shadow-xl lg:max-h-[min(70vh,32rem)]"
        >
            <header className="flex min-h-14 shrink-0 items-center gap-2 border-b border-[var(--app-border)] bg-[var(--app-subtle-bg)] px-3">
                <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                        <h2 className="truncate text-sm font-semibold">
                            {t('terminal.history.title')}
                        </h2>
                        <span className="shrink-0 rounded-md bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-violet-600 dark:text-violet-300">
                            {t('terminal.history.count', { count: entries.length })}
                        </span>
                    </div>
                    <p className="truncate text-[11px] text-[var(--app-hint)]">
                        {t('terminal.history.insertOnly')}
                    </p>
                </div>
                <IconButton
                    label={t('terminal.history.refresh')}
                    disabled={props.state.status === 'loading'}
                    onClick={props.onRefresh}
                >
                    ↻
                </IconButton>
                <IconButton
                    label={t('terminal.history.close')}
                    onClick={props.onClose}
                >
                    ×
                </IconButton>
            </header>

            {props.state.status === 'ready' ? (
                <label className="shrink-0 border-b border-[var(--app-border)] p-2.5">
                    <span className="sr-only">
                        {t('terminal.history.searchPlaceholder')}
                    </span>
                    <input
                        type="search"
                        value={query}
                        enterKeyHint="search"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        aria-label={t('terminal.history.searchPlaceholder')}
                        placeholder={t('terminal.history.searchPlaceholder')}
                        onChange={(event) => {
                            setQuery(event.currentTarget.value)
                            setInsertStatus(null)
                        }}
                        className="min-h-11 w-full rounded-xl border border-[var(--app-border)] bg-[var(--app-secondary-bg)] px-3 text-sm text-[var(--app-fg)] outline-none placeholder:text-[var(--app-hint)] focus-visible:ring-2 focus-visible:ring-violet-500"
                    />
                </label>
            ) : null}

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {props.state.status === 'ready' && entries.length > 0 ? (
                    filteredEntries.length > 0 ? (
                        <ul className="divide-y divide-[var(--app-border)] p-1.5">
                            {filteredEntries.map((entry) => (
                                <li key={`${entry.index}:${entry.command}`}>
                                    <button
                                        type="button"
                                        aria-label={t('terminal.history.insert', { command: entry.command })}
                                        disabled={props.disabled}
                                        onClick={() => insert(entry.command)}
                                        className="group flex min-h-11 w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors motion-reduce:transition-none hover:bg-violet-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-45"
                                    >
                                        <span className="mt-0.5 w-7 shrink-0 text-right font-mono text-[10px] tabular-nums text-[var(--app-hint)]">
                                            {entry.index}
                                        </span>
                                        <code className="min-w-0 flex-1 overflow-hidden whitespace-pre-wrap break-all font-mono text-xs leading-5 text-[var(--app-fg)] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                                            {entry.command}
                                        </code>
                                        <span aria-hidden="true" className="shrink-0 pt-0.5 text-xs text-violet-500 opacity-0 transition-opacity motion-reduce:transition-none group-hover:opacity-100">
                                            ↵
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="grid min-h-28 place-items-center px-4 text-center text-sm text-[var(--app-hint)]">
                            {t('terminal.history.noMatches')}
                        </p>
                    )
                ) : (
                    <div className="grid min-h-32 place-items-center px-5 text-center text-sm text-[var(--app-hint)]">
                        {stateContent()}
                    </div>
                )}
            </div>

            {insertStatus ? (
                <span
                    role={insertStatus === 'error' ? 'alert' : 'status'}
                    className={insertStatus === 'error'
                        ? 'shrink-0 border-t border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-300'
                        : 'sr-only'}
                >
                    {insertStatus === 'error'
                        ? t('terminal.history.insertFailed')
                        : t('terminal.history.inserted')}
                </span>
            ) : null}
        </section>
    )
}
