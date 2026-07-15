---
title: 'Shared Hub Phase 2 identity core'
type: 'feature'
created: '2026-07-14'
status: 'done'
context:
  - 'docs/superpowers/plans/2026-07-14-shared-hub-pilot-core-implementation-plan.md'
  - '_bmad-output/implementation-artifacts/shared-hub-pilot-core-checklist.md'
---

<frozen-after-approval reason="human-owned intent — continuation explicitly approved">

## Intent

**Problem:** Shared Hub chưa có browser identity boundary; legacy auth vẫn dựa shared token/namespace JWT. **Approach:** tạo identity core độc lập gồm Keycloak OIDC Code+PKCE transaction, verified-email invitation/bootstrap, opaque session và CSRF validation; routes/startup integration để ở slice kế tiếp.

## Boundaries & Constraints

**Always:** discovery issuer exact-match; HTTPS endpoints; state/nonce one-time và hết hạn; PKCE S256; ID token signature/issuer/audience/time/nonce; chỉ `email_verified=true`; invitation email normalize và atomic claim; cookie/session/CSRF tokens entropy cao, hash-only at rest; constant-time compare; fail closed.

**Ask First:** sửa legacy auth route/middleware/server/config; thay Shared Hub schema version strategy.

**Never:** fallback shared token; nhận unverified email; log token/code/verifier/session/CSRF; store browser session plaintext; public signup.

## I/O & Edge-Case Matrix

| Scenario | State | Expected | Error |
|---|---|---|---|
| Login start | valid discovery | authorization URL + one-time transaction | reject non-HTTPS/issuer mismatch |
| Callback | valid state/code/token | verified identity + consumed transaction | replay/expiry/nonce mismatch fail closed |
| Invitation claim | matching verified email | identity/member bound atomically | mismatch/used/expired rejected |
| First Admin | configured verified email | exactly one active Admin membership | other email cannot bootstrap |
| Browser session | valid cookie + CSRF | request context | expired/revoked/hash mismatch rejected |

</frozen-after-approval>

## Code Map

- `hub/src/store/sharedHubStore.ts` — identity/session/invitation/OIDC transaction persistence.
- `hub/src/auth/oidcService.ts` — discovery, PKCE, callback token validation.
- `hub/src/auth/identityService.ts` — invitation/bootstrap and opaque session lifecycle.
- `hub/src/utils/crypto.ts` — existing constant-time helper; no edit planned.

## Tasks & Acceptance

**Execution:**
- [x] Extend SharedHub schema/store with one-time OIDC transaction, identity, invitation and web-session operations.
- [x] Implement OIDC service with injected fetch/JWKS verifier seams.
- [x] Implement identity/session service with keyed hashes and atomic claims.
- [x] Add replay, expiry, mismatch, CSRF and bootstrap tests.
- [x] Update checklist evidence.

**Acceptance Criteria:**
- Given consumed/expired state, when callback repeats, then token exchange is not attempted.
- Given unverified or mismatched email, when claim/bootstrap runs, then no identity binding occurs.
- Given valid opaque session but missing/wrong CSRF on mutation, then validation fails.
- Given concurrent invitation claims, then exactly one succeeds.

## Spec Change Log

- 2026-07-14: identity-core slice matched frozen intent; route/startup integration remains explicitly deferred to next slice.

## Verification

**Commands:**
- `bun test hub/src/auth/oidcService.test.ts hub/src/auth/identityService.test.ts hub/src/store/sharedHubStore.test.ts`
- `bun run --cwd hub typecheck`
- `git diff --check`
- GitNexus change detection.
