# Shared Hub Pilot-Core — Checklist thực thi

Trạng thái hợp lệ: `pending`, `in-progress`, `completed`, `blocked`.

## Phase 0 — Approved contracts

- `completed` Update Product Brief with selected decisions. Evidence: `_bmad-output/planning-artifacts/briefs/brief-hapi-2026-07-13/brief.md`; verification: diff inspection; result: approved decisions recorded; remaining risk: implementation pending.
- `completed` Replace scratch Architecture Spine with approved architecture. Evidence: `_bmad-output/planning-artifacts/architecture/architecture-hapi-shared-hub-2026-07-13/ARCHITECTURE-SPINE.md`; verification: diff inspection; result: status approved and contracts aligned; remaining risk: implementation pending.
- `completed` Record permission/action matrix. Evidence: `docs/superpowers/plans/2026-07-14-shared-hub-pilot-core-implementation-plan.md`; verification: document inspection; result: fixed matrix recorded; remaining risk: code enforcement not implemented.
- `completed` Record OIDC, invitation, Runner enrollment, revoke, and failure contracts. Evidence: implementation plan; verification: document inspection; result: contracts recorded; remaining risk: provider-specific discovery unverified.
- `completed` Record Linux/macOS UX and operational acceptance criteria. Evidence: implementation plan; verification: document inspection; result: criteria recorded; remaining risk: manual platform runs pending.

## Phase 1 — Shared Hub persistence

- `completed` Add organization, identity, membership, Team, invitation, web-session, Runner, credential, enrollment, grant, and audit schemas. Evidence: `hub/src/store/sharedHubStore.ts`, `shared/src/auth.ts`, `shared/src/runnerEnrollment.ts`; verification: focused tests + shared/hub typecheck; result: 10 pass, typecheck pass; remaining risk: not wired into Hub startup.
- `completed` Retain machine runtime state as a one-to-one Runner projection. Evidence: `runner_machine_projections`, `createRunnerProjection`; verification: focused store test; result: unique Runner and machine constraints pass with rollback; remaining risk: legacy runtime adapter/startup wiring pending.
- `in-progress` Replace namespace ownership with organization context. Evidence: SharedHubStore Runner/grant APIs require organizationId and cross-org tests pass; verification: focused store test; result: persistence kernel scoped; remaining risk: legacy REST/realtime/data-plane namespace guards remain for Phase 5.
- `completed` Reject legacy databases with backup/new-database guidance. Evidence: `SharedHubStore.initialize`; verification: `sharedHubStore.test.ts`; result: pass; remaining risk: startup integration pending.
- `completed` Add transactional authorize → mutate → audit → publish services. Evidence: `hub/src/application/authorizedMutationService.ts`; verification: focused tests; result: commit ordering, denial, rollback and no-publish-on-failure pass; remaining risk: entry-point adoption pending.
- `completed` Pass schema/store tests and migration-safety checks. Evidence: `hub/src/store/sharedHubStore.test.ts`; verification: `bun test ...`; result: pass; remaining risk: concurrent multi-connection SQLite test pending.

## Phase 2 — Keycloak identity

- `completed` Add OIDC discovery and Authorization Code + PKCE flow. Evidence: `oidcService.ts`, `sharedHubConfiguration.ts`, Shared auth routes and server wiring; verification: protocol, config, route and assembly tests; result: mounted production browser path; remaining risk: real Keycloak/browser E2E pending.
- `completed` Add secure opaque sessions and CSRF HTTP boundary. Evidence: `identityService.ts`, `web_sessions`, Shared auth routes/middleware/server; verification: hash-at-rest, expiry, revoke, cookie flags, middleware and assembly tests; result: mounted; remaining risk: browser E2E pending.
- `completed` Bootstrap first Admin from configured verified email in identity core. Evidence: `bootstrapFirstAdmin`; verification: mismatch/idempotency/single-admin tests; result: pass; remaining risk: configuration/startup wiring pending.
- `completed` Implement verified-email invitations and atomic claims. Evidence: `claimInvitation`; verification: match/mismatch/expiry/replay tests; result: pass; remaining risk: invitation management routes pending.
- `completed` Implement user disable, role management, and last-Admin protection. Evidence: `identityService.ts` (en/disableMember, updateMemberRole), `sharedMembers.ts` routes, store methods; verification: identity + route tests (24 pass, 0 fail); result: admin-only list/get/role-change/disable/enable with last-admin guard; remaining risk: proactive session/stream disconnect on disable requires Phase 5 realtime enforcement.
- `in-progress` Remove shared-token, namespace JWT, and Telegram binding authentication. Evidence: browser `/api/auth`, `/api/bind`, HS256 middleware removed from server assembly; startup no longer logs/embeds token; verification: server assembly + Hub suite; result: browser replacement complete; remaining risk: Socket.IO namespace JWT and `/cli` shared token remain until Phase 4/5 Runner credential enforcement.
- `in-progress` Pass authentication, replay, expiry, and CSRF tests. Evidence: identity+HTTP+server suites; verification: protocol, cookie, replay, expiry, nonce, email, CSRF and assembly tests pass; remaining risk: real Keycloak/JWKS and browser E2E pending.

