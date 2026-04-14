# Phase 7: Monitoring & Rollback

**Parent:** [plan.md](../plan.md)  
**Dependencies:** [Phase 4](phase-04-auto-resume.md)  
**Date:** 2026-04-11  
**Status:** Pending  
**Priority:** Medium

## Overview

Production monitoring, alerting, and rollback strategy.

## Key Insights

- Need to track resume success/failure rates
- Should alert on high failure rates
- Queue depth monitoring critical
- Feature flag for safe rollout

## Requirements

1. Metrics for resume operations
2. Alerting on anomalies
3. Feature flag implementation
4. Comprehensive rollback strategy with triggers
5. Dashboard (optional)

## Metrics

**Resume Metrics:**
- `auto_resume_total` - Total resume attempts
- `auto_resume_success` - Successful resumes
- `auto_resume_failed` - Failed resumes
- `auto_resume_duration_seconds` - Time to resume

**Queue Metrics:**
- `pending_queue_depth` - Messages per session
- `pending_queue_oldest_age_seconds` - Oldest pending message
- `pending_queue_processed_total` - Total processed

**Session Metrics:**
- `session_auto_archived_total` - Sessions archived after failure

## Alerting Rules

**Critical Alerts (Page On-Call):**
- Auto-resume failure rate > 20% (5min window)
- Queue depth > 10,000 total messages
- Queue depth > 100 for any single session
- Oldest pending message > 10 minutes
- Avg message latency increase > 500ms vs baseline
- DB CPU > 80% (pending_messages table impact)

**Warning Alerts (Investigate within 1hr):**
- Auto-resume failure rate > 10% (5min window)
- Queue depth > 5,000 total messages
- Queue depth > 50 for any single session
- Oldest pending message > 5 minutes
- Avg message latency increase > 200ms vs baseline

## Feature Flag

**Implementation:**
```typescript
// hub/src/config/features.ts
export interface FeatureFlags {
    autoResume: boolean
    autoResumeRolloutPercent: number  // 0-100
}

// In-memory or Redis-backed
export async function getFeatureFlags(): Promise<FeatureFlags> {
    return {
        autoResume: process.env.AUTO_RESUME_ENABLED === 'true',
        autoResumeRolloutPercent: parseInt(process.env.AUTO_RESUME_ROLLOUT || '0')
    }
}

// Usage in guard
const flags = await getFeatureFlags()
const userInRollout = hash(sessionId) % 100 < flags.autoResumeRolloutPercent
const enabled = flags.autoResume && userInRollout

if (autoResume && enabled && !session.active) {
    // trigger resume
}
```

**Rollback Levels:**
1. **Feature Off:** `AUTO_RESUME_ENABLED=false` → Complete disable
2. **Partial Rollout:** `AUTO_RESUME_ROLLOUT=10` → Only 10% of users
3. **Per-User:** Disable for specific problematic sessions

## Architecture

**New File:** `hub/src/metrics/autoResumeMetrics.ts`

```typescript
export class AutoResumeMetrics {
    incResumeAttempts(sessionId: string)
    incResumeSuccess(sessionId: string, duration: number)
    incResumeFailed(sessionId: string, reason: string)
    setQueueDepth(sessionId: string, depth: number)
    exposeMetrics(): MetricsSnapshot
}
```

## Related Code Files

- `hub/src/metrics/autoResumeMetrics.ts` - **NEW FILE**
- `hub/src/configuration.ts` - Feature flag
- `hub/src/resume/autoResumeOrchestrator.ts` - Emit metrics

## Implementation Steps

1. Create metrics collector
2. Add metrics to orchestrator
3. Create alerting rules
4. Implement feature flag
5. Document rollback procedure
6. Test rollback

## Todo List

- [ ] Create AutoResumeMetrics class
- [ ] Add Prometheus/StatsD export
- [ ] Integrate with orchestrator
- [ ] Create alerting rules (with thresholds above)
- [ ] Implement feature flag (with rollout support)
- [ ] Write rollback documentation (procedures above)
- [ ] Test feature flag toggle (on/off)
- [ ] Test gradual rollback (100% → 50% → 10% → 0%)
- [ ] Test immediate rollback (emergency)
- [ ] Test data cleanup procedures
- [ ] Create runbook for on-call engineers

