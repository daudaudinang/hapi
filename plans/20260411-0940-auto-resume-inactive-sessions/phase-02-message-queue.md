# Phase 2: Message Queue Service

**Parent:** [plan.md](../plan.md)
**Dependencies:** [Phase 1](phase-01-database-schema.md)
**Date:** 2026-04-11
**Status:** ✅ COMPLETED
**Priority:** High
**Implementation Date:** 2026-04-11
**Report:** [fullstack-dev-260411-phase-02-message-queue.md](reports/fullstack-dev-260411-phase-02-message-queue.md)

## Overview

Service layer to manage pending messages for inactive sessions.

## Key Insights

- Must be thread-safe (multiple concurrent requests)
- Need deduplication by localId
- Should trigger auto-resume automatically
- Must handle queue overflow

## Requirements

1. Queue messages for inactive sessions
2. Deduplicate by localId
3. Trigger resume on first pending message
4. Limit queue size per session (100 messages max)
5. Provide queue depth metrics
6. Handle queue overflow gracefully (archive + notify)

## Architecture

**New File:** `hub/src/queue/messageQueue.ts`

```typescript
export class MessageQueue {
    // Queue message for inactive session
    // Returns: { queued: true, count: number } | { archived: true, reason: string }
    async enqueue(sessionId: string, payload: MessagePayload): Promise<EnqueueResult>
    
    // Get pending messages for session
    getPending(sessionId: string): PendingMessage[]
    
    // Mark as processed
    markProcessed(messageId: string): void
    
    // Mark as failed (resume failed)
    markFailed(messageId: string, error: string): void
    
    // Get queue depth metrics
    getMetrics(): QueueMetrics
    
    // Handle queue overflow - archive session
    async handleOverflow(sessionId: string): Promise<void>
}
```

## Related Code Files

- `hub/src/store/pendingMessages.ts` - Data layer
- `hub/src/queue/messageQueue.ts` - **NEW FILE**
- `hub/src/sync/messageService.ts` - Integration point

## Implementation Steps

1. Create `MessageQueue` class
2. Implement `enqueue()` with deduplication
3. Implement session limit (100 messages max)
4. Add metrics tracking
5. Integrate with `syncEngine`
6. Write tests

## Todo List

- [x] Create MessageQueue class skeleton
- [x] Implement enqueue() with validation
- [x] Add localId deduplication
- [x] Add session queue limit (100 messages)
- [x] Implement getPending()
- [x] Implement markProcessed()
- [x] Implement markFailed()
- [x] Implement handleOverflow() - archive session when queue full
- [x] Add metrics (queue depth, oldest message)
- [x] Integrate with syncEngine constructor
- [x] Write unit tests
- [x] Write integration tests
- [x] Test queue overflow scenario

## Success Criteria

- Messages queue for inactive sessions only
- Deduplication works (same localId → rejected)
- Queue limit enforced (max 100 per session)
- Queue overflow triggers archive + returns error
- Metrics accurate
- Thread-safe (concurrent enqueue)

## Risk Assessment

**Medium Risk:**
- Race conditions in concurrent enqueue
- Queue overflow if spam attacks

**Mitigation:**
- Database transactions
- Per-session limits (100 messages)
- Rate limiting
- Archive on overflow (data preservation)

## Security Considerations

- Validate message payload size (max 10KB)
- Limit queue depth per session
- Prevent queue flooding attacks
- Sanitize error messages

## Next Steps

→ Phase 3: Guard Modification
