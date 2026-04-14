# Phase 5: Frontend Changes

**Parent:** [plan.md](../plan.md)
**Dependencies:** [Phase 4](phase-04-auto-resume.md)
**Date:** 2026-04-11
**Status:** ✅ **COMPLETED**
**Priority:** Medium
**Implementation Date:** 2026-04-11
**Implementation Report:** [reports/fullstack-dev-260411-phase-05-frontend.md](reports/fullstack-dev-260411-phase-05-frontend.md)

## Overview

Update frontend to handle 202 response from auto-resume and show resume status.

## Key Insights

- Guard returns 202 immediately when auto-resuming (FIXED - no race condition)
- Frontend needs to show "Resuming session..." UI
- Need to handle 202 (queued) and 503 (failed)
- Should show archive prompt on failure
- No optimistic UI needed (202 confirmed queued)

## Requirements

1. Detect 202 response (auto-resume started)
2. Show "Resuming session..." loading state
3. Poll or wait for resume completion
4. Handle resume success (reenable message input)
5. Handle resume failure (show archive prompt)
6. Update session list to show inactive status
7. **Handle browser close during resume** ← CRITICAL FIX C3

## Architecture

**Modified Files:**
- `web/src/api/client.ts` - Handle new responses
- `web/src/components/SessionChat/` - Show resume UI

**New Response Codes (from guard):**
```typescript
// Message sent to inactive session (auto-resuming)
{ status: 202, body: {
    queued: true,
    resuming: true,
    sessionId: string,
    message: "Message queued, session is resuming..."
}}

// Resume failed, session archived
{ status: 503, body: {
    error: "Session resume failed",
    archived: true,
    reason: string
}}

// Queue overflow, session archived
{ status: 503, body: {
    error: "Queue overflow",
    archived: true,
    reason: "Too many pending messages (max 100)"
}}
```

**UI States:**
- **Resuming:** Spinner + "Resuming session..." (on 202)
- **Failed:** Modal "Session could not be resumed. It has been archived." (on 503)
- **Success:** Message delivered (socket event or next message success)

### Offline Queue Persistence (CRITICAL FIX C3)

**Problem:** User closes browser during resume → messages lost, no recovery

**Solution Decision:** **Server-side only** (recommended)

**Rationale:**
- ✅ **Simpler:** No localStorage sync complexity
- ✅ **More reliable:** Server queue persists regardless of client state
- ✅ **Already implemented:** Phase 1-2 handle server-side queuing
- ✅ **Better UX:** Messages restored when user returns to any device
- ❌ localStorage approach: 4+ hours, sync complexity, cross-tab issues

### Implementation: Server-Side Only

**How it works:**
1. User sends message to inactive session
2. Guard returns 202 (message queued on server)
3. **User closes browser** ← Critical moment
4. Server continues processing resume in background
5. Messages persist in SQLite queue
6. User reopens browser later
7. Frontend fetches session history → sees queued messages
8. Messages show as "Pending" or "Delivered" based on status

**No frontend changes needed for queue persistence** - already handled by backend!

### Frontend Enhancements (Optional UX Improvements)

If better UX desired, add these enhancements:

```typescript
// Show "pending" messages in chat history
interface MessageStatus {
  status: 'pending' | 'delivered' | 'failed';
  queuedAt?: number;
}

// Poll for message status updates
useEffect(() => {
  if (hasPendingMessages) {
    const interval = setInterval(async () => {
      const status = await fetchMessageStatus(sessionId);
      updateMessages(status);
    }, 2000); // Poll every 2s
    return () => clearInterval(interval);
  }
}, [hasPendingMessages, sessionId]);
```

### Deployment Strategy for Offline Queue

**Phase 1:** Deploy server-side changes (Phases 1-4)
- Messages queue and persist on server
- Frontend handles 202/503 responses

**Phase 2 (Optional):** Add UX enhancements
- Show pending message status
- Poll for updates
- Restore queued messages on page load

**Recommendation:** Start with Phase 1 only (server-side)

## Related Code Files

- `web/src/api/client.ts` - **MODIFY**
- `web/src/components/SessionChat/HappyComposer.tsx` - Show resume UI
- `web/src/hooks/useSessionStatus.ts` - **NEW FILE** (optional)

## Implementation Steps

1. Update API client to handle 202/503
2. Add "resuming" state to composer
3. Show loading UI when 202 received
4. Poll session status or wait for socket event
5. Handle resume failure with modal
6. Clear resuming state on success/failure
7. Test with real session

## Todo List

- [x] Update sendMessage() to handle 202
- [x] Update sendMessage() to handle 503
- [x] Add "resuming" state to composer
- [x] Create ResumeLoading component
- [x] Create ArchivePrompt modal
- [x] Add session status polling or socket listener
- [x] Update session list refresh
- [x] Write component tests
- [ ] Manual test with inactive session (Phase 6)

## Success Criteria

- Frontend shows "Resuming..." on 202 response
- Resume success → message input reenabled
- Resume failure → archive modal appears
- No duplicate messages (no optimistic UI, confirmed queued)
- Graceful degradation on errors

## Risk Assessment

**Low Risk:** Frontend only, no backend changes

## Security Considerations

- Sanitize error messages shown to user
- Validate session IDs before showing
- Don't expose internal architecture
- Rate limit retry attempts

## Next Steps

→ Phase 6: Testing & Validation
