---
title: 'Shared Hub Phase 2 auth HTTP boundary'
type: 'feature'
created: '2026-07-14'
status: 'done'
context:
  - '_bmad-output/implementation-artifacts/spec-shared-hub-phase-2-identity-core.md'
---

<frozen-after-approval reason="human-owned intent — continuation explicitly approved">

## Intent

**Problem:** Identity core chưa có HTTP/cookie boundary để browser đăng nhập và tạo RequestContext. **Approach:** thêm route factory và middleware độc lập, test đầy đủ trước khi thay wiring legacy CRITICAL.

## Boundaries & Constraints

**Always:** session cookie Secure/HttpOnly/SameSite=Lax; invitation cookie Secure/HttpOnly/short-lived; CSRF cookie Secure/SameSite=Strict và header match cho mutation; no-store auth responses; invitation hoặc configured first Admin bắt buộc; logout revoke server-side; stable sanitized errors.

**Ask First:** sửa `createAuthRoutes`, `createAuthMiddleware`, `createWebApp` hoặc startup wiring.

**Never:** bearer/query browser token; namespace context; invitation/token logging; callback tạo public signup; relax CSRF cho mutation.

</frozen-after-approval>

## Code Map

- `hub/src/web/routes/sharedAuth.ts` — login/callback/session/logout boundary mới.
- `hub/src/web/middleware/sharedAuth.ts` — opaque cookie + CSRF RequestContext middleware.
- `hub/src/auth/oidcService.ts` — verified identity provider.
- `hub/src/auth/identityService.ts` — membership/session provider.

## Tasks & Acceptance

**Execution:**
- [x] Add Shared Hub auth environment/request context.
- [x] Add login/callback/session/logout routes with strict cookie attributes.
- [x] Add session+CSRF middleware.
- [x] Test invitation/bootstrap, cookie flags, unauthorized and CSRF behavior.
- [x] Update checklist.

**Acceptance Criteria:**
- Given valid invite callback, when identity matches, then server session is issued and invite cookie removed.
- Given non-bootstrap identity without invite, when callback completes, then no session is issued.
- Given valid session cookie, when GET runs, then organization actor context is set.
- Given mutation missing/mismatched CSRF, when middleware runs, then 403 and downstream is not called.

## Spec Change Log

- 2026-07-14: HTTP boundary completed independently; CRITICAL legacy server wiring remains isolated for next slice.

## Verification

**Commands:**
- `bun test hub/src/web/routes/sharedAuth.test.ts hub/src/web/middleware/sharedAuth.test.ts`
- `bun run --cwd hub typecheck`
- `git diff --check`
