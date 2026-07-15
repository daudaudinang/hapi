---
title: 'Shared Hub pilot readiness closure'
type: 'feature'
created: '2026-07-15'
status: 'in-review'
baseline_commit: 'c96229d'
context:
  - '_bmad-output/implementation-artifacts/shared-hub-pilot-core-checklist.md'
  - '_bmad-output/planning-artifacts/architecture/architecture-hapi-shared-hub-2026-07-13/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Shared Hub core behavior exists, but pilot readiness is overstated: access-loss teardown is not wired, effective capability is role-derived in important paths, security/operations work is incomplete, Admin UI omits required lifecycle evidence, and real multi-user/platform E2E has not run.

**Approach:** Close implementation gaps in dependency order, add automated coverage for deterministic boundaries, document operational procedures, and leave environment-dependent checks explicitly not-ready until recorded manual execution succeeds.

## Boundaries & Constraints

**Always:** Preserve organization isolation; use centralized authorization/effective-grant resolution; invalidate credentials/sessions before disconnect publication; target only affected principals/resources where possible; never claim manual evidence from unit tests; keep audit/outbox mutation ordering; strict TypeScript/Zod contracts; no backward compatibility requirement.

**Ask First:** New production dependencies; changing approved permission semantics; destructive database migration; external Keycloak, release, systemd, LaunchAgent, or backup actions requiring credentials/hosts unavailable in this workspace.

**Never:** Log secrets, enrollment codes, credentials, private paths, or raw commands; use organization-wide disconnect as a substitute for principal/resource teardown; expose UI actions based only on optimistic client checks; mark manual E2E complete without an execution record.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Access loss | Disabled member, removed Team member, revoked/expired grant, revoked Runner | Existing affected sessions/streams/attachments lose access immediately; unrelated actors remain connected | Mutation remains committed/audited; teardown retries or fails closed without exposing access |
| Effective access | Direct, Team, owner, Admin, Viewer, expired grant | REST/realtime/UI use the same capped cumulative capability | Missing/stale projection denies access |
| Browser security | Untrusted Origin, abusive auth/enrollment requests | Request rejected; security headers present; trusted credentialed Origin works | Stable sanitized response; no secret reflection |
| Administration | Admin inspects Teams, grants, lifecycle, audit | Source, expiry, effective access and audit chronology visible; permitted mutations work | Server authorization remains authoritative |
| Operations | Backup/restore or platform enrollment run | Documented reproducible result and evidence record | Failed/manual-unavailable check remains not-ready with reason |

</frozen-after-approval>

## Code Map

- `hub/src/index.ts` -- composition point for transports, identity, lifecycle, and teardown callbacks
- `hub/src/auth/authorizationService.ts` -- policy and capability kernel
- `hub/src/store/sharedHubStore.ts` -- grants, sessions, audit, Runner and membership persistence
- `hub/src/web/routes/sessions.ts` -- session capability response boundary
- `hub/src/web/server.ts` -- HTTP security middleware and administration routes
- `hub/src/socket/server.ts` -- realtime principals and targeted disconnects
- `hub/src/sse/sseManager.ts` -- live subscription ownership and teardown
- `web/src/routes/admin.tsx` -- pilot administration UI
- `docs/guide/` -- deployment, backup and restore operations

## Tasks & Acceptance

**Execution:**
- [x] Update checklist statuses/evidence and retain `not-ready` until all gates pass.
- [ ] Wire principal/resource access-loss invalidation and targeted SSE/Socket.IO/terminal teardown with integration tests.
- [ ] Resolve effective capabilities consistently for REST, realtime and UI; add direct/Team/expiry/Viewer tests. (REST/UI complete; realtime pending)
- [x] Add strict Origin policy, security headers and bounded rate limits to sensitive HTTP/realtime boundaries.
- [ ] Complete grant/Team/audit APIs and Admin UI with source, expiry and lifecycle coverage. (grant/audit complete; Team lifecycle UI pending)
- [x] Sweep logs/audit payloads and add regression tests for credential/path/command redaction. (production pilot audit inspection remains an external gate)
- [x] Document SQLite WAL single-instance deployment, encrypted backup and restore; add executable restore validation where local tooling permits.
- [x] Add browser-flow automation where feasible; record Linux/macOS and multi-user manual gates separately.
- [x] Run full verification, GitNexus change detection, update checklist evidence and issue final verdict.

