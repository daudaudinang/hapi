---
title: 'Shared Hub Phase 2 server auth replacement'
type: 'feature'
created: '2026-07-14'
status: 'done'
context:
  - '_bmad-output/implementation-artifacts/spec-shared-hub-phase-2-auth-http-boundary.md'
---

<frozen-after-approval reason="human-owned intent — continuation explicitly approved">

## Intent

**Problem:** Shared auth boundary xanh nhưng chưa mounted; legacy token/Telegram browser auth vẫn là production path. **Approach:** seed fresh SharedHub DB before legacy runtime projection, require OIDC startup config, mount new routes/middleware, and bridge organizationId into legacy namespace only until Phase 5 replaces data-plane guards.

## Boundaries & Constraints

**Always:** reject legacy DB before runtime Store opens; required env fail-fast without secret echo; no browser JWT/shared token/Telegram binding routes; update `main → startWebServer → createWebApp` atomically; auth routes public, every other `/api/*` opaque-session protected; organization context retained.

**Ask First:** Socket.IO/CLI credential auth change; removal of legacy runtime Store; Telegram notification removal.

**Never:** personal mode/fallback; second auth DB; numeric fake user; log pepper/token; weaken cookies/CSRF.

</frozen-after-approval>

## Code Map

- `hub/src/sharedHubConfiguration.ts` — strict env loader mới.
- `hub/src/index.ts` — SharedHub seed/services and web dependency wiring.
- `hub/src/web/server.ts` — replace legacy browser auth routes/middleware.
- `hub/src/web/sharedAuthEnv.ts` — temporary organization→namespace compatibility variable.

## Tasks & Acceptance

**Execution:**
- [x] Add fail-fast shared auth configuration loader/tests.
- [x] Seed SharedHubStore on fresh DB before legacy runtime Store.
- [x] Wire OIDC/Identity services into web server.
- [x] Replace `/api/auth`, bind, JWT middleware with shared auth boundary.
- [x] Add server assembly test and run affected suites/typecheck.

**Acceptance Criteria:**
- Given legacy DB without marker, when Hub starts, then fail with backup/new DB guidance before legacy Store mutation.
- Given missing OIDC setting, when config loads, then fail without printing values.
- Given non-auth API request without opaque cookie, when web app handles it, then 401.
- Given authenticated request, when legacy route runs during transition, then namespace equals organizationId.

### Review Findings

- [x] [Review][Patch] Amend invitation claim contract to callback-bound claim; bind invitation hash to OIDC state and remove invitation bearer material from URL/cookies — user decision: option 2 [docs/superpowers/plans/2026-07-14-shared-hub-pilot-core-implementation-plan.md]
- [x] [Review][Patch] Resource owner can authorize organization/member/Team management because owner bypass runs before org-action rejection [hub/src/auth/authorizationService.ts:35]
- [x] [Review][Patch] Previously invited members cannot log in again after their first session expires because callback only attempts bootstrap or one-time invitation claim [hub/src/web/routes/sharedAuth.ts:55]
- [x] [Review][Patch] Disabled organization does not invalidate otherwise-active member sessions [hub/src/store/sharedHubStore.ts:293]
- [x] [Review][Patch] Async mutation can be audited and published before its Promise rejects [hub/src/application/authorizedMutationService.ts:45]
- [x] [Review][Patch] Publisher failure occurs after commit and surfaces as retryable failure without an outbox/idempotency boundary [hub/src/application/authorizedMutationService.ts:64]
- [x] [Review][Patch] Invitation is consumed before session creation; session failure strands the membership flow [hub/src/web/routes/sharedAuth.ts:58]
- [x] [Review][Patch] OIDC discovery and token fetches have no timeout [hub/src/auth/oidcService.ts:75]
- [x] [Review][Patch] Login without invitation retains a stale invitation cookie from an earlier attempt [hub/src/web/routes/sharedAuth.ts:32]
- [x] [Review][Patch] Disabled bootstrap Admin produces a duplicate-identity constraint error instead of a clean denial [hub/src/store/sharedHubStore.ts:267]
- [x] [Review][Patch] Expired OIDC transactions, sessions, and enrollments have no cleanup path [hub/src/store/sharedHubStore.ts:187]
- [x] [Review][Patch] Viewer role does not receive the documented organization-wide `view` capability by default [hub/src/auth/authorizationService.ts:41]
- [x] [Review][Patch] Security relationships can cross organizations because ownership, Team membership, and grant references lack same-org constraints [hub/src/store/sharedHubStore.ts:329]
- [x] [Review][Patch] A new invitation for the same email can rebind an existing membership to another issuer/subject [hub/src/store/sharedHubStore.ts:234]
- [x] [Review][Patch] Restarting with another organization ID silently creates a second organization in single-org pilot DB [hub/src/store/sharedHubStore.ts:315]
- [x] [Review][Patch] Invitation bearer secret is accepted in a query string while global request logging is enabled [hub/src/web/routes/sharedAuth.ts:33]
- [x] [Review][Patch] Invitation cookie is not bound to OIDC state, so concurrent login tabs can claim the wrong invitation [hub/src/web/routes/sharedAuth.ts:33]
- [x] [Review][Patch] Invitation email is not normalized when stored, causing valid case/whitespace variants to fail claim [hub/src/store/sharedHubStore.ts:201]
- [x] [Review][Patch] Invitation role lacks a database CHECK constraint [hub/src/store/sharedHubStore.ts:332]
- [x] [Review][Patch] Logout leaves stale cookies when the server session is expired or revoked [hub/src/web/routes/sharedAuth.ts:82]

## Spec Change Log

- 2026-07-14: adversarial checkpoint found token output/direct-access URL; removed credential values from startup logs and QR before completion.

## Verification

**Commands:** focused auth/server tests; Hub typecheck; Hub suite; `git diff --check`; GitNexus change detection.
