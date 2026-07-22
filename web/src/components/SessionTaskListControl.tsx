import type { TodoItem } from '@/types/api'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger
} from '@/components/ui/dialog'
import { useTranslation } from '@/lib/use-translation'

export function SessionTaskListControl({ todos, compact = false }: {
    todos: TodoItem[] | null | undefined
    compact?: boolean
}) {
    const { t } = useTranslation()

    if (!todos || todos.length === 0) return null

    const completed = todos.filter((todo) => todo.status === 'completed').length
    const total = todos.length
    const label = t('session.tasks.trigger', { completed, total })

    return (
        <Dialog>
            <DialogTrigger asChild>
                <button
                    type="button"
                    aria-label={label}
                    title={label}
                    className={compact
                        ? 'db-pinned__compact-action db-pinned__compact-action--tasks gap-1'
                        : 'inline-flex h-8 items-center gap-1 rounded-full px-2 text-xs font-medium text-[var(--app-hint)] hover:bg-[var(--app-secondary-bg)]'}
                    onDoubleClick={compact ? (event) => event.stopPropagation() : undefined}
                >
                    <span aria-hidden="true">☑</span>
                    {!compact ? <span className="hidden sm:inline">{t('session.tasks.label')}</span> : null}
                    <span>{completed}/{total}</span>
                </button>
            </DialogTrigger>
            <DialogContent className="w-[calc(100vw-2rem)] max-w-md" closeLabel={t('button.close')}>
                <DialogHeader>
                    <DialogTitle>{t('session.tasks.title')}</DialogTitle>
                    <DialogDescription>{t('session.tasks.progress', { completed, total })}</DialogDescription>
                </DialogHeader>
                <div
                    role="progressbar"
                    aria-label={label}
                    aria-valuemin={0}
                    aria-valuemax={total}
                    aria-valuenow={completed}
                    className="h-2 overflow-hidden rounded-full bg-[var(--app-secondary-bg)]"
                >
                    <div
                        className="h-full bg-[var(--app-link)]"
                        style={{ width: `${Math.round((completed / total) * 100)}%` }}
                    />
                </div>
                <ul className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
                    {todos.map((todo, index) => (
                        <li key={`${todo.id || 'todo'}:${index}`} className="flex min-w-0 gap-2 rounded-lg border border-[var(--app-border)] p-3">
                            <span aria-hidden="true">
                                {todo.status === 'completed' ? '✓' : todo.status === 'in_progress' ? '◉' : '○'}
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="break-words text-sm">{todo.content}</p>
                                <p className="text-xs text-[var(--app-hint)]">{t(`session.tasks.status.${todo.status}`)}</p>
                            </div>
                        </li>
                    ))}
                </ul>
            </DialogContent>
        </Dialog>
    )
}