**Acceptance Criteria:**
- Given any authorization-loss mutation, when it commits, then the affected principal/resource is denied on REST and live transports without disconnecting unrelated organization members.
- Given equivalent actor/resource state, when capability is queried by Hub or Web, then both observe the same effective capped capability.
- Given an untrusted Origin or rate-limit excess, when a sensitive endpoint is called, then it fails safely with security headers and no secret leakage.
- Given pilot administration data, when an authorized operator opens Admin, then Teams, grants, lifecycle and audit evidence are inspectable and mutations obey server policy.
- Given unavailable external environments, when verification completes, then their checklist gates remain pending with exact commands and required evidence.

## Spec Change Log

- 2026-07-15 review loop 1: three-layer review found organization-only REST/SSE/terminal authorization, incomplete member lifecycle audit/teardown, and legacy CLI fallback. Clarified these as deterministic blockers in the checklist; known-bad state is treating organization isolation as resource authorization. KEEP: opaque web sessions, targeted membership/Runner disconnect primitives, centralized effective-capability resolver, passing security/browser automation, and explicit external gates.

## Design Notes

Access-loss handling should emit a sanitized post-commit domain event consumed by a coordinator that can map membership, Team, grant, Runner and organization changes to exact live principals/resources. Organization-wide teardown is reserved for organization disable. Capability resolution remains server-owned; UI receives capability facts and only mirrors them for presentation.

## Verification

**Commands:**
- `bun typecheck` -- all workspaces compile
- `bun run test` -- CLI, Hub and Web suites pass; environment-gated skips are reported
- `git diff --check` -- clean patch formatting
- `npx gitnexus detect-changes` or MCP equivalent -- affected flows reviewed after final edits

**Manual checks:**
- Keycloak two-user grant/revoke, disable, Team removal and reconnect flows.
- Linux systemd and macOS LaunchAgent enrollment lifecycle.
- Encrypted backup creation and restore into a clean Hub instance.

## Suggested Review Order

**Authorization spine**

- Start with the server-owned capability resolver and its policy inputs.
  [`teamAuthorizationService.ts:43`](../../hub/src/application/teamAuthorizationService.ts#L43)

- Compare resource capability intent with current organization-only REST guards.
  [`guards.ts:16`](../../hub/src/web/routes/guards.ts#L16)

**Realtime identity and teardown**

- Review opaque-session terminal identity and the retained legacy fallback.
  [`server.ts:87`](../../hub/src/socket/server.ts#L87)

- Inspect terminal scope authorization; effective capability integration remains required.
  [`terminal.ts:54`](../../hub/src/socket/handlers/terminal.ts#L54)

- Review membership-targeted stream ownership and disconnect mechanics.
  [`sseManager.ts:30`](../../hub/src/sse/sseManager.ts#L30)

- Trace composition callbacks connecting lifecycle mutations to transport teardown.
  [`index.ts:192`](../../hub/src/index.ts#L192)

**Administration and lifecycle**

- Review member lifecycle mutations where audit/outbox integration remains incomplete.
  [`identityService.ts:116`](../../hub/src/auth/identityService.ts#L116)

- Inspect grant/audit UI plus remaining Team lifecycle and capability-display gaps.
  [`admin.tsx:18`](../../web/src/routes/admin.tsx#L18)

**Verification and operations**

- Browser automation proves token-free login and invitation redirect behavior.
  [`shared-hub-auth.spec.ts:9`](../../web/e2e/shared-hub-auth.spec.ts#L9)

- Operations runbook defines the still-pending encrypted restore evidence.
  [`shared-hub-operations.md:1`](../../docs/guide/shared-hub-operations.md#L1)
