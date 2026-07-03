import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Terminal } from '@xterm/xterm'
import type { TerminalState } from '@hapi/protocol'
import { TerminalView } from '@/components/Terminal/TerminalView'
import { TerminalQuickKeys, useTerminalQuickInput } from '@/components/Terminal/TerminalQuickKeys'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useSessionTerminalSocket } from '@/hooks/useTerminalSocket'
import { useAppContext } from '@/lib/app-context'
import { useTranslation } from '@/lib/use-translation'
import { randomId } from '@/lib/randomId'

export type SessionTerminalTabsProps = {
    sessionId: string
    title?: string
    subtitle?: string | null
    active: boolean
    terminalSupported: boolean
    cwd?: string
    compactFontSize?: boolean
    className?: string
}

const LIVE_STATUSES = new Set<TerminalState['status']>(['running', 'detached', 'warning_idle', 'warning_age'])
const UI_BUFFER_LIMIT = 50_000

function isLiveTerminal(terminal: TerminalState): boolean {
    return LIVE_STATUSES.has(terminal.status)
}

function warningReason(terminal: TerminalState): 'idle' | 'age' | null {
    if (terminal.status === 'warning_idle') return 'idle'
    if (terminal.status === 'warning_age') return 'age'
    return null
}

function closeReasonCopy(terminal: TerminalState, t: (key: string) => string): string {
    switch (terminal.closeReason) {
        case 'idle_timeout':
            return t('terminal.closed.idle')
        case 'hard_timeout':
            return t('terminal.closed.age')
        case 'user_close':
            return t('terminal.closed.user')
        case 'archive':
            return t('terminal.closed.archive')
        case 'process_exit':
            return t('terminal.closed.exited')
        case 'cli_lost':
            return t('terminal.closed.lost')
        case 'spawn_error':
            return t('terminal.closed.spawn')
        default:
            break
    }
    switch (terminal.status) {
        case 'closed_idle':
            return t('terminal.closed.idle')
        case 'closed_age':
            return t('terminal.closed.age')
        case 'closed_user':
            return t('terminal.closed.user')
        case 'closed_archive':
            return t('terminal.closed.archive')
        case 'exited':
            return t('terminal.closed.exited')
        case 'lost':
            return t('terminal.closed.lost')
        default:
            return t('terminal.closed.generic')
    }
}

function appendBounded(current: string, next: string): string {
    const combined = `${current}${next}`
    if (combined.length <= UI_BUFFER_LIMIT) {
        return combined
    }
    return combined.slice(-UI_BUFFER_LIMIT)
}

