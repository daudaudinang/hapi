---
title: 'Shared Hub realtime capability enforcement'
type: 'feature'
created: '2026-07-15'
status: 'done'
baseline_commit: 'c96229d5a11e2ed642c0c1c9b81419bae6570ee5'
context:
  - '_bmad-output/planning-artifacts/architecture/architecture-hapi-shared-hub-2026-07-13/ARCHITECTURE-SPINE.md'
  - '_bmad-output/implementation-artifacts/spec-shared-hub-rest-capability-enforcement.md'
  - '_bmad-output/implementation-artifacts/shared-hub-pilot-core-checklist.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** SSE và web terminal/Socket.IO hiện xác thực user nhưng chủ yếu authorize theo organization namespace. `all` SSE có thể nhận event của tài nguyên không được grant, còn terminal room có thể phát output hoặc nhận control từ user chỉ có `view`.

**Approach:** Dùng cùng production capability resolver như REST tại lúc subscribe/join, mỗi event/output và mỗi terminal control. SSE chỉ giao event `view`-authorized; terminal yêu cầu `operate`; capability được tính lại theo live grants/expiry trước mọi data delivery hoặc side effect.

## Boundaries & Constraints

**Always:** Admin/owner/direct/Team/Viewer/expiry/session-read-only phải cho cùng kết quả với REST; SSE `all` là dynamic authorized projection, không phải organization wildcard; nested toast dùng `data.sessionId`; unmapped Team Chat events fail closed; terminal input và CLI→web output đều re-authorize; denial phải detach attachment/leave room mà không kill agent hoặc terminal process; unrelated actor/resource vẫn hoạt động.

**Ask First:** Thay đổi approved capability matrix; tạo Team Chat resource policy; kill CLI terminal process khi human mất quyền; thêm production dependency hoặc persistent scheduler.

**Never:** Dùng namespace equality thay cho capability; tin room membership như authorization lâu dài; broadcast raw output organization-wide; cache capability qua nhiều events; mở rộng sang member audit, legacy CLI auth, REST hoặc Admin UI.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Scoped SSE | Viewer/direct/session-view subscribe Session | Kết nối và nhận event của Session đó | Missing/expired/cross-org bị 403/404 trước stream |
| SSE all | Member có grant trên subset | Chỉ nhận session/machine/toast thuộc subset | Team/unmapped event bị drop |
| Midstream expiry | Grant hết hạn giữa hai events | Event sau không được giao | Stream có thể tồn tại nhưng không rò data |
| Terminal open | Actor có `operate` trên Session/Runner | Subscribe/list/create/control/output hoạt động | `view`/read-only bị deny trước CLI emit |
| Mixed room | Hai sockets, chỉ một còn `operate` | Output chỉ tới socket còn quyền | Socket mất quyền rời room, attachment detach |
| Revoke/removal | Access-loss commit | Affected attachment mất quyền; unrelated socket giữ nguyên | Không terminate agent/terminal process |

</frozen-after-approval>

## Code Map

- `hub/src/web/routes/guards.ts`, `hub/src/web/server.ts` -- production resolver hiện dùng cho REST cần được tổng quát hóa/reuse.
- `hub/src/web/routes/events.ts` -- validate SSE selector và tạo per-connection authorization predicate.
- `hub/src/sse/sseManager.ts` -- selector matching, event-resource mapping và delivery filter.
- `hub/src/socket/server.ts` -- opaque-session subject và resolver injection vào terminal namespaces.
- `hub/src/socket/handlers/terminal.ts` -- web terminal subscribe/list/create/control authorization.
- `hub/src/socket/handlers/cli/terminalHandlers.ts` -- CLI output/list/warning delivery cần per-recipient authorization.
- `hub/src/socket/handlers/cli/index.ts` -- CLI terminal dependency composition.
- `hub/src/index.ts` -- Hub composition với `TeamAuthorizationService`.

## Tasks & Acceptance

