# Shared Hub shipping plan

Status: active
Target: production-capable single-organization Shared Hub
Companion checklist: [`shared-hub-shipping-checklist.md`](./shared-hub-shipping-checklist.md)

## Outcome

Ship Shared Hub only after every access path uses organization identity plus Runner credentials, authorization decisions are consistent across REST and realtime transports, security mutations are audited, revocation is timely, the administration UI exposes the required lifecycle controls, and operational recovery has been exercised.

This plan replaces the earlier pilot-core readiness verdict as the active closure plan. Earlier planning and `_bmad-output` records remain historical evidence, not release authority.

## Release boundary

Included:

- One organization per Hub deployment.
- Keycloak OIDC browser identity with opaque Hub sessions and CSRF protection.
- Per-Runner credentials; Linux systemd and macOS LaunchAgent operation.
- Runner, session, Team, member, grant, terminal, editor, file, Git, permission, RPC, and Team Chat authorization.
- Immediate access-loss handling, durable audit/outbox records, encrypted backup and restore.
- Admin workflows needed to operate the pilot without database intervention.

Excluded:

- Multi-organization Hub, HA, multiple Hub writers, PostgreSQL, Windows service installation, automatic directory sync, and automatic upgrade channels.
- Compatibility with shared-token or namespace-based ownership formats.

## Shipping invariants

1. No browser, CLI, Runner, REST, Socket.IO, SSE, RPC, or Team Chat path authenticates with `CLI_API_TOKEN`, namespace JWT, or a legacy session principal.
2. Namespace may remain a runtime partition key during migration, but never establishes identity, ownership, or authorization.
3. Every resource mutation follows authorize -> mutate -> audit/outbox commit -> publish. Failed authorization or transaction means no mutation and no event.
4. Every resource read, subscription, delivery, and control action resolves effective capability at use time. Room membership and prior authorization are not authority.
5. Disable, role loss, Team removal, grant revoke, Runner revoke, and grant expiry stop newly forbidden access within the documented service-level objective.
6. Plaintext enrollment codes and Runner credentials appear once, are never stored unhashed, and never enter logs, audit, outbox, diagnostics, or error bodies.
7. Cross-organization resources fail closed as 404; same-organization insufficient capability returns the documented 403 response.
8. Release evidence comes from the release commit and production-like fixtures. Historical pass counts do not satisfy a gate.

## Workstream 1 — Remove legacy authentication

Goal: enrolled Runner credentials are the only CLI/Runner authority.

1. Inventory REST and Socket.IO client types: machine-scoped Runner, session-scoped Runner, browser opaque session.
2. Change `/cli` REST authentication so every route validates a Runner credential, machine binding, organization, and route-appropriate session binding.
3. Remove Bearer shared-token handling, `parseAccessToken` authorization, namespace suffix behavior, and `legacy-session` Socket.IO principals.
4. Update CLI construction paths so normal agent sessions receive the enrolled profile explicitly; fail with enrollment guidance when absent.
5. Remove `CLI_API_TOKEN` generation, configuration, login/logout UX, JWT secret wiring, and obsolete auth/bind middleware after all callers migrate.
6. Update documentation and integration fixtures to describe Runner credentials only.

Verification:

- Credential valid/wrong/rotated/revoked matrices for REST and Socket.IO.
- Machine mismatch, session mismatch, organization mismatch, and missing-profile tests.
- Search gate: no production authentication reference to `CLI_API_TOKEN`, namespace JWT, or `legacy-session`.
- GitNexus impact check before each central symbol edit; `createWebApp`, `startWebServer`, and `main` d=1 paths covered.

## Workstream 2 — Complete authorization parity

Goal: one effective-capability resolver controls every transport and feature.

### Locked Team Chat authorization policy

This policy is the implementation contract for Shared Hub:

