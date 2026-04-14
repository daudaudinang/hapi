---
skill: review-implement
plan: 20260411-0940-auto-resume-inactive-sessions
ticket: null
status: FAIL
timestamp: 2026-04-13T12:30:00.000Z
updated: 2026-04-13T14:00:00.000Z
duration_min: 18
---

## Artifact

primary: /home/huynq/notebooks/hapi/.codex/pipeline/20260411-0940-auto-resume-inactive-sessions/04-review-implement.output.md

secondary: []

## Decision Summary

- Score: **84.4/130 (64.9%)** — verdict: **CHANGES REQUESTED** (`score_calculator.py` with `has_critical: true` forces this verdict)
- Boundary violations: **NONE** (plan docs do not define `Allowed Files` / `Do NOT Modify`)
- Critical: **4** | Major: **5** | Minor: **3**
- Auto-fix applied: **NONE**

## Context Chain

- Input summaries: `PLAN_FIXES_SUMMARY.md`, `CRITICAL_FIXES_20260411.md`, parent `plan.md`
- No `phase-*-walkthrough.md` per skill; used `plans/.../reports/` and current source
- Files read: `hub/src/web/routes/guards.ts`, `hub/src/web/routes/messages.ts`, `hub/src/sync/syncEngine.ts`, `hub/src/queue/messageQueue.ts`, `hub/src/config/features.ts`, `hub/src/store/index.ts`, `hub/src/resume/autoResumeOrchestrator.ts`, `web/src/api/client.ts`, `web/src/hooks/mutations/useSendMessage.ts`
- GitNexus: ran `npx gitnexus analyze`; `impact(triggerResume, upstream)` => **CRITICAL** risk

## Next Step

recommended_skill: implement-plan

input_for_next: /home/huynq/notebooks/hapi/plans/20260411-0940-auto-resume-inactive-sessions/plan.md

handoff_note: "Fix hub typecheck; wire AutoResumeOrchestrator into triggerResume; await enqueue and return correct HTTP 202/503/400; extend WebAppEnv with features."

## Blockers

- `bun typecheck` fails for hub package
- C1: `AutoResumeOrchestrator` only exercised in tests; `SyncEngine.triggerResume` calls `resumeSession` directly

## Pending Questions

- Should guard return **503** on queue overflow as described in PLAN_FIXES?

---

# Implementation review (detail)

## Traceability vs PLAN_FIXES_SUMMARY and CRITICAL_FIXES_20260411

| Requirement | Code status |
|-------------|-------------|
| Guard returns **202**, feature flag | Partially: logic exists; `c.get('features')` not on `WebAppEnv` (TS errors) |
| Frontend 202 / 503 | `client.ts` handles both; guard does not map overflow to 503 |
| 15s resume timeout | OK: `waitForSessionActive(..., 15_000)` |
| Overflow -> archive | `MessageQueue` archives; guard does not branch on enqueue result |
| Migrations + `resume_attempts` | Present; `runNewMigrations` uses async fire-and-forget pattern |
| C1 max 3 resume attempts | **FAIL**: logic lives in `AutoResumeOrchestrator`, not invoked from `triggerResume` |
| C3 server-side queue | OK: SQLite queue matches server-only decision |

## Critical

1. **Orchestrator not wired to production** — `SyncEngine.triggerResume` calls `resumeSession` directly (```613:628:hub/src/sync/syncEngine.ts```). Attempt limits and failure handling in ```69:90:hub/src/resume/autoResumeOrchestrator.ts``` never run on this path (contradicts CRITICAL_FIXES C1).

2. **Async enqueue vs sync guard** — `MessageQueue.enqueue` is `async` (```55:hub/src/queue/messageQueue.ts```) but `SyncEngine.enqueueMessage` returns without `await` (```603:605:hub/src/sync/syncEngine.ts```). `requireSession` puts `enqueueResult` in JSON (```38:52:hub/src/web/routes/guards.ts```) so body may contain a **Promise**. Also TS: `EnqueueResult` name missing in `syncEngine.ts`.

