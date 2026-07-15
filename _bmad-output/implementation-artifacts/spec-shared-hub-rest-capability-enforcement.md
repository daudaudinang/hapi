---
title: 'Shared Hub REST capability enforcement'
type: 'feature'
created: '2026-07-15'
status: 'done'
baseline_commit: 'c96229d5a11e2ed642c0c1c9b81419bae6570ee5'
context:
  - '_bmad-output/planning-artifacts/architecture/architecture-hapi-shared-hub-2026-07-13/ARCHITECTURE-SPINE.md'
  - '_bmad-output/implementation-artifacts/shared-hub-pilot-core-checklist.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Shared Hub REST hiện chỉ kiểm tra cùng organization ở nhiều route. Member hoặc Viewer không có grant vẫn có thể liệt kê tài nguyên, đọc message/file, hoặc gọi mutation/RPC trên Session và Runner không thuộc quyền của họ.

**Approach:** Đưa một capability resolver do server sở hữu vào REST boundary, ánh xạ từng operation sang capability `view`, `interact`, `spawn`, `operate`, hoặc `manage`, lọc collection theo quyền hiệu lực, và từ chối trước khi đọc dữ liệu hoặc route RPC.

## Boundaries & Constraints

**Always:** Admin và owner giữ full access; Viewer bị hard-cap ở `view`; direct/Team grant cộng dồn và expiry được đánh giá tại thời điểm request; session read-only chỉ cho `view`; organization mismatch fail closed; mọi route dùng cùng resolver thay vì tự suy luận role.

**Ask First:** Thay đổi permission matrix đã duyệt; thêm resource/grant model mới; quyết định quyền người dùng cho standalone Team Chat vì hiện chưa có approved human Team Chat resource mapping.

**Never:** Dùng organization membership như resource authorization; dựa vào UI để chặn mutation; mở rộng sang SSE/Socket.IO/terminal, lifecycle audit, hoặc xóa legacy CLI auth trong story này; làm lộ sự tồn tại tài nguyên cross-organization.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Collection | Member có grant trên một số Runner | Chỉ trả machines/sessions mà capability khác null | Không lộ ID/metadata tài nguyên khác |
| Read | Viewer hoặc session read-only | Đọc session, messages, files, Git read được | Mutation trả 403 |
| Interact | Member có `interact` | Gửi message và trả lời permission được | `view` trả 403 trước side effect |
| Spawn | Member có `spawn` trên Runner | Tạo/resume session trên Runner đó | Grant expired/missing trả 403 |
| Operate | Member có `operate` | Editor/file/Git-write/session-control RPC được | Capability thấp hơn trả 403 |
| Expiry | Grant hết hạn giữa hai request | Request sau bị từ chối ngay | Không dùng capability cache phía client |

</frozen-after-approval>

## Code Map

- `hub/src/application/teamAuthorizationService.ts` -- nguồn effective capability cho Runner/Session.
- `hub/src/web/routes/guards.ts` -- REST guard chung cần nhận subject và required capability.
- `hub/src/web/server.ts` -- composition/injection resolver vào route factories.
- `hub/src/web/routes/sessions.ts` -- collection, detail và session-control actions.
- `hub/src/web/routes/messages.ts` -- `view`/`interact` boundary.
- `hub/src/web/routes/machines.ts` -- collection, `spawn`, read/operate machine RPC.
- `hub/src/web/routes/editor.ts` -- editor/file/Git read-vs-write mapping.
- `hub/src/web/routes/git.ts`, `permissions.ts` -- session-backed read/interact enforcement.

## Tasks & Acceptance

**Execution:**
- [x] `hub/src/web/routes/guards.ts` -- thêm subject-aware capability guard và rank comparison; giữ organization existence check riêng.
- [x] `hub/src/web/server.ts` -- inject một resolver adapter từ `TeamAuthorizationService` vào mọi runner/session-backed REST factory.
- [x] `hub/src/web/routes/sessions.ts`, `messages.ts`, `machines.ts` -- lọc collections và enforce view/interact/spawn/operate trước side effect.
- [x] `hub/src/web/routes/editor.ts`, `git.ts`, `permissions.ts` -- enforce action-specific capability trước RPC/read/write.
- [x] Route tests -- phủ Admin, owner, Viewer, direct grant, Team grant, read-only session, expired grant, ungranted và cross-org denial.
- [x] Checklist -- cập nhật evidence nhưng giữ `not-ready` cho realtime và các gate còn lại.