- Every Team Chat belongs to one organization and records the creating active membership as `ownerMembershipId`. Organization namespace is isolation metadata only; it grants no access.
- An active organization Admin and the active Team Chat owner have `manage`. An active user participant has `interact`. Other organization members have no Team Chat capability. Participant roles such as `backend`, `frontend`, or `reviewer` are descriptive and never grant authority.
- Capabilities are hierarchical: `manage` includes `operate`, `interact`, and `view`; `operate` includes `interact` and `view`; `interact` includes `view`.
- `view` permits listing a discoverable chat, reading its messages and participants, and reading relevant reports. `interact` permits posting and acknowledging or responding to mentions. `operate` permits adding or updating participants. `manage` permits removing participants and archiving a chat.
- Chat creation requires an active organization Admin; the creator becomes owner. An Admin may create a chat owned by another active membership. Ownership transfer, if exposed, requires `manage`, an active target membership, and last-owner protection.
- Browser access is evaluated from the current opaque-session membership on every REST request and every SSE delivery. Prior room membership, a cached list response, or organization membership alone is not authority.
- A session participant receives Team Chat messages or mentions only while the chat and participant are active, the session is active, and the session still belongs to an active authorized Runner projection. Access to a Runner or session alone never grants browser access to its Team Chats.
- Posting a session report requires `interact` on the Team Chat and `interact` on the source session. The source session must be an active participant in that chat. Mention targets must be active session participants in the same chat.
- Cross-organization, archived, or otherwise undiscoverable resources return `404`. A discoverable same-organization resource with insufficient capability returns `403`.
- Authorization is checked before database mutation, message lookup, mention/report creation, publish, room join, RPC, CLI emit, or session delivery. Denial produces no side effect.
- Disable, owner loss, participant removal, chat archive, Runner revoke, and session projection loss take effect for new requests and deliveries immediately and disconnect or detach affected realtime recipients within the access-loss SLO.

1. Build an endpoint/event/action inventory for REST, SSE, browser Socket.IO, CLI Socket.IO, RPC, terminal, editor, files, Git, permissions, and Team Chat.
2. Map every operation to `view`, `interact`, `spawn`, `operate`, or `manage`; reject unmapped operations by default.
3. Replace organization-only Team Chat guards with explicit membership/resource/capability checks. Define Team Chat ownership and participant rules before enabling access.
4. Verify editor, file, Git, permission, and RPC checks occur before engine calls or CLI side effects.
5. Add adversarial matrices for two users, two Teams, two Runners, expired grants, disabled users, archived resources, and reused session IDs.
6. Reconcile the earlier contradictory Phase 5 claims with a generated route/event coverage table committed beside the tests.

Verification:

- Every inventory row has one positive and at least one denial test.
- Cross-user/cross-Team tests cover REST, SSE, Socket.IO input/output, RPC, and terminal.
- Denial tests assert no database mutation, RPC, CLI emit, room join, or publish side effect.

## Workstream 3 — Audited lifecycle and immediate teardown

Goal: security state changes are durable, observable, and promptly enforced.

1. Move member role/status changes into the authorized transactional mutation pattern.
2. Emit sanitized audit and outbox records for role change, disable, enable, Team membership changes, ownership changes, grant changes, and Runner lifecycle changes.
3. Invalidate opaque sessions and disconnect affected SSE, browser Socket.IO, terminal attachments, and disallowed CLI session streams after commit.
4. Treat role downgrade as capability loss, not only identity metadata change.
5. Add a bounded expiry scheduler or equivalent timer/index mechanism for active expiring grants. Recheck current state before teardown so extension/replacement races are safe.
6. Define and measure the access-loss SLO; target no later than five seconds after committed mutation or expiry.
7. Ensure teardown detaches recipients without killing locally running agents unless an explicit lifecycle action requests process cleanup.

Verification:

- Commit-before-disconnect and rollback/no-disconnect tests.
- Multiple memberships and unrelated-user isolation tests.
- Fake-clock expiry, extension race, restart recovery, and idempotency tests.
- Audit/outbox payload snapshot review proving no secrets, commands, or private paths.

