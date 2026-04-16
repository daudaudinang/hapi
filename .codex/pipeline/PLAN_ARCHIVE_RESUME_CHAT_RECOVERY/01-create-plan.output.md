---
skill: create-plan
workflow: WF_20260416_D3242758
plan: PLAN_ARCHIVE_RESUME_CHAT_RECOVERY
plan_profile: standard
timestamp: 2026-04-16T15:55:00Z
status: REVISED
revision: 2
---

## Summary

- Revised canonical LP plan package after review failure.
- Profile remains `standard`.
- Main purpose of revision: remove contract ambiguity, fix ownership gaps, and make verification baseline-aware.

## Blockers Addressed

1. Chốt một flow authoritative: `queue-then-rebind` for inactive send/manual resume.
2. Chốt ownership cho manual resume:
   - backend route surface: `hub/src/web/routes/sessions.ts` + tests
   - frontend entrypoint: `web/src/router.tsx` via shared `resumeAndRebindSession` path.
3. Verify strategy tách rõ:
   - informational preflight: `bun run typecheck`
   - targeted gating commands for regression scope.
4. Mở rộng web verification từ hook-only sang route/SSE/message-window rebind sequence.
5. Chốt explicit atomic merge expectation ở backend (messages + pending_messages + metadata/team state + old-session delete).
6. Sửa test surface sang path thực tế (`messages.ts` + route tests), không chỉ `sessions.test.ts`.

## Artifacts

- Plan root: `/home/huynq/notebooks/hapi/.codex/plans/PLAN_ARCHIVE_RESUME_CHAT_RECOVERY`
- Plan file: `/home/huynq/notebooks/hapi/.codex/plans/PLAN_ARCHIVE_RESUME_CHAT_RECOVERY/plan.md`
- Phase files:
  - `/home/huynq/notebooks/hapi/.codex/plans/PLAN_ARCHIVE_RESUME_CHAT_RECOVERY/phase-01-backend-canonical-queue.md`
  - `/home/huynq/notebooks/hapi/.codex/plans/PLAN_ARCHIVE_RESUME_CHAT_RECOVERY/phase-02-frontend-session-rebind.md`
  - `/home/huynq/notebooks/hapi/.codex/plans/PLAN_ARCHIVE_RESUME_CHAT_RECOVERY/phase-03-regression-tests-and-qa.md`
- Manifests:
  - `/home/huynq/notebooks/hapi/.codex/plans/PLAN_ARCHIVE_RESUME_CHAT_RECOVERY/manifests/ownership.json`
  - `/home/huynq/notebooks/hapi/.codex/plans/PLAN_ARCHIVE_RESUME_CHAT_RECOVERY/manifests/dependency-graph.json`
  - `/home/huynq/notebooks/hapi/.codex/plans/PLAN_ARCHIVE_RESUME_CHAT_RECOVERY/manifests/benchmark.json`

## Verify Strategy

Preflight (informational):

```bash
bun run typecheck
```

Gating commands (regression scope):

```bash
cd hub && bun test src/store/pendingMessages.test.ts src/resume/autoResumeOrchestrator.test.ts src/resume/autoResumeOrchestrator.integration.test.ts src/web/routes/messages.test.ts src/web/routes/sessions.test.ts
cd web && bun test src/hooks/mutations/useSendMessage.rebind.test.tsx src/routes/sessions/session-rebind-flow.test.tsx
```

## Next

- Recommended skill: `review-plan`
- Human gate remains required.
