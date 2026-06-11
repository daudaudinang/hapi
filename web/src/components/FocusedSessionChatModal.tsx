import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import { LoadingState } from '@/components/LoadingState'
import { SessionChat } from '@/components/SessionChat'
import { useSendMessage } from '@/hooks/mutations/useSendMessage'
import { useMessages } from '@/hooks/queries/useMessages'
import { useSession } from '@/hooks/queries/useSession'
import { useSkills } from '@/hooks/queries/useSkills'
import { useSlashCommands } from '@/hooks/queries/useSlashCommands'
import { useRegisterActiveOverlaySession } from '@/lib/active-chat-session'
import { clearDraftsAfterSend } from '@/lib/clearDraftsAfterSend'
import { fetchLatestMessages, seedMessageWindowFromSession } from '@/lib/message-window-store'
import { queryKeys } from '@/lib/query-keys'
import { useToast } from '@/lib/toast-context'
import { cn } from '@/lib/utils'
import type { AttachmentMetadata, Session } from '@/types/api'

function getSessionTitle(session: Session): string {
    return session.metadata?.name
        ?? session.metadata?.summary?.text
        ?? session.metadata?.path
        ?? session.id.slice(0, 8)
}

function getPendingRequestCount(session: Session): number {
    return session.agentState?.requests ? Object.keys(session.agentState.requests).length : 0
}

function getSessionStatus(session: Session): {
    label: string
    dotClassName: string
    pillClassName: string
} {
    if (getPendingRequestCount(session) > 0) {
        return {
            label: 'Needs input',
            dotClassName: 'bg-amber-400',
            pillClassName: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
        }
    }
    if (session.thinking) {
        return {
            label: 'Working',
            dotClassName: 'bg-sky-400',
            pillClassName: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300'
        }
    }
    if (session.active) {
        return {
            label: 'Active',
            dotClassName: 'bg-emerald-400',
            pillClassName: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
        }
    }
    return {
        label: 'Idle',
        dotClassName: 'bg-[var(--app-border)]',
        pillClassName: 'border-[var(--app-border)] bg-[var(--app-secondary-bg)] text-[var(--app-hint)]'
    }
}

function getSessionMetaLine(session: Session): string {
    return [
        session.model,
        session.effort ? `${session.effort} effort` : null,
        session.metadata?.path
    ].filter((item): item is string => Boolean(item)).join(' · ')
}