## Phase 3 — Teams and authorization

- `completed` Implement organization Teams, membership, ownership, and archival. Evidence: organization-scoped store/service/routes with atomic ownership transfer and archived immutability; focused lifecycle tests pass.
- `completed` Implement cumulative view → interact → spawn → operate → manage policy kernel. Evidence: `hub/src/auth/authorizationService.ts`; verification: exhaustive 6,864-case Cartesian matrix plus focused service/routes.
- `completed` Implement direct and dynamic Team grant resolution. Evidence: live `SharedHubStore.resolveEffectiveGrants`, Team service and REST mutations; active/direct/Team/expired/archived/cross-org tests pass.
- `completed` Enforce Viewer hard cap and Admin full access in policy kernel. Evidence: exhaustive authorization matrix and authenticated route assembly; proactive transport enforcement remains Phase 5.
- `completed` Implement delegated managers without transfer/archive/revoke authority. Evidence: policy + lifecycle service tests, including Team-owner own-source transfer restriction.
- `completed` Implement explicit session-level read-only grant constraint. Evidence: schema CHECK, active-Runner projection validation, service validation, stale Admin revoke tests.
- `completed` Project session security identifiers through current same-organization active Runner bindings. Evidence: subscribe-before-reconcile coordinator, temporal replay/tombstones, transactional grant retirement; race/idempotency/ID-reuse tests pass.
- `completed` Expose authenticated Team/member/grant REST administration. Evidence: `sharedTeams.ts`, opaque-session server mount, route and assembly tests; stable 400/403/404/409 responses.
- `completed` Pass exhaustive role/grant/action matrix tests. Evidence: role × ownership × none/direct/Team capability × 26 actions × expiry × disabled = 6,864 policy assertions.

## Phase 4 — Runner enrollment

- `completed` Add one-time, 15-minute, hash-only enrollment codes. Evidence: bounded issue/exchange routes and service, exact server TTL, keyed hash-only persistence, atomic owner-active recheck and single-consumer transaction; focused tests pass.
- `completed` Add per-Runner credential issuance, hashing, generation-CAS rotation, authentication core, and revocation. Evidence: one-time bounded envelope, constant-time authenticator, expected-generation CAS, active-Runner check, atomic revoke/tombstone/access retirement; focused tests pass.
- `completed` Add hapi runner enroll --hub --code --profile. Evidence: bounded enrollment client, canonical Hub URL, no-overwrite atomic profile persistence, sanitized command output, and focused tests.
- `completed` Add isolated multi-Hub profiles, state, locks, logs, and services. Evidence: explicit named-profile daemon lifecycle, per-profile credential/state/lock/log paths, profile-scoped control integration harness, and filesystem/redaction tests.
- `completed` Add Linux user-systemd installation. Evidence: `commands/runner.ts` (install/uninstall/--foreground); verification: typecheck + `bun run test` (560 pass); result: `hapi runner install --profile <name>` generates `~/.config/systemd/user/hapi-runner-<name>.service`, enables, and starts via systemctl; `uninstall` stops/disables/removes; `--foreground` flag enables systemd-compatible foreground mode; remaining risk: manual Linux systemd E2E pending.
- `completed` Add macOS LaunchAgent installation. Evidence: `commands/runner.ts` (darwin branch in install/uninstall); verification: typecheck + `bun run test` (560 pass); result: generates `~/Library/LaunchAgents/com.hapi.runner.<profile>.plist`, bootstraps via `launchctl bootstrap` (fallback `launchctl load`), uninstall bootout/unloads; remaining risk: manual macOS E2E pending.
- `completed` Add bootstrap scripts with platform artifact selection and SHA-256 verification. Evidence: `cli/scripts/install.sh` (POSIX sh, OS/arch detection, curl/wget download, sha256sum/shasum verify, tar extract, install to /usr/local/bin or ~/.local/bin, PATH warning, enrollment next-steps); `release.yml` (copies install.sh as release asset); verification: `sh -n` syntax check + `bun run test` (560 pass); result: `curl -fsSL <url>/install.sh | sh` pipeline ready; remaining risk: CI release E2E pending.
- `completed` Implement online/offline revoke, cleanup, tombstone, transfer, and re-enroll. Evidence: `runnerLifecycleService.ts` (list/transfer/cleanup + existing revoke), `sharedHubStore.ts` (listRunners/transferRunnerOwnership/cleanupRunnerTombstone + existing revokeRunnerAccess/runner_tombstones), `runnerEnrollments.ts` routes (GET /runners, POST /runners/:id/transfer, POST /runners/:id/cleanup), `shared/src/runnerEnrollment.ts` (RunnerTransfer/Cleanup/List schemas); verification: focused tests 25 pass + full suite 560 pass; result: transfer with admin/owner auth + same-owner/target-not-found rejection; cleanup marks tombstone once with cleanup_required guard; list admin-only; re-enroll possible via existing issue+exchange flow after revoke clears claims; remaining risk: manual E2E pending.
- `completed` Pass concurrent consumption, reconnect, cleanup, and secret-redaction tests. Evidence: core concurrent-winner/rollback, inactive-owner, CAS, revoke/re-enroll, response validation and redaction tests pass (25 focused tests, 0 fail); remaining risk: reconnect/platform cleanup occur at Runner level in Phase 7 manual E2E.

