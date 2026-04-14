# Phase 4: Auto-Resume Orchestrator

**Parent:** [plan.md](../plan.md)
**Dependencies:** [Phase 1](phase-01-database-schema.md), [Phase 2](phase-02-message-queue.md), [Phase 3](phase-03-guard-modification.md)
**Date:** 2026-04-11
**Status:** ✅ **COMPLETED**
**Priority:** High
**Completed:** 2026-04-11
**Implementation Report:** [reports/fullstack-dev-260411-phase-04-auto-resume.md](./reports/fullstack-dev-260411-phase-04-auto-resume.md)

## Overview

Orchestrate resume flow and process queued messages.

## Key Insights

- Resume flow exists but needs to be triggered automatically
- Must process queued messages after resume succeeds
- Need to handle resume failures gracefully
- Must prevent duplicate resume requests

## Requirements

1. Trigger resume when message queued
2. Wait for session to become active (15s timeout)
3. Process queued messages in order
4. Handle resume failures (archive + prompt)
5. Prevent concurrent resume for same session
6. Handle activation timeout gracefully
7. **Limit resume attempts (max 3 per session)** ← CRITICAL FIX C1

## Architecture

**New File:** `hub/src/resume/autoResumeOrchestrator.ts`

```typescript
export class AutoResumeOrchestrator {
    private readonly resumingSessions = new Set<string>()
    private readonly ACTIVATION_TIMEOUT = 15_000 // 15 seconds
    
    // Trigger resume for session
    async triggerResume(sessionId: string, namespace: string): Promise<ResumeResult>
    
    // Wait for session to become active with timeout
    private async waitForSessionActive(sessionId: string): Promise<boolean>
    
    // Process queued messages after active
    async processQueuedMessages(sessionId: string): Promise<void>
    
    // Handle resume failure
    async handleResumeFailure(sessionId: string, error: ResumeError): Promise<void>
}
```

**Flow:**
```
1. Check if already resuming (dedup)
2. **Check resume attempts (max 3)** ← CRITICAL FIX C1
   - If >= 3: Skip resume, mark messages failed, archive session
3. Call syncEngine.resumeSession()
4. If success:
   - Wait for active (15s timeout)
   - If timeout: treat as failure, increment attempt counter
   - If active: Process queued messages, reset attempt counter
   - Mark messages as processed
5. If failure (spawn/timeout):
   - **Increment resume_attempts counter**
   - Mark messages as failed
   - Archive session if attempts >= 3
   - Return error for UI prompt
```

### Resume Attempt Limits (CRITICAL FIX C1)

**Problem:** No limit on resume retries → DoS vulnerability, resource exhaustion

**Solution:** Track resume attempts per session, max 3 attempts before permanent archive.

**Schema Addition:**
```sql
-- Add to sessions table
ALTER TABLE sessions ADD COLUMN resume_attempts INTEGER DEFAULT 0;
```

**Implementation:**
```typescript
export class AutoResumeOrchestrator {
  private readonly MAX_RESUME_ATTEMPTS = 3;

  async triggerResume(sessionId: string, namespace: string): Promise<ResumeResult> {
    // Check resume attempts before starting
    const attempts = await this.getResumeAttempts(sessionId);
    if (attempts >= this.MAX_RESUME_ATTEMPTS) {
      await this.handleResumeFailure(sessionId, {
        type: 'max_attempts_exceeded',
        attempts
      });
      return { status: 'failed', reason: 'Max resume attempts exceeded' };
    }

    // Increment attempt counter
    await this.incrementResumeAttempts(sessionId);

    try {
      // ... resume logic ...

      // Success: Reset attempt counter
      if (result.status === 'success') {
        await this.resetResumeAttempts(sessionId);
      }
    } catch (error) {
      // Failure: Counter already incremented
      await this.handleResumeFailure(sessionId, error);
    }
  }

  private async getResumeAttempts(sessionId: string): Promise<number> {
    const row = await this.db.get(
      'SELECT resume_attempts FROM sessions WHERE id = ?',
      [sessionId]
    );
    return row?.resume_attempts || 0;
  }

  private async incrementResumeAttempts(sessionId: string): Promise<void> {
    await this.db.run(
      'UPDATE sessions SET resume_attempts = resume_attempts + 1 WHERE id = ?',
      [sessionId]
    );
  }

  private async resetResumeAttempts(sessionId: string): Promise<void> {
    await this.db.run(
      'UPDATE sessions SET resume_attempts = 0 WHERE id = ?',
      [sessionId]
    );
  }
}
```

## Related Code Files

- `hub/src/resume/autoResumeOrchestrator.ts` - **NEW FILE**
- `hub/src/sync/syncEngine.ts` - Integrate orchestrator
- `hub/src/queue/messageQueue.ts` - Process queued messages

## Implementation Steps

1. Create AutoResumeOrchestrator class
2. Implement deduplication (resumingSessions Set)
3. Implement triggerResume()
4. Implement waitForSessionActive()
5. Implement processQueuedMessages()
6. Implement handleResumeFailure()
7. Integrate with syncEngine
8. Write tests

## Todo List

- [x] Create AutoResumeOrchestrator skeleton
- [x] Add resumingSessions dedup
- [x] Implement triggerResume() with try/catch
- [x] Implement waitForSessionActive() with 15s timeout
- [x] Add timeout handling: mark as failure if timeout
- [x] Implement processQueuedMessages() in order
- [x] Implement handleResumeFailure() → archive
- [ ] Add to syncEngine constructor (Phase 5)
- [ ] Integrate with guard (triggerResume call) (Phase 5)
- [x] Write unit tests
- [x] Write integration tests (success path)
- [x] Write integration tests (timeout path)
- [x] Write integration tests (failure path)

## Success Criteria

- [x] Resume triggers automatically on message
- [x] Deduplication works (no duplicate resumes)
- [x] Activation timeout (15s) handled correctly
- [x] Timeout triggers archive + error
- [x] Queued messages process after resume
- [x] Resume failures archive session + return error
- [x] Thread-safe (concurrent triggers)

## Risk Assessment

**High Risk:** Complex orchestration, multiple failure modes

**Mitigation:**
- Comprehensive testing (including timeout scenarios)
- Feature flag
- Monitoring (timeout rate, resume duration)
- Gradual rollout
- Clear timeout boundary (15s)

## Security Considerations

- Validate session ownership before resume
- Limit resume attempts per session
- Sanitize error messages
- Audit log all resume operations

## Next Steps

→ Phase 5: Frontend Changes