export function FocusedSessionChatModal(props: {
    api: ApiClient
    sessionId: string
    onClose: () => void
}) {
    const [activeSessionId, setActiveSessionId] = useState(props.sessionId)
    const queryClient = useQueryClient()
    const { addToast } = useToast()
    const {
        session,
        isLoading,
        error,
        refetch: refetchSession,
    } = useSession(props.api, activeSessionId)
    const messagesState = useMessages(props.api, activeSessionId)
    const agentType = session?.metadata?.flavor ?? 'claude'
    const slashCommands = useSlashCommands(props.api, activeSessionId, agentType)
    const skills = useSkills(props.api, activeSessionId)
    useRegisterActiveOverlaySession(activeSessionId)

    useEffect(() => {
        setActiveSessionId(props.sessionId)
    }, [props.sessionId])

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                props.onClose()
            }
        }
        window.addEventListener('keydown', onKeyDown)
        return () => {
            window.removeEventListener('keydown', onKeyDown)
        }
    }, [props.onClose])

    const { sendMessage, retryMessage, isSending } = useSendMessage(props.api, activeSessionId, {
        isSessionThinking: session?.thinking ?? false,
        onSuccess: (sentSessionId) => {
            clearDraftsAfterSend(sentSessionId, activeSessionId)
        },
        resolveSessionId: async (currentSessionId) => {
            if (!session || session.active) {
                return currentSessionId
            }
            try {
                return await props.api.resumeSession(currentSessionId, { permissionMode: session.permissionMode ?? undefined })
            } catch (resumeError) {
                const message = resumeError instanceof Error ? resumeError.message : 'Resume failed'
                addToast({
                    title: 'Resume failed',
                    body: message,
                    sessionId: currentSessionId,
                    url: ''
                })
                throw resumeError
            }
        },
        onSessionResolved: (resolvedSessionId) => {
            if (resolvedSessionId === activeSessionId) {
                return
            }
            if (session) {
                seedMessageWindowFromSession(session.id, resolvedSessionId)
                queryClient.setQueryData(queryKeys.session(resolvedSessionId), {
                    session: { ...session, id: resolvedSessionId, active: true }
                })
            }
            setActiveSessionId(resolvedSessionId)
            void Promise.all([
                queryClient.prefetchQuery({
                    queryKey: queryKeys.session(resolvedSessionId),
                    queryFn: () => props.api.getSession(resolvedSessionId),
                }),
                fetchLatestMessages(props.api, resolvedSessionId),
            ]).catch(() => {})
        },
        onBlocked: (reason) => {
            if (reason !== 'no-api') return
            addToast({
                title: 'Cannot send message',
                body: 'Hub connection is unavailable.',
                sessionId: activeSessionId,
                url: ''
            })
        }
    })

    const getAutocompleteSuggestions = useCallback(async (query: string) => {
        if (query.startsWith('$')) {
            return await skills.getSuggestions(query)
        }
        return await slashCommands.getSuggestions(query)
    }, [skills, slashCommands])

    const refreshSession = useCallback(() => {
        void refetchSession()
        void messagesState.refetch()
    }, [messagesState, refetchSession])

    const status = useMemo(() => session ? getSessionStatus(session) : null, [session])
    const title = session ? getSessionTitle(session) : activeSessionId
    const metaLine = session ? getSessionMetaLine(session) : ''

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label="Focus session"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-2 backdrop-blur-sm sm:p-4"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                    props.onClose()
                }
            }}
        >
            <div className="flex h-[min(92vh,900px)] w-[min(1120px,calc(100vw-1rem))] min-h-0 flex-col overflow-hidden rounded-2xl border border-[var(--app-border)] bg-[var(--app-bg)] text-[var(--app-fg)] shadow-2xl sm:w-[min(1120px,calc(100vw-2rem))]">
                <div className="border-b border-[var(--app-border)] bg-[var(--app-subtle-bg)] px-3 py-2 sm:px-4">
                    <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <div className="truncate text-sm font-semibold sm:text-base">Focus session</div>
                                {status ? (
                                    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium', status.pillClassName)}>
                                        <span className={cn('h-1.5 w-1.5 rounded-full', status.dotClassName, session?.thinking ? 'animate-pulse' : '')} />
                                        {status.label}
                                    </span>
                                ) : null}
                            </div>
                            <div className="mt-0.5 truncate text-xs text-[var(--app-hint)]">{title}</div>
                            <div className="mt-0.5 truncate text-[11px] text-[var(--app-hint)]">
                                <span>Messages here go only to this focused session, not the Team Chat.</span>
                                {metaLine ? <span> · {metaLine}</span> : null}
                            </div>
                        </div>
                        <button
                            type="button"
                            aria-label="Close focus session"
                            onClick={props.onClose}
                            className="shrink-0 rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] px-2.5 py-1.5 text-xs font-medium text-[var(--app-fg)] transition-colors hover:bg-[var(--app-secondary-bg)]"
                        >
                            Close
                        </button>
                    </div>
                </div>

                <div className="min-h-0 flex-1">
                    {isLoading ? (
                        <div className="flex h-full items-center justify-center p-4">
                            <LoadingState label="Loading focus session…" className="text-sm" />
                        </div>
                    ) : error || !session ? (
                        <div className="flex h-full items-center justify-center p-4 text-sm text-red-500">
                            {error ?? 'Focus session unavailable'}
                        </div>
                    ) : (
                        <SessionChat
                            key={session.id}
                            api={props.api}
                            session={session}
                            messages={messagesState.messages}
                            messagesWarning={messagesState.warning}
                            hasMoreMessages={messagesState.hasMore}
                            isLoadingMessages={messagesState.isLoading}
                            isLoadingMoreMessages={messagesState.isLoadingMore}
                            isSending={isSending}
                            pendingCount={messagesState.pendingCount}
                            messagesVersion={messagesState.messagesVersion}
                            onBack={props.onClose}
                            onRefresh={refreshSession}
                            onLoadMore={messagesState.loadMore}
                            onSend={(text: string, attachments?: AttachmentMetadata[]) => sendMessage(text, attachments)}
                            onFlushPending={messagesState.flushPending}
                            onAtBottomChange={messagesState.setAtBottom}
                            onRetryMessage={retryMessage}
                            autocompleteSuggestions={getAutocompleteSuggestions}
                            availableSlashCommands={slashCommands.commands}
                            hideHeader={true}
                            compactMode={false}
                            disableVoice={true}
                        />
                    )}
                </div>
            </div>
        </div>
    )
}