## Phase 5 — Enforcement across the data plane

- `completed` Replace namespace guards in scoped REST APIs. Evidence: `guards.ts` provides the shared rank-based subject/resource guard; `server.ts` injects the live `TeamAuthorizationService` resolver; sessions/machines collections filter inaccessible resources; messages, permissions, editor, files, Git and session control map to `view`/`interact`/`spawn`/`operate`; cross-organization resources return 404. Verification: adversarial and production-wired resolver matrices plus full Hub 383 pass and root suite pass. Result: deny occurs before engine/RPC side effects; inactive-message auto-resume also requires `spawn`; bulk controls are atomic across visible resources. Remaining risk: standalone Team Chat permission mapping remains intentionally out of scope; realtime parity remains pending.
- `completed` Enforce live authorization in SSE subscriptions and broadcasts. Evidence: `resourceCapability.ts` centralizes the production resolver/rank; `events.ts` preflights scoped selectors; `sseManager.ts` re-authorizes session/machine/nested-toast delivery, treats `all` as a dynamic projection, and drops unmapped Team events. Verification: production resolver matrix plus dynamic expiry/toast/Team regressions; focused realtime suite 102 pass. Result: events after expiry/revoke are not delivered; remaining risk: real two-user Keycloak transport E2E remains pending.
- `completed` Enforce actor/resource authorization in Socket.IO and terminal rooms. Evidence: opaque web session subject is passed to the shared resolver; subscribe/list/create/write/resize/close/keepalive require live `operate`; CLI list/warning/output/error/exit delivery filters every recipient and evicts denied attachments. Verification: deny-before-CLI, expiry detach/no-close, mixed-room and unrelated-recipient tests; Hub 388 pass. Result: room membership is routing only and denial never kills the terminal process; remaining risk: real two-user transport E2E remains pending.
- `in-progress` Enforce authorization for RPC, editor, files, Git, permissions, and Team Chat. Evidence: organization guards prevent cross-organization access; verification: Hub suite 374 pass. Review result: guards do not enforce resource grants/action capability, and Team Chat lacks Team membership policy. Remaining work: action-specific centralized authorization and adversarial cross-user tests.
- `in-progress` Disconnect affected streams and terminal attachments immediately after access loss. Evidence: membership-targeted SSE/Socket.IO disconnect is wired after member disable, Team removal and grant revoke; Runner-targeted disconnect is wired after revoke; focused service/SSE/socket tests pass. Result: unrelated memberships stay connected; remaining risk: time-based grant expiry has no scheduler-driven immediate teardown and needs real multi-user transport E2E.
- `in-progress` Require an enrolled Runner profile for local CLI sessions. Evidence: Runner credentials are supported by CLI/Hub; verification: automated suites pass. Review result: `/cli` and Socket.IO retain active `CLI_API_TOKEN`/`legacy-session` fallback, and non-machine Runner REST route classification needs integration proof. Remaining work: remove shared-secret fallback and run enrolled CLI session/message E2E.
- `completed` Preserve terminal lifecycle and running-agent behavior except revoke cleanup. Evidence: runner daemon (`run.ts`) handles Socket.IO disconnects gracefully via reconnection; credential revocation returns `authenticate()` as null, connection fails, but agent processes on CLI side are not killed — only hub-side sessions/grants/tombstones are affected; terminal sessions in existing sessions continue unaffected by credential changes; verification: existing runner integration tests verify disconnect/reconnect behavior; remaining risk: manual revoke-disconnect E2E pending.
- `pending` Pass every-transport cross-user/cross-Team isolation tests. Evidence: requires multi-user Keycloak setup; deferred to Phase 7 manual E2E.

