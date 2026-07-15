---
title: 'Shared Hub Phase 3 Teams and authorization'
type: 'feature'
created: '2026-07-14'
status: 'done'
baseline_commit: 'c96229d5a11e2ed642c0c1c9b81419bae6570ee5'
context:
  - 'docs/superpowers/plans/2026-07-14-shared-hub-pilot-core-implementation-plan.md'
  - '_bmad-output/implementation-artifacts/shared-hub-pilot-core-checklist.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Shared Hub đã có schema Team/grant và policy kernel, nhưng chưa có application boundary hay REST API để quản trị Team, thành viên và quyền truy cập. Policy cũng chưa được chứng minh bằng ma trận đầy đủ, nên các sai lệch owner/manager/viewer hoặc quyền hết hạn có thể trở thành privilege escalation.

**Approach:** Hoàn thiện repository + service giao dịch cho lifecycle Team và grant, thêm session-security projection organization-scoped đồng bộ từ lifecycle session hiện hữu, cung cấp API dùng actor từ opaque session, và kiểm thử exhaustive action matrix. Mọi request resolve quyền trực tiếp từ DB để Team removal, archive, revoke hoặc expiry có hiệu lực ở request kế tiếp.

## Boundaries & Constraints

**Always:** organization scope ở mọi query/mutation; Admin quản trị Team toàn cục; Team owner quản trị membership của Team mình; Team archive chỉ Admin; capability cộng dồn `view → interact → spawn → operate → manage`; Viewer chỉ view; Runner owner có full Runner operations nhưng không có organization/member/Team authority; delegated `manage` không transfer/archive/revoke/rotate; mutation + audit + outbox cùng transaction; stable 400/403/404/409 errors; không trả secret/private path.

**Ask First:** thay đổi semantics Team Chat hiện hữu; sửa nội bộ `SyncEngine`, SSE, Socket.IO hoặc terminal registry ngoài public subscription seam; thay ownership Runner; mở rộng Team owner thành organization admin.

**Never:** dùng namespace làm ACL mới; cache effective grants qua mutation; cho session grant ngoài read-only; coi UI hiding là enforcement; đánh dấu realtime disconnect hoàn tất trong slice này.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Team lifecycle | Admin tạo/đổi tên/archive Team | mutation atomic + audit/outbox | duplicate name 409; archived Team immutable |
| Membership | Admin hoặc Team owner add/remove member | active Team membership thay đổi ngay | cross-org/unknown 404; last owner removal 409 |
| Grants | authorized manager tạo/revoke grant | effective source/expiry được resolve live | invalid capability/session write 400; unauthorized 403 |
| Session target | session projection gắn organization + active Runner | chỉ cho phép explicit read-only grant | unknown/cross-org/orphaned session 404 |
| Access loss | Team removal/archive/grant expiry | request kế tiếp không còn grant | fail closed |
| Viewer | Viewer không có explicit grant | metadata/session read được; mutation bị deny | 403 cho mutation |

</frozen-after-approval>

## Code Map

- `hub/src/store/sharedHubStore.ts` — Team, membership, grant repositories; session projection retirement; current-projection effective-grant resolution.
- `hub/src/application/sessionSecurityProjection.ts` — subscribe-before-reconcile coordinator với buffered replay, temporal ordering và idempotent lifecycle.
- `hub/src/application/teamAuthorizationService.ts` — application boundary authorize → mutate → audit → outbox.
- `hub/src/auth/authorizationService.ts` — action/capability policy kernel.
- `hub/src/web/routes/sharedTeams.ts` — Team/member/grant REST API mới.
- `hub/src/web/server.ts` — mount route qua opaque-session middleware hiện hữu.
- `shared/src/auth.ts` — runtime schemas/types cho request/response nếu cần dùng chung.

## Tasks & Acceptance

