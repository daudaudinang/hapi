---
title: 'Shared Hub Phase 4 enrollment and credential core'
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

**Problem:** Shared Hub chỉ có hash-only enrollment persistence primitive; chưa thể phát code 15 phút, exchange atomic thành Runner credential, rotate hoặc revoke credential. Vì vậy Runner vẫn phụ thuộc shared CLI token và chưa có identity riêng để dùng cho các phase transport tiếp theo.

**Approach:** Thêm application boundary cho issuance/exchange/rotation/revocation, lưu enrollment code và Runner secret bằng keyed hash, trả plaintext đúng một lần, expose REST endpoints với stable errors, và chứng minh concurrency/rollback/redaction bằng tests. Slice này tạo credential core nhưng chưa thay Socket.IO/CLI authentication hoặc cài profile/service.

## Boundaries & Constraints

**Always:** enrollment TTL chính xác 15 phút do server quyết định; code/secret entropy cao; keyed hash-at-rest; plaintext chỉ ở response tạo/exchange/rotate; exchange là một transaction consume → Runner projection → credential → audit/outbox; đúng một concurrent winner; Runner credential gắn Runner và machine; rotation không có credential gap và old secret bị vô hiệu ngay sau commit; revoke đánh Runner revoked, revoke mọi credential, tạo tombstone, retire grants/session projections, audit/outbox; stable 400/403/404/409; không log/audit code, secret, command hoặc private path.

**Ask First:** thay `/cli` hoặc Socket.IO shared-token authentication; sửa CLI profile/config; cleanup-only reconnect protocol; transfer Runner ownership; online disconnect.

**Never:** client chọn expiry; lưu plaintext/reversible secret; re-return secret cho consumed code; dùng namespace làm Runner identity; migrate legacy DB; đánh dấu CLI enrollment hoặc offline cleanup hoàn tất.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Issue | Admin tạo enrollment | code một lần, expiry `now + 15m` | non-Admin 403 |
| Exchange | valid unused code + machine/profile | Runner + credential atomic; secret một lần | invalid/expired/cancelled/used 409 |
| Concurrent exchange | hai consumer cùng code | đúng một commit | loser 409 `enrollment_used` |
| Exchange rollback | machine conflict hoặc credential insert lỗi | code vẫn unused, không Runner/audit | stable 409/500 sanitized |
| Rotate | Admin/owner rotate active Runner | new secret một lần; old credential unusable | inactive/unknown 404 |
| Revoke | Admin/owner revoke Runner | status+credentials+tombstone+access retirement atomic | repeated revoke idempotent hoặc 409 theo contract test |

</frozen-after-approval>

## Code Map

- `shared/src/runnerEnrollment.ts` — bounded request/response schemas cho issue, exchange, rotate/revoke và credential envelope.
- `hub/src/store/sharedHubStore.ts` — enrollment/credential generation/active machine-profile claim/Runner tombstone transaction primitives.
- `hub/src/application/runnerEnrollmentService.ts` — issuance/exchange orchestration và secret generation/hashing.
- `hub/src/application/runnerLifecycleService.ts` — credential rotation và Runner revocation.
- `hub/src/auth/runnerAuthenticator.ts` — verify keyed credential cho transport adoption về sau.
- `hub/src/web/routes/runnerEnrollments.ts` — authenticated management + public exchange REST boundary.
- `hub/src/web/server.ts`, `hub/src/index.ts` — dependency injection và route ordering.

## Tasks & Acceptance

**Execution:**
- [x] `shared/src/runnerEnrollment.ts` — strict bounded schemas: `ownerMembershipId`, code/profile/machine, credential envelope, expected credential generation, và mọi response shape; không expose hashes.
- [x] `hub/src/store/sharedHubStore.ts` — enrollment read/cancel/atomic claim; active machine/profile claim tách khỏi history để revoke release uniqueness; credential generation/CAS; owner-active recheck; revoke+tombstone+access retirement.
- [x] `hub/src/application/runnerEnrollmentService.ts` — fixed TTL, entropy, keyed hashes, Admin issuance; exchange transaction recheck owner active rồi consume → active claims → Runner/credential → audit/outbox.
- [x] `hub/src/application/runnerLifecycleService.ts` — owner/Admin rotation với expected-generation CAS; revoke race-safe, release active claims nhưng giữ Runner/tombstone/history.
- [x] `hub/src/auth/runnerAuthenticator.ts` — bounded envelope parsing + constant-time active credential verification; fail closed wrong/rotated/revoked secrets.
- [x] `hub/src/web/routes/runnerEnrollments.ts` — validate request và service response schemas; public exchange; authenticated management; stable sanitized errors.
- [x] `hub/src/web/server.ts`, `hub/src/index.ts` — narrow injection/mount; exchange trước shared auth, management sau shared auth.
- [x] Focused tests + checklist — concurrent exchange, rollback, inactive-owner race, machine/profile re-enroll, rotation CAS/revoke race, response validation, known-conflict translation, unknown failure sanitization và redaction.

**Acceptance Criteria:**
- Given Admin issuance, when persisted, then DB/audit/log inspection contains no plaintext code and expiry equals exactly 15 minutes.
- Given two concurrent exchanges, when both submit one code, then one receives the only secret and the other receives `enrollment_used` without partial state.
- Given exchange fails after consume attempt, when transaction rolls back, then code remains usable and no Runner/credential/audit/outbox remains.
- Given rotation succeeds, when authenticating old/new secrets, then old fails and new resolves exactly the bound active Runner.
- Given revoke succeeds, when inspecting Runner access, then all credentials and grants are ineffective and tombstone exists.
- Given any error path, when response/log/audit is inspected, then no code, credential, command or private path appears.

## Spec Change Log

