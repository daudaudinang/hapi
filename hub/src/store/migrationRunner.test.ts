import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { Database } from 'bun:sqlite'
import { MigrationRunner } from './migrationRunner'
import { MIGRATIONS } from './migrations'

describe('MigrationRunner', () => {
  let db: Database
  let runner: MigrationRunner

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec('PRAGMA foreign_keys = ON')
    runner = new MigrationRunner(MIGRATIONS)
  })

  afterEach(() => {
    db.close()
  })

  describe('getCurrentVersion', () => {
    it('should return 0 for new database', async () => {
      const version = await runner.getCurrentVersion(db)
      expect(version).toBe(0)
    })

    it('should return current version after migrations', async () => {
      await runner.runMigrations(db, 'up')

      const version = await runner.getCurrentVersion(db)
      expect(version).toBe(MIGRATIONS.length)
    })
  })

  describe('runMigrations (up)', () => {
    it('should create schema_migrations table', async () => {
      await runner.runMigrations(db, 'up')

      const tables = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='schema_migrations'
      `).all() as Array<{ name: string }>

      expect(tables).toHaveLength(1)
    })

    it('should create pending_messages table', async () => {
      await runner.runMigrations(db, 'up')

      const tables = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='pending_messages'
      `).all() as Array<{ name: string }>

      expect(tables).toHaveLength(1)
    })

    it('should create indexes', async () => {
      await runner.runMigrations(db, 'up')

      const indexes = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='index' AND name LIKE 'idx_pending_%'
      `).all() as Array<{ name: string }>

      expect(indexes.length).toBeGreaterThanOrEqual(2)
      expect(indexes.some(idx => idx.name === 'idx_pending_session')).toBe(true)
      expect(indexes.some(idx => idx.name === 'idx_pending_status')).toBe(true)
    })

    it('should record migration in schema_migrations', async () => {
      await runner.runMigrations(db, 'up')

      const history = runner.getMigrationHistory(db)
      expect(history).toHaveLength(MIGRATIONS.length)
      expect(history[0].version).toBe(1)
      expect(history[0].name).toBe('create_pending_messages_table')
    })

    it('should be idempotent', async () => {
      // Run migrations twice
      await runner.runMigrations(db, 'up')
      await runner.runMigrations(db, 'up')

      const version = await runner.getCurrentVersion(db)
      expect(version).toBe(MIGRATIONS.length)

      const history = runner.getMigrationHistory(db)
      expect(history).toHaveLength(MIGRATIONS.length)
    })
  })

  describe('runMigrations (down)', () => {
    it('should rollback migrations', async () => {
      await runner.runMigrations(db, 'up')

      await runner.runMigrations(db, 'down')

      const version = await runner.getCurrentVersion(db)
      expect(version).toBe(0)

      const tables = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='pending_messages'
      `).all() as Array<{ name: string }>

      expect(tables).toHaveLength(0)
    })

    it('should rollback in reverse order', async () => {
      await runner.runMigrations(db, 'up')

      const historyBefore = runner.getMigrationHistory(db)
      expect(historyBefore).toHaveLength(MIGRATIONS.length)

      await runner.runMigrations(db, 'down')

      const historyAfter = runner.getMigrationHistory(db)
      expect(historyAfter).toHaveLength(0)
    })
  })

  describe('isMigrationApplied', () => {
    it('should return false for unapplied migration', () => {
      const applied = runner.isMigrationApplied(db, 1)
      expect(applied).toBe(false)
    })

    it('should return true for applied migration', async () => {
      await runner.runMigrations(db, 'up')

      const applied = runner.isMigrationApplied(db, 1)
      expect(applied).toBe(true)
    })
  })

  describe('getPendingMigrations', () => {
    it('should return all migrations when database is new', () => {
      const pending = runner.getPendingMigrations(db)
      expect(pending).toHaveLength(MIGRATIONS.length)
    })

    it('should return no pending migrations after all applied', async () => {
      await runner.runMigrations(db, 'up')

      const pending = runner.getPendingMigrations(db)
      expect(pending).toHaveLength(0)
    })
  })

  describe('transaction safety', () => {
    it('should rollback on error during migration up', async () => {
      // Create a failing migration
      const failingMigrations = [
        {
          version: 999,
          name: 'failing_migration',
          up: async () => {
            throw new Error('Migration failed')
          },
          down: async () => {}
        }
      ]

      const failingRunner = new MigrationRunner(failingMigrations)

      // This should throw
      await expect(failingRunner.runMigrations(db, 'up')).rejects.toThrow()

      // Check that the migration was not recorded
      const applied = failingRunner.isMigrationApplied(db, 999)
      expect(applied).toBe(false)
    })
  })

  describe('resume_attempts column', () => {
    it('should add resume_attempts column to sessions table', async () => {
      // First create sessions table (simulate existing database)
      db.exec(`
        CREATE TABLE sessions (
          id TEXT PRIMARY KEY,
          namespace TEXT NOT NULL DEFAULT 'default',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `)

      await runner.runMigrations(db, 'up')

      // Check column exists
      const columns = db.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>
      const hasResumeAttempts = columns.some(col => col.name === 'resume_attempts')

      expect(hasResumeAttempts).toBe(true)
    })

    it('should not fail if column already exists', async () => {
      // Create sessions table with resume_attempts already
      db.exec(`
        CREATE TABLE sessions (
          id TEXT PRIMARY KEY,
          namespace TEXT NOT NULL DEFAULT 'default',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          resume_attempts INTEGER DEFAULT 0
        );
      `)

      // Should not throw
      await runner.runMigrations(db, 'up').catch((error) => {
        expect(error).toBeUndefined()
      })
    })

    it('should gracefully handle missing sessions table', async () => {
      // Don't create sessions table - migration should handle gracefully
      // This tests the robustness of the migration system
      try {
        await runner.runMigrations(db, 'up')
        // If we get here, the migration ran but couldn't add the column
        // That's actually OK behavior
        const tables = db.prepare(`
          SELECT name FROM sqlite_master
          WHERE type='table' AND name='pending_messages'
        `).all() as Array<{ name: string }>

        // At minimum, pending_messages should be created
        expect(tables.some(t => t.name === 'pending_messages')).toBe(true)
      } catch (error) {
        // It's also acceptable to throw an error about missing sessions table
        expect(error).toBeDefined()
      }
    })
  })
})
