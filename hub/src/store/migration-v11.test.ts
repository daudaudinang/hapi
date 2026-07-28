import { describe, expect, it } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Store } from './index'

const TERMINAL_SNIPPET_INDEX = 'idx_terminal_snippets_namespace_created'

describe('Store V10→V11 migration: terminal snippets', () => {
    it('creates the terminal_snippets table, ordering index, and user_version 11 for a fresh database', () => {
        const store = new Store(':memory:')
        const db = getDatabase(store)

        expect(getSchemaObject(db, 'table', 'terminal_snippets')).toBeDefined()
        expect(getSchemaObject(db, 'index', TERMINAL_SNIPPET_INDEX)?.sql).toContain(
            'namespace, created_at DESC, id DESC'
        )
        expect(getUserVersion(db)).toBe(11)
    })

    it('migrates a real on-disk user_version 10 database to version 11', () => {
        const dir = mkdtempSync(join(tmpdir(), 'hapi-migration-v11-'))
        const dbPath = join(dir, 'test.db')

        try {
            const db = new Database(dbPath, { create: true, readwrite: true, strict: true })
            db.exec('CREATE TABLE migration_fixture (id TEXT PRIMARY KEY)')
            db.exec('PRAGMA user_version = 10')
            db.close()

            const store = new Store(dbPath)
            const migratedDb = getDatabase(store)

            expect(getUserVersion(migratedDb)).toBe(11)
            expect(getSchemaObject(migratedDb, 'table', 'terminal_snippets')).toBeDefined()
            expect(getSchemaObject(migratedDb, 'index', TERMINAL_SNIPPET_INDEX)).toBeDefined()

            const created = store.terminalSnippets.create({
                namespace: 'default',
                name: 'Migrated',
                command: 'echo migrated',
                description: null
            })
            expect(store.terminalSnippets.list('default').map(snippet => snippet.id)).toEqual([created.id])
        } finally {
            rmSync(dir, { recursive: true, force: true })
        }
    })

    it('reopens a valid version 11 database and keeps terminal snippets usable', () => {
        const dir = mkdtempSync(join(tmpdir(), 'hapi-reopen-v11-'))
        const dbPath = join(dir, 'test.db')

        try {
            const firstStore = new Store(dbPath)
            const created = firstStore.terminalSnippets.create({
                namespace: 'default',
                name: 'Persisted',
                command: 'echo persisted',
                description: null,
                now: 123
            })

            const reopenedStore = new Store(dbPath)
            expect(getUserVersion(getDatabase(reopenedStore))).toBe(11)
            expect(reopenedStore.terminalSnippets.list('default')).toEqual([created])
        } finally {
            rmSync(dir, { recursive: true, force: true })
        }
    })
})

function getDatabase(store: Store): Database {
    return (store as unknown as { db: Database }).db
}

function getSchemaObject(
    db: Database,
    type: 'table' | 'index',
    name: string
): { name: string; sql: string | null } | undefined {
    return db.prepare(
        'SELECT name, sql FROM sqlite_master WHERE type = ? AND name = ?'
    ).get(type, name) as { name: string; sql: string | null } | undefined
}

function getUserVersion(db: Database): number {
    const row = db.prepare('PRAGMA user_version').get() as { user_version: number }
    return row.user_version
}