## Workstream 4 — Finish administration UI

Goal: authorized operators can complete all pilot lifecycle tasks without direct database access.

1. Add Team member add/remove, ownership transfer, and archive controls.
2. Display owner, direct/Team grant source, expiry, and per-actor effective capability for Runners and sessions.
3. Drive action visibility and disabled states from server-provided effective capabilities; keep server authorization authoritative.
4. Complete invitation, member disable/enable/role, Runner transfer/revoke/cleanup/re-enroll, grant create/revoke, and audit views.
5. Add confirmation and impact copy for whole-Runner grants, destructive lifecycle actions, and last-admin constraints.

Verification:

- Component tests for role, ownership, capability, expiry, and disabled states.
- Browser flows for Admin, delegated manager, Member, Viewer, expired access, and revoked access.
- UI denial never substitutes for server denial tests.

## Workstream 5 — Test stability and release automation

Goal: one clean, repeatable release run.

1. Fix timeout-prone CLI and Web tests; avoid solving deterministic races by only increasing timeouts.
2. Add a production-like Keycloak fixture with Admin plus two non-admin identities, two Teams, and two enrolled Runners.
3. Add transport isolation and revoke/reconnect browser tests to CI where practical; keep OS-service drills as recorded manual gates.
4. Add a release verification command or CI job that runs typecheck, package tests, browser tests, build, artifact checksums, and `git diff --check`.
5. Require zero unexpected skipped tests. Environment-gated tests must either run in release CI or have fresh manual evidence.

Required automated gate:

```bash
bun typecheck
bun run test
bun run test:e2e
bun run build:single-exe
git diff --check
```

## Workstream 6 — Operational qualification

Goal: prove deployment, recovery, and revocation with release artifacts.

1. Execute encrypted SQLite backup and isolated restore from the documented operations guide; verify integrity, entity counts, startup, and login.
2. Execute Linux install, start, restart, reconnect, revoke, cleanup, re-enroll, and uninstall using the release artifact.
3. Execute the same lifecycle on macOS LaunchAgent.
4. Execute real Keycloak login/invitation, two-user grant/revoke, role downgrade, disable, Team removal, grant expiry, offline Runner revoke, and reconnect.
5. Review production-like Hub, CLI, audit, and outbox output for credentials, tokens, commands, and private paths.
6. Validate reverse-proxy client IP handling, trusted origins, security headers, rate limits, TLS, persistent volume, WAL, monitoring, and alert ownership.

Evidence record for each drill:

- Date, release SHA and artifact checksum.
- Environment and operator.
- Preconditions and sanitized command transcript.
- Expected versus observed result.
- Relevant log/audit identifiers without secrets.
- Cleanup confirmation and linked follow-up issues.

## Execution order

1. Stabilize baseline tests enough to distinguish regressions.
2. Remove legacy authentication.
3. Complete authorization parity, starting with Team Chat and remaining RPC boundaries.
4. Implement audited member lifecycle and role/revoke/expiry teardown.
5. Finish Admin UI against stable server contracts.
6. Run automated release gates.
7. Run Keycloak, OS-service, revoke/reconnect, and restore drills.
8. Hold final go/no-go review and sign the companion checklist.

Authentication, Socket.IO, Team Chat route assembly, and Hub startup are CRITICAL GitNexus surfaces. Keep changes narrow; run upstream impact analysis before edits and change detection after every workstream.

## Go/no-go rule

Ship only when every blocker in the companion checklist is `completed`, all automated commands pass from the same release commit, all required manual evidence references that commit and artifact, no unresolved Critical/High security finding exists, and rollback plus on-call ownership are recorded.

Allowed final verdicts:

- `ready`: all gates satisfied.
- `conditional`: only explicitly accepted non-security limitations outside the release boundary remain.
- `not-ready`: any authentication, authorization, audit, teardown, recovery, cross-user isolation, artifact, or platform gate remains incomplete.
