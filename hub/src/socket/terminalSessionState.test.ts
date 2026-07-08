import { describe, expect, it } from 'bun:test'
import type { TerminalListPayload } from '@hapi/protocol'
import { TerminalSessionStateStore } from './terminalSessionState'

function list(input: Partial<TerminalListPayload> & { sessionId: string; terminals: TerminalListPayload['terminals'] }): TerminalListPayload {
    return {
        scopeType: 'session',
        sessionId: input.sessionId,
        terminals: input.terminals
    }
}

function terminal(terminalId: string, status: TerminalListPayload['terminals'][number]['status']): TerminalListPayload['terminals'][number] {
    return {
        scopeType: 'session',
        sessionId: 'session-1',
        terminalId,
        label: terminalId,
        cwd: '/repo',
        cols: 80,
        rows: 24,
        status,
        closeReason: status.startsWith('closed_') ? 'user_close' : null,
        createdAt: 1,
        lastActivityAt: 1,
        idleWarningAt: null,
        hardExpiresAt: 24
    }
}

describe('TerminalSessionStateStore', () => {
    it('counts live session terminals from CLI terminal:list snapshots, including detached terminals', () => {
        const store = new TerminalSessionStateStore()
        store.updateFromList('cli-1', 'ns-a', list({
            sessionId: 'session-1',
            terminals: [
                terminal('a', 'running'),
                terminal('b', 'detached'),
                terminal('c', 'closed_user')
            ]
        }))

        expect(store.countLiveSessionTerminals('session-1', 'ns-a')).toBe(2)
    })

    it('separates namespaces and returns undefined when no CLI list is known', () => {
        const store = new TerminalSessionStateStore()
        store.updateFromList('cli-1', 'ns-a', list({ sessionId: 'session-1', terminals: [terminal('a', 'running')] }))

        expect(store.countLiveSessionTerminals('session-1', 'ns-b')).toBeUndefined()
        expect(store.countLiveSessionTerminals('missing', 'ns-a')).toBeUndefined()
    })

    it('clears stale counts when owning CLI socket disconnects', () => {
        const store = new TerminalSessionStateStore()
        store.updateFromList('cli-1', 'ns-a', list({ sessionId: 'session-1', terminals: [terminal('a', 'running')] }))
        store.updateFromList('cli-2', 'ns-a', list({ sessionId: 'session-2', terminals: [terminal('b', 'running')] }))

        store.clearByCliSocket('cli-1')

        expect(store.countLiveSessionTerminals('session-1', 'ns-a')).toBeUndefined()
        expect(store.countLiveSessionTerminals('session-2', 'ns-a')).toBe(1)
    })

    it('marks live terminals lost when the owning CLI socket disconnects', () => {
        const store = new TerminalSessionStateStore()
        store.updateFromList('cli-1', 'ns-a', list({
            sessionId: 'session-1',
            terminals: [terminal('a', 'running'), terminal('b', 'detached'), terminal('c', 'closed_user')]
        }))

        const affected = store.markLostByCliSocket('cli-1', 999)

        const cached = store.getCachedSessionList('session-1', 'ns-a')
        if (!cached) {
            throw new Error('Expected cached lost terminal list')
        }
        expect(affected).toEqual([{
            namespace: 'ns-a',
            payload: cached
        }])
        expect(cached?.recovery).toEqual({ reason: 'cli_lost', at: 999 })
        expect(cached?.terminals.map(t => [t.terminalId, t.status, t.closeReason])).toEqual([
            ['a', 'lost', 'cli_lost'],
            ['b', 'lost', 'cli_lost'],
            ['c', 'closed_user', 'user_close']
        ])
    })

    it('stores session-level recovery when CLI disconnects before any terminal list', () => {
        const store = new TerminalSessionStateStore()

        const affected = store.markLostByCliSocket('cli-1', 999, { namespace: 'ns-a', sessionId: 'session-1' })

        const expected: Extract<TerminalListPayload, { scopeType: 'session' }> = {
            scopeType: 'session',
            sessionId: 'session-1',
            terminals: [],
            recovery: { reason: 'cli_lost', at: 999 }
        }
        expect(store.getCachedSessionList('session-1', 'ns-a')).toEqual(expected)
        expect(affected).toEqual([{ namespace: 'ns-a', payload: expected }])
    })

    it('preserves lost terminals when restarted CLI reports an empty list', () => {
        const store = new TerminalSessionStateStore()
        store.updateFromList('cli-1', 'ns-a', list({ sessionId: 'session-1', terminals: [terminal('a', 'running')] }))
        store.markLostByCliSocket('cli-1', 999)

        store.updateFromList('cli-2', 'ns-a', list({ sessionId: 'session-1', terminals: [] }))

        const cached = store.getCachedSessionList('session-1', 'ns-a')
        expect(cached?.terminals.map(t => [t.terminalId, t.status, t.closeReason])).toEqual([
            ['a', 'lost', 'cli_lost']
        ])
        expect(cached?.recovery).toEqual({ reason: 'cli_lost', at: 999 })
    })

    it('preserves session-level recovery when restarted CLI reports an empty list', () => {
        const store = new TerminalSessionStateStore()
        store.markLostByCliSocket('cli-1', 999, { namespace: 'ns-a', sessionId: 'session-1' })

        store.updateFromList('cli-2', 'ns-a', list({ sessionId: 'session-1', terminals: [] }))

        expect(store.getCachedSessionList('session-1', 'ns-a')).toEqual({
            scopeType: 'session',
            sessionId: 'session-1',
            terminals: [],
            recovery: { reason: 'cli_lost', at: 999 }
        })
    })
})
