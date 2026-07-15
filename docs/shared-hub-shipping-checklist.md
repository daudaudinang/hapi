# Shared Hub shipping checklist

Companion plan: [`shared-hub-shipping-plan.md`](./shared-hub-shipping-plan.md)
Valid states: `pending`, `in-progress`, `completed`, `blocked`
Current verdict: `not-ready`

Evidence must identify the release commit and exact verification command or manual record. Marking implementation complete without verification does not complete an item.

## 0 — Baseline and scope

- [ ] `pending` Record candidate release SHA, dirty-tree owner, artifact version, and target environment.
- [ ] `pending` Reconcile the earlier Phase 5 authorization contradiction with a route/event/action coverage inventory.
- [ ] `pending` Confirm exclusions: multi-org, HA, PostgreSQL, Windows service, directory sync, automatic upgrades.
- [ ] `pending` Fix or root-cause the timeout-prone CLI and Web tests; obtain one clean baseline run.

## 1 — Authentication closure

- [ ] `pending` Require Runner credentials for every `/cli` REST route.
- [ ] `pending` Require Runner credentials for every `/cli` Socket.IO connection.
- [ ] `pending` Bind machine-scoped clients to the credential's Runner and machine.
- [ ] `pending` Bind session-scoped clients to an authorized active session projection.
- [ ] `pending` Remove shared Bearer-token and namespace-token authentication.
- [ ] `pending` Remove `legacy-session` principals and namespace JWT authentication.
- [ ] `pending` Remove production `CLI_API_TOKEN` generation, configuration, logs, CLI login UX, and documentation.
- [ ] `pending` Make unenrolled local sessions fail with actionable enrollment guidance.
- [ ] `pending` Pass valid, missing, malformed, wrong, rotated, revoked, machine-mismatch, session-mismatch, and cross-org credential tests.
- [ ] `pending` Confirm production search contains no legacy authentication path.

## 2 — Authorization parity

- [ ] `pending` Inventory every REST endpoint, SSE selector/event, Socket.IO event, RPC, and terminal operation.
- [ ] `pending` Assign each inventory row a capability and fail closed when unmapped.
- [ ] `pending` Enforce effective capability before editor and file reads/mutations.
- [ ] `pending` Enforce effective capability before Git reads/mutations.
- [ ] `pending` Enforce effective capability before permission and session-control RPCs.
- [ ] `pending` Define Team Chat ownership, membership, participant, read, post, manage, and archive policy.
- [ ] `pending` Enforce Team Chat policy on REST, SSE, mentions, reports, and session delivery.
- [ ] `pending` Verify denial occurs before database, engine, RPC, CLI, room, terminal, or publish side effects.
- [ ] `pending` Pass every-transport cross-user, cross-Team, cross-Runner, cross-org, expiry, disable, archive, and session-ID-reuse tests.

## 3 — Security lifecycle, audit, and teardown

- [ ] `pending` Route member role changes through authorize -> mutate -> audit/outbox -> publish.
- [ ] `pending` Route member disable/enable through the same transaction boundary.
- [ ] `pending` Audit Team membership/ownership, grant, invitation, and Runner lifecycle mutations with sanitized payloads.
- [ ] `pending` Invalidate browser sessions after disable and other identity-invalidating changes.
- [ ] `pending` Disconnect affected SSE and Socket.IO streams after committed access loss.
- [ ] `pending` Detach affected terminal and CLI session streams without killing local agents.
- [ ] `pending` Treat role downgrade as immediate effective-capability loss.
- [ ] `pending` Add proactive grant-expiry scheduling with restart recovery and race-safe recheck.
- [ ] `pending` Meet and record the access-loss SLO of no more than five seconds.
- [ ] `pending` Pass commit-order, rollback, idempotency, unrelated-user, multiple-membership, fake-clock, extension-race, and restart tests.
- [ ] `pending` Review audit/outbox/log payloads; confirm no credentials, tokens, commands, or private paths.

## 4 — Administration UI

- [ ] `pending` Add Team member add/remove controls.
- [ ] `pending` Add Team ownership transfer and archive controls.
- [ ] `pending` Show Runner and session ownership, grant source, expiry, and effective capability.
- [ ] `pending` Gate controls using server-provided effective capability.
- [ ] `pending` Complete invitation and member lifecycle workflows.
- [ ] `pending` Complete Runner transfer, revoke, cleanup, and re-enroll workflows.
- [ ] `pending` Complete grant create/list/revoke and chronological audit workflows.
- [ ] `pending` Add whole-Runner grant and destructive-action confirmations.
- [ ] `pending` Pass Admin, delegated manager, Member, Viewer, expired, disabled, and revoked browser flows.

## 5 — Automated release gates

- [ ] `pending` `bun typecheck` passes from the release commit.
- [ ] `pending` `bun run test` passes in one clean run.
- [ ] `pending` `bun run test:e2e` passes with production-like Keycloak fixtures.
- [ ] `pending` `bun run build:single-exe` passes for release targets.
- [ ] `pending` Release artifacts and SHA-256 checksums are generated and verified.
- [ ] `pending` `git diff --check` passes.
- [ ] `pending` No unexpected skipped or flaky tests remain.
- [ ] `pending` GitNexus upstream impact reviewed before central-symbol edits; all d=1 dependents updated/tested.
- [ ] `pending` GitNexus change detection matches intended symbols and execution flows.
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
