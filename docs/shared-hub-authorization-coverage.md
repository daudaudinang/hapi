# Shared Hub authorization coverage

Generated/reconciled: 2026-07-16. Release evidence must rerun the linked tests from the release commit.

Unmapped operations fail closed. Browser routes use the opaque Shared Hub session middleware; `/cli` routes and `/cli` Socket.IO accept only a machine-bound Runner credential. Cross-organization resources return 404 at browser resource boundaries; authenticated same-organization capability denial returns 403.

| Surface | Operations | Capability / authority | Enforcement | Denial evidence |
|---|---|---|---|---|
| Browser auth | `/auth/login`, callback, session, logout | OIDC state/nonce; active membership; CSRF on mutation | `sharedAuth.ts`, `sharedAuth.ts` middleware | `sharedAuth.test.ts`, `sharedAuth.test.ts` middleware |
| Runner enrollment | exchange; issue/list/cancel; rotate/revoke/transfer/cleanup | one-time code for exchange; Admin or Runner owner lifecycle rules; atomic sanitized audit/outbox | `runnerEnrollments.ts`, lifecycle services | `runnerEnrollments.test.ts`, `runnerCredentialMachineAcceptance.test.ts`, `lifecycleAudit.test.ts` |
| CLI REST machine | create/read machine | valid active Runner credential bound to header/body machine | `cli.ts` | `cliRunnerAuth.test.ts`, `runnerCredentialMachineAcceptance.test.ts` |
| CLI REST session | create/read/messages/report/no-action | valid active Runner; machine-bound create; current Runner/session projection on existing session | `cli.ts` | `cliTeamReports.test.ts` plus Runner auth tests |
| Session collections/detail | list/detail | `view` | `sessions.ts` resolver before store exposure | `restCapability.test.ts`, `restCapability.integration.test.ts` |
| Session interaction | messages, resume, upload/delete, abort, switch, permission/model/collaboration/effort mutations | `interact`; resume additionally `spawn`; destructive/host operations `operate` | `messages.ts`, `sessions.ts`, `permissions.ts` | REST capability tests assert denial before engine/RPC |
| Session administration | rename, archive/delete, archive-all/delete-archived | `manage` | `sessions.ts` | `sessions.test.ts`, REST capability tests |
| Machine reads/spawn | list, models, directory/path queries; spawn | `view`; spawn requires `spawn` | `machines.ts` | `machines.test.ts` |
| Editor/files | directory/file/projects/status/diff; write/create/delete | `view`; mutations `operate` | `editor.ts` before RPC | `restCapability.test.ts`, `client.editor.test.ts` |
| Git | status/diff/file/branches/stash list; stage/commit/pull/push/checkout/create/fetch/discard/stash mutation | `view`; mutations `operate` | `git.ts`, `editor.ts` before RPC | `restCapability.test.ts`, RPC editor tests |
| Permissions | approve/deny | `interact` | `permissions.ts` before engine mutation | `restCapability.test.ts` |
| SSE | `/events` selection and each delivery; visibility | per-resource `view`, rechecked at delivery | `events.ts`, `sseManager.ts` | `sseManager.test.ts` |
| Terminal browser Socket.IO | subscribe/list | `view` plus active session | `terminal.ts` | `terminal.test.ts` |
| Terminal control Socket.IO | create/write/resize/close/keepalive | `operate`, rechecked before control | `terminal.ts` | `terminal.test.ts` includes expiry/no-forward assertions |
| CLI Socket.IO machine | machine alive/metadata/state | machine-scoped Runner credential bound to Runner machine | `server.ts`, `machineHandlers.ts` | `runnerPrincipal.test.ts` |
| CLI Socket.IO session | message/state/alive/end, RPC registration, terminal output | session-scoped Runner credential bound to active Runner/session projection | `server.ts`, CLI handlers | `runnerPrincipal.test.ts`, CLI handler tests |
| RPC gateway | editor/files/Git/session control/permission side effects | route or terminal capability check occurs before gateway call | REST routes, terminal handlers | REST capability and terminal denial tests |
| Teams/grants/audit | Team/member/ownership/archive; grant create/list/revoke; audit list | Admin or Team/resource manager; audit/list-all Admin; atomic sanitized audit/outbox | `sharedTeams.ts`, `TeamAuthorizationService` | `sharedTeams.test.ts`, `teamAuthorizationService.test.ts`, `lifecycleAudit.test.ts` |
| Member/invitation lifecycle | member list/detail/role/status; invitation issue/list/cancel/claim | Admin for management; last-Admin protection; invitation bearer only at claim; atomic sanitized audit/outbox | `sharedMembers.ts`, `IdentityService` transaction | `sharedMembers.test.ts`, `identityService.test.ts`, `lifecycleAudit.test.ts` |
| Lifecycle outbox delivery | pending Team/member/grant/invitation/Runner events; startup recovery; retry | ordered at-least-once dispatch; admin-only organization SSE invalidation; stable event id | `OutboxDispatcher`, `SSEManager`, Hub startup | `outboxDispatcher.test.ts`, `sseManager.test.ts` |
| Team Chat | list/read/post/archive/participants/reports/mentions | Locked policy: active Admin/owner=`manage`; active user participant=`interact`; capability checked per request/delivery; session reports also require source-session `interact` | `teamChatAuthorization.ts`, `teamChats.ts`, `events.ts`, `sseManager.ts`; ownership persisted by schema v11 | `teamChats.test.ts`, `sseManager.test.ts`, `teamChatService.test.ts`, `migration-v11.test.ts`; production-like multi-user fixture still pending |
| Push/voice | subscription/token | active organization session; provider policy | `push.ts`, `voice.ts` | package tests |

## Reconciled gap

The earlier Phase 5 claim that authorization was complete was false for Team Chat. The authoritative ownership, participant, capability, delivery, status-code, and denial-side-effect policy is locked in [`shared-hub-shipping-plan.md`](./shared-hub-shipping-plan.md#locked-team-chat-authorization-policy). Dirty-tree implementation now enforces it for REST, SSE, mentions, reports, and active session delivery, including denial-before-side-effect tests. Release-commit and production-like multi-user evidence remain required before this row is complete.

Dead legacy route modules (`auth.ts`, `bind.ts`) are not mounted by `createWebApp`; they still must be deleted with the remaining shared-token configuration and CLI login UX to satisfy the production search gate.
