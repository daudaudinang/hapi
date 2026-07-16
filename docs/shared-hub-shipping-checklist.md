# Shared Hub shipping checklist

Companion plan: [`shared-hub-shipping-plan.md`](./shared-hub-shipping-plan.md)
Valid states: `pending`, `in-progress`, `completed`, `blocked`
Current verdict: `not-ready`

Evidence must identify the release commit and exact verification command or manual record. Marking implementation complete without verification does not complete an item.

## Current implementation run — 2026-07-16

Candidate base SHA: `868d856` with Codex-owned dirty implementation changes; therefore no item below is promoted to `completed` yet.

- `bun typecheck`: passed.
- `bun run test`: passed in one combined run: CLI 637/637 plus TerminalManager 50/50, Hub 397/397, and Web 562/562. All 12 Runner integration tests passed; no skipped tests. Claude Remote timing regressions also passed 10/10 focused repetitions before the combined run.
- `bun run test:e2e`: passed, 2 mocked-browser authentication flows; not a production-like Keycloak fixture.
- `bun run build:single-exe`: passed for host `bun-linux-x64-baseline`.
- `bun run checksums:release`: generated and verified one host artifact checksum during the dirty run; regenerate from the release commit.
- `git diff --check`: passed.
- GitNexus change detection: CRITICAL scope, 51 files; expected authentication/startup/CLI Socket.IO processes plus lifecycle/Admin UI. Requires release review.
- Production TypeScript search: no `CLI_API_TOKEN`, `parseAccessToken`, `legacy-session`, or legacy token getter remains.
- Coverage reconciliation: [`shared-hub-authorization-coverage.md`](./shared-hub-authorization-coverage.md). Team Chat policy enforcement now passes dirty-tree Hub tests; production-like multi-user evidence remains a blocker.
- Lifecycle audit matrix: Team membership/ownership, grants, invitations, and Runner enrollment/credential/ownership/cleanup mutations now write atomic sanitized audit and outbox records. Failure injection verifies invitation issue and Runner cleanup roll back with their audit write.
- Runner integration fixture: self-contained Shared Hub/database/enrollment process; all 12 tests execute. Enabling it fixed stale profile-lock recovery, profile-bound duplicate-start identity, and profile-aware heartbeat replacement.
- Durable outbox dispatcher: production startup recovery, ordered at-least-once delivery, bounded exponential retry, post-publish marking, shutdown cancellation, admin-only SSE invalidation, and Admin UI refresh are implemented. Focused dispatcher/security tests and full Hub/Web suites pass.
- Manual Keycloak, Linux, macOS, backup/restore, proxy, rollback, and owner sign-offs: not executed.

## 0 — Baseline and scope

- [ ] `pending` Record candidate release SHA, dirty-tree owner, artifact version, and target environment.
- [ ] `in-progress` Reconcile the earlier Phase 5 authorization contradiction with a route/event/action coverage inventory. Inventory committed; release-commit evidence pending.
- [ ] `in-progress` Confirm exclusions: multi-org, HA, PostgreSQL, Windows service, directory sync, automatic upgrades. Scope documented; owner acceptance pending.
- [ ] `in-progress` Fix or root-cause the timeout-prone CLI and Web tests; obtain one clean baseline run. Timed test paths no longer perform dynamic module loading; 10/10 focused repetitions and one complete dirty-tree baseline passed. Release-commit rerun pending.

## 1 — Authentication closure

- [ ] `in-progress` Require Runner credentials for every `/cli` REST route. Implemented and tested; release-commit evidence pending.
- [ ] `in-progress` Require Runner credentials for every `/cli` Socket.IO connection. Implemented and tested; release-commit evidence pending.
- [ ] `in-progress` Bind machine-scoped clients to the credential's Runner and machine. Implemented and tested.
- [ ] `in-progress` Bind session-scoped clients to an authorized active session projection. Implemented and tested.
- [ ] `in-progress` Remove shared Bearer-token and namespace-token authentication. Production TypeScript paths removed.
- [ ] `in-progress` Remove `legacy-session` principals and namespace JWT authentication. Production TypeScript paths removed.
- [ ] `in-progress` Remove production `CLI_API_TOKEN` generation, configuration, logs, CLI login UX, and documentation. Code removed; primary documentation cleanup still pending.
- [ ] `in-progress` Make unenrolled local sessions fail with actionable enrollment guidance. Implemented and tested through startup paths.
- [ ] `in-progress` Pass valid, missing, malformed, wrong, rotated, revoked, machine-mismatch, session-mismatch, and cross-org credential tests. Focused matrix passes; production-like fixture pending.
- [ ] `in-progress` Confirm production search contains no legacy authentication path. TypeScript search clean; documentation search pending.

