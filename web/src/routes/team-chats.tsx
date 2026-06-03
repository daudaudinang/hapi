import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useAppContext } from '@/lib/app-context'
import { useTeamChats } from '@/hooks/queries/useTeamChats'

export default function TeamChatsPage() {
    const { api } = useAppContext()
    const navigate = useNavigate()
    const search = useSearch({ strict: false }) as { machine?: string; project?: string }
    const { teamChats, isLoading, error } = useTeamChats(api)

    if (isLoading) {
        return <div className="p-3 text-sm text-[var(--app-hint)]">Loading Team Chats…</div>
    }

    return (
        <div className="flex h-full min-h-0 flex-col bg-[var(--app-bg)] text-[var(--app-fg)]">
            <div className="border-b border-[var(--app-border)] bg-[var(--app-subtle-bg)] px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-[var(--app-border)] bg-[var(--app-bg)] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--app-hint)]">
                        Team Chat
                    </span>
                    <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold">Team Chats</div>
                        <div className="truncate text-xs text-[var(--app-hint)]">
                            Collaborate across HAPI sessions{search.project ? ` · ${search.project}` : ''}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => navigate({ to: '/sessions' })}
                        className="rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] px-2.5 py-1 text-xs font-medium text-[var(--app-fg)] transition-colors hover:bg-[var(--app-secondary-bg)]"
                    >
                        Agent Mode
                    </button>
                    <button
                        type="button"
                        onClick={() => navigate({
                            to: '/editor',
                            search: {
                                machine: search.machine,
                                project: search.project
                            } as never
                        })}
                        className="rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] px-2.5 py-1 text-xs font-medium text-[var(--app-fg)] transition-colors hover:bg-[var(--app-secondary-bg)]"
                    >
                        Editor
                    </button>
                </div>
            </div>
            {error ? <div className="p-3 text-sm text-red-600">{error}</div> : null}
            <div className="app-scroll-y flex-1 min-h-0 p-3">
                {teamChats.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[var(--app-border)] p-4 text-sm text-[var(--app-hint)]">
                        No Team Chats yet.
                    </div>
                ) : (
                    <div className="space-y-2">
                        {teamChats.map((chat) => (
                            <Link
                                key={chat.id}
                                to="/team-chats/$teamChatId"
                                params={{ teamChatId: chat.id }}
                                search={{
                                    machine: search.machine,
                                    project: search.project
                                } as never}
                                className="block rounded-xl border border-[var(--app-border)] bg-[var(--app-card-bg,var(--app-bg))] p-3 transition-colors hover:bg-[var(--app-secondary-bg)]"
                            >
                                <div className="text-sm font-medium">{chat.name}</div>
                                {chat.projectPath ? <div className="mt-1 truncate text-xs text-[var(--app-hint)]">{chat.projectPath}</div> : null}
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