**Acceptance Criteria:**
- Given hai member cùng organization nhưng chỉ một người có grant, khi gọi mọi REST route trong scope, chỉ member được grant thấy hoặc thao tác tài nguyên.
- Given cùng actor/resource state, khi gọi collection, detail và mutation, capability decision nhất quán với `TeamAuthorizationService.resolveEffectiveCapability`.
- Given request bị deny, khi handler kết thúc, không có engine mutation/RPC nào được gọi.
- Given Viewer hoặc session read-only grant, khi gửi message, spawn, editor write, Git write hoặc session control, Hub trả 403.

## Spec Change Log

- 2026-07-15: Implemented centralized capability rank guard, machine-to-Runner resolution, route-specific enforcement and collection filtering. Added side-effect denial and cross-organization non-disclosure tests. Standalone Team Chat remains out of scope as approved.
- 2026-07-15 review: required `spawn` before inactive-message auto-resume, moved capability denial before active-state disclosure, made bulk controls atomic across visible resources, and added a real SharedHubStore/AuthorizationService/TeamAuthorizationService route matrix using the exact production resolver.

## Design Notes

Route guard nhận required capability thay vì action string để giữ mapping HTTP operation gần route; resolver server vẫn là nguồn duy nhất tính owner/Admin/Viewer/direct/Team/expiry. Standalone Team Chat bị loại khỏi scope cho đến khi human actor được ánh xạ rõ vào Team Chat resource; các `/sessions/:id/team-*` vẫn phải dùng session capability khi story Team Chat được chốt.

## Verification

**Commands:**
- `bun run --cwd hub test` -- 383 pass, 0 fail, gồm adversarial REST matrix và production-wired resolver matrix mới.
- `bun typecheck` -- pass cả bốn workspace.
- `bun run test` -- CLI 629 pass + 12 environment-gated skipped; TerminalManager 50 pass; Hub 381 pass; Web 562 pass.
- `git diff --check` -- pass.
- GitNexus impact trước edit và detect-changes sau edit -- các factory/guard HIGH/CRITICAL đã được cảnh báo; cumulative dirty tree CRITICAL, 423 changed symbols, 130 affected symbols, 65 indexed files.

## Suggested Review Order

**Composition và policy source**

- Production adapter binds every REST decision to the live authorization service.
  [`server.ts:45`](../../hub/src/web/server.ts#L45)

- Machine identity maps to its security-owned Runner before capability resolution.
  [`teamAuthorizationService.ts:93`](../../hub/src/application/teamAuthorizationService.ts#L93)

- Active machine projection lookup fails closed across organization boundaries.
  [`sharedHubStore.ts:251`](../../hub/src/store/sharedHubStore.ts#L251)

**Shared guard và action mapping**

- One capability lattice compares authenticated subject access against route requirements.
  [`guards.ts:6`](../../hub/src/web/routes/guards.ts#L6)

- Session capability denial precedes active-state disclosure and handler side effects.
  [`guards.ts:53`](../../hub/src/web/routes/guards.ts#L53)

- Collections filter hidden sessions while bulk controls remain atomic across visible resources.
  [`sessions.ts:87`](../../hub/src/web/routes/sessions.ts#L87)

- Inactive message auto-resume requires spawn beyond ordinary interact permission.
  [`messages.ts:84`](../../hub/src/web/routes/messages.ts#L84)

- Editor middleware centralizes view-versus-operate classification for every RPC path.
  [`editor.ts:46`](../../hub/src/web/routes/editor.ts#L46)

**Verification**

- Real store/service matrix proves Admin, owner, Viewer, direct, Team, expiry and read-only behavior.
  [`restCapability.integration.test.ts:57`](../../hub/src/web/routes/restCapability.integration.test.ts#L57)