## 2 — Authorization parity

- [ ] `in-progress` Inventory every REST endpoint, SSE selector/event, Socket.IO event, RPC, and terminal operation. Coverage document added; Team Chat gap recorded.
- [ ] `in-progress` Assign each inventory row a capability and fail closed when unmapped. Team Chat policy mapped and dirty-tree enforcement passes; release evidence pending.
- [ ] `in-progress` Enforce effective capability before editor and file reads/mutations. Implemented and tested.
- [ ] `in-progress` Enforce effective capability before Git reads/mutations. Implemented and tested.
- [ ] `in-progress` Enforce effective capability before permission and session-control RPCs. Implemented and tested.
- [ ] `in-progress` Define Team Chat ownership, membership, participant, read, post, manage, and archive policy. Policy locked in the shipping plan; release review evidence pending.
- [ ] `in-progress` Enforce Team Chat policy on REST, SSE, mentions, reports, and session delivery. Ownership schema v11 and per-use checks implemented; focused and full Hub tests pass; release/production-like evidence pending.
- [ ] `in-progress` Verify denial occurs before database, engine, RPC, CLI, room, terminal, or publish side effects. Team Chat REST/SSE denial cases now pass; production-like every-transport matrix pending.
- [ ] `pending` Pass every-transport cross-user, cross-Team, cross-Runner, cross-org, expiry, disable, archive, and session-ID-reuse tests.

## 3 — Security lifecycle, audit, and teardown

- [ ] `in-progress` Route member role changes through authorize -> mutate -> audit/outbox -> publish. Production dispatcher and admin-only SSE invalidation implemented and tested; release-commit evidence pending.
- [ ] `in-progress` Route member disable/enable through the same transaction boundary. Implemented and tested.
- [ ] `in-progress` Audit Team membership/ownership, grant, invitation, and Runner lifecycle mutations with sanitized payloads. Atomic audit/outbox coverage and sensitive-value regression tests pass; release-commit evidence pending.
- [ ] `in-progress` Invalidate browser sessions after disable and other identity-invalidating changes. Disable implemented; full identity-invalidating matrix pending.
- [ ] `in-progress` Disconnect affected SSE and Socket.IO streams after committed access loss. Implemented for member, Team, grant, and Runner paths.
- [ ] `in-progress` Detach affected terminal and CLI session streams without killing local agents. Existing terminal teardown behavior tested; full lifecycle matrix pending.
- [ ] `in-progress` Treat role downgrade as immediate effective-capability loss. Post-commit disconnect implemented.
- [ ] `in-progress` Add proactive grant-expiry scheduling with restart recovery and race-safe recheck. One-second scheduler and replacement recheck implemented; restart fixture pending.
- [ ] `pending` Meet and record the access-loss SLO of no more than five seconds.
- [ ] `in-progress` Pass commit-order, rollback, idempotency, unrelated-user, multiple-membership, fake-clock, extension-race, and restart tests. Lifecycle rollback plus outbox ordering/retry/restart recovery pass; remaining combined matrix pending.
- [ ] `in-progress` Review audit/outbox/log payloads; confirm no credentials, tokens, commands, or private paths. Automated audit/outbox serialization check passes for lifecycle secrets; production log/manual review pending.

## 4 — Administration UI

- [ ] `in-progress` Add Team member add/remove controls. Implemented; component/browser coverage pending.
- [ ] `in-progress` Add Team ownership transfer and archive controls. Implemented; component/browser coverage pending.
- [ ] `pending` Show Runner and session ownership, grant source, expiry, and effective capability.
- [ ] `pending` Gate controls using server-provided effective capability.
- [ ] `pending` Complete invitation and member lifecycle workflows.
- [ ] `in-progress` Complete Runner transfer, revoke, cleanup, and re-enroll workflows. Transfer/revoke/cleanup/enrollment UI exists; browser coverage pending.
- [ ] `in-progress` Complete grant create/list/revoke and chronological audit workflows. Implemented; browser coverage pending.
- [ ] `in-progress` Add whole-Runner grant and destructive-action confirmations. Implemented; component coverage pending.
- [ ] `pending` Pass Admin, delegated manager, Member, Viewer, expired, disabled, and revoked browser flows.