**Execution:**
- [x] `hub/src/store/sharedHubStore.ts` — thêm organization-scoped Team/member/grant reads; archived immutability; equivalent-grant conflict; atomic role/ownership operations; session projection upsert/retire và effective resolution chỉ qua current same-org projection + active Runner.
- [x] `hub/src/application/sessionSecurityProjection.ts` — subscribe trước reconcile, buffer event trong reconcile, replay theo temporal order; `start/stop` idempotent; upsert/remove identifiers-only; retirement transactionally retire/delete mọi session grant trước khi projection biến mất.
- [x] `hub/src/application/teamAuthorizationService.ts` — orchestration authorize → mutate → audit → outbox; authorize-before-existence; Admin được revoke stale grant dù resource/projection/Runner đã inactive; ownership transfer xử lý same-source-target, inactive target và target đã là owner.
- [x] `hub/src/web/routes/sharedTeams.ts` — REST endpoints validated bằng Zod, actor lấy từ `SharedWebAppEnv`, stable errors.
- [x] `hub/src/web/server.ts` — inject SharedHub dependencies và mount routes sau shared-auth middleware; startup/shutdown projection lifecycle không race.
- [x] `hub/src/auth/authorizationService.test.ts` — Cartesian role × ownership × none/direct/Team capability × action × expiry × disabled matrix.
- [x] Store/projection/service/route/server tests — cover temporal reconcile race, replay ordering/idempotency, grant retirement/ID reuse, lifecycle, cross-org, duplicate, archive, ownership edge cases, stale Admin revoke và immediate access loss.
- [x] Checklist — cập nhật evidence chỉ sau verification.

**Acceptance Criteria:**
- Given Admin, when tạo Team và thêm owner/member, then state, audit và outbox commit cùng nhau.
- Given Team owner, when quản trị membership Team mình, then được phép; archive Team hoặc quản trị Team khác bị từ chối.
- Given delegated Runner manager, when grant access, then được phép manage grant; transfer/archive/revoke/credential rotation vẫn bị từ chối.
- Given Team grant, when membership bị remove, Team archive hoặc grant hết hạn, then effective resolution kế tiếp trả no access.
- Given session unknown, cross-org hoặc không gắn active Runner, when tạo session grant, then fail closed 404 và không audit-success/outbox.
- Given mọi role/action trong contract, when chạy matrix, then kết quả đúng permission matrix không có action rơi vào implicit allow.

## Spec Change Log

- 2026-07-14: acceptance review phát hiện session grant không thể validate organization/resource bằng persistence hiện tại. Human chọn mở rộng Phase 3 với session security projection (option 2). Spec thêm projection lifecycle, active-Runner binding và 404 contract; tránh phantom/cross-org session grants. KEEP: Team lifecycle transaction, stable errors, live DB resolution, Phase 5 realtime disconnect boundary.
- 2026-07-14: edge-case review phát hiện reconcile có lost-update window, projection removal để lại grant mồ côi/ID-reuse, ownership transfer thiếu edge semantics và Admin không revoke được stale grant. Tasks/Design Notes bổ sung subscribe-before-reconcile + buffered temporal replay + idempotent lifecycle; transactional projection/grant retirement và current-projection resolution; explicit same-source-target/inactive/existing-owner transfer; Admin stale-grant revoke. Known-bad state cần tránh: snapshot reconcile ghi đè event mới hơn hoặc grant cũ sống lại khi session ID tái sử dụng. KEEP: identifiers-only projection, archived immutability, atomic role transfer, duplicate conflict, authorization-before-existence, Cartesian matrix, narrow server mount.

## Design Notes

REST slice chỉ quản trị Shared Hub control-plane entities; không đổi behavior các route session/machine legacy. Projection phải đăng ký public `SyncEngine.subscribe()` trước khi đọc snapshot legacy. Event đến trong reconcile được buffer, sau snapshot được replay theo `(event timestamp, arrival sequence)`; stale upsert không được thắng newer remove/update. `start()` gọi lặp không tạo subscription/reconcile thứ hai; `stop()` gọi lặp an toàn và event sau stop không mutate.

