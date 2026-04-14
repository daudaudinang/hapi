# Critical Fixes Summary - 2026-04-11

## Overview

Fixed **3 critical issues** identified in plan review:
- **C1:** Resume attempt limits (Phase 4) - DoS vulnerability
- **C2:** Database migration strategy (Phase 1) - Production deployment blocker
- **C3:** Offline queue persistence (Phase 5) - UX/reliability issue

---

## Fix #1: Resume Attempt Limits (C1)

**Phase:** 4 - Auto-Resume Orchestrator
**Severity:** Critical - DoS vulnerability
**Time:** 2 hours

### Problem
No limit on resume retries → Resource exhaustion, DoS attacks possible

### Solution
- Add `resume_attempts` column to `sessions` table
- Track attempts per session
- Max 3 attempts before permanent archive
- Reset counter on successful resume

### Implementation

**Schema Change:**
```sql
ALTER TABLE sessions ADD COLUMN resume_attempts INTEGER DEFAULT 0;
```

**Key Methods:**
- `getResumeAttempts(sessionId)` - Check current attempts
- `incrementResumeAttempts(sessionId)` - Increment before resume
- `resetResumeAttempts(sessionId)` - Reset on success
- Check attempts before starting resume (fail fast if >= 3)

**Updated File:** `phase-04-auto-resume.md`

---

## Fix #2: Database Migration Strategy (C2)

**Phase:** 1 - Database Schema
**Severity:** Critical - Production deployment blocker
**Time:** 3 hours

### Problem
No migration system → Cannot safely deploy to production, no rollback capability

### Solution
Complete migration system with:
- Version tracking (`schema_migrations` table)
- Migration runner (up/down)
- Rollback support
- CLI commands
- Transaction safety

### Implementation

**New Files:**
- `hub/src/store/migrations.ts` - Migration definitions
- `hub/src/store/migrationRunner.ts` - Migration runner
- `hub/src/cli/migrate.ts` - CLI commands

**Schema:**
```sql
CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    applied_at INTEGER NOT NULL
);
```

**CLI Commands:**
```bash
npm run migrate up        # Run pending migrations
npm run migrate down      # Rollback last migration
npm run migrate down:all  # Rollback all migrations
npm run migrate status    # Show migration status
```

**Migration Structure:**
```typescript
interface Migration {
  version: number;
  name: string;
  up: (db: Database) => Promise<void>;
  down: (db: Database) => Promise<void>; // Rollback
}
```

**Updated File:** `phase-01-database-schema.md`

---

## Fix #3: Offline Queue Persistence (C3)

**Phase:** 5 - Frontend Changes
**Severity:** Critical - UX/reliability issue
**Time:** 1 hour decision

### Problem
User closes browser during resume → messages lost, no recovery

### Solution Decision: **Server-Side Only**

**Rationale:**
- ✅ Simpler: No localStorage sync complexity
- ✅ More reliable: Server queue persists regardless of client state
- ✅ Already implemented: Phase 1-2 handle server-side queuing
- ✅ Better UX: Messages restored when user returns to any device
- ✅ Time savings: 0 hours vs 4+ hours for localStorage approach

### How It Works

1. User sends message to inactive session
2. Guard returns 202 (message queued on server)
3. **User closes browser** ← Critical moment
4. Server continues processing resume in background
5. Messages persist in SQLite queue
6. User reopens browser later
7. Frontend fetches session history → sees queued messages
8. Messages show as "Pending" or "Delivered" based on status

**No frontend changes needed** - already handled by backend!

**Optional Enhancements (Phase 2):**
- Show pending message status
- Poll for status updates every 2s
- Restore queued messages on page load

**Recommendation:** Deploy Phase 1 only (server-side)

**Updated File:** `phase-05-frontend.md`

---

## Impact Summary

### Security
- ✅ Closes DoS vulnerability (C1)
- ✅ Prevents resource exhaustion attacks

### Operations
- ✅ Enables safe production deployment (C2)
- ✅ Provides rollback capability
- ✅ Version tracking for schema changes

### Reliability
- ✅ Messages persist across browser closes (C3)
- ✅ Better UX for offline scenarios

### Time Investment
- **Total fix time:** 6 hours (2h + 3h + 1h)
- **Time saved:** 3+ hours (server-side vs localStorage)

---

## Testing Requirements

### C1: Resume Limits
- [ ] Test resume with 1, 2, 3 attempts
- [ ] Verify 4th attempt is blocked
- [ ] Verify counter resets on success
- [ ] Test concurrent resume attempts

### C2: Migrations
- [ ] Test migration up (version 0 → 3)
- [ ] Test migration down (version 3 → 0)
- [ ] Test rollback on migration failure
- [ ] Verify `schema_migrations` table
- [ ] Test on staging before production

### C3: Offline Queue
- [ ] Test: Send message, close browser, reopen
- [ ] Verify: Message still in queue
- [ ] Verify: Resume completes in background
- [ ] Test: Message status after resume

---

## Deployment Order

1. **Deploy Phase 1** (Database Schema + Migrations)
   - Run migrations on staging
   - Verify `schema_migrations` table
   - Test rollback capability

2. **Deploy Phase 2-3** (Queue + Guard)
   - Server-side queuing active
   - Guard returns 202

3. **Deploy Phase 4** (Auto-Resume with Limits)
   - Resume attempt tracking active
   - Max 3 attempts enforced

4. **Deploy Phase 5** (Frontend - minimal changes)
   - Handle 202/503 responses
   - Server-side queue already handles offline case

---

## Next Steps

1. ✅ Critical issues fixed
2. Update plan status to "Ready for Implementation"
3. Begin Phase 1 implementation with migration system
4. Execute phases sequentially
5. Gradual rollout: 10% → 50% → 100%

---

## Files Updated

- `phase-01-database-schema.md` - Added migration system
- `phase-04-auto-resume.md` - Added resume attempt limits
- `phase-05-frontend.md` - Added offline queue strategy
- `plan.md` - Updated fix count and status
- `CRITICAL_FIXES_20260411.md` - This document
