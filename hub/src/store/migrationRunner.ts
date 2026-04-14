import { Database } from 'bun:sqlite'
import { MIGRATIONS, type Migration } from './migrations'

/**
 * MigrationRunner manages database schema migrations
 *
 * Features:
 * - Automatic migration on startup
 * - Version tracking via schema_migrations table
 * - Rollback support (down migrations)
 * - Transaction safety
 * - Idempotent operations
 */
export class MigrationRunner {
  private readonly migrations: Migration[]

  constructor(migrations: Migration[] = MIGRATIONS) {
    // Sort migrations by version to ensure correct order
    this.migrations = migrations.sort((a, b) => a.version - b.version)
  }

  /**
   * Run all pending migrations
   *
   * @param db - Database instance
   * @param direction - 'up' to apply migrations, 'down' to rollback
   */
  async runMigrations(db: Database, direction: 'up' | 'down' = 'up'): Promise<void> {
    const currentVersion = await this.getCurrentVersion(db)
    const targetVersion = direction === 'up'
      ? this.migrations.length
      : 0

    console.log(`MigrationRunner: Starting ${direction} migration from version ${currentVersion} to ${targetVersion}`)

    if (direction === 'up') {
      await this.runUpMigrations(db, currentVersion)
    } else {
      await this.runDownMigrations(db, currentVersion)
    }

    const finalVersion = await this.getCurrentVersion(db)
    console.log(`MigrationRunner: Completed. Final version: ${finalVersion}`)
  }

  /**
   * Get current schema version from database
   */
  async getCurrentVersion(db: Database): Promise<number> {
    // First check if schema_migrations table exists
    const tableExists = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='schema_migrations'
    `).get() as { name?: string } | undefined

    if (!tableExists) {
      return 0
    }

    const row = db.prepare(
      'SELECT MAX(version) as version FROM schema_migrations'
    ).get() as { version: number } | undefined

    return row?.version || 0
  }

  /**
   * Get migration history
   */
  getMigrationHistory(db: Database): Array<{ version: number; name: string; applied_at: number }> {
    // Check if table exists first
    const tableExists = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='schema_migrations'
    `).get() as { name?: string } | undefined

    if (!tableExists) {
      return []
    }

    return db.prepare(`
      SELECT version, name, applied_at FROM schema_migrations
      ORDER BY version ASC
    `).all() as Array<{ version: number; name: string; applied_at: number }>
  }

  /**
   * Run pending migrations (up direction)
   */
  private async runUpMigrations(db: Database, currentVersion: number): Promise<void> {
    const pendingMigrations = this.migrations.filter(m => m.version > currentVersion)

    for (const migration of pendingMigrations) {
      console.log(`Applying migration ${migration.version}: ${migration.name}`)

      try {
        // Use transaction for atomicity
        db.exec('BEGIN')

        await migration.up(db)

        await this.recordMigration(db, migration)

        db.exec('COMMIT')

        console.log(`✓ Migration ${migration.version} completed successfully`)
      } catch (error) {
        db.exec('ROLLBACK')
        console.error(`✗ Migration ${migration.version} failed:`, error)
        throw new Error(
          `Migration ${migration.version} (${migration.name}) failed: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }
  }

  /**
   * Rollback migrations (down direction)
   */
  private async runDownMigrations(db: Database, currentVersion: number): Promise<void> {
    // Rollback in reverse order
    const migrationsToRollback = this.migrations
      .filter(m => m.version <= currentVersion)
      .reverse()

    for (const migration of migrationsToRollback) {
      console.log(`Rolling back migration ${migration.version}: ${migration.name}`)

      try {
        // Use transaction for atomicity
        db.exec('BEGIN')

        await migration.down(db)

        await this.removeMigrationRecord(db, migration)

        db.exec('COMMIT')

        console.log(`✓ Rollback ${migration.version} completed successfully`)
      } catch (error) {
        db.exec('ROLLBACK')
        console.error(`✗ Rollback ${migration.version} failed:`, error)
        throw new Error(
          `Rollback ${migration.version} (${migration.name}) failed: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }
  }

  /**
   * Record a migration as applied
   */
  private async recordMigration(db: Database, migration: Migration): Promise<void> {
    db.prepare(
      'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)'
    ).run(migration.version, migration.name, Date.now())
  }

  /**
   * Remove migration record (for rollback)
   */
  private async removeMigrationRecord(db: Database, migration: Migration): Promise<void> {
    // Check if schema_migrations table exists (it might have been dropped by migration 1 rollback)
    const tableExists = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='schema_migrations'
    `).get() as { name?: string } | undefined

    if (!tableExists) {
      return // Table doesn't exist, nothing to remove
    }

    db.prepare(
      'DELETE FROM schema_migrations WHERE version = ? AND name = ?'
    ).run(migration.version, migration.name)
  }

  /**
   * Check if a specific migration is applied
   */
  isMigrationApplied(db: Database, version: number): boolean {
    // Check if schema_migrations table exists first
    const tableExists = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='schema_migrations'
    `).get() as { name?: string } | undefined

    if (!tableExists) {
      return false
    }

    const row = db.prepare(
      'SELECT 1 FROM schema_migrations WHERE version = ?'
    ).get(version) as { 1?: number } | undefined

    return Boolean(row)
  }

  /**
   * Get all pending (not yet applied) migrations
   */
  getPendingMigrations(db: Database): Migration[] {
    const currentVersion = this.getCurrentVersionSync(db)
    return this.migrations.filter(m => m.version > currentVersion)
  }

  /**
   * Synchronous version of getCurrentVersion for use in synchronous contexts
   */
  private getCurrentVersionSync(db: Database): number {
    const tableExists = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='schema_migrations'
    `).get() as { name?: string } | undefined

    if (!tableExists) {
      return 0
    }

    const row = db.prepare(
      'SELECT MAX(version) as version FROM schema_migrations'
    ).get() as { version: number } | undefined

    return row?.version || 0
  }
}
