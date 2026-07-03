import { describe, expect, it } from 'bun:test'
import { TerminalRegistry, type TerminalRegistryEntry } from './terminalRegistry'

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('TerminalRegistry idle lifecycle', () => {
    it('does not remove session entries after the hub idle timer window', async () => {
        const idleEntries: TerminalRegistryEntry[] = []
        const registry = new TerminalRegistry({
            idleTimeoutMs: 5,
            onIdle: (entry) => idleEntries.push(entry)
        })

        registry.register({
            terminalId: 'terminal-session',
            sessionId: 'session-1',
            namespace: 'team-a',
            socketId: 'socket-1',
            cliSocketId: 'cli-1'
        })
        registry.markActivity('terminal-session')

        await sleep(25)

        expect(registry.get('terminal-session')).not.toBeNull()
        expect(registry.countForSession('session-1')).toBe(1)
        expect(idleEntries).toEqual([])
    })

    it('removes machine entries after the hub idle timer window and calls onIdle', async () => {
        const idleEntries: TerminalRegistryEntry[] = []
        const registry = new TerminalRegistry({
            idleTimeoutMs: 5,
            onIdle: (entry) => idleEntries.push(entry)
        })

        registry.register({
            terminalId: 'terminal-machine',
            machineId: 'machine-1',
            namespace: 'team-a',
            socketId: 'socket-1',
            cliSocketId: 'cli-1'
        })
        registry.markActivity('terminal-machine')

        await sleep(25)

        expect(registry.get('terminal-machine')).toBeNull()
        expect(registry.countForMachine('machine-1')).toBe(0)
        expect(idleEntries).toHaveLength(1)
        expect(idleEntries[0]?.terminalId).toBe('terminal-machine')
    })
})


describe('TerminalRegistry namespace-scoped session cleanup', () => {
    it('returns entries for a session in one namespace only', () => {
        const registry = new TerminalRegistry({ idleTimeoutMs: 0 })

        registry.register({
            terminalId: 'terminal-a1',
            sessionId: 'same-session',
            namespace: 'team-a',
            socketId: 'socket-a1',
            cliSocketId: 'cli-a'
        })
        registry.register({
            terminalId: 'terminal-a2',
            sessionId: 'same-session',
            namespace: 'team-a',
            socketId: 'socket-a2',
            cliSocketId: 'cli-a'
        })
        registry.register({
            terminalId: 'terminal-b1',
            sessionId: 'same-session',
            namespace: 'team-b',
            socketId: 'socket-b1',
            cliSocketId: 'cli-b'
        })

        expect(registry.entriesForSession('same-session', 'team-a').map((entry) => entry.terminalId).sort()).toEqual([
            'terminal-a1',
            'terminal-a2'
        ])
        expect(registry.entriesForSession('same-session', 'team-b').map((entry) => entry.terminalId)).toEqual(['terminal-b1'])
    })

    it('removes only matching session and namespace entries while leaving machines and other namespaces', () => {
        const registry = new TerminalRegistry({ idleTimeoutMs: 0 })

        registry.register({
            terminalId: 'terminal-a1',
            sessionId: 'session-1',
            namespace: 'team-a',
            socketId: 'socket-a1',
            cliSocketId: 'cli-a'
        })
        registry.register({
            terminalId: 'terminal-a2',
            sessionId: 'session-1',
            namespace: 'team-a',
            socketId: 'socket-a2',
            cliSocketId: 'cli-a'
        })
        registry.register({
            terminalId: 'terminal-b1',
            sessionId: 'session-1',
            namespace: 'team-b',
            socketId: 'socket-b1',
            cliSocketId: 'cli-b'
        })
        registry.register({
            terminalId: 'terminal-machine',
            machineId: 'machine-1',
            namespace: 'team-a',
            socketId: 'socket-m',
            cliSocketId: 'cli-m'
        })

        const removed = registry.removeBySession('session-1', 'team-a')

        expect(removed.map((entry) => entry.terminalId).sort()).toEqual(['terminal-a1', 'terminal-a2'])
        expect(registry.entriesForSession('session-1', 'team-a')).toEqual([])
        expect(registry.entriesForSession('session-1', 'team-b').map((entry) => entry.terminalId)).toEqual(['terminal-b1'])
        expect(registry.countForSession('session-1')).toBe(1)
        expect(registry.countForMachine('machine-1')).toBe(1)
        expect(registry.get('terminal-machine')).not.toBeNull()
    })
})