## Phase 6 — Pilot web UI

- `completed` Replace token login with Keycloak login/invitation flow. Evidence: `web/src/api/client.ts` (cookie-based auth with CSRF, credentials:include, removed Bearer JWT/auth/bind), `web/src/hooks/useAuth.ts` (rewritten for session cookie: GET /api/auth/session, login redirect, loginWithInvitation, logout), `web/src/hooks/useSSE.ts` (removed ?token= param, relies on cookie), `web/src/components/LoginPrompt.tsx` (replaced token input with Keycloak login button + invitation code input), `web/src/App.tsx` (removed useAuthSource, adapted to new useAuth with session/role info); verification: typecheck all workspaces + `bun run test` (562 pass, 91 files); result: web PWA authenticates via Keycloak OIDC + opaque session cookie; remaining risk: manual browser/Keycloak E2E pending.
- `completed` Add Workspace, Runners, Teams, and Admin navigation. Evidence: `web/src/components/NavBar.tsx` (global top nav bar with path-based active styling, admin-only Admin link), `web/src/App.tsx` (NavBar rendered before Outlet), `web/src/router.tsx` (runners + admin placeholder routes), `web/src/routes/runners.tsx` and `web/src/routes/admin.tsx` (placeholder pages); verification: typecheck + `bun run test` (562 pass); result: persistent nav bar with Sessions/Runners/Teams/Admin(admin-only) links across all pages; remaining risk: placeholder pages need Phase 6 items 3-8 implementation.
- `completed` Add Linux/macOS enrollment dialog and status. Evidence: `web/src/routes/runners.tsx` (create enrollment, copy enroll command, platform selection, profile name input, install instructions, pending enrollment list with cancel, enrolled runner list with revoke/cleanup), `web/src/api/client.ts` (createEnrollment/listEnrollments/cancelEnrollment/listRunners/revokeRunner/cleanupRunner methods); verification: typecheck + `bun run test` (562 pass); result: full enrollment lifecycle UI; remaining risk: browser E2E + member list for owner dropdown pending.
- `in-progress` Add ownership, permission source, expiry, and effective-access displays. Evidence: `web/src/routes/admin.tsx` now displays Runner ownership plus direct/Team grant source, capability and expiry; Hub session detail uses `TeamAuthorizationService.resolveEffectiveCapability`; verification: full typecheck/test pass; remaining risk: Admin resource tables do not yet expose per-actor computed effective capability.
- `completed` Add whole-Runner access warning and grant management. Evidence: `web/src/routes/admin.tsx` (Runners tab: yellow "Grants access to all sessions on this machine" warning on active runners, "Grant access" button opens inline form with principal type/user/team selector, capability dropdown view→manage, optional expiry input, operate/manage capability warning; Teams tab: create team with owner select, team list with archive status), `web/src/api/client.ts` (listTeams, createTeam, createGrant, revokeGrant); verification: typecheck + `bun run test` (562 pass); result: grant lifecycle UI operational; remaining risk: grant listing not yet implemented.
- `completed` Add read-only shared-session view. Evidence: `TeamAuthorizationService.resolveEffectiveCapability` resolves owner/Admin/Viewer/direct/Team Runner grants, expiry and session read-only grants; `sessions.ts` returns that server-owned capability or 403; web renders/gates from `userCapability`; verification: focused capability/session tests plus full typecheck/test pass; remaining risk: realtime transport parity remains in Phase 5.
- `in-progress` Add Admin users, Teams, Runners, grants, lifecycle, and audit pages. Evidence: Admin now includes Members, Teams, Runners, grant create/list/revoke/source/expiry and chronological Audit tabs backed by organization-scoped APIs; verification: full typecheck/test pass; remaining risk: Team membership/ownership lifecycle controls remain absent from the UI.
- `in-progress` Hide or disable actions based on effective capability. Evidence: organization-role gates exist in App/Admin/Runners; verification: typecheck + web tests pass; result: broad role gating implemented; remaining risk: controls do not consume fine-grained effective capability or ownership policy.
- `completed` Pass component and browser-flow tests. Evidence: 562 web unit/component tests plus `web/e2e/shared-hub-auth.spec.ts`; verification: `bun run test:e2e`; result: Chromium 2 pass covering token-free Keycloak/invitation UI and invitation-body-to-OIDC redirect; remaining risk: real Keycloak two-user pilot execution remains Phase 7 pending.

