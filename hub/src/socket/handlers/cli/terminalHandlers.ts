import {
    TerminalErrorPayloadSchema,
    TerminalExitPayloadSchema,
    TerminalHistoryResultSchema,
    TerminalListPayloadSchema,
    TerminalOutputPayloadSchema,
    TerminalReadyPayloadSchema,
    TerminalWarningPayloadSchema,
    type TerminalScopeTyped
} from '@hapi/protocol'
import type { StoredMachine, StoredSession } from '../../../store'
import type { TerminalRegistry } from '../../terminalRegistry'
import type { TerminalSessionStateStore } from '../../terminalSessionState'
import {
    TerminalHistoryRequestRegistry,
    type TerminalHistoryScope
} from '../../terminalHistoryRequests'
import type { CliSocketWithData, SocketServer } from '../../socketTypes'
import { terminalScopeRoom } from '../../terminalRooms'
import type { AccessErrorReason, AccessResult } from './types'

type ResolveSessionAccess = (sessionId: string) => AccessResult<StoredSession>
type ResolveMachineAccess = (machineId: string) => AccessResult<StoredMachine>

type EmitAccessError = (scope: 'session' | 'machine', id: string, reason: AccessErrorReason) => void

type SocketNamespace = ReturnType<SocketServer['of']>

const terminalReadySchema = TerminalReadyPayloadSchema
const terminalOutputSchema = TerminalOutputPayloadSchema
const terminalExitSchema = TerminalExitPayloadSchema
const terminalErrorSchema = TerminalErrorPayloadSchema
const terminalListSchema = TerminalListPayloadSchema
const terminalWarningSchema = TerminalWarningPayloadSchema

export type TerminalHandlersDeps = {
    terminalRegistry: TerminalRegistry
    terminalHistoryRequests?: TerminalHistoryRequestRegistry
    terminalSessionState?: TerminalSessionStateStore
    terminalNamespace: SocketNamespace
    resolveSessionAccess: ResolveSessionAccess
    resolveMachineAccess: ResolveMachineAccess
    emitAccessError: EmitAccessError
}