## 5 — Automated release gates

- [ ] `in-progress` `bun typecheck` passes from the release commit. Passed on dirty tree; release commit pending.
- [ ] `in-progress` `bun run test` passes in one clean run. Passed on dirty tree; release commit pending.
- [ ] `in-progress` `bun run test:e2e` passes with production-like Keycloak fixtures. Mocked E2E passes; production-like Keycloak fixture pending.
- [ ] `in-progress` `bun run build:single-exe` passes for release targets. Host Linux x64 passed; full release targets pending.
- [ ] `in-progress` Release artifacts and SHA-256 checksums are generated and verified. Automation added and host artifact verified; release artifacts pending.
- [ ] `in-progress` `git diff --check` passes. Passed on dirty tree; release commit pending.
- [ ] `in-progress` No unexpected skipped or flaky tests remain. Zero skips; both Claude Remote suites passed 10/10 focused repetitions and the full parallel run after moving module loading outside timed test bodies. Release-commit rerun pending.
- [ ] `in-progress` GitNexus upstream impact reviewed before central-symbol edits; all d=1 dependents updated/tested. Critical surfaces reviewed and package tests pass; release review pending.
- [ ] `in-progress` GitNexus change detection matches intended symbols and execution flows. Detection run; CRITICAL expected scope requires reviewer acceptance.
- [ ] `pending` No unresolved Critical or High security finding remains.

## 6 — Keycloak and multi-user qualification

- [ ] `pending` Verify discovery, JWKS rotation, login, logout, expiry, replay, nonce, CSRF, and invitation in the pilot environment.
- [ ] `pending` Verify first-Admin bootstrap and last-Admin protection.
- [ ] `pending` Execute two-user direct-grant and Team-grant isolation across every transport.
- [ ] `pending` Execute grant revoke and confirm SLO-compliant realtime teardown.
- [ ] `pending` Execute role downgrade, user disable, and Team removal with active browser and terminal streams.
- [ ] `pending` Execute natural grant expiry while streams are active.
- [ ] `pending` Retain sanitized evidence tied to the release SHA.

## 7 — Runner and platform qualification

- [ ] `pending` Linux: install verified artifact and enroll named profile.
- [ ] `pending` Linux: start, restart, reconnect, revoke, cleanup, re-enroll, and uninstall.
- [ ] `pending` macOS: install verified artifact and enroll named profile.
- [ ] `pending` macOS: start, restart, reconnect, revoke, cleanup, re-enroll, and uninstall.
- [ ] `pending` Revoke an offline Runner; confirm reconnect denial and cleanup behavior.
- [ ] `pending` Verify profile/state/lock/log/service isolation for two Hubs.
- [ ] `pending` Confirm secrets absent from process arguments, service definitions, files with broad permissions, logs, diagnostics, and shell output.
- [ ] `pending` Retain sanitized platform evidence tied to artifact checksums.

## 8 — Operations and recovery

- [ ] `pending` Validate single-instance SQLite WAL deployment and persistent-volume ownership.
- [ ] `pending` Create an online backup and encrypt it with the production procedure.
- [ ] `pending` Restore into an isolated environment and pass integrity checks.
- [ ] `pending` Verify restored entity counts, Hub startup, Keycloak login, Runner state, and audit chronology.
- [ ] `pending` Validate reverse-proxy client IP trust, TLS, Origin/CORS, security headers, and rate limits.
- [ ] `pending` Define monitoring, disk/backup alerts, credential rotation, incident owner, and on-call escalation.
- [ ] `pending` Record rollback procedure and execute a rollback rehearsal.
- [ ] `pending` Retain the restore and rollback records tied to the release SHA.

## 9 — Final review

- [ ] `pending` Product owner accepts pilot scope and known non-security limitations.
- [ ] `pending` Security reviewer signs authentication, authorization, secret handling, and audit evidence.
- [ ] `pending` Operations owner signs deployment, backup/restore, monitoring, and rollback evidence.
- [ ] `pending` Engineering owner confirms all checklist evidence references one release commit and its artifacts.
- [ ] `pending` Set verdict to `ready` or document why it remains `not-ready`.

## Final verdict record

- Verdict: `not-ready`
- Release SHA: unset
- Artifact/checksum: unset
- Review date: unset
- Product owner: unset
- Engineering owner: unset
- Security reviewer: unset
- Operations owner: unset
- Remaining risks: all checklist items pending