3. **Hub typecheck fails** — `guards.ts` (`features` context), `syncEngine.ts`, orchestrator and guards tests.

4. **503 on overflow** — PLAN_FIXES standardizes 503 for queue overflow; guard always returns 202 without checking `archived` / `rejected` after a real awaited enqueue.

## Major

5. **Migration timing** — ```196:203:hub/src/store/index.ts``` may serve traffic before migrations finish.

6. **Duplicate inactive path** — `SyncEngine.sendMessage` still has queue branch + Phase 3 TODO (```314:319:hub/src/sync/syncEngine.ts```).

7. **Blast radius** — `triggerResume` upstream impact is CRITICAL (multiple routes/processes).

8. **Feature flag** — Plan mentions rollout percentage; code is env boolean only (document or implement).

9. **`useSendMessage`** — Still optimistic UI; 3s timer vs15s server timeout (```69:76:web/src/hooks/mutations/useSendMessage.ts```), conflicts with PLAN_FIXES “no optimistic UI” narrative.

## Minor

10. `MessageQueue.getMetrics` returns zeros (```144:152:hub/src/queue/messageQueue.ts```).

11. `plan.md` internal inconsistency (phases marked done vs “Begin Phase 1” in Next Steps).

12. No skill-style walkthrough files for Execution Boundary audit.

## Weighted score (script)

- Command: `python3 .agents/skills/review-implement/scripts/score_calculator.py '<json>'`
- Output: `total_score` 84.4 /130, `percentage` 64.9, `verdict` **CHANGES REQUESTED**

## Conclusion

**FAIL / CHANGES REQUESTED** — fix compile errors, wire orchestrator, fix async enqueue and HTTP mapping before merge or QA sign-off.

---

# Bổ sung: Xác minh lại và phân tích sâu (2026-04-13)

Phần này tổng hợp kết quả đọc lại mã, `bun typecheck`, và grep middleware sau phiên review đầu tiên.

## 1. Đối chiếu phát hiện cũ — còn đúng không?

| Phát hiện ban đầu | Kết luận xác minh | Ghi chú |
|-------------------|-------------------|---------|
| `enqueueMessage` không `await` → body JSON có thể là Promise / sai kiểu | **Vẫn đúng** | `MessageQueue.enqueue` là `async`; guard gán `enqueueResult` trực tiếp vào `c.json` mà không `await`. |
| `EnqueueResult` không tồn tại trong scope `syncEngine` (TS2304) | **Vẫn đúng** | Re-export `export type { EnqueueResult }` không đưa tên vào scope cho return type của method. |
| `c.get('features')` không khớp `WebAppEnv` | **Vẫn đúng** | `WebAppEnv.Variables` chỉ có `userId`, `namespace`. |
| `AutoResumeOrchestrator` không nối `triggerResume` | **Vẫn đúng** | `triggerResume` gọi thẳng `resumeSession`. |
| Guard không map overflow → 503 | **Vẫn đúng** (khi path guard có hiệu lực) | Luôn 202 sau nhánh auto-resume; không xử lý `archived` / `rejected`. |
| `runNewMigrations` fire-and-forget | **Vẫn đúng** | `.catch` + `throw` bên trong không propagate ra caller sync. |
| `bun typecheck` fail hub | **Vẫn đúng** | Thêm lỗi test orchestrator / guards (vitest, narrowing, mock Context). |

**Điều chỉnh diễn đạt:** Không phải mọi trường hợp đều “race insert vs read”. Với nhánh enqueue không vào `await handleOverflow` sớm, phần insert sync có thể hoàn tất trước khi `triggerResume` đọc DB. Rủi ro thứ tự mạnh hơn khi **overflow** (có `await` giữa chừng). Lỗi chắc chắn vẫn là **Promise trong JSON** và **thiếu await** ở contract.