## Phase 7 — Hardening and release readiness

- `completed` Add strict origin/CORS policy, security headers, and rate limits. Evidence: `hub/src/web/server.ts` rejects wildcard/untrusted origins, adds CSP/frame/content/referrer/permissions headers, and applies bounded per-client auth/enrollment rate limits; verification: assembly tests cover trusted CORS, untrusted rejection, headers, and 429; full Hub suite pass; remaining risk: production proxy client-IP trust configuration requires deployment validation.
- `in-progress` Verify no credentials, tokens, commands, or private paths enter logs/audit. Evidence: raw command/path/argument logging removed from common CLI handlers and Runner spawn; optional remote diagnostic logger transmits metadata only. Verification: logger/terminal redaction regressions and full CLI suite (629 pass, 12 environment-gated skipped); remaining risk: production audit/outbox payload review against real pilot activity remains pending.
- `completed` Document single-instance SQLite WAL deployment and encrypted backups. Evidence: `docs/guide/shared-hub-operations.md`; verification: document inspection + README link; result: single-instance boundary, online SQLite backup, age encryption, secret separation and evidence format documented.
- `pending` Test backup restoration. Blocker: `age` and a backup identity/artifact are unavailable on this host; execute the documented encrypted restore drill in `docs/guide/shared-hub-operations.md` and retain integrity/startup evidence.
- `completed` Run bun typecheck. Evidence: all four workspaces; verification: `bun typecheck`; result: pass; remaining risk: none for current compile surface.
- `completed` Run focused package suites for new core. Evidence: four new test files; verification: focused `bun test`; result: 10 pass, 0 fail; remaining risk: integration coverage pending.
- `completed` Run bun run test. Evidence: all CLI, Hub, and Web suites; verification: `bun run test`; result: pass; remaining risk: manual pilot flows remain pending.
- `completed` Run git diff --check. Evidence: workspace diff; verification: `git diff --check`; result: pass; remaining risk: none for whitespace hygiene.
- `completed` Run GitNexus change detection and review affected flows. Evidence: 2026-07-15 realtime authorization checkpoint; verification: `gitnexus_detect_changes(scope=all)`; result: CRITICAL cumulative dirty-tree scope, 522 changed symbols, 136 affected symbols, 71 indexed changed files; realtime/startup/data-plane d=1 callers were covered by focused and Hub suites. Remaining risk: this is a broad pre-existing dirty tree and unindexed new symbols reduce graph completeness.
- `pending` Execute Linux and macOS manual enrollment. Blocker: current host is Linux but has no approved enrollment code/profile; macOS/`launchctl` is unavailable. Required evidence: install/start/restart/revoke/uninstall transcript on each OS.
- `pending` Execute two-user grant/revoke and realtime-disconnect E2E. Blocker: no Keycloak/OIDC pilot configuration or two test identities are available.
- `pending` Execute user disable, Team removal, offline revoke, and reconnect E2E. Blocker: no Keycloak identities and enrolled Runner fixture are available.
- `completed` Record final pilot readiness verdict and unresolved manual risks. Evidence: verdict below; deterministic automation passes, unavailable environment gates remain explicit.

## Current verdict

`not-ready — REST/SSE/terminal action authorization is capability-enforced, but deterministic blockers remain: member lifecycle audit/outbox and role-loss teardown are incomplete, legacy shared CLI authentication remains, Team lifecycle UI is incomplete, and grant-expiry proactive teardown is unscheduled; encrypted restore, Keycloak two-user, and Linux/macOS manual evidence also remain`

## Checkpoint 2026-07-15 — Readiness closure

