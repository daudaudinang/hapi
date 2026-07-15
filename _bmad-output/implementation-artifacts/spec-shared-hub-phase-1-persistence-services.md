---
title: 'Shared Hub Phase 1 persistence services'
type: 'feature'
created: '2026-07-14'
status: 'done'
context:
  - 'docs/superpowers/plans/2026-07-14-shared-hub-pilot-core-implementation-plan.md'
  - '_bmad-output/implementation-artifacts/shared-hub-pilot-core-checklist.md'
---

<frozen-after-approval reason="human-owned intent — continuation explicitly approved by 'Do the next step'">

## Intent

**Problem:** Shared Hub schema và authorization kernel đã tồn tại nhưng runtime machine chưa được ràng buộc 1:1 với Runner, repository vẫn thiếu organization-scoped reads, và chưa có transaction boundary đảm bảo mutation/audit/publish đúng thứ tự.

**Approach:** Mở rộng SharedHubStore thành persistence boundary riêng, thêm Runner-machine projection và effective-grant resolution, rồi thêm application transaction service chỉ publish sau commit thành công.

## Boundaries & Constraints

**Always:** fresh Shared Hub database; organization scope trên mọi lookup; một machine ID chỉ thuộc một Runner; session grant chỉ view; authorize trước mutation; audit cùng transaction; publish sau commit; không log secret/payload riêng tư.

**Ask First:** thay constructor/API của legacy `Store` hoặc `MachineStore`; bất kỳ edit GitNexus HIGH/CRITICAL ngoài additive compatibility.

**Never:** migrate database legacy; dùng namespace làm ACL; publish trước commit; sửa lifecycle terminal/Runner hiện hữu; đánh dấu integration vào startup hoàn tất khi chưa thực hiện.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Project Runner | Runner mới + machine ID chưa dùng | Runner và machine projection tạo atomic | duplicate machine rollback toàn bộ |
| Scoped lookup | Resource khác organization | Không trả resource | fail closed/null |
| Grant resolution | direct + active Team grants | capability hiệu lực cao nhất, giữ nguồn | bỏ expired/archived Team |
| Mutation | authorized mutation + audit | commit cả hai rồi publish một event | mutation/audit lỗi: rollback, không publish |
| Denied mutation | policy deny | không mutation/audit-success/publish | typed authorization error |

</frozen-after-approval>

## Code Map

- `hub/src/store/sharedHubStore.ts` — schema và Shared Hub repositories hiện tại.
- `hub/src/auth/authorizationService.ts` — capability policy kernel.
- `hub/src/store/machineStore.ts` — legacy runtime projection; không sửa trong slice này vì blast radius.
- `hub/src/application/authorizedMutationService.ts` — transaction orchestration mới.

## Tasks & Acceptance

**Execution:**
- [x] `hub/src/store/sharedHubStore.ts` — thêm machine projection table, organization-scoped Runner/grant APIs và public transaction primitive.
- [x] `hub/src/application/authorizedMutationService.ts` — enforce authorize → mutate → audit → publish.
- [x] `hub/src/store/sharedHubStore.test.ts` — test one-to-one projection, organization isolation, dynamic Team grants và rollback.
- [x] `hub/src/application/authorizedMutationService.test.ts` — test ordering, denial và no-publish-on-failure.
- [x] Checklist — cập nhật evidence ngay sau verification.

**Acceptance Criteria:**
- Given một machine đã project vào Runner A, when Runner B dùng cùng machine ID, then transaction thất bại và không tạo Runner B.
- Given membership thuộc organization B, when lookup Runner organization A, then không thấy Runner.
- Given direct và Team grants còn hạn, when resolve, then trả grants hợp lệ; archived Team/expired grant bị loại.
- Given audit insert thất bại, when authorized mutation chạy, then mutation rollback và event không publish.

## Spec Change Log

- 2026-07-14: implementation matched frozen intent; no spec correction required.

## Design Notes

Không nối vào legacy `Store` trong slice này: GitNexus đánh giá class đó CRITICAL. SharedHubStore sở hữu DB transaction, còn publisher nằm ngoài transaction và chỉ nhận sanitized committed event.

## Verification

**Commands:**
- `bun test hub/src/store/sharedHubStore.test.ts hub/src/application/authorizedMutationService.test.ts hub/src/auth/authorizationService.test.ts` — tất cả pass.
- `bun run --cwd hub typecheck` — pass.
- `git diff --check` — pass.
- GitNexus change detection — scope phù hợp, không bỏ qua HIGH/CRITICAL.
