import { expect, it } from 'bun:test'
import { registerCliHandlers } from './handlers/cli'

function createHarness(principalKind: 'runner' | 'legacy-session') {
    const events: string[] = []
    const socket = {
        id: 'socket-1',
        data: { principalKind, namespace: 'o1', machineId: 'm1' },
        handshake: { auth: { machineId: 'm1' } },
        on: (name: string) => { events.push(name) },
        join: () => {},
        emit: () => {},
        to: () => ({ emit: () => {} })
    }
    const machine = { id: 'm1', namespace: 'o1' }
    const store = {
        machines: {
            getMachineByNamespace: (id: string, namespace: string) => id === 'm1' && namespace === 'o1' ? machine : null,
            getMachine: () => machine
        },
        sessions: {
            getSessionByNamespace: () => null,
            getSession: () => null
        }
    }
    const io = { of: () => ({}) }

        registerCliHandlers(socket as never, {
        io: io as never,
        store: store as never,
        rpcRegistry: {} as never,
            terminalRegistry: {} as never,
            resolveCapability: () => null
    })

    return events
}

it('registers only machine events for Runner principal', () => {
    const events = createHarness('runner')

    expect(events).toContain('machine-alive')
    expect(events).not.toContain('session-alive')
    expect(events).not.toContain('rpc-register')
    expect(events.some((event) => event.startsWith('terminal:'))).toBe(false)
})

it('does not register machine events for legacy session principal', () => {
    const events = createHarness('legacy-session')

    expect(events).toContain('session-alive')
    expect(events).toContain('rpc-register')
    expect(events).not.toContain('machine-alive')
})