- Verification: `bun typecheck` pass across shared/CLI/Web/Hub; `bun run test` → CLI 629 pass + 12 environment-gated skipped, TerminalManager 50 pass, Hub 374 pass, Web 562 pass; Playwright Chromium 2 pass; `git diff --check` pass.
- Security: opaque-session web terminal authentication replaces namespace JWT; targeted membership/Runner teardown is post-commit; effective session capability is server-owned; strict Origin/security-header/rate-limit boundary passes; remote diagnostic logs contain metadata only.
- Operations: single-instance SQLite WAL and encrypted backup/restore runbook documented. Restore execution remains pending because `age`/identity/backup artifact are unavailable.
- GitNexus: cumulative dirty tree remains CRITICAL (522 changed symbols, 136 affected, 71 indexed files). Full compile and Hub/data-plane coverage passed; broad baseline ownership and unindexed-new-symbol risk remain explicit.
- External gates: real Keycloak two-user flows, grant-expiry timing, Linux systemd enrollment with an approved profile, macOS LaunchAgent enrollment, offline revoke/reconnect, and encrypted restore drill remain pending.
- Realtime closure: REST, SSE and terminal use one effective-capability resolver; SSE filters every resource event and terminal input/output rechecks `operate`, safely detaching denied recipients without killing processes. Standalone Team Chat remains fail-closed. Member lifecycle audit/outbox, role-downgrade/proactive-expiry teardown and legacy shared-token fallback remain internal blockers, not manual-test substitutes.

## Checkpoint 2026-07-14 — Phase 4 enrollment credential core iteration 2

- Changed files: bounded shared enrollment contracts; active-claim/enrollment/credential/revoke persistence; issuance, lifecycle and authenticator services; enrollment REST boundary; narrow Hub composition; focused tests.
- Security results: fixed 15-minute server TTL; keyed hashes; plaintext returned once; exchange owner rechecked inside transaction; claims unique only while active and released on revoke while Runner/tombstone history remains; expected-generation CAS; wrong/rotated/revoked credentials fail closed; response schemas and sanitized unknown failures.
- Verification: iteration-2 review exact focused suite 27 pass/0 fail/84 assertions; Hub suite 338 pass/0 fail/7,782 assertions; Hub/all-workspace typecheck and `git diff --check` pass.
- Review hardening: real overlapping two-connection exchange winner; injected full rollback; bounded HTTP body/path and generation; `no-store` secret responses; composite Runner/org credential FK; retained profile and enrollment terminal history/status; archived revoke no mutation; issue/cancel lifecycle audit/outbox; bootstrap Runner audit actor; exact known-conflict classification.
- Root suite: `bun run test` stopped in unchanged CLI runner integration boundary: 623 pass, 12 `beforeEach` stopRunner timeouts; Hub was then run independently and passed fully.
- GitNexus: cumulative dirty-tree HIGH with 7 previously approved startup/config flows; narrow `main → startWebServer → createWebApp` Phase 4 composition compiled and passed assembly/Hub tests. New uncommitted Phase 4 symbols remain absent from graph.
- Scope retained: no `/cli`, Socket.IO, CLI profile/service, reconnect/cleanup protocol, transfer, or online disconnect changes.

## Checkpoint 2026-07-14

- Changed files: shared auth/enrollment contracts + tests; SharedHubStore + tests; AuthorizationService + tests; approved brief/spine/plan.
- Verification: `bun test shared/src/auth.test.ts shared/src/runnerEnrollment.test.ts hub/src/store/sharedHubStore.test.ts hub/src/auth/authorizationService.test.ts` → 10 pass, 0 fail.
- Verification: `bun run --cwd shared typecheck && bun run --cwd hub typecheck` → pass.
- Verification: `bun typecheck` → pass across shared/cli/web/hub.
- Verification: `bun run test` → failed in pre-existing CLI Runner integration boundary (624 pass, 11 fail); new core tests remain green.
- GitNexus: `Store` integration impact CRITICAL (11 direct callers, 7 flows), intentionally not edited; change detection risk low, no affected indexed flows; new files not yet present in prior index.
- Remaining risk: Hub startup still uses legacy Store/auth; no OIDC, routes, CLI enrollment, realtime enforcement, UI or manual platform/E2E validation.

## Checkpoint 2026-07-14 — Phase 1 services

