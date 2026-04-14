---
version: "1.0"
workflow_id: "WF_20260411_000001"
step: "create-plan"
status: "completed"
output_type: "plan"
agent: "create-plan"
started_at: "2026-04-11T10:26:23+07:00"
completed_at: "2026-04-11T10:26:23+07:00"
---

# Auto-Resume Inactive Sessions - Implementation Plan

**Created:** 2026-04-11
**Status:** Ready for Implementation ✅ (Issues Fixed)
**Priority:** High
**Last Updated:** 2026-04-11 - Fixed 8 critical/medium issues

## Problem Statement

Session `55948a83-6267-4ebf-941f-ae87ee7a1a9c` stopped responding because:
- Session became inactive (30s timeout)
- User sent message → guard returned 409 "Session is inactive"
- No auto-resume happened
- **Result:** Bad UX, user confusion

## Current Architecture

```
POST /sessions/:id/messages
  ↓
requireSessionFromParam({requireActive: true}) ← BLOCKER
  ↓ (if active)
engine.sendMessage()
  ↓
messageService.sendMessage() → DB → Socket emit
```

**Resume flow exists:** `syncEngine.resumeSession()` (lines 344-434 in syncEngine.ts)

## User Requirements

- Queue storage: **SQLite persistent**
- Resume failure: **Archive + prompt user**
- Old sessions (>24h): **Still auto-resume**

## Implementation Phases

### Phase 1: Database Schema (FOUNDATION)
**Status:** Pending
**File:** `phase-01-database-schema.md`

### Phase 2: Message Queue Service
**Status:** Pending
**File:** `phase-02-message-queue.md`

### Phase 3: Guard Modification
**Status:** Pending
**File:** `phase-03-guard-modification.md`

### Phase 4: Auto-Resume Orchestrator
**Status:** Pending
**File:** `phase-04-auto-resume.md`

### Phase 5: Frontend Changes
**Status:** Pending
**File:** `phase-05-frontend.md`

### Phase 6: Testing & Validation
**Status:** Pending
**File:** `phase-06-testing.md`

### Phase 7: Monitoring & Rollback
**Status:** Pending
**File:** `phase-07-monitoring.md`

## Quick Links

- [Research Reports](research/)
- [Implementation Phases](phase-*)
- [Progress Tracking](#progress)
- [**Fixes Summary**](PLAN_FIXES_SUMMARY.md) - Recent updates and issue fixes

## Progress

| Phase | Status | Blocker | ETA |
|-------|--------|---------|-----|
| 1. Database Schema | Ready | None | 2h |
| 2. Message Queue | Ready | Phase 1 | 4h |
| 3. Guard Mod | Ready | Phase 1 | 2h |
| 4. Auto-Resume | Ready | Phases 1-3 | 6h |
| 5. Frontend | Ready | Phase 4 | 3h |
| 6. Testing | Ready | Phases 1-5 | 4h |
| 7. Monitoring | Ready | Phase 4 | 2h |

**Total Estimated:** ~23 hours

**Recent Changes:**
- ✅ Fixed Phase 3 race condition (guard returns 202)
- ✅ Fixed frontend response strategy (align 202 handling)
- ✅ Added timeout handling to Phase 4 (15s)
- ✅ Clarified queue overflow behavior (archive on overflow)
- ✅ Added feature flag implementation
- ✅ Added comprehensive rollback strategy
- ✅ Added load testing scenarios

See [PLAN_FIXES_SUMMARY.md](PLAN_FIXES_SUMMARY.md) for details.

## Next Steps

1. ✅ Review complete - all issues fixed
2. Begin Phase 1 (Database Schema) implementation
3. Execute phases sequentially with testing
4. Use gradual rollout: 10% → 50% → 100%
5. Monitor metrics closely during rollout

**Deployment Strategy:**
- Start with feature flag OFF (safe deployment)
- Enable for 10% of users (monitor for 24h)
- Increase to 50% if metrics good (monitor 24h)
- Full rollout at 100% if all metrics green
- Keep rollback plan ready (see Phase 7)