## 2. Phát hiện sâu hơn (chưa nhấn mạnh đủ ở báo cáo đầu)

### 2.1 Feature auto-resume trên web thực tế không bật

- `getFeatureFlags` / `setFeatureFlagsInContext` chỉ có trong `hub/src/config/features.ts`; **không** có middleware nào trong `hub/src/web` gọi `c.set('features', ...)`.
- Hệ quả: `autoResumeEnabled = c.get('features')?.autoResume ?? false` **luôn false**.
- Nhánh guard (202 + queue + `triggerResume`) **không chạy** với request web thông thường.

### 2.2 Luồng thật hiện tại (inactive + POST messages)

- Guard bỏ qua auto-resume → trả `{ sessionId, session }` kể cả session inactive (vì `requireActive` không set).
- Handler gọi `engine.sendMessage` → nhánh inactive **có** `await enqueue` nhưng resume chỉ còn `console.log` TODO Phase 3 (```314:319:hub/src/sync/syncEngine.ts```).
- **Kết luận hành vi:** Auto-resume qua HTTP **không hoạt động**; `HAPI_AUTO_RESUME` hiện **không ảnh hưởng** luồng web vì không inject vào context.

### 2.3 Hai đường thiết kế (guard vs `sendMessage`)

- Khi sau này gắn middleware `features`: cần enqueue + 202 + không gọi `sendMessage`.
- Khi flag tắt: đi qua `sendMessage` + TODO resume.

Hai đường song song dễ sửa lệch; nên gom **một** API nội bộ async (ví dụ chỉ xử lý ở route hoặc một method engine duy nhất).

### 2.4 C1 (`resume_attempts` + orchestrator)

- Vẫn đúng: production path không qua `AutoResumeOrchestrator` → giới hạn 3 lần không áp dụng.

## 3. Đề xuất sửa theo thứ tự ưu tiên (tối ưu)

1. **Middleware feature:** Mở rộng `WebAppEnv` (thêm `features` hoặc `FeatureFlags`); middleware toàn cục `c.set('features', getFeatureFlags())` trước route API cần auto-resume.

2. **Async tại route, không để guard sync làm I/O bất đồng bộ:** Trong `POST .../messages`, nếu inactive + flag bật: `await` kết quả enqueue, rồi nhánh `202` / `503` / `4xx` tương ứng `queued` / `archived` / `rejected`; sau đó gọi `triggerResume` (hoặc orchestrator). Tránh nhét Promise vào `c.json`.

3. **`SyncEngine`:** Đổi `enqueueMessage` thành `async`, `return await this.messageQueue.enqueue(...)`, và `import type { EnqueueResult }` đúng scope; nối `triggerResume` với `AutoResumeOrchestrator` (hoặc gộp logic C1 vào một chỗ).

4. **`sendMessage`:** Hoàn thiện hoặc xóa nhánh inactive trùng — gọi chung helper với route, hoặc chỉ để cho kênh không đi guard 202 (Telegram/CLI) để tránh hai nguồn sự thật.

5. **Migration:** `await runMigrations` trong khởi tạo (hoặc runner đồng bộ) đến khi xong mới listen; xử lý lỗi migration rõ ràng (không `throw` vô hiệu trong `.catch`).

6. **Typecheck / test:** Sửa narrowing trong test orchestrator; sửa `guards.test.ts` (mock `Context`, metadata đủ `host`, cấu hình vitest types).

7. **UX (tuỳ chọn sau core):** Cân nhắc `useSendMessage` (optimistic vs plan; timer 3s vs timeout 15s server).

## 4. Tóm tắt một dòng

Báo cáo đầu đúng hướng về type/async/orchestrator/503/migration; **bổ sung quan trọng nhất** là **feature không được gắn vào request** nên auto-resume web **đang tắt hoàn toàn**, còn resume thật bị chặn bởi TODO trong `sendMessage`.