Projection chỉ lưu security identifiers, không payload/path/message. Remove/orphan/rebind phải chạy một transaction retire hoặc delete mọi session-level grant rồi mới remove/replace projection. Effective session grants chỉ hợp lệ khi query hiện tại join đúng `(session, organization, Runner active)`; grant mồ côi không được sống lại nếu session ID tái sử dụng. Admin có thể revoke stale grant bằng grant record organization-scoped dù projection hoặc Runner đã inactive; non-Admin vẫn fail closed và không được dùng stale grant để authorize.

Ownership transfer là một transaction: source và target khác nhau; source là active owner; target là active Team member. Same-source-target trả stable 400; inactive/unknown target trả 404; target đã owner trả 409 hoặc idempotent success theo một contract duy nhất được test (chọn 409 để tránh mutation/audit giả). Không có thời điểm Team mất owner. Immediate access loss trong slice này nghĩa là live authorization ở request kế tiếp; proactive transport disconnect vẫn thuộc Phase 5.

## Verification

**Commands:**
- `bun test hub/src/auth/authorizationService.test.ts hub/src/store/sharedHubStore.test.ts hub/src/application/sessionSecurityProjection.test.ts hub/src/application/teamAuthorizationService.test.ts hub/src/web/routes/sharedTeams.test.ts hub/src/web/server.sharedAuth.test.ts` — exact focused suite pass.
- `bun typecheck` — bốn workspace pass.
- `bun run test` — full repository suite pass.
- `git diff --check` — không có whitespace error.
- GitNexus change detection — affected flows đúng phạm vi và mọi d=1 dependent được xử lý.

**Iteration 3 final evidence (2026-07-14):** exact focused suite 30 pass / 0 fail / 6,942 assertions; Hub suite 327 pass / 0 fail; workspace typecheck, full repository suite, and diff check pass. Review auto-fixes cover causal post-subscribe replay, deterministic equal-version tombstone/rebind handling, explicit-remove-only retirement, pending outbox without publisher, archived/expired/inactive grant rejection, and Team-owner own-source transfer. GitNexus cumulative dirty-tree detection: HIGH, seven previously approved `main` startup/config flows; direct callers compile and pass.

## Suggested Review Order

**Entry point and composition**

- Starts projection only after SyncEngine exists and owns shutdown ordering.
  [`index.ts:224`](../../hub/src/index.ts#L224)

- Mounts Team/grant APIs behind opaque-session authentication.
  [`server.ts:62`](../../hub/src/web/server.ts#L62)

**Session security projection**

- Subscribes before reconcile and buffers concurrent lifecycle events.
  [`sessionSecurityProjection.ts:35`](../../hub/src/application/sessionSecurityProjection.ts#L35)

- Resolves session grants only through current active-Runner projection.
  [`sharedHubStore.ts:149`](../../hub/src/store/sharedHubStore.ts#L149)

- Retires projections and session grants atomically with tombstone ordering.
  [`sharedHubStore.ts:196`](../../hub/src/store/sharedHubStore.ts#L196)

**Team and grant policy**

- Centralizes Team lifecycle and resource-grant transaction orchestration.
  [`teamAuthorizationService.ts:19`](../../hub/src/application/teamAuthorizationService.ts#L19)

- Guards ownership transfer and stale-grant cleanup semantics.
  [`teamAuthorizationService.ts:95`](../../hub/src/application/teamAuthorizationService.ts#L95)

- Validates stable REST errors using authenticated actor context.
  [`sharedTeams.ts:22`](../../hub/src/web/routes/sharedTeams.ts#L22)

**Verification**

- Exercises the full role, ownership, capability, expiry and status matrix.
  [`authorizationService.test.ts:34`](../../hub/src/auth/authorizationService.test.ts#L34)
