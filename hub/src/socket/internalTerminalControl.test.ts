import { describe, expect, it } from 'bun:test'
import { closeSessionTerminalsInternal } from './internalTerminalControl'
import { TerminalRegistry } from './terminalRegistry'
import type { SocketServer } from './socketTypes'

type EmittedEvent = {
    event: string
    data: unknown
}

class FakeSocket {
    readonly id: string
    readonly data: Record<string, unknown> = {}
    readonly emitted: EmittedEvent[] = []

    constructor(id: string, namespace: string) {
        this.id = id
        this.data.namespace = namespace
    }

    emit(event: string, data: unknown): boolean {
        this.emitted.push({ event, data })
        return true
    }
}

class FakeNamespace {
    readonly sockets = new Map<string, FakeSocket>()
    readonly adapter = { rooms: new Map<string, Set<string>>() }
}

class FakeServer {
    private readonly namespaces = new Map<string, FakeNamespace>()

    of(name: string): FakeNamespace {
        const existing = this.namespaces.get(name)
        if (existing) return existing
        const namespace = new FakeNamespace()
        this.namespaces.set(name, namespace)
        return namespace
    }
}

function addCli(namespace: FakeNamespace, socket: FakeSocket, room: string): void {
    namespace.sockets.set(socket.id, socket)
    const sockets = namespace.adapter.rooms.get(room) ?? new Set<string>()
    sockets.add(socket.id)
    namespace.adapter.rooms.set(room, sockets)
}

function closeAllEvents(socket: FakeSocket): EmittedEvent[] {
    return socket.emitted.filter((entry) => entry.event === 'terminal:close-all')
}

function createHarness(): { io: FakeServer; cliNamespace: FakeNamespace; registry: TerminalRegistry } {
    const io = new FakeServer()
    return {
        io,
        cliNamespace: io.of('/cli'),
        registry: new TerminalRegistry({ idleTimeoutMs: 0 })
    }
}

describe('closeSessionTerminalsInternal', () => {
    it('emits archive close-all to owning CLI only and cleans matching registry entries', () => {
        const { io, cliNamespace, registry } = createHarness()
        const owner = new FakeSocket('cli-owner', 'team-a')
        const sameSessionOtherNamespace = new FakeSocket('cli-team-b', 'team-b')
        const machineCli = new FakeSocket('cli-machine', 'team-a')
        addCli(cliNamespace, owner, 'session:session-1')
        addCli(cliNamespace, sameSessionOtherNamespace, 'session:session-1')
        addCli(cliNamespace, machineCli, 'machine:machine-1')
        registry.register({
            terminalId: 'terminal-a',
            sessionId: 'session-1',
            namespace: 'team-a',
            socketId: 'web-a',
            cliSocketId: owner.id
        })
        registry.register({
            terminalId: 'terminal-b',
            sessionId: 'session-1',
            namespace: 'team-b',
            socketId: 'web-b',
            cliSocketId: sameSessionOtherNamespace.id
        })
        registry.register({
            terminalId: 'terminal-machine',
            machineId: 'machine-1',
            namespace: 'team-a',
            socketId: 'web-m',
            cliSocketId: machineCli.id
        })

        const emitted = closeSessionTerminalsInternal({
            io: io as unknown as SocketServer,
            terminalRegistry: registry
        }, { namespace: 'team-a', sessionId: 'session-1' })

        expect(emitted).toBe(1)
        expect(closeAllEvents(owner)).toEqual([{
            event: 'terminal:close-all',
            data: { scopeType: 'session', sessionId: 'session-1', reason: 'archive' }
        }])
        expect(closeAllEvents(sameSessionOtherNamespace)).toEqual([])
        expect(closeAllEvents(machineCli)).toEqual([])
        expect(registry.entriesForSession('session-1', 'team-a')).toEqual([])
        expect(registry.entriesForSession('session-1', 'team-b').map((entry) => entry.terminalId)).toEqual(['terminal-b'])
        expect(registry.countForMachine('machine-1')).toBe(1)
    })

    it('falls back to matching session room CLI when registry has no session entries', () => {
        const { io, cliNamespace, registry } = createHarness()
        const matching = new FakeSocket('cli-matching', 'team-a')
        const wrongNamespace = new FakeSocket('cli-wrong', 'team-b')
        addCli(cliNamespace, matching, 'session:session-1')
        addCli(cliNamespace, wrongNamespace, 'session:session-1')

        const emitted = closeSessionTerminalsInternal({
            io: io as unknown as SocketServer,
            terminalRegistry: registry
        }, { namespace: 'team-a', sessionId: 'session-1' })

        expect(emitted).toBe(1)
        expect(closeAllEvents(matching)).toEqual([{
            event: 'terminal:close-all',
            data: { scopeType: 'session', sessionId: 'session-1', reason: 'archive' }
        }])
        expect(closeAllEvents(wrongNamespace)).toEqual([])
    })

    it('uses registry owner instead of stale duplicate CLI in same session room', () => {
        const { io, cliNamespace, registry } = createHarness()
        const owner = new FakeSocket('cli-owner', 'team-a')
        const staleDuplicate = new FakeSocket('cli-stale', 'team-a')
        addCli(cliNamespace, owner, 'session:session-1')
        addCli(cliNamespace, staleDuplicate, 'session:session-1')
        registry.register({
            terminalId: 'terminal-a',
            sessionId: 'session-1',
            namespace: 'team-a',
            socketId: 'web-a',
            cliSocketId: owner.id
        })

        const emitted = closeSessionTerminalsInternal({
            io: io as unknown as SocketServer,
            terminalRegistry: registry
        }, { namespace: 'team-a', sessionId: 'session-1' })

        expect(emitted).toBe(1)
        expect(closeAllEvents(owner)).toHaveLength(1)
        expect(closeAllEvents(staleDuplicate)).toEqual([])
    })
})
