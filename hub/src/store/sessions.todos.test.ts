import { describe, expect, it } from 'bun:test'

import { Store } from './index'

describe('session todo persistence', () => {
    it('classifies applied, unchanged and stale without extra seq increments', () => {
        const store = new Store(':memory:')
        const session = store.sessions.getOrCreateSession('todos', {}, null, 'default')
        const first = [{ id: '1', content: 'One', status: 'pending', priority: 'medium' }]

        expect(store.sessions.setSessionTodos(session.id, first, 100, 'default')).toBe('applied')
        const seqAfterApply = store.sessions.getSession(session.id)?.seq
        expect(store.sessions.setSessionTodos(session.id, first, 101, 'default')).toBe('unchanged')
        expect(store.sessions.setSessionTodos(session.id, [], 99, 'default')).toBe('stale')
        expect(store.sessions.getSession(session.id)?.seq).toBe(seqAfterApply)
        expect(store.sessions.setSessionTodos('missing', [], 102, 'default')).toBe('error')
    })
})
