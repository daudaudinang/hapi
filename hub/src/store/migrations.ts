import { Database } from 'bun:sqlite'

/**
 * Migration interface for database schema changes
 *
 * Each migration must have:
 * - version: Unique incremental number
 * - name: Descriptive name of the migration
 * - up: Function to apply the migration
 * - down: Function to rollback the migration
 */
export interface Migration {
  version: number
  name: string
  up: (db: Database) => Promise<void>
  down: (db: Database) => Promise<void>
}

/**
 * Migration definitions
 *
 * IMPORTANT: Migrations must be:
 * 1. Idempotent - can be run multiple times safely
 * 2. Transactional - use transactions for multi-step operations
 * 3. Reversible - provide proper down() migration
 * 4. Backward compatible - don't break existing data
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'create_pending_messages_table',
    up: async (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS pending_messages (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          payload TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          processed_at INTEGER,
          error TEXT,
          retry_count INTEGER DEFAULT 0,
          status TEXT DEFAULT 'pending',
          FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          applied_at INTEGER NOT NULL
        );
      `)
    },
    down: async (db) => {
      db.exec(`DROP TABLE IF EXISTS pending_messages;`)
      db.exec(`DROP TABLE IF EXISTS schema_migrations;`)
    }
  },
  {
    version: 2,
    name: 'create_pending_messages_indexes',
    up: async (db) => {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_pending_session
          ON pending_messages(session_id, status);
        CREATE INDEX IF NOT EXISTS idx_pending_status
          ON pending_messages(status, created_at);
      `)
    },
    down: async (db) => {
      db.exec(`DROP INDEX IF EXISTS idx_pending_session;`)
      db.exec(`DROP INDEX IF EXISTS idx_pending_status;`)
    }
  },
  {
    version: 3,
    name: 'add_resume_attempts_to_sessions',
    up: async (db) => {
      // Check if sessions table exists
      const sessionsTable = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='sessions'
      `).get() as { name?: string } | undefined

      if (!sessionsTable) {
        console.log('Sessions table does not exist, skipping resume_attempts column addition')
        return
      }

      // Check if column already exists
      const columns = db.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>
      const hasResumeAttempts = columns.some(col => col.name === 'resume_attempts')

      if (!hasResumeAttempts) {
        db.exec(`ALTER TABLE sessions ADD COLUMN resume_attempts INTEGER DEFAULT 0;`)
      }
    },
    down: async (db) => {
      // Check if sessions table exists
      const sessionsTable = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='sessions'
      `).get() as { name?: string } | undefined

      if (!sessionsTable) {
        return // Nothing to rollback
      }

      // SQLite doesn't support DROP COLUMN - need to recreate table
      const columns = db.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>
      const hasResumeAttempts = columns.some(col => col.name === 'resume_attempts')

      if (!hasResumeAttempts) {
        return // Already rolled back
      }

      // Get all columns except resume_attempts
      const columnNames = columns
        .filter(col => col.name !== 'resume_attempts')
        .map(col => col.name)

      const columnDefs = columnNames.join(', ')

      db.exec('BEGIN')
      try {
        // Create backup table
        db.exec(`
          CREATE TABLE sessions_backup AS SELECT ${columnDefs} FROM sessions;
        `)

        // Drop original table
        db.exec(`DROP TABLE sessions;`)

        // Recreate table without resume_attempts
        db.exec(`
          CREATE TABLE sessions (
            id TEXT PRIMARY KEY,
            tag TEXT,
            namespace TEXT NOT NULL DEFAULT 'default',
            machine_id TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            metadata TEXT,
            metadata_version INTEGER DEFAULT 1,
            agent_state TEXT,
            agent_state_version INTEGER DEFAULT 1,
            model TEXT,
            effort TEXT,
            todos TEXT,
            todos_updated_at INTEGER,
            team_state TEXT,
            team_state_updated_at INTEGER,
            active INTEGER DEFAULT 0,
            active_at INTEGER,
            seq INTEGER DEFAULT 0
          );
        `)

        // Restore data
        db.exec(`INSERT INTO sessions SELECT ${columnDefs} FROM sessions_backup;`)

        // Recreate indexes
        db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_tag ON sessions(tag);`)
        db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_tag_namespace ON sessions(tag, namespace);`)

        // Drop backup
        db.exec(`DROP TABLE sessions_backup;`)

        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    }
  }
]
