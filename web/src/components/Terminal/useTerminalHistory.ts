import { useCallback, useEffect, useRef, useState } from 'react'
import type { TerminalHistoryEntry, TerminalHistoryResult } from '@hapi/protocol'

export type TerminalHistoryState =
    | { status: 'idle'; entries: [] }
    | { status: 'loading'; entries: [] }
    | { status: 'ready'; entries: TerminalHistoryEntry[] }
    | { status: 'unsupported'; entries: []; shell?: string }
    | { status: 'error'; entries: []; message: 'not_ready' | 'read_failed' | 'request_failed' }

type UseTerminalHistoryOptions = {
    terminalContextKey: string | null
    terminalId: string | null
    request: (requestId: string, limit: number) => boolean
    subscribe: (handler: (result: TerminalHistoryResult) => void) => void
}

let fallbackRequestSequence = 0

function createRequestId(): string {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
        return globalThis.crypto.randomUUID()
    }
    fallbackRequestSequence += 1
    return `terminal-history-${Date.now()}-${fallbackRequestSequence}`
}

export function useTerminalHistory(options: UseTerminalHistoryOptions): {
    state: TerminalHistoryState
    open: () => void
    refresh: () => void
    close: () => void
} {
    const [state, setState] = useState<TerminalHistoryState>({ status: 'idle', entries: [] })
    const activeRequestRef = useRef<{ requestId: string; terminalContextKey: string; terminalId: string } | null>(null)
    const terminalContextKeyRef = useRef(options.terminalContextKey)
    const terminalIdRef = useRef(options.terminalId)
    const requestRef = useRef(options.request)
    terminalContextKeyRef.current = options.terminalContextKey
    terminalIdRef.current = options.terminalId
    requestRef.current = options.request

    useEffect(() => {
        activeRequestRef.current = null
        setState({ status: 'idle', entries: [] })
    }, [options.terminalContextKey])

    useEffect(() => {
        options.subscribe((result) => {
            const active = activeRequestRef.current
            if (
                !active
                || result.requestId !== active.requestId
                || result.terminalId !== active.terminalId
                || terminalContextKeyRef.current !== active.terminalContextKey
            ) {
                return
            }

            if (result.status === 'ok') {
                setState({ status: 'ready', entries: result.entries })
                return
            }
            if (result.status === 'unsupported_shell') {
                setState({
                    status: 'unsupported',
                    entries: [],
                    ...(result.shell ? { shell: result.shell } : {})
                })
                return
            }
            setState({
                status: 'error',
                entries: [],
                message: result.status
            })
        })
    }, [options.subscribe])

    const load = useCallback(() => {
        const terminalContextKey = terminalContextKeyRef.current
        const terminalId = terminalIdRef.current
        if (!terminalContextKey || !terminalId) {
            activeRequestRef.current = null
            setState({ status: 'error', entries: [], message: 'request_failed' })
            return
        }

        const requestId = createRequestId()
        activeRequestRef.current = { requestId, terminalContextKey, terminalId }
        setState({ status: 'loading', entries: [] })
        if (!requestRef.current(requestId, 100)) {
            activeRequestRef.current = null
            setState({ status: 'error', entries: [], message: 'request_failed' })
        }
    }, [])

    const close = useCallback(() => {
        activeRequestRef.current = null
        setState({ status: 'idle', entries: [] })
    }, [])

    return {
        state,
        open: load,
        refresh: load,
        close
    }
}
