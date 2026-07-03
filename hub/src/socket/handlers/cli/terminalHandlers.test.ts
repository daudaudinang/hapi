import { describe, expect, it } from 'bun:test'
import type { StoredMachine, StoredSession } from '../../../store'
import type { CliSocketWithData } from '../../socketTypes'
import { TerminalRegistry } from '../../terminalRegistry'
import { TerminalSessionStateStore } from '../../terminalSessionState'
import { registerTerminalHandlers } from './terminalHandlers'

type EmittedEvent = {
    event: string
    data: unknown
}

class FakeSocket {
    readonly id: string
    readonly data: Record<string, unknown> = {}
    readonly emitted: EmittedEvent[] = []
    readonly rooms = new Set<string>()
    private readonly handlers = new Map<string, (...args: unknown[]) => void>()

    constructor(id: string) {
        this.id = id
    }

    on(event: string, handler: (...args: unknown[]) => void): this {
        this.handlers.set(event, handler)
        return this
    }

    emit(event: string, data: unknown): boolean {
        this.emitted.push({ event, data })
        return true
    }

    trigger(event: string, data?: unknown): void {
        const handler = this.handlers.get(event)
        if (!handler) {
            return
        }
        if (typeof data === 'undefined') {
            handler()
            return
        }
        handler(data)
    }
}

class FakeNamespace {
    readonly sockets = new Map<string, FakeSocket>()
    readonly roomEmits: EmittedEvent[] = []

    to(room: string): { emit: (event: string, data: unknown) => boolean } {
        return {
            emit: (event, data) => {
                this.roomEmits.push({ event: `${room}:${event}`, data })
                return true
            }
        }
    }
}

function lastEmit(socket: FakeSocket, event: string): EmittedEvent | undefined {
    return [...socket.emitted].reverse().find((entry) => entry.event === event)
}

function storedSession(namespace = 'default'): StoredSession {
    return { namespace } as StoredSession
}

function storedMachine(namespace = 'default'): StoredMachine {
    return { namespace } as StoredMachine
}

function runningSessionTerminal(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        scopeType: 'session',
        sessionId: 'session-1',
        terminalId: 'terminal-1',
        label: 'Terminal 1',
        cwd: '/repo',
        cols: 80,
        rows: 24,
        status: 'running',
        closeReason: null,
        createdAt: 1,
        lastActivityAt: 1,
        idleWarningAt: null,
        hardExpiresAt: 10,
        ...overrides
    }
}

