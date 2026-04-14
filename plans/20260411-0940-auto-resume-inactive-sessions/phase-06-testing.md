# Phase 6: Testing & Validation

**Parent:** [plan.md](../plan.md)  
**Dependencies:** [Phase 5](phase-05-frontend.md)  
**Date:** 2026-04-11  
**Status:** Pending  
**Priority:** High

## Overview

Comprehensive testing strategy for auto-resume feature.

## Key Insights

- Need to test multiple failure modes
- Must validate race conditions
- Integration tests critical
- Manual testing required for UX

## Requirements

1. Unit tests for all new components
2. Integration tests for full flow
3. Race condition tests
4. Manual test plan
5. Performance tests (baseline + with auto-resume)
6. Load tests (stress scenarios)

## Test Scenarios

### Unit Tests

**Database (Phase 1):**
- [ ] addPendingMessage() - success, duplicate
- [ ] getPendingMessages() - by session, empty
- [ ] markProcessed() - success, not found
- [ ] markFailed() - success, retry count
- [ ] cleanupOldMessages() - deletes old messages

**Message Queue (Phase 2):**
- [ ] enqueue() - inactive session
- [ ] enqueue() - active session (reject)
- [ ] enqueue() - duplicate localId
- [ ] enqueue() - queue limit (100)
- [ ] getPending() - returns in order
- [ ] getMetrics() - accurate counts

**Auto-Resume (Phase 4):**
- [ ] triggerResume() - success path
- [ ] triggerResume() - no machine (fail)
- [ ] triggerResume() - invalid token (fail)
- [ ] triggerResume() - dedup (concurrent)
- [ ] waitForSessionActive() - timeout after 15s
- [ ] processQueuedMessages() - processes all
- [ ] handleResumeFailure() - archives session

### Integration Tests

**Happy Path:**
1. Send message to inactive session
2. Message queued
3. Resume triggered
4. Session becomes active
5. Queued message processed
6. Agent responds

**Failure Paths:**
1. No machine online → archive + error
2. Invalid resume token → archive + error
3. Activation timeout (15s) → archive + error
4. Queue overflow (100 messages) → archive + error
5. Multiple concurrent messages → dedup works

**Race Conditions:**
1. 10 messages sent simultaneously to same inactive session
2. Resume + new message during resume
3. Multiple resume triggers (should dedup)
4. Server restart during resume (messages persist)

### Manual Test Plan

**Test Setup:**
1. Create test session
2. Let it timeout (30s)
3. Send message from webapp
4. Verify behavior

**Test Cases:**
- [ ] Send message to inactive session → auto-resumes
- [ ] Send 5 messages while resuming → all queued
- [ ] Resume fails → archive modal shows
- [ ] Active session → no change in behavior
- [ ] Server restart during resume → messages persist

### Performance Tests

**Baseline Metrics (without auto-resume):**
- [ ] POST /messages latency: P50/P95/P99
- [ ] DB queries per message
- [ ] Socket.IO emit latency
- [ ] Memory baseline

**With Auto-Resume:**
- [ ] 202 response latency (should be fast, < 50ms)
- [ ] Resume time (target: < 15s)
- [ ] Message processing after resume
- [ ] Memory usage with queue
- [ ] DB load (pending_messages table)

**Performance Criteria:**
- 202 response < 100ms P95
- Resume completes < 15s P95
- Message latency increase < 200ms P95
- Memory increase < 50MB per 1000 queued messages

### Load Tests

**Stress Scenarios:**
- [ ] 100 users concurrently send to different inactive sessions
- [ ] 10 users spam same inactive session (1000 messages in 10s)
- [ ] Queue overflow test (send 200 messages to same session)
- [ ] Multiple concurrent resumes (10 sessions simultaneously)
- [ ] Server restart with 1000 pending messages

**Load Criteria:**
- No request timeouts
- Queue overflow handled correctly
- DB connections stable
- No memory leaks
- Resume success rate > 95% under load

## Related Code Files

- `hub/src/**/*.test.ts` - Unit tests
- `hub/integration/auto-resume.test.ts` - **NEW FILE**
- `test/manual/auto-resume.md` - **NEW FILE**

## Implementation Steps

1. Write unit tests for each phase
2. Write integration tests
3. Write manual test plan
4. Execute tests
5. Fix any failures
6. Document results

## Todo List

- [ ] Measure baseline performance metrics
- [ ] Phase 1: Database unit tests
- [ ] Phase 2: Queue unit tests
- [ ] Phase 4: Orchestrator unit tests (including timeout)
- [ ] Integration: Happy path test
- [ ] Integration: Failure paths
- [ ] Integration: Race conditions
- [ ] Manual: Test with real session
- [ ] Performance: Measure with auto-resume enabled
- [ ] Load: Concurrent users test
- [ ] Load: Spam attack test
- [ ] Load: Queue overflow test
- [ ] Document test results

## Success Criteria

- All unit tests pass (>90% coverage)
- All integration tests pass
- No race conditions detected
- Performance within requirements (latency increase < 200ms)
- Load tests pass (no crashes, graceful degradation)
- Manual tests successful

## Risk Assessment

**Medium Risk:** Complex test scenarios

**Mitigation:**
- Start with unit tests
- Gradual complexity increase
- Use feature flags
- Test in staging first

## Security Considerations

- Tests don't expose production data
- Test sessions isolated
- Clean up test data
- No hard-coded credentials

## Next Steps

→ Phase 7: Monitoring & Rollback