export function registerTerminalHandlers(socket: CliSocketWithData, deps: TerminalHandlersDeps): void {
    const { terminalRegistry, terminalSessionState, terminalNamespace, resolveSessionAccess, resolveMachineAccess, emitAccessError } = deps
    const terminalHistoryRequests = deps.terminalHistoryRequests ?? new TerminalHistoryRequestRegistry()

    const authorizeTypedScope = (scope: TerminalScopeTyped): string | null => {
        if (scope.scopeType === 'session') {
            const sessionAccess = resolveSessionAccess(scope.sessionId)
            if (!sessionAccess.ok) {
                emitAccessError('session', scope.sessionId, sessionAccess.reason)
                return null
            }
            return sessionAccess.value.namespace
        }

        const machineAccess = resolveMachineAccess(scope.machineId)
        if (!machineAccess.ok) {
            emitAccessError('machine', scope.machineId, machineAccess.reason)
            return null
        }
        return machineAccess.value.namespace
    }

    const forwardTerminalEvent = (event: string, payload: { sessionId?: string; machineId?: string; terminalId: string } & Record<string, unknown>, removeEntry = false) => {
        const entry = terminalRegistry.get(payload.terminalId)
        if (!entry) {
            return
        }
        if (entry.cliSocketId !== socket.id) {
            return
        }
        if (payload.sessionId !== entry.sessionId || payload.machineId !== entry.machineId) {
            return
        }
        const typedScope: TerminalScopeTyped | null = payload.sessionId
            ? { scopeType: 'session', sessionId: payload.sessionId }
            : payload.machineId
                ? { scopeType: 'machine', machineId: payload.machineId }
                : null
        const namespace = typedScope ? authorizeTypedScope(typedScope) : null
        if (!typedScope || !namespace) {
            if (removeEntry) {
                terminalRegistry.remove(payload.terminalId)
            }
            return
        }
        if (removeEntry) {
            terminalRegistry.remove(payload.terminalId)
        }
        const room = terminalScopeRoom(namespace, typedScope)
        terminalNamespace.to(room).emit(event, payload)
        const terminalSocket = terminalNamespace.sockets.get(entry.socketId)
        if (!terminalSocket) {
            return
        }
        if (terminalSocket.rooms.has(room)) {
            return
        }
        terminalSocket.emit(event, payload)
    }

    socket.on('terminal:list', (data: unknown) => {
        const parsed = terminalListSchema.safeParse(data)
        if (!parsed.success) {
            return
        }
        const namespace = authorizeTypedScope(parsed.data)
        if (!namespace) {
            return
        }
        terminalSessionState?.updateFromList(socket.id, namespace, parsed.data)
        const payload = parsed.data.scopeType === 'session'
            ? (terminalSessionState?.getCachedSessionList(parsed.data.sessionId, namespace) ?? parsed.data)
            : parsed.data
        terminalNamespace.to(terminalScopeRoom(namespace, parsed.data)).emit('terminal:list', payload)
    })

    socket.on('terminal:warning', (data: unknown) => {
        const parsed = terminalWarningSchema.safeParse(data)
        if (!parsed.success) {
            return
        }
        const namespace = authorizeTypedScope(parsed.data)
        if (!namespace) {
            return
        }
        terminalNamespace.to(terminalScopeRoom(namespace, parsed.data)).emit('terminal:warning', parsed.data)
    })

    socket.on('terminal:ready', (data: unknown) => {
        const parsed = terminalReadySchema.safeParse(data)
        if (!parsed.success) {
            return
        }
        terminalRegistry.markActivity(parsed.data.terminalId)
        forwardTerminalEvent('terminal:ready', parsed.data)
    })

    socket.on('terminal:output', (data: unknown) => {
        const parsed = terminalOutputSchema.safeParse(data)
        if (!parsed.success) {
            return
        }
        terminalRegistry.markActivity(parsed.data.terminalId)
        forwardTerminalEvent('terminal:output', parsed.data)
    })

    socket.on('terminal:exit', (data: unknown) => {
        const parsed = terminalExitSchema.safeParse(data)
        if (!parsed.success) {
            return
        }
        const entry = terminalRegistry.get(parsed.data.terminalId)
        const sessionId = 'sessionId' in parsed.data ? parsed.data.sessionId : undefined
        const machineId = 'machineId' in parsed.data ? parsed.data.machineId : undefined
        if (!entry || entry.sessionId !== sessionId || entry.machineId !== machineId || entry.cliSocketId !== socket.id) {
            return
        }
        forwardTerminalEvent('terminal:exit', parsed.data, true)
    })

    socket.on('terminal:error', (data: unknown) => {
        const parsed = terminalErrorSchema.safeParse(data)
        if (!parsed.success) {
            return
        }

        const entry = terminalRegistry.get(parsed.data.terminalId)
        const sessionId = 'sessionId' in parsed.data ? parsed.data.sessionId : undefined
        const machineId = 'machineId' in parsed.data ? parsed.data.machineId : undefined
        if (!entry || entry.sessionId !== sessionId || entry.machineId !== machineId || entry.cliSocketId !== socket.id) {
            return
        }

        forwardTerminalEvent('terminal:error', parsed.data, true)
    })

    socket.on('terminal:history-result', (data: unknown) => {
        const parsed = TerminalHistoryResultSchema.safeParse(data)
        if (!parsed.success) {
            return
        }
        const scope: TerminalHistoryScope = 'sessionId' in parsed.data
            ? { sessionId: parsed.data.sessionId }
            : { machineId: parsed.data.machineId }
        const typedScope: TerminalScopeTyped = 'sessionId' in scope
            ? { scopeType: 'session', sessionId: scope.sessionId }
            : { scopeType: 'machine', machineId: scope.machineId }
        const namespace = authorizeTypedScope(typedScope)
        if (!namespace) {
            return
        }
        const entry = terminalRegistry.get(parsed.data.terminalId)
        if (
            !entry
            || entry.cliSocketId !== socket.id
            || entry.namespace !== namespace
            || entry.sessionId !== ('sessionId' in scope ? scope.sessionId : undefined)
            || entry.machineId !== ('machineId' in scope ? scope.machineId : undefined)
        ) {
            return
        }

        const pending = terminalHistoryRequests.consume(parsed.data.requestId, {
            cliSocketId: socket.id,
            terminalId: parsed.data.terminalId,
            namespace,
            scope
        })
        if (!pending) {
            return
        }
        const webSocket = terminalNamespace.sockets.get(pending.webSocketId)
        webSocket?.emit('terminal:history-result', {
            ...parsed.data,
            requestId: pending.webRequestId
        })
    })
}

export function cleanupTerminalHandlers(socket: CliSocketWithData, deps: {
    terminalRegistry: TerminalRegistry
    terminalHistoryRequests?: TerminalHistoryRequestRegistry
    terminalNamespace: SocketNamespace
}): void {
    deps.terminalHistoryRequests?.removeByCliSocket(socket.id)
    const removed = deps.terminalRegistry.removeByCliSocket(socket.id)
    for (const entry of removed) {
        const terminalSocket = deps.terminalNamespace.sockets.get(entry.socketId)
        terminalSocket?.emit('terminal:error', {
            ...(entry.sessionId ? { sessionId: entry.sessionId } : { machineId: entry.machineId }),
            terminalId: entry.terminalId,
            message: 'CLI disconnected.'
        })
    }
}