export function SessionTerminalTabs(props: SessionTerminalTabsProps) {
    const { token, baseUrl } = useAppContext()
    const { t } = useTranslation()
    const controller = useSessionTerminalSocket({ token, baseUrl, sessionId: props.sessionId })
    const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null)
    const [pendingCloseTerminalId, setPendingCloseTerminalId] = useState<string | null>(null)
    const [createError, setCreateError] = useState<string | null>(null)
    const [createPending, setCreatePending] = useState(false)
    const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null)
    const bootstrapRequestedRef = useRef(false)
    const terminalRef = useRef<Terminal | null>(null)
    const inputDisposableRef = useRef<{ dispose: () => void } | null>(null)
    const buffersRef = useRef<Map<string, string>>(new Map())
    const attachedTerminalIdsRef = useRef<Set<string>>(new Set())

    const liveTerminals = useMemo(() => controller.terminals.filter(isLiveTerminal), [controller.terminals])
    const liveCount = liveTerminals.length
    const selectedTerminal = useMemo(
        () => controller.terminals.find((terminal) => terminal.terminalId === activeTerminalId) ?? null,
        [activeTerminalId, controller.terminals]
    )
    const displayTerminal = selectedTerminal ?? liveTerminals[0] ?? controller.terminals[0] ?? null
    const activeLiveTerminal = displayTerminal && isLiveTerminal(displayTerminal) ? displayTerminal : null
    const selectedIsLive = Boolean(activeLiveTerminal)
    const activeWarning = activeLiveTerminal ? warningReason(activeLiveTerminal) : null
    const canUseTerminal = props.active && props.terminalSupported
    const quickInputDisabled = !canUseTerminal || !selectedIsLive || controller.state.status !== 'connected'
    const quickInput = useTerminalQuickInput({
        disabled: quickInputDisabled,
        write: (data) => {
            const terminalId = activeLiveTerminal?.terminalId
            if (terminalId) {
                controller.write(terminalId, data)
            }
        }
    })

    useEffect(() => {
        if (!props.active || !props.terminalSupported) {
            controller.disconnect()
            return
        }
        controller.connect()
        return () => {
            inputDisposableRef.current?.dispose()
            inputDisposableRef.current = null
            terminalRef.current = null
            controller.disconnect()
        }
    }, [controller.connect, controller.disconnect, props.active, props.terminalSupported, props.sessionId])

    useEffect(() => {
        controller.onOutput((terminalId, data) => {
            buffersRef.current.set(terminalId, appendBounded(buffersRef.current.get(terminalId) ?? '', data))
            if (terminalId === activeTerminalId) {
                terminalRef.current?.write(data)
            }
        })
    }, [activeTerminalId, controller.onOutput])

    useEffect(() => {
        controller.onExit((terminalId, code) => {
            const message = `\r\n[process exited${code !== null ? ` with code ${code}` : ''}]`
            buffersRef.current.set(terminalId, appendBounded(buffersRef.current.get(terminalId) ?? '', message))
            if (terminalId === activeTerminalId) {
                terminalRef.current?.write(message)
            }
        })
    }, [activeTerminalId, controller.onExit])

    useEffect(() => {
        bootstrapRequestedRef.current = false
        attachedTerminalIdsRef.current.clear()
        buffersRef.current.clear()
        setCreatePending(false)
        setActiveTerminalId(null)
        setCreateError(null)
        controller.clearLastError()
    }, [controller.clearLastError, props.sessionId])

    useEffect(() => {
        if (controller.terminals.length > 0) {
            bootstrapRequestedRef.current = false
            setCreatePending(false)
        }
        setActiveTerminalId((activeId) => {
            const current = activeId
                ? controller.terminals.find((terminal) => terminal.terminalId === activeId) ?? null
                : null
            if (current) {
                return current.terminalId
            }
            return liveTerminals[0]?.terminalId ?? controller.terminals[0]?.terminalId ?? null
        })
    }, [controller.terminals, liveTerminals])

    useEffect(() => {
        if (controller.lastError) {
            setCreatePending(false)
        }
    }, [controller.lastError])

    const createTerminal = useCallback((replay = true, sizeFallback?: { cols: number; rows: number }) => {
        if (!canUseTerminal) {
            return
        }
        if (createPending) {
            return
        }
        if (liveCount >= 3) {
            setCreateError(t('terminal.limit.full'))
            return
        }
        const size = lastSizeRef.current ?? sizeFallback
        if (!size) {
            setCreateError('Waiting for terminal size before creating a terminal.')
            return
        }
        const terminalId = randomId()
        attachedTerminalIdsRef.current.add(terminalId)
        setCreatePending(true)
        setCreateError(null)
        controller.clearLastError()
        setActiveTerminalId(terminalId)
        controller.create({ terminalId, cols: size.cols, rows: size.rows, cwd: props.cwd, replay })
        controller.subscribe()
    }, [canUseTerminal, controller.clearLastError, controller.create, controller.subscribe, createPending, liveCount, props.cwd, t])

    const handleResize = useCallback((cols: number, rows: number) => {
        lastSizeRef.current = { cols, rows }
        if (activeLiveTerminal) {
            if (!attachedTerminalIdsRef.current.has(activeLiveTerminal.terminalId)) {
                attachedTerminalIdsRef.current.add(activeLiveTerminal.terminalId)
                controller.create({ terminalId: activeLiveTerminal.terminalId, cols, rows, cwd: props.cwd, replay: true })
                return
            }
            controller.resize(activeLiveTerminal.terminalId, cols, rows)
            return
        }
        if (!canUseTerminal || controller.terminals.length > 0 || bootstrapRequestedRef.current) {
            return
        }
        bootstrapRequestedRef.current = true
        const terminalId = randomId()
        attachedTerminalIdsRef.current.add(terminalId)
        setCreatePending(true)
        setActiveTerminalId(terminalId)
        controller.clearLastError()
        controller.create({ terminalId, cols, rows, cwd: props.cwd, replay: true })
    }, [activeLiveTerminal, canUseTerminal, controller.clearLastError, controller.create, controller.resize, controller.terminals.length, props.cwd])

    const handleTerminalMount = useCallback((terminal: Terminal) => {
        terminalRef.current = terminal
        inputDisposableRef.current?.dispose()
        inputDisposableRef.current = terminal.onData(quickInput.writeTerminalData)
        if (activeTerminalId) {
            const buffered = buffersRef.current.get(activeTerminalId)
            if (buffered) {
                terminal.write(buffered)
            }
        }
    }, [activeTerminalId, quickInput.writeTerminalData])

    useEffect(() => {
        const terminal = terminalRef.current
        if (!terminal || !activeTerminalId) {
            return
        }
        terminal.clear?.()
        const buffered = buffersRef.current.get(activeTerminalId)
        if (buffered) {
            terminal.write(buffered)
        }
    }, [activeTerminalId])

    const closeTarget = pendingCloseTerminalId
        ? controller.terminals.find((terminal) => terminal.terminalId === pendingCloseTerminalId)
        : null

    return (
        <div className={`flex h-full min-h-0 flex-col bg-[var(--app-bg)] ${props.className ?? ''}`}>
            <div className="shrink-0 border-b border-[var(--app-border)] px-3 py-2">
                <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                        {props.title ? <div className="truncate text-sm font-semibold">{props.title}</div> : null}
                        {props.subtitle ? <div className="truncate text-xs text-[var(--app-hint)]">{props.subtitle}</div> : null}
                        <div className="mt-1 text-[11px] text-[var(--app-hint)]">{t('terminal.lifecycle.hint')}</div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="rounded-full border border-[var(--app-border)] px-2 py-0.5 text-xs text-[var(--app-hint)]">{liveCount}/3</span>
                        <button
                            type="button"
                            aria-label={t('terminal.new')}
                            disabled={!canUseTerminal || liveCount >= 3 || createPending}
                            onClick={() => createTerminal(true)}
                            className="rounded border border-[var(--app-border)] px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            +
                        </button>
                    </div>
                </div>
                {liveCount >= 3 ? <div className="mt-1 text-xs text-[var(--app-hint)]">{t('terminal.limit.full')}</div> : null}
                {createError ? <div className="mt-1 text-xs text-red-500">{createError}</div> : null}
                {controller.lastError ? <div className="mt-1 text-xs text-red-500">{controller.lastError}</div> : null}
                {controller.terminals.length === 0 && controller.recoveryReason === 'cli_lost' ? (
                    <div className="mt-1 text-xs text-amber-500">{t('terminal.recovery.cliLost')}</div>
                ) : null}
                {!props.terminalSupported ? <div className="mt-1 text-xs text-red-500">{t('terminal.unsupported')}</div> : null}
                {!props.active ? <div className="mt-1 text-xs text-[var(--app-hint)]">{t('terminal.inactive')}</div> : null}
            </div>

            <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-[var(--app-border)] px-2 py-1">
                {controller.terminals.map((terminal) => {
                    const isSelected = terminal.terminalId === activeTerminalId
                    const warning = warningReason(terminal)
                    return (
                        <div key={terminal.terminalId} className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${isSelected ? 'bg-[var(--app-subtle-bg)]' : ''}`}>
                            <button type="button" onClick={() => setActiveTerminalId(terminal.terminalId)} className="max-w-[140px] truncate">
                                {terminal.label}
                            </button>
                            <span className="text-[10px] text-[var(--app-hint)]">{terminal.status}</span>
                            {warning ? (
                                <span aria-label={t(warning === 'idle' ? 'terminal.warning.badge.idle' : 'terminal.warning.badge.age')} className="text-[10px] text-amber-500">⚠</span>
                            ) : null}
                            {isLiveTerminal(terminal) ? (
                                <button
                                    type="button"
                                    aria-label={`Close terminal ${terminal.terminalId}`}
                                    className="text-[10px] hover:text-red-500"
                                    onClick={() => setPendingCloseTerminalId(terminal.terminalId)}
                                >
                                    ✕
                                </button>
                            ) : null}
                        </div>
                    )
                })}
            </div>

            <div className="min-h-0 flex-1 overflow-hidden p-2">
                {activeWarning ? (
                    <div role="status" className="mb-2 flex items-center justify-between gap-3 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
                        <span>{t(activeWarning === 'idle' ? 'terminal.warning.idle' : 'terminal.warning.age')}</span>
                        {activeWarning === 'idle' && activeLiveTerminal ? (
                            <button
                                type="button"
                                onClick={() => controller.keepalive(activeLiveTerminal.terminalId)}
                                className="shrink-0 rounded border border-amber-500/40 px-2 py-1 text-xs font-medium text-[var(--app-fg)]"
                            >
                                {t('terminal.keep')}
                            </button>
                        ) : null}
                    </div>
                ) : null}
                {liveCount === 0 && controller.terminals.length > 0 ? (
                    <div className="flex h-full flex-col items-center justify-center gap-3 overflow-auto rounded border border-[var(--app-border)] p-4 text-center text-sm text-[var(--app-hint)]">
                        {controller.terminals.map((terminal) => (
                            <div key={terminal.terminalId} className="flex flex-col items-center gap-2">
                                <div>{closeReasonCopy(terminal, t)}</div>
                                <button
                                    type="button"
                                    disabled={!canUseTerminal}
                                    onClick={() => createTerminal(true, { cols: terminal.cols, rows: terminal.rows })}
                                    className="rounded border border-[var(--app-border)] px-3 py-1.5 text-xs text-[var(--app-fg)] disabled:opacity-50"
                                >
                                    {t('terminal.createNew')}
                                </button>
                            </div>
                        ))}
                    </div>
                ) : displayTerminal && !selectedIsLive ? (
                    <div className="flex h-full flex-col items-center justify-center gap-3 rounded border border-[var(--app-border)] p-4 text-center text-sm text-[var(--app-hint)]">
                        <div>{closeReasonCopy(displayTerminal, t)}</div>
                        <button
                            type="button"
                            disabled={!canUseTerminal}
                            onClick={() => createTerminal(true, { cols: displayTerminal.cols, rows: displayTerminal.rows })}
                            className="rounded border border-[var(--app-border)] px-3 py-1.5 text-xs text-[var(--app-fg)] disabled:opacity-50"
                        >
                            {t('terminal.createNew')}
                        </button>
                    </div>
                ) : props.terminalSupported ? (
                    <TerminalView
                        key={activeTerminalId ?? 'bootstrap'}
                        onMount={handleTerminalMount}
                        onResize={handleResize}
                        compactFontSize={props.compactFontSize}
                        className={controller.terminals.length === 0 ? 'opacity-0' : 'h-full w-full'}
                    />
                ) : (
                    <div className="flex h-full items-center justify-center rounded border border-[var(--app-border)] text-sm text-[var(--app-hint)]">
                        {t('terminal.unsupported')}
                    </div>
                )}
            </div>

            <TerminalQuickKeys
                disabled={quickInputDisabled}
                ctrlActive={quickInput.ctrlActive}
                altActive={quickInput.altActive}
                onQuickInput={quickInput.sendQuickInput}
                onModifierToggle={quickInput.toggleModifier}
                onWritePlainInput={quickInput.writePlainInput}
            />

            <Dialog open={pendingCloseTerminalId !== null} onOpenChange={(open) => !open && setPendingCloseTerminalId(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>{t('terminal.close.confirmTitle')}</DialogTitle>
                        <DialogDescription>{t('terminal.close.confirmDescription')}</DialogDescription>
                    </DialogHeader>
                    <div className="mt-3 flex justify-end gap-2">
                        <button
                            type="button"
                            className="rounded border border-[var(--app-border)] px-3 py-1.5 text-sm"
                            onClick={() => setPendingCloseTerminalId(null)}
                        >
                            {t('button.cancel')}
                        </button>
                        <button
                            type="button"
                            className="rounded bg-red-600 px-3 py-1.5 text-sm text-white"
                            onClick={() => {
                                if (closeTarget) {
                                    controller.closeOne(closeTarget.terminalId)
                                }
                                setPendingCloseTerminalId(null)
                            }}
                        >
                            {t('terminal.close.confirmAction')}
                        </button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
