import type { TerminalListPayload, TerminalState } from '@hapi/protocol'

const SESSION_LIVE_STATUSES = new Set<TerminalState['status']>([
    'running',
    'detached',
    'warning_idle',
    'warning_age'
])

type SessionKey = `${string}\0${string}`

type SessionTerminalSnapshot = {
    cliSocketId: string
    namespace: string
    sessionId: string
    terminals: TerminalState[]
    recovery?: { reason: 'cli_lost'; at: number }
}

export type LostSessionTerminalList = {
    namespace: string
    payload: Extract<TerminalListPayload, { scopeType: 'session' }>
}

function sessionKey(namespace: string, sessionId: string): SessionKey {
    return `${namespace}\0${sessionId}`
}

export class TerminalSessionStateStore {
    private readonly snapshotsBySession = new Map<SessionKey, SessionTerminalSnapshot>()
    private readonly sessionsByCliSocket = new Map<string, Set<SessionKey>>()

    updateFromList(cliSocketId: string, namespace: string, payload: TerminalListPayload): void {
        if (payload.scopeType !== 'session') {
            return
        }
        const key = sessionKey(namespace, payload.sessionId)
        const previous = this.snapshotsBySession.get(key)
        if (previous) {
            this.sessionsByCliSocket.get(previous.cliSocketId)?.delete(key)
        }
        const previousLost = previous?.terminals.filter((terminal) => terminal.status === 'lost' && terminal.closeReason === 'cli_lost') ?? []
        const nextTerminalIds = new Set(payload.terminals.map((terminal) => terminal.terminalId))
        const terminals = [
            ...payload.terminals,
            ...previousLost.filter((terminal) => !nextTerminalIds.has(terminal.terminalId))
        ]
        const recovery = previous?.recovery && (previousLost.length > 0 || payload.terminals.length === 0)
            ? previous.recovery
            : undefined
        this.snapshotsBySession.set(key, {
            cliSocketId,
            namespace,
            sessionId: payload.sessionId,
            terminals,
            ...(recovery ? { recovery } : {})
        })
        const keys = this.sessionsByCliSocket.get(cliSocketId) ?? new Set<SessionKey>()
        keys.add(key)
        this.sessionsByCliSocket.set(cliSocketId, keys)
    }

    clearByCliSocket(cliSocketId: string): void {
        const keys = this.sessionsByCliSocket.get(cliSocketId)
        if (!keys) {
            return
        }
        for (const key of keys) {
            const snapshot = this.snapshotsBySession.get(key)
            if (snapshot?.cliSocketId === cliSocketId) {
                this.snapshotsBySession.delete(key)
            }
        }
        this.sessionsByCliSocket.delete(cliSocketId)
    }

    markLostByCliSocket(
        cliSocketId: string,
        at: number,
        fallbackSession?: { namespace: string; sessionId: string } | null
    ): LostSessionTerminalList[] {
        const keys = new Set(this.sessionsByCliSocket.get(cliSocketId) ?? [])
        if (fallbackSession) {
            keys.add(sessionKey(fallbackSession.namespace, fallbackSession.sessionId))
        }
        if (keys.size === 0) {
            return []
        }
        const affected: LostSessionTerminalList[] = []
        for (const key of keys) {
            const existing = this.snapshotsBySession.get(key)
            const [namespace, sessionId] = key.split('\0') as [string, string]
            const resolvedNamespace = existing?.namespace ?? namespace
            const resolvedSessionId = existing?.sessionId ?? sessionId
            const terminals = (existing?.terminals ?? []).map((terminal) => {
                if (!SESSION_LIVE_STATUSES.has(terminal.status)) {
                    return terminal
                }
                return {
                    ...terminal,
                    status: 'lost' as const,
                    closeReason: 'cli_lost' as const,
                    lastActivityAt: at
                }
            })
            this.snapshotsBySession.set(key, {
                cliSocketId,
                namespace: resolvedNamespace,
                sessionId: resolvedSessionId,
                terminals,
                recovery: { reason: 'cli_lost', at }
            })
            affected.push({
                namespace: resolvedNamespace,
                payload: {
                    scopeType: 'session',
                    sessionId: resolvedSessionId,
                    terminals,
                    recovery: { reason: 'cli_lost', at }
                }
            })
        }
        this.sessionsByCliSocket.delete(cliSocketId)
        return affected
    }

    getCachedSessionList(sessionId: string, namespace: string): Extract<TerminalListPayload, { scopeType: 'session' }> | null {
        const snapshot = this.snapshotsBySession.get(sessionKey(namespace, sessionId))
        if (!snapshot) {
            return null
        }
        return {
            scopeType: 'session',
            sessionId,
            terminals: snapshot.terminals,
            ...(snapshot.recovery ? { recovery: snapshot.recovery } : {})
        }
    }

    countLiveSessionTerminals(sessionId: string, namespace: string): number | undefined {
        const snapshot = this.snapshotsBySession.get(sessionKey(namespace, sessionId))
        if (!snapshot) {
            return undefined
        }
        return snapshot.terminals.filter((terminal) => SESSION_LIVE_STATUSES.has(terminal.status)).length
    }
}
