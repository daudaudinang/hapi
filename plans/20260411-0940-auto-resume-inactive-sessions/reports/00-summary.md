# Auto-Resume Implementation Plan - Summary

**Date:** 2026-04-11  
**Status:** Ready for Review  
**Total Estimated Time:** ~23 hours

## Executive Summary

Implement production-ready auto-resume mechanism for inactive sessions. When users send messages to inactive sessions, system will automatically resume the session and process messages. Uses SQLite persistent queue, handles failures gracefully with archive + user prompt.

## Problem

Session `55948a83-6267-4ebf-941f-ae87ee7a1a9c` has 2352 messages but stopped responding because:
- Session timed out (30s inactivity)
- Guard blocked message with 409 "Session is inactive"
- No auto-resume happened
- User experience: confusion, no response

## Solution Overview

**Architecture Changes:**
```
User sends message to inactive session
  ↓
Guard detects inactive + autoResume=true
  ↓
Message queued (SQLite persistent)
  ↓
Auto-resume orchestrator triggers resume
  ↓
Session becomes active
  ↓
Queued messages processed
  ↓
Agent responds normally
```

## Implementation Phases

### Phase 1: Database Schema (2h)
- Create `pending_messages` table
- Add CRUD operations
- Cleanup logic

### Phase 2: Message Queue Service (4h)
- `MessageQueue` class
- Deduplication by localId
- Session limits (100 messages)
- Metrics tracking

### Phase 3: Guard Modification (2h)
- Add `autoResume` flag to guard
- Allow inactive sessions through
- Trigger background resume
- Maintain backward compatibility

### Phase 4: Auto-Resume Orchestrator (6h)
- Trigger resume automatically
- Wait for session active
- Process queued messages
- Handle failures (archive + prompt)
- Prevent duplicate resumes

### Phase 5: Frontend Changes (3h)
- Handle new response codes (202/503)
- Show "Resuming session..." UI
- Archive prompt modal on failure
- Auto-retry mechanism

### Phase 6: Testing & Validation (4h)
- Unit tests (>90% coverage)
- Integration tests
- Race condition tests
- Manual test plan
- Performance tests

### Phase 7: Monitoring & Rollback (2h)
- Metrics (resume success/failure, queue depth)
- Alerting rules
- Feature flag implementation
- Rollback procedure

## Key Design Decisions

### 1. SQLite Persistent Queue
**Decision:** Use SQLite for pending messages  
**Rationale:** Survives server restarts, minimal infrastructure  
**Trade-off:** Slightly slower than in-memory, but safer

### 2. Archive on Resume Failure
**Decision:** Auto-archive session when resume fails  
**Rationale:** Clear user communication, prevents stuck sessions  
**Trade-off:** User loses session context, but gets clear error

### 3. No Auto-Archive by Age
**Decision:** Don't auto-archive old sessions (>24h)  
**Rationale:** User wanted all sessions to auto-resume  
**Trade-off:** May waste resources on very old sessions

### 4. Feature Flag
**Decision:** Use `AUTO_RESUME_ENABLED` env variable  
**Rationale:** Safe rollout, instant rollback  
**Trade-off:** Additional configuration management

## Edge Cases Handled

1. **Multiple messages while resuming:** Queue all, dedup by localId
2. **Resume fails:** Archive session + show error modal
3. **Server restart:** SQLite queue survives, resumes on startup
4. **Concurrent resume triggers:** Deduplication prevents duplicates
5. **Queue overflow:** Limit 100 messages per session
6. **No machine online:** Fail fast, archive session

## Testing Strategy

**Unit Tests:** Each component in isolation  
**Integration Tests:** Full flow from message to response  
**Race Condition Tests:** Concurrent operations  
**Manual Tests:** Real user scenarios  
**Performance Tests:** Load testing with 100+ concurrent messages

## Rollback Plan

**Immediate (< 5 min):**
```bash
# Disable feature
export AUTO_RESUME_ENABLED=false
systemctl restart hapi-hub
```

**Data Cleanup (if needed):**
```sql
DELETE FROM pending_messages WHERE status = 'pending';
```

## Success Criteria

- ✅ Inactive sessions auto-resume on message
- ✅ Queued messages process after resume
- ✅ Resume failures handled gracefully
- ✅ No regression in active sessions
- ✅ Frontend shows resume status
- ✅ Metrics and alerting working
- ✅ Rollback tested
- ✅ >90% test coverage

## Risks & Mitigations

| Risk | Level | Mitigation |
|------|-------|------------|
| Race conditions | Medium | Extensive testing, deduplication |
| Queue overflow | Low | Per-session limits (100) |
| Resume failures | High | Archive + error modal |
| Performance degradation | Low | Load testing, monitoring |
| Regression in active sessions | Low | Backward compatibility |

## Next Steps

1. **Review this plan** with user
2. **Create tasks** from phase breakdowns
3. **Start implementation** with Phase 1
4. **Test after each phase**
5. **Deploy with feature flag**
6. **Monitor metrics** closely
7. **Rollout gradually** (10% → 50% → 100%)

## Questions for User

1. Confirm queue limit (100 messages per session)?
2. Confirm resume timeout (15 seconds)?
3. Confirm archive behavior (user creates new session)?
4. Any additional metrics needed?
5. Timeline preferences (rapid vs careful rollout)?

---

**Plan Files:**
- [plan.md](../plan.md) - Overview
- [phase-01-database-schema.md](../phase-01-database-schema.md) - Database layer
- [phase-02-message-queue.md](../phase-02-message-queue.md) - Queue service
- [phase-03-guard-modification.md](../phase-03-guard-modification.md) - Guard changes
- [phase-04-auto-resume.md](../phase-04-auto-resume.md) - Orchestrator
- [phase-05-frontend.md](../phase-05-frontend.md) - UI changes
- [phase-06-testing.md](../phase-06-testing.md) - Test strategy
- [phase-07-monitoring.md](../phase-07-monitoring.md) - Ops & rollback