- 2026-07-14: iteration 1 review rejected the active uniqueness and rotation model. Revoked Runner must release machine/profile claims while retaining Runner history and tombstone; exchange must recheck active owner in-transaction; rotation requires expected-generation CAS and must lose cleanly to concurrent rotate/revoke. Contracts now require bounded identifiers/envelopes and response validation. Persistence must return explicit known machine/profile conflicts; unknown failures remain sanitized. KEEP: fixed TTL, keyed hashes, atomic exchange/rollback, single winner, redaction, tombstone/access retirement, narrow route composition, and out-of-scope transport/CLI work.

## Design Notes

Enrollment issue/management routes nằm sau browser auth; exchange là public pre-auth route vì code là one-time bootstrap capability. Error không phân biệt unknown/expired/cancelled code ngoài stable `enrollment_used` để giảm oracle. `ownerMembershipId`, credential envelope, profile và machine identifiers đều có upper bound. Route validate cả request lẫn service response trước khi trả plaintext một lần.

Machine/profile uniqueness chỉ áp dụng cho active claims, không nằm trên immutable Runner history. Exchange trong cùng transaction phải xác nhận enrollment owner vẫn là membership active trước consume. Revoke xóa/retire active claim, revoke credential/access và tạo tombstone nhưng giữ Runner/history; cùng machine/profile sau đó có thể re-enroll, trong khi không bao giờ có hai active claim.

Credential family có generation tăng đơn điệu. Rotate request mang `expectedGeneration`; transaction chỉ rotate khi Runner active và generation còn khớp. Hai rotate đồng thời: một commit, một stable conflict; revoke thắng race khiến rotate fail và không trả usable secret. Authenticator dùng bounded opaque envelope có lookup ID, DB chỉ giữ keyed hash. Repository map riêng known machine/profile claim conflicts; service không regex-map mọi SQLite constraint. Unknown persistence failures rollback và route trả lỗi sanitized.

## Verification

**Commands:**
- `bun test shared/src/runnerEnrollment.test.ts hub/src/store/sharedHubStore.test.ts hub/src/application/runnerEnrollmentService.test.ts hub/src/application/runnerLifecycleService.test.ts hub/src/auth/runnerAuthenticator.test.ts hub/src/web/routes/runnerEnrollments.test.ts hub/src/web/server.sharedAuth.test.ts` — focused pass.
- `bun typecheck` — bốn workspace pass.
- `bun run test` — full repository pass.
- `git diff --check` — pass.
- GitNexus change detection — chỉ expected flows; mọi d=1 caller updated.

**Evidence 2026-07-14 — iteration 2 review fixes:** exact focused suite 27 pass/0 fail/84 assertions; Hub suite 338 pass/0 fail/7,782 assertions; Hub và toàn workspace typecheck pass; `git diff --check` pass. Hai Bun process dùng hai SQLite connection trên file DB, readiness barrier và `busy_timeout` chứng minh đúng một exchange winner, loser `enrollment_used`, và đúng một Runner/credential/audit/outbox. Injected failure sau credential insert chứng minh toàn transaction rollback và code dùng lại được. HTTP bounds path/body, `no-store`, composite Runner/org credential FK, profile history, safe generation, terminal enrollment status/history, archived revoke no-op, response validation, exact known-conflict classification và audit actor semantics đều có regression coverage. Root `bun run test` dừng tại CLI với 623 pass và 12 timeout trong `runner.integration.test.ts` trước khi chạy Hub/Web; không có file CLI/Runner transport thuộc slice này thay đổi. GitNexus cumulative dirty-tree detection HIGH: 7 startup/config flows đã được duyệt từ Phase 2–3 và narrow Phase 4 composition; các symbol Phase 4 mới chưa có trong index. Không thay `/cli`, Socket.IO, CLI profile/reconnect/transfer/disconnect.

## Suggested Review Order

**Entry point and route security**

- Composes enrollment services and approved startup dependencies.
  [`index.ts:175`](../../hub/src/index.ts#L175)

- Mounts public exchange before auth and management routes after auth.
  [`server.ts:105`](../../hub/src/web/server.ts#L105)

- Bounds inputs and prevents caching one-time secrets.
  [`runnerEnrollments.ts:7`](../../hub/src/web/routes/runnerEnrollments.ts#L7)

**Enrollment transaction**

- Owns fixed-TTL issuance and atomic one-time exchange orchestration.
  [`runnerEnrollmentService.ts:11`](../../hub/src/application/runnerEnrollmentService.ts#L11)

- Enforces active machine/profile claims independently from retained Runner history.
  [`sharedHubStore.ts:146`](../../hub/src/store/sharedHubStore.ts#L146)

- Demonstrates real two-process concurrency and one-winner semantics.
  [`runnerEnrollmentService.test.ts:149`](../../hub/src/application/runnerEnrollmentService.test.ts#L149)

**Credential lifecycle**

- Applies generation-CAS rotation and idempotent revoke orchestration.
  [`runnerLifecycleService.ts:7`](../../hub/src/application/runnerLifecycleService.ts#L7)

- Releases active claims while retaining tombstone and history.
  [`sharedHubStore.ts:193`](../../hub/src/store/sharedHubStore.ts#L193)

- Verifies bounded constant-time credential envelopes for future transport adoption.
  [`runnerAuthenticator.ts:5`](../../hub/src/auth/runnerAuthenticator.ts#L5)

**Contracts and verification**

- Defines strict bounded public enrollment and credential schemas.
  [`runnerEnrollment.ts:1`](../../shared/src/runnerEnrollment.ts#L1)

- Covers rotation, revocation, re-enrollment and archived lifecycle guards.
  [`runnerLifecycleService.test.ts:8`](../../hub/src/application/runnerLifecycleService.test.ts#L8)