## Success Criteria

- All critical operations emit metrics
- Alerts fire correctly at defined thresholds
- Feature flag supports instant disable
- Feature flag supports gradual rollout (0-100%)
- Rollback procedures tested (all 4 levels)
- Data cleanup procedures tested
- Metrics visible in monitoring system
- On-call runbook created

## Risk Assessment

**Low Risk:** Monitoring only, no production impact (before deployment)

**High Risk:** Inadequate rollback strategy could cause extended outage

**Mitigation:**
- Test all rollback procedures in staging
- Create detailed runbook
- Train on-call team
- Use gradual rollout (10% → 50% → 100%)

## Security Considerations

- Metrics don't expose PII
- Rate limit metric queries
- Secure alert endpoints
- Audit log all rollback actions

## Rollback Strategy

### Rollback Triggers

| Metric | Threshold | Action | Severity |
|--------|-----------|--------|----------|
| Resume failure rate | > 20% | Disable flag immediately | CRITICAL |
| Resume failure rate | > 10% | Reduce rollout to 10% | HIGH |
| Queue depth total | > 50,000 | Purge + disable flag | CRITICAL |
| Queue depth total | > 10,000 | Alert + consider rollback | HIGH |
| Queue depth single | > 100 | Archive session | MEDIUM |
| Oldest pending | > 30min | Purge old messages | MEDIUM |
| Message latency P95 | +500ms vs baseline | Disable flag | HIGH |
| Message latency P95 | +200ms vs baseline | Alert + investigate | MEDIUM |
| DB CPU (pending_messages) | > 80% | Disable flag | CRITICAL |
| Memory leak trend | Growing > 100MB/hr | Disable flag | HIGH |

### Rollback Procedures

**Level 1: Immediate Disable (< 1 min):**
```bash
# Emergency disable
export AUTO_RESUME_ENABLED=false
systemctl restart hapi-hub
# Verify
curl localhost:3000/health | grep autoResume
```

**Level 2: Gradual Rollback (< 5 min):**
```bash
# Step down rollout
export AUTO_RESUME_ROLLOUT=10  # from 100
systemctl restart hapi-hub
# Monitor for 5 min
# If still bad, go to Level 1
```

**Level 3: Data Cleanup (after disable):**
```sql
-- Option A: Process pending messages (preferable)
-- Let existing resume attempts complete
-- Monitor pending_messages table

-- Option B: Purge if queue is huge (> 50,000)
DELETE FROM pending_messages
WHERE status = 'pending'
AND created_at < strftime('%s', 'now') - 300;  -- older than 5min

-- Option C: Mark all as failed
UPDATE pending_messages
SET status = 'failed', error = 'Feature disabled - rollback'
WHERE status = 'pending';
```

**Level 4: Per-Session Disable (if specific sessions problematic):**
```typescript
// hub/src/config/features.ts
const disabledSessions = new Set([
    'problematic-session-id-1',
    'problematic-session-id-2'
])

if (disabledSessions.has(sessionId)) {
    return { autoResume: false }
}
```

### In-Progress Resume Handling

When rolling back while resumes are in progress:

1. **Wait Strategy (Default):**
   - Let in-progress resumes complete
   - Don't queue new messages
   - Returns 409 for new messages to inactive sessions

2. **Abort Strategy (Emergency):**
   - Cancel pending resumes
   - Mark queued messages as failed
   - Notify users of failure

3. **Drain Strategy (Clean Shutdown):**
   - Stop accepting new messages
   - Process existing queue
   - Disable flag when queue empty

### Rollback Verification

After rollback, verify:
```bash
# Check feature is off
curl localhost:3000/api/features | jq '.autoResume'  # should be false

# Check queue is draining
sqlite3 hub.db "SELECT COUNT(*) FROM pending_messages WHERE status='pending'"

# Check latency is back to baseline
curl localhost:3000/api/metrics | jq '.message_latency_p95'

# Check error rates
curl localhost:3000/api/metrics | jq '.resume_failure_rate'
```

## Next Steps

- Review all phases
- Get user approval
- Begin implementation
