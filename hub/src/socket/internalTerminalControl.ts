import { TerminalCloseAllPayloadSchema, type TerminalCloseAllPayload } from '@hapi/protocol'
import type { SocketServer, SocketWithData } from './socketTypes'
import type { TerminalRegistry } from './terminalRegistry'

export type CloseSessionTerminalsDeps = {
    io: SocketServer
    terminalRegistry: TerminalRegistry
}

export function closeSessionTerminalsInternal(
    deps: CloseSessionTerminalsDeps,
    input: { namespace: string; sessionId: string }
): number {
    const payload: TerminalCloseAllPayload = {
        scopeType: 'session',
        sessionId: input.sessionId,
        reason: 'archive'
    }
    const parsed = TerminalCloseAllPayloadSchema.safeParse(payload)
    if (!parsed.success) {
        return 0
    }

    const cliNamespace = deps.io.of('/cli')
    const registryEntries = deps.terminalRegistry.entriesForSession(input.sessionId, input.namespace)
    const targetSocketIds = new Set<string>()

    if (registryEntries.length > 0) {
        for (const entry of registryEntries) {
            targetSocketIds.add(entry.cliSocketId)
        }
    } else {
        const room = cliNamespace.adapter.rooms.get(`session:${input.sessionId}`)
        if (room) {
            for (const socketId of room) {
                targetSocketIds.add(socketId)
            }
        }
    }

    let emitted = 0
    for (const socketId of targetSocketIds) {
        const cliSocket = cliNamespace.sockets.get(socketId) as SocketWithData | undefined
        if (!cliSocket || cliSocket.data.namespace !== input.namespace) {
            continue
        }
        cliSocket.emit('terminal:close-all', parsed.data)
        emitted += 1
    }

    deps.terminalRegistry.removeBySession(input.sessionId, input.namespace)
    return emitted
}
