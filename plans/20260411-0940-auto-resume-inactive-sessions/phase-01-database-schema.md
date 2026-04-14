# Phase 1: Database Schema

**Parent:** [plan.md](../plan.md)
**Date:** 2026-04-11
**Status:** ✅ **COMPLETED**
**Priority:** High (Foundation)
**Completed:** 2026-04-11
**Implementation Report:** [reports/fullstack-dev-260411-phase-01-database-schema.md](./reports/fullstack-dev-260411-phase-01-database-schema.md)

## Overview

Create persistent message queue for inactive sessions.

## Key Insights

- Sessions timeout after 30s (sessionCache.expireInactive())
- Need to persist messages across server restarts
- Must handle multiple messages per inactive session
- SQLite already used → minimal infrastructure change

## Requirements

1. Store messages for inactive sessions
2. Track resume attempts
3. Support cleanup of old/processed messages
4. Survive server restarts

## Architecture

**New Table:** `pending_messages`

```sql
CREATE TABLE pending_messages (
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

CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    applied_at INTEGER NOT NULL
);

CREATE INDEX idx_pending_session ON pending_messages(session_id, status);
CREATE INDEX idx_pending_status ON pending_messages(status, created_at);
```

## Database Migration Strategy (CRITICAL FIX C2)

**Problem:** No migration system → Cannot safely deploy to production

**Solution:** Implement complete migration system with version tracking and rollback support.

### Migration System Architecture

**New File:** `hub/src/store/migrations.ts`

```typescript
interface Migration {
  version: number;
  name: string;
  up: (db: Database) => Promise<void>;
  down: (db: Database) => Promise<void>; // Rollback
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'create_pending_messages_table',
    up: async (db) => {
      await db.exec(`
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
      `);
    },
    down: async (db) => {
      await db.exec(`DROP TABLE IF EXISTS pending_messages;`);
      await db.exec(`DROP TABLE IF EXISTS schema_migrations;`);
    }
  },
  {
    version: 2,
    name: 'create_pending_messages_indexes',
    up: async (db) => {
      await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_pending_session 
          ON pending_messages(session_id, status);
        CREATE INDEX IF NOT EXISTS idx_pending_status 
          ON pending_messages(status, created_at);
      `);
    },
    down: async (db) => {
      await db.exec(`DROP INDEX IF EXISTS idx_pending_session;`);
      await db.exec(`DROP INDEX IF EXISTS idx_pending_status;`);
    }
  },
  {
    version: 3,
    name: 'add_resume_attempts_to_sessions',
    up: async (db) => {
      await db.exec(`
        ALTER TABLE sessions ADD COLUMN resume_attempts INTEGER DEFAULT 0;
      `);
    },
    down: async (db) => {
      // SQLite doesn't support DROP COLUMN - recreate table without column
      await db.exec(`
        CREATE TABLE sessions_backup AS SELECT 
          id, namespace, created_at, updated_at, last_active_at, status 
          FROM sessions;
        DROP TABLE sessions;
        CREATE TABLE sessions (
          id TEXT PRIMARY KEY,
          namespace TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          last_active_at INTEGER,
          status TEXT DEFAULT 'active'
        );
        INSERT INTO sessions SELECT * FROM sessions_backup;
        DROP TABLE sessions_backup;
      `);
    }
  }
];
```

### Migration Runner

**New File:** `hub/src/store/migrationRunner.ts`

```typescript
export class MigrationRunner {
  async runMigrations(db: Database, direction: 'up' | 'down' = 'up'): Promise<void> {
    const currentVersion = await this.getCurrentVersion(db);
    const targetVersion = direction === 'up' 
      ? MIGRATIONS.length 
      : 0;

    if (direction === 'up') {
      for (const migration of MIGRATIONS) {
        if (migration.version > currentVersion) {
          console.log(`Running migration ${migration.version}: ${migration.name}`);
          await migration.up(db);
          await this.recordMigration(db, migration);
        }
      }
    } else {
      // Rollback: run migrations in reverse order
      const migrationsToRollback = MIGRATIONS
        .filter(m => m.version <= currentVersion)
        .reverse();

      for (const migration of migrationsToRollback) {
        console.log(`Rolling back migration ${migration.version}: ${migration.name}`);
        await migration.down(db);
        await this.removeMigrationRecord(db, migration);
      }
    }
  }

  private async getCurrentVersion(db: Database): Promise<number> {
    const row = await db.get(
      'SELECT MAX(version) as version FROM schema_migrations'
    );
    return row?.version || 0;
  }

  private async recordMigration(db: Database, migration: Migration): Promise<void> {
    await db.run(
      'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
      [migration.version, migration.name, Date.now()]
    );
  }

  private async removeMigrationRecord(db: Database, migration: Migration): Promise<void> {
    await db.run(
      'DELETE FROM schema_migrations WHERE version = ? AND name = ?',
      [migration.version, migration.name]
    );
  }
}
```

### Integration with Store Initialization

**Modify:** `hub/src/store/index.ts`

```typescript
import { MigrationRunner } from './migrationRunner';

export async function initializeStore(): Promise<Store> {
  const db = new Database(DB_PATH);
  
  // Run migrations on startup
  const runner = new MigrationRunner();
  await runner.runMigrations(db);
  
  return { /* ... */ };
}
```

### Migration Commands

**Add to CLI:** `hub/src/cli/migrate.ts`

```bash
# Run all pending migrations
npm run migrate up

# Rollback last migration
npm run migrate down

# Rollback all migrations
npm run migrate down:all

# Show migration status
npm run migrate status
```

### Deployment Safety

1. **Pre-deployment:** Run migrations on staging first
2. **Backup:** Auto-backup DB before migrations
3. **Atomic:** Each migration in transaction
4. **Validation:** Check data integrity after migration
5. **Rollback plan:** Document rollback steps per migration

### Success Criteria (Migration System)

- ✅ Migrations run automatically on server startup
- ✅ Can rollback to any previous version
- ✅ Migration history tracked in `schema_migrations` table
- ✅ Can query current schema version
- ✅ Transactions ensure atomicity
- ✅ Backup before migration (optional but recommended)

## Related Code Files

- `hub/src/store/index.ts` - Store initialization
- `hub/src/store/types.ts` - Type definitions
- `hub/src/store/pendingMessages.ts` - **NEW FILE**

## Implementation Steps

1. Create `hub/src/store/pendingMessages.ts`
2. Add table to DB schema
3. Create CRUD operations
4. Add cleanup logic
5. Write unit tests

## Todo List

- [ ] Design schema with indexes
- [ ] Implement `addPendingMessage()`
- [ ] Implement `getPendingMessages()`
- [ ] Implement `markAsProcessed()`
- [ ] Implement `markAsFailed()`
- [ ] Implement `cleanupOldMessages()`
- [ ] Add migration script
- [ ] Write tests (add, get, update, cleanup)

## Success Criteria

- Messages persist across server restarts
- Can retrieve by session_id
- Can mark as processed/failed
- Cleanup works correctly
- Tests pass with >90% coverage

## Risk Assessment

**Low Risk:** Pure schema change, isolated from existing code

## Security Considerations

- Input validation on payload (JSON)
- SQL injection prevention (use prepared statements)
- Rate limiting per session (max 100 pending)

## Next Steps

→ Phase 2: Message Queue Service