- Changed files: `hub/src/store/sharedHubStore.ts`, its tests, `hub/src/application/authorizedMutationService.ts` and tests, phase spec/checklist.
- Verification: focused Hub tests → 11 pass, 0 fail; Hub typecheck pass; `git diff --check` pass.
- GitNexus: new uncommitted symbols unavailable to impact analyzer even after `npx gitnexus analyze` reported up-to-date; no legacy CRITICAL symbol edited. Change detection remains low risk/no indexed affected flows.
- Remaining risk: SharedHubStore/application service are not wired into Hub startup or transports; organization-context replacement therefore remains `in-progress`.

## Checkpoint 2026-07-14 — Phase 2 identity core

- Changed files: `hub/src/auth/oidcService.ts`, `identityService.ts`, `identityCrypto.ts`, tests, SharedHubStore identity/session primitives, phase spec/checklist.
- Verification: Phase 2 focused tests → 12 pass, 0 fail; combined current-core run → 18 pass, 0 fail; Hub typecheck pass; `git diff --check` pass.
- Security results: exact discovery issuer + HTTPS endpoints, PKCE S256, one-time state, nonce validation, `email_verified=true`, normalized invitation email, hash-only opaque session/CSRF storage.
- GitNexus: existing `constantTimeEquals` is CRITICAL and intentionally not edited; change detection low risk/no indexed flows. New uncommitted symbols remain absent from graph.
- Remaining risk: legacy auth routes/middleware/startup still active; no cookie attributes or real Keycloak/browser integration yet.

## Checkpoint 2026-07-14 — Phase 2 auth HTTP boundary

- Changed files: `hub/src/web/routes/sharedAuth.ts`, `hub/src/web/middleware/sharedAuth.ts`, Shared auth environment and tests, phase spec/checklist.
- Verification: route/middleware focused suite → 6 pass, 0 fail; combined identity+HTTP suite → 13 pass, 0 fail; Hub typecheck and `git diff --check` pass.
- Security results: `__Host-` cookies; session/invitation HttpOnly+Secure+SameSite=Lax; CSRF Secure+SameSite=Strict; mutation header validation; no-store; server-side logout revoke; no public signup.
- GitNexus: `createAuthRoutes`, `createAuthMiddleware`, `createWebApp` are each CRITICAL (7 flows) and were not edited in this compatibility-harness slice; change detection low/no indexed affected flow.
- Remaining risk: new boundary is not mounted; legacy token/Telegram browser auth still active until controlled server replacement.

## Checkpoint 2026-07-14 — Phase 2 server auth replacement

- Changed files: `hub/src/index.ts`, `hub/src/web/server.ts`, `sharedHubConfiguration.ts` + tests, server assembly test, shared auth environment/middleware, spec/checklist.
- Verification: server/config focused tests pass; Hub typecheck pass; full Hub suite → 300 pass, 0 fail; `git diff --check` pass.
- GitNexus: pre-edit `startWebServer`/`createWebApp` CRITICAL; post-edit detection HIGH with exactly 7 expected `main` startup/config flows. All d=1 caller changes compiled and Hub suite passed.
- Security result: legacy browser auth and bind routes unmounted; opaque cookie middleware protects non-auth API; CORS credentials enabled without Authorization header; startup/QR no longer expose CLI token.
- Remaining risk: Socket.IO still accepts namespace JWT and `/cli` still uses shared CLI token pending Runner credentials; legacy data routes temporarily receive `organizationId` through `namespace` bridge until Phase 5.

## Checkpoint 2026-07-14 — Adversarial auth review remediation

- Changed files: SharedHubStore/schema, authorization, identity/OIDC, auth routes, authorized mutation outbox, tests, approved implementation plan, review spec.
- Review result: 20/20 accepted findings patched; callback-bound invitation option implemented; no accepted finding deferred.
- Verification: adversarial regression suite → 32 pass, 0 fail; `bun typecheck` pass across all workspaces; `bun run test` pass; `git diff --check` pass.
- GitNexus: change detection HIGH with seven expected existing startup/config flows; new auth/store symbols remain absent from the prior index. Existing CRITICAL `main → startWebServer → createWebApp` boundary was previously warned and its d=1 integration surface compiles/tests cleanly.
- Remaining risk: manual Keycloak/browser pilot and Phase 4–6 enrollment/data-plane/UI work remain pending; review remediation itself is ready.

## Checkpoint 2026-07-14 — Phase 3 Teams and authorization

