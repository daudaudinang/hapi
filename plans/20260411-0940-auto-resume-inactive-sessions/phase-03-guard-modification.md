# Phase 3: Guard Modification

**Parent:** [plan.md](../plan.md)
**Dependencies:** [Phase 1](phase-01-database-schema.md), [Phase 2](phase-02-message-queue.md)
**Date:** 2026-04-11
**Status:** ✅ **COMPLETED**
**Priority:** High
**Implementation Date:** 2026-04-11
**Implementation Report:** [reports/fullstack-dev-260411-phase-03-guard-modification.md](reports/fullstack-dev-260411-phase-03-guard-modification.md)

## Overview

Modify `requireSession()` to allow inactive sessions with auto-resume.

## Key Insights

- Current guard blocks ALL inactive sessions with 409
- Need to allow inactive sessions through for auto-resume
- Must not break existing `requireActive: true` behavior
- Need new flag for auto-resume behavior

## Requirements

1. Add `autoResume` flag to guard options
2. If `autoResume=true` and inactive: queue + trigger resume + return 202
3. If `requireActive=true` and inactive: still block (backward compat)
4. Preserve existing behavior by default
5. Add feature flag check before enabling auto-resume

## Architecture

**Modified File:** `hub/src/web/routes/guards.ts`

```typescript
export function requireSession(
    c: Context<WebAppEnv>,
    engine: SyncEngine,
    sessionId: string,
    options?: {
        requireActive?: boolean
        autoResume?: boolean  // NEW
    }
): { sessionId: string; session: Session } | Response
```

**Logic Flow (FIXED - No Race Condition):**
```
// Check feature flag first
const autoResumeEnabled = c.get('features')?.autoResume ?? false

if autoResume && autoResumeEnabled && !session.active:
    queue message for later
    trigger background resume
    return 202 {
        queued: true,
        resuming: true,
        sessionId: string,
        message: "Message queued, session is resuming..."
    }  // STOP HERE - don't proceed to handler

if requireActive && !session.active:
    return 409 (existing behavior)

return session // Allow handler to proceed
```

## Related Code Files

- `hub/src/web/routes/guards.ts` - **MODIFY**
- `hub/src/web/routes/messages.ts` - Use new flag
- `hub/src/sync/syncEngine.ts` - Add triggerResume()
- `hub/src/config/features.ts` - **NEW FILE** - Feature flag configuration

## Implementation Steps

1. Create feature flag system (`hub/src/config/features.ts`)
2. Add `autoResume` option to guard signature
3. Implement auto-resume logic with 202 response (FIXED)
4. Add `syncEngine.triggerResume()` method
5. Update messages route to use `autoResume: true`
6. Ensure backward compatibility
7. Write tests

## Todo List

- [x] Create feature flag configuration system
- [x] Add autoResume flag to options type
- [x] Implement auto-resume branch in requireSession() with 202 response
- [x] Add triggerResume() to syncEngine
- [x] Update messages.ts: use autoResume: true
- [x] Test backward compatibility
- [x] Test inactive session with autoResume enabled
- [x] Test inactive session with autoResume disabled
- [x] Test active session (no change)
- [x] Test feature flag off → allows inactive session (backward compat)

## Success Criteria

- Inactive sessions + autoResume + flag enabled → 202 response + queued + resume triggered
- Inactive sessions + autoResume + flag disabled → 409 (backward compat)
- Inactive sessions + requireActive → 409 (unchanged)
- Active sessions → no change in behavior
- Backward compatibility maintained

## Risk Assessment

**Medium Risk:** Modifying core guard logic

**Mitigation:**
- Feature flag (can disable instantly)
- Extensive testing
- Gradual rollout (10% → 50% → 100%)
- Monitor 202 vs 409 ratios

## Security Considerations

- Auto-resume only for authenticated users
- Validate session ownership
- Rate limit resume triggers
- Log all auto-resume attempts

## Next Steps

→ Phase 4: Auto-Resume Orchestrator