describe('cli terminal handlers', () => {
    it('forwards typed terminal list payloads to the exact session room', () => {
        const cliSocket = new FakeSocket('cli-socket')
        const terminalNamespace = new FakeNamespace()
        const terminalRegistry = new TerminalRegistry({ idleTimeoutMs: 0 })

        registerTerminalHandlers(cliSocket as unknown as CliSocketWithData, {
            terminalRegistry,
            terminalNamespace: terminalNamespace as never,
            resolveSessionAccess: () => ({ ok: true, value: storedSession() }),
            resolveMachineAccess: () => ({ ok: true, value: storedMachine() }),
            emitAccessError: () => {
                throw new Error('Unexpected access error')
            }
        })

        cliSocket.trigger('terminal:list', {
            scopeType: 'session',
            sessionId: 'session-1',
            terminals: []
        })

        expect(terminalNamespace.roomEmits).toEqual([{
            event: 'terminal:default:session:session-1:terminal:list',
            data: { scopeType: 'session', sessionId: 'session-1', terminals: [] }
        }])
    })

    it('broadcasts the merged cached recovery list after restarted CLI sends an empty list', () => {
        const cliSocket = new FakeSocket('cli-socket')
        const terminalNamespace = new FakeNamespace()
        const terminalRegistry = new TerminalRegistry({ idleTimeoutMs: 0 })
        const terminalSessionState = new TerminalSessionStateStore()
        terminalSessionState.markLostByCliSocket('old-cli', 999, { namespace: 'default', sessionId: 'session-1' })

        registerTerminalHandlers(cliSocket as unknown as CliSocketWithData, {
            terminalRegistry,
            terminalSessionState,
            terminalNamespace: terminalNamespace as never,
            resolveSessionAccess: () => ({ ok: true, value: storedSession() }),
            resolveMachineAccess: () => ({ ok: true, value: storedMachine() }),
            emitAccessError: () => {
                throw new Error('Unexpected access error')
            }
        })

        cliSocket.trigger('terminal:list', {
            scopeType: 'session',
            sessionId: 'session-1',
            terminals: []
        })

        expect(terminalNamespace.roomEmits).toEqual([{
            event: 'terminal:default:session:session-1:terminal:list',
            data: {
                scopeType: 'session',
                sessionId: 'session-1',
                terminals: [],
                recovery: { reason: 'cli_lost', at: 999 }
            }
        }])
    })

    it('uses namespace-specific terminal rooms for CLI list events with the same session id', () => {
        const cliSocket = new FakeSocket('cli-socket')
        const terminalNamespace = new FakeNamespace()
        const terminalRegistry = new TerminalRegistry({ idleTimeoutMs: 0 })

        registerTerminalHandlers(cliSocket as unknown as CliSocketWithData, {
            terminalRegistry,
            terminalNamespace: terminalNamespace as never,
            resolveSessionAccess: () => ({ ok: true, value: storedSession('team/a') }),
            resolveMachineAccess: () => ({ ok: true, value: storedMachine('team/a') }),
            emitAccessError: () => {
                throw new Error('Unexpected access error')
            }
        })

        cliSocket.trigger('terminal:list', {
            scopeType: 'session',
            sessionId: 'same-session',
            terminals: []
        })

        expect(terminalNamespace.roomEmits).toEqual([{
            event: 'terminal:team%2Fa:session:same-session:terminal:list',
            data: { scopeType: 'session', sessionId: 'same-session', terminals: [] }
        }])
        expect(terminalNamespace.roomEmits.some((entry) => entry.event.startsWith('terminal:team%2Fb:'))).toBe(false)
    })

    it('forwards typed terminal list payloads to the exact machine room', () => {
        const cliSocket = new FakeSocket('cli-socket')
        const terminalNamespace = new FakeNamespace()
        const terminalRegistry = new TerminalRegistry({ idleTimeoutMs: 0 })

        registerTerminalHandlers(cliSocket as unknown as CliSocketWithData, {
            terminalRegistry,
            terminalNamespace: terminalNamespace as never,
            resolveSessionAccess: () => ({ ok: true, value: storedSession() }),
            resolveMachineAccess: () => ({ ok: true, value: storedMachine() }),
            emitAccessError: () => {
                throw new Error('Unexpected access error')
            }
        })

        cliSocket.trigger('terminal:list', {
            scopeType: 'machine',
            machineId: 'machine-1',
            terminals: []
        })

        expect(terminalNamespace.roomEmits).toEqual([{
            event: 'terminal:default:machine:machine-1:terminal:list',
            data: { scopeType: 'machine', machineId: 'machine-1', terminals: [] }
        }])
    })

    it('forwards terminal warnings only to the exact machine room', () => {
        const cliSocket = new FakeSocket('cli-socket')
        const terminalNamespace = new FakeNamespace()
        const terminalRegistry = new TerminalRegistry({ idleTimeoutMs: 0 })

        registerTerminalHandlers(cliSocket as unknown as CliSocketWithData, {
            terminalRegistry,
            terminalNamespace: terminalNamespace as never,
            resolveSessionAccess: () => ({ ok: true, value: storedSession() }),
            resolveMachineAccess: () => ({ ok: true, value: storedMachine() }),
            emitAccessError: () => {
                throw new Error('Unexpected access error')
            }
        })

        cliSocket.trigger('terminal:warning', {
            scopeType: 'machine',
            machineId: 'machine-1',
            terminalId: 'tm',
            reason: 'idle',
            message: 'idle',
            closesAt: 10
        })

        expect(terminalNamespace.roomEmits).toEqual([{
            event: 'terminal:default:machine:machine-1:terminal:warning',
            data: {
                scopeType: 'machine',
                machineId: 'machine-1',
                terminalId: 'tm',
                reason: 'idle',
                message: 'idle',
                closesAt: 10
            }
        }])
    })

    it('does not emit list or warning when access is denied and reports access error', () => {
        const cliSocket = new FakeSocket('cli-socket')
        const terminalNamespace = new FakeNamespace()
        const terminalRegistry = new TerminalRegistry({ idleTimeoutMs: 0 })
        const accessErrors: Array<{ scope: string; id: string; reason: string }> = []

        registerTerminalHandlers(cliSocket as unknown as CliSocketWithData, {
            terminalRegistry,
            terminalNamespace: terminalNamespace as never,
            resolveSessionAccess: () => ({ ok: false, reason: 'access-denied' }),
            resolveMachineAccess: () => ({ ok: true, value: storedMachine() }),
            emitAccessError: (scope, id, reason) => {
                accessErrors.push({ scope, id, reason })
            }
        })

        cliSocket.trigger('terminal:list', {
            scopeType: 'session',
            sessionId: 'session-1',
            terminals: []
        })
        cliSocket.trigger('terminal:warning', {
            scopeType: 'session',
            sessionId: 'session-1',
            terminalId: 'terminal-1',
            reason: 'age',
            message: 'old',
            closesAt: 10
        })

        expect(terminalNamespace.roomEmits).toEqual([])
        expect(accessErrors).toEqual([
            { scope: 'session', id: 'session-1', reason: 'access-denied' },
            { scope: 'session', id: 'session-1', reason: 'access-denied' }
        ])
    })

    it('rejects terminal list payloads whose terminal scope mismatches the list scope', () => {
        const cliSocket = new FakeSocket('cli-socket')
        const terminalNamespace = new FakeNamespace()
        const terminalRegistry = new TerminalRegistry({ idleTimeoutMs: 0 })

        registerTerminalHandlers(cliSocket as unknown as CliSocketWithData, {
            terminalRegistry,
            terminalNamespace: terminalNamespace as never,
            resolveSessionAccess: () => ({ ok: true, value: storedSession() }),
            resolveMachineAccess: () => ({ ok: true, value: storedMachine() }),
            emitAccessError: () => {
                throw new Error('Unexpected access error')
            }
        })

        cliSocket.trigger('terminal:list', {
            scopeType: 'session',
            sessionId: 'session-1',
            terminals: [runningSessionTerminal({ sessionId: 'session-2' })]
        })

        expect(terminalNamespace.roomEmits).toEqual([])
    })

    it('forwards terminal output to exact room after access check and keeps legacy attached socket emit', () => {
        const cliSocket = new FakeSocket('cli-socket')
        const terminalSocket = new FakeSocket('terminal-socket')
        const terminalNamespace = new FakeNamespace()
        const terminalRegistry = new TerminalRegistry({ idleTimeoutMs: 0 })

        terminalNamespace.sockets.set(terminalSocket.id, terminalSocket)
        terminalRegistry.register({
            terminalId: 'terminal-1',
            sessionId: 'session-1',
            namespace: 'default',
            socketId: terminalSocket.id,
            cliSocketId: cliSocket.id
        })

        registerTerminalHandlers(cliSocket as unknown as CliSocketWithData, {
            terminalRegistry,
            terminalNamespace: terminalNamespace as never,
            resolveSessionAccess: () => ({ ok: true, value: storedSession() }),
            resolveMachineAccess: () => ({ ok: true, value: storedMachine() }),
            emitAccessError: () => {
                throw new Error('Unexpected access error')
            }
        })

        cliSocket.trigger('terminal:output', {
            sessionId: 'session-1',
            terminalId: 'terminal-1',
            data: 'hello'
        })

        const payload = {
            sessionId: 'session-1',
            terminalId: 'terminal-1',
            data: 'hello'
        }
        expect(lastEmit(terminalSocket, 'terminal:output')?.data).toEqual(payload)
        expect(terminalNamespace.roomEmits).toEqual([{
            event: 'terminal:default:session:session-1:terminal:output',
            data: payload
        }])
    })

    it('skips legacy direct stream emit when attached socket is already in the exact room', () => {
        const cliSocket = new FakeSocket('cli-socket')
        const terminalSocket = new FakeSocket('terminal-socket')
        const terminalNamespace = new FakeNamespace()
        const terminalRegistry = new TerminalRegistry({ idleTimeoutMs: 0 })
        terminalSocket.rooms.add('terminal:default:session:session-1')

        terminalNamespace.sockets.set(terminalSocket.id, terminalSocket)
        terminalRegistry.register({
            terminalId: 'terminal-1',
            sessionId: 'session-1',
            namespace: 'default',
            socketId: terminalSocket.id,
            cliSocketId: cliSocket.id
        })

        registerTerminalHandlers(cliSocket as unknown as CliSocketWithData, {
            terminalRegistry,
            terminalNamespace: terminalNamespace as never,
            resolveSessionAccess: () => ({ ok: true, value: storedSession() }),
            resolveMachineAccess: () => ({ ok: true, value: storedMachine() }),
            emitAccessError: () => {
                throw new Error('Unexpected access error')
            }
        })

        cliSocket.trigger('terminal:output', {
            sessionId: 'session-1',
            terminalId: 'terminal-1',
            data: 'hello'
        })

        expect(terminalNamespace.roomEmits).toEqual([{
            event: 'terminal:default:session:session-1:terminal:output',
            data: { sessionId: 'session-1', terminalId: 'terminal-1', data: 'hello' }
        }])
        expect(lastEmit(terminalSocket, 'terminal:output')).toBeUndefined()
    })

    it('does not emit terminal output room when access is denied', () => {
        const cliSocket = new FakeSocket('cli-socket')
        const terminalSocket = new FakeSocket('terminal-socket')
        const terminalNamespace = new FakeNamespace()
        const terminalRegistry = new TerminalRegistry({ idleTimeoutMs: 0 })
        const accessErrors: Array<{ scope: string; id: string; reason: string }> = []

        terminalNamespace.sockets.set(terminalSocket.id, terminalSocket)
        terminalRegistry.register({
            terminalId: 'terminal-1',
            sessionId: 'session-1',
            namespace: 'default',
            socketId: terminalSocket.id,
            cliSocketId: cliSocket.id
        })

        registerTerminalHandlers(cliSocket as unknown as CliSocketWithData, {
            terminalRegistry,
            terminalNamespace: terminalNamespace as never,
            resolveSessionAccess: () => ({ ok: false, reason: 'access-denied' }),
            resolveMachineAccess: () => ({ ok: true, value: storedMachine() }),
            emitAccessError: (scope, id, reason) => {
                accessErrors.push({ scope, id, reason })
            }
        })

        cliSocket.trigger('terminal:output', {
            sessionId: 'session-1',
            terminalId: 'terminal-1',
            data: 'hello'
        })

        expect(terminalNamespace.roomEmits).toEqual([])
        expect(lastEmit(terminalSocket, 'terminal:output')).toBeUndefined()
        expect(accessErrors).toEqual([{ scope: 'session', id: 'session-1', reason: 'access-denied' }])
    })

    it('removes stale registry entries after terminal errors', () => {
        const cliSocket = new FakeSocket('cli-socket')
        const terminalSocket = new FakeSocket('terminal-socket')
        const terminalNamespace = new FakeNamespace()
        const terminalRegistry = new TerminalRegistry({ idleTimeoutMs: 0 })

        terminalNamespace.sockets.set(terminalSocket.id, terminalSocket)
        terminalRegistry.register({
            terminalId: 'terminal-1',
            sessionId: 'session-1',
            namespace: 'default',
            socketId: terminalSocket.id,
            cliSocketId: cliSocket.id
        })

        registerTerminalHandlers(cliSocket as unknown as CliSocketWithData, {
            terminalRegistry,
            terminalNamespace: terminalNamespace as never,
            resolveSessionAccess: () => ({ ok: true, value: storedSession() }),
            resolveMachineAccess: () => ({ ok: true, value: storedMachine() }),
            emitAccessError: () => {
                throw new Error('Unexpected access error')
            }
        })

        cliSocket.trigger('terminal:error', {
            sessionId: 'session-1',
            terminalId: 'terminal-1',
            message: 'Remote terminal is not supported on Windows yet.'
        })

        expect(terminalRegistry.get('terminal-1')).toBeNull()
        expect(lastEmit(terminalSocket, 'terminal:error')?.data).toEqual({
            sessionId: 'session-1',
            terminalId: 'terminal-1',
            message: 'Remote terminal is not supported on Windows yet.'
        })
        expect(terminalNamespace.roomEmits).toEqual([{
            event: 'terminal:default:session:session-1:terminal:error',
            data: {
                sessionId: 'session-1',
                terminalId: 'terminal-1',
                message: 'Remote terminal is not supported on Windows yet.'
            }
        }])
    })

    it('forwards ready and exit stream events to exact session room', () => {
        const cliSocket = new FakeSocket('cli-socket')
        const terminalSocket = new FakeSocket('terminal-socket')
        const terminalNamespace = new FakeNamespace()
        const terminalRegistry = new TerminalRegistry({ idleTimeoutMs: 0 })

        terminalNamespace.sockets.set(terminalSocket.id, terminalSocket)
        terminalRegistry.register({
            terminalId: 'terminal-1',
            sessionId: 'session-1',
            namespace: 'default',
            socketId: terminalSocket.id,
            cliSocketId: cliSocket.id
        })

        registerTerminalHandlers(cliSocket as unknown as CliSocketWithData, {
            terminalRegistry,
            terminalNamespace: terminalNamespace as never,
            resolveSessionAccess: () => ({ ok: true, value: storedSession() }),
            resolveMachineAccess: () => ({ ok: true, value: storedMachine() }),
            emitAccessError: () => {
                throw new Error('Unexpected access error')
            }
        })

        cliSocket.trigger('terminal:ready', {
            sessionId: 'session-1',
            terminalId: 'terminal-1'
        })
        cliSocket.trigger('terminal:exit', {
            sessionId: 'session-1',
            terminalId: 'terminal-1',
            code: 0,
            signal: null
        })

        expect(terminalNamespace.roomEmits).toEqual([
            {
                event: 'terminal:default:session:session-1:terminal:ready',
                data: { sessionId: 'session-1', terminalId: 'terminal-1' }
            },
            {
                event: 'terminal:default:session:session-1:terminal:exit',
                data: { sessionId: 'session-1', terminalId: 'terminal-1', code: 0, signal: null }
            }
        ])
        expect(terminalRegistry.get('terminal-1')).toBeNull()
    })

    it('forwards machine-scoped terminal output without session access', () => {
        const cliSocket = new FakeSocket('cli-socket')
        const terminalSocket = new FakeSocket('terminal-socket')
        const terminalNamespace = new FakeNamespace()
        const terminalRegistry = new TerminalRegistry({ idleTimeoutMs: 0 })

        terminalNamespace.sockets.set(terminalSocket.id, terminalSocket)
        terminalRegistry.register({
            terminalId: 'terminal-machine',
            machineId: 'machine-1',
            namespace: 'default',
            socketId: terminalSocket.id,
            cliSocketId: cliSocket.id
        })

        registerTerminalHandlers(cliSocket as unknown as CliSocketWithData, {
            terminalRegistry,
            terminalNamespace: terminalNamespace as never,
            resolveSessionAccess: () => {
                throw new Error('Session access should not be checked')
            },
            resolveMachineAccess: () => ({ ok: true, value: storedMachine() }),
            emitAccessError: () => {
                throw new Error('Unexpected access error')
            }
        })

        cliSocket.trigger('terminal:output', {
            machineId: 'machine-1',
            terminalId: 'terminal-machine',
            data: 'hello'
        })

        expect(lastEmit(terminalSocket, 'terminal:output')?.data).toEqual({
            machineId: 'machine-1',
            terminalId: 'terminal-machine',
            data: 'hello'
        })
        expect(terminalNamespace.roomEmits).toEqual([{
            event: 'terminal:default:machine:machine-1:terminal:output',
            data: {
                machineId: 'machine-1',
                terminalId: 'terminal-machine',
                data: 'hello'
            }
        }])
    })

    it('forwards all machine terminal events only to the exact machine room', () => {
        const cliSocket = new FakeSocket('cli-socket')
        const terminalNamespace = new FakeNamespace()
        const terminalRegistry = new TerminalRegistry({ idleTimeoutMs: 0 })

        for (const terminalId of ['tm-ready', 'tm-output', 'tm-exit', 'tm-error']) {
            terminalRegistry.register({
                terminalId,
                machineId: 'machine-1',
                namespace: 'default',
                socketId: `terminal-socket-${terminalId}`,
                cliSocketId: cliSocket.id
            })
        }

        registerTerminalHandlers(cliSocket as unknown as CliSocketWithData, {
            terminalRegistry,
            terminalNamespace: terminalNamespace as never,
            resolveSessionAccess: () => {
                throw new Error('Session access should not be checked for machine events')
            },
            resolveMachineAccess: () => ({ ok: true, value: storedMachine() }),
            emitAccessError: () => {
                throw new Error('Unexpected access error')
            }
        })

        cliSocket.trigger('terminal:list', {
            scopeType: 'machine',
            machineId: 'machine-1',
            terminals: []
        })
        cliSocket.trigger('terminal:warning', {
            scopeType: 'machine',
            machineId: 'machine-1',
            terminalId: 'tm-warning',
            reason: 'idle',
            message: 'idle',
            closesAt: 10
        })
        cliSocket.trigger('terminal:ready', {
            machineId: 'machine-1',
            terminalId: 'tm-ready'
        })
        cliSocket.trigger('terminal:output', {
            machineId: 'machine-1',
            terminalId: 'tm-output',
            data: 'hello'
        })
        cliSocket.trigger('terminal:exit', {
            machineId: 'machine-1',
            terminalId: 'tm-exit',
            code: 0,
            signal: null
        })
        cliSocket.trigger('terminal:error', {
            machineId: 'machine-1',
            terminalId: 'tm-error',
            message: 'boom'
        })

        expect(terminalNamespace.roomEmits.map((entry) => entry.event)).toEqual([
            'terminal:default:machine:machine-1:terminal:list',
            'terminal:default:machine:machine-1:terminal:warning',
            'terminal:default:machine:machine-1:terminal:ready',
            'terminal:default:machine:machine-1:terminal:output',
            'terminal:default:machine:machine-1:terminal:exit',
            'terminal:default:machine:machine-1:terminal:error'
        ])
        expect(terminalNamespace.roomEmits.some((entry) => entry.event.startsWith('terminal:default:session:machine-1:'))).toBe(false)
    })
})