**Execution:**
- [x] Extract/generalize production resource capability resolver without duplicating policy or changing REST behavior.
- [x] `events.ts` + `sseManager.ts` -- authorize selectors and every delivery; map session/machine/nested-toast; fail closed for Team events.
- [x] `socket/server.ts` + web terminal handlers -- inject subject-aware resolver; require live `operate` for every scope/control.
- [x] CLI terminal handlers -- replace unfiltered room broadcast with per-recipient authorization; detach/evict denied recipients safely.
- [x] Tests -- production-wired Admin/owner/Viewer/direct/Team/read-only/expiry matrix; mixed rooms; deny-before-CLI; unrelated recipient isolation.
- [x] Checklist -- record evidence while retaining `not-ready` for remaining internal/manual gates.

**Acceptance Criteria:**
- Given the same actor/resource state, when REST, SSE, or terminal asks for access, all use the same live effective capability result.
- Given an `all` SSE stream, when events for granted and ungranted resources broadcast, only granted `view` events arrive.
- Given terminal access expires or is revoked, when the next input or output occurs, no data/side effect crosses the boundary and attachment is detached without killing the process.
- Given a mixed terminal room, when one membership loses access, the other continues receiving output without reconnect.

## Spec Change Log

- 2026-07-15: Centralized resource resolver reused by REST/SSE/terminal; live delivery/control checks, safe detach, Team fail-closed and mixed-recipient regressions implemented.
- 2026-07-15 review: fixed SSE message authorization bypass, room-emit TOCTOU, denied cleanup room retention, and stale role/status resolution; preserved fail-closed Team behavior and non-destructive detach.

## Design Notes

SSE keeps transport selection separate from policy: route supplies a synchronous event predicate closing over authenticated subject and live resolver. Terminal rooms remain routing indexes only; CLI output iterates recipients and rechecks `operate` before emit. Re-evaluation on every observable input/output means expiry cannot leak subsequent data even if an idle socket remains connected.

## Verification

**Commands:**
- Focused Hub SSE/terminal/composition tests -- capability matrix and mixed-recipient cases pass.
- `bun typecheck` -- all workspaces compile.
- `bun run test` -- full CLI/Hub/Web suites pass.
- `git diff --check` -- clean patch.
- GitNexus impact before edits and detect-changes after final edits -- critical flows reviewed.

**Result:** post-review realtime matrix 57 pass, 0 fail, 168 assertions; shared/CLI/Web/Hub typecheck pass; CLI 629 pass + 12 environment-gated skips; TerminalManager 50 pass; Hub 388 pass; Web 562 pass with `maxWorkers=2`; `git diff --check` pass. GitNexus cumulative dirty tree remains CRITICAL (522 changed symbols, 136 affected symbols, 71 indexed files).

## Suggested Review Order

**Shared live policy**

- Start with the single resolver that refreshes membership role and status.
  [`resourceCapability.ts:22`](../../hub/src/auth/resourceCapability.ts#L22)

- Membership lookup prevents stale role or disabled-state authorization.
  [`teamAuthorizationService.ts:28`](../../hub/src/application/teamAuthorizationService.ts#L28)

**SSE projection**

- Route preflights selectors and closes each stream over live authorization.
  [`events.ts:36`](../../hub/src/web/routes/events.ts#L36)

- Delivery maps resources, rechecks messages, and fails closed for Team events.
  [`sseManager.ts:185`](../../hub/src/sse/sseManager.ts#L185)

**Terminal input and output**

- Web controls require live operate and safely detach denied attachments.
  [`terminal.ts:56`](../../hub/src/socket/handlers/terminal.ts#L56)

- CLI output authorizes and emits directly to each current recipient.
  [`terminalHandlers.ts:78`](../../hub/src/socket/handlers/cli/terminalHandlers.ts#L78)

- Disconnect cleanup removes denied recipients from stale rooms.
  [`terminalHandlers.ts:229`](../../hub/src/socket/handlers/cli/terminalHandlers.ts#L229)

**Composition and evidence**

- Socket composition injects the same resolver into both directions.
  [`server.ts:163`](../../hub/src/socket/server.ts#L163)

- Dynamic SSE and message-expiry regressions cover fail-closed delivery.
  [`sseManager.test.ts:156`](../../hub/src/sse/sseManager.test.ts#L156)

- Mixed-room regression proves unrelated recipients continue without reconnect.
  [`terminalHandlers.test.ts:714`](../../hub/src/socket/handlers/cli/terminalHandlers.test.ts#L714)