- Changed files: SharedHubStore Team/grant/session-projection persistence, authorization matrix, projection coordinator, Team authorization service/routes, startup/shutdown wiring, and focused tests.
- Verification: final exact six-file Phase 3 suite → 30 pass, 0 fail, 6,942 assertions; Hub suite → 327 pass, 0 fail; `bun typecheck`, full `bun run test`, and `git diff --check` pass.
- Security results: Viewer-owner lifecycle escalation closed; grants resolve live; stale/orphan session grants fail closed; causal reconcile prevents snapshot retirement from defeating post-subscribe events; equal-version retirement/rebind rules deterministic; projection retirement prevents session-ID grant inheritance; Admin-only stale revoke retained; archived/expired/inactive grant targets rejected; pending outbox preserved without a publisher; Team ownership edge contracts enforced.
- GitNexus: cumulative dirty-tree detection remains HIGH with the seven previously approved `main` startup/config flows; all existing direct callers compile and full suites pass. New Phase 3 symbols are absent from the prior graph index.
- Remaining risk: Phase 5 realtime/data-plane enforcement and proactive disconnect remain pending by design; manual browser/Keycloak E2E remains pending.

## Checkpoint 2026-07-14 — Phase 2 member management

- Changed files: `hub/src/store/sharedHubStore.ts` (listMemberships, findMembershipById, countActiveAdmins, updateMembershipRole, updateMembershipStatus), `hub/src/auth/identityService.ts` (listMembers, getMember, updateMemberRole, disableMember, enableMember, MemberServiceError), `hub/src/web/routes/sharedMembers.ts` (new routes + tests), `hub/src/web/routes/sharedAuth.ts` (widened IdentityBoundary), `hub/src/web/server.ts` (mount route), checklist.
- Verification: focused identity + route suite → 24 pass, 0 fail; `bun typecheck` all workspaces pass; full `bun run test` → 560 pass (91 files); `git diff --check` pass.
- Security results: admin-only routes; last-admin guard prevents self-demotion and self-disable when only one admin remains; idempotent status change rejects; non-active members cannot have role changed; MemberServiceError returns stable 400/403/404/409 responses.
- GitNexus: existing CRITICAL `main → startWebServer → createWebApp` contains 1 new member route mount line (compiles and full suite pass). New uncommitted symbols remain absent from graph index.
- Remaining risk: disable does not proactively invalidate existing browser sessions or close active Socket.IO streams — this is deferred to Phase 5 realtime enforcement.

## Checkpoint 2026-07-14 — Phase 4 Linux systemd installation

- Changed files: `cli/src/commands/runner.ts` (install/uninstall subcommands, --foreground flag, systemd unit generation).
- Verification: `bun typecheck` all workspaces pass; full `bun run test` → 560 pass (91 files); `git diff --check` pass.
- Implementation: `hapi runner install --profile <name>` creates `~/.config/systemd/user/hapi-runner-<name>.service` with `Environment=HAPI_HOME=<dir>`, `Restart=always`, `WantedBy=default.target`; calls `systemctl --user daemon-reload`, `enable`, `start`. `uninstall` stops/disables/removes unit file. `--foreground` flag on `start` runs the daemon in-process for systemd compatibility. Service line uses `getHappyCliCommand()` for correct binary/entrypoint resolution (compiled binary vs bun dev mode).
- Remaining risk: manual Linux systemd E2E and macOS LaunchAgent pending.

## Checkpoint 2026-07-14 — Phase 4 lifecycle: transfer, cleanup, list runners

- Changed files: `shared/src/runnerEnrollment.ts` (RunnerTransfer/Cleanup/List schemas), `hub/src/store/sharedHubStore.ts` (listRunners, transferRunnerOwnership, cleanupRunnerTombstone + AND cleanup_required=1 guard), `hub/src/application/runnerLifecycleService.ts` (list/transfer/cleanup methods with audit/outbox), `hub/src/web/routes/runnerEnrollments.ts` (GET /runners, POST /runners/:id/transfer, POST /runners/:id/cleanup), tests (+14 assertions across store/lifecycle/route suites).
- Verification: focused runner suite → 25 pass, 0 fail; full `bun run test` → 560 pass (91 files); `bun typecheck` all workspaces pass; `git diff --check` pass.
- Security results: transfer requires admin or current owner; same-owner/target-not-active/target-not-found rejected with stable errors; cleanup requires admin or runner owner, tombstone cleanup_required=1 guard prevents double-cleanup; list is admin-only; all mutations audit-logged and outbox-published; revoked runners can re-enroll via the existing issue+exchange flow since revoke clears active_claims.
- Remaining risk: manual E2E transfer/cleanup/re-enroll flows pending.
