# Ket qua review-plan: FIX_IMPLEMENTATION_PLAN_20260413.md

**Ngay:** 2026-04-13  
**Tier:** M (Standard)  
**File plan:** `plans/20260411-0940-auto-resume-inactive-sessions/FIX_IMPLEMENTATION_PLAN_20260413.md`  
**GitNexus:** repo `hapi` co trong index MCP.

---

## Ket luan (score_calculator.py)

- `weighted_avg`: **6.6/10**
- `verdict`: **CAN XEM LAI** (`has_blocker: true`)
- Lenh: `python3 .agents/skills/review-plan/scripts/score_calculator.py` voi `tier: M`, personas, `has_blocker: true`.

---

## Diem tot

- Thu tu phase hop ly (middleware -> engine -> route -> dedupe -> migration -> test).
- Nguyen tac: khong async hoa toan bo `requireSession`; await o handler POST la dung.
- Bang F-1..F-8 khop code da xac minh.
- Co nhac doi chieu `web/src/api/client.ts` (202/503).
- Human gate co checklist.

---

## Format / template (trang thai luc review)

Plan **custom**: thieu Execution Boundary, AC khong co Verify, risk khong ma tran — so voi skill tier M thi **thieu**.

**Sau v2:** Da bo sung boundary, AC+Verify, ma tran rui ro; van la plan custom (khong full template v2/v3 chuan) nhung du de implement.

---

## Findings

### Blocker

**1. Thieu phase gui tin that sau resume (drain queue)**

- Code: `AutoResumeOrchestrator.processQueuedMessages` danh dau processed nhung co TODO, **khong** goi `messageService.sendMessage` — xem ```189:200:hub/src/resume/autoResumeOrchestrator.ts```.
- Neu chi lam Phase 1-4 cua plan fix, user van co the **khong thay noi dung queue trong chat**.
- **Can bo sung plan:** phase hoac mo rong Phase 2/4: sau resume thanh cong, goi `MessageService.sendMessage` (hoac duong tuong duong), xu ly loi, idempotency `localId`, test integration.

### Major

2. Khong co **Execution Boundary** — de cham `messageService`, `shared` khi lam delivery.  
3. AC khong gan **lenh verify** cu the (`bun typecheck`, `bun test`, curl).  
4. `Store` dung `private db` — ```41:42:hub/src/store/index.ts``` — can AC bat buoc **accessor / API** dau Phase 2.  
5. Phase 4 grep caller: tren `hub` hien chi `hub/src/web/routes/messages.ts` goi `engine.sendMessage`; co the rut gon; ghi ro khong lan `telegram/bot.ts` (API Telegram).  
6. Hai lop `waitForSessionActive` — can quy uoc **session id sau merge**.

### Minor

7. Tieu de plan fix ASCII khong dau.  
8. Bang rui ro chua theo matrix chuan skill.

---

## Cau hoi mo

- Tin tu queue sau resume co bat buoc cung semantics `seq` / SSE nhu tin gui truc tiep?  
- Bang mapping HTTP cho `rejected` (400 vs 409).

---

## Khong auto-fix file plan (ban dau)

Co **Blocker** theo skill — ban dau khong tu sua file plan; can bo sung phase delivery truoc khi implement.

---

## Cap nhat sau review (2026-04-13)

**Trang thai:** User dong y — da cap nhat `FIX_IMPLEMENTATION_PLAN_20260413.md` **Version 2**.

**Da xu ly tu findings:**

| Finding (review) | Xu ly trong plan v2 |
|------------------|---------------------|
| Blocker: thieu drain queue / `MessageService` | **Phase 4** — `processQueuedMessages` gui tin that, inject / callback, idempotency |
| Thieu Execution Boundary | Muc **Execution boundary** (Allowed / Do NOT) |
| AC khong co Verify | Moi phase co bang **AC \| Verify** |
| Store `private db` | Phase 2 buoc **0** — API / accessor bat buoc truoc orchestrator |
| Grep caller rong | Phase 5 — chi ro hub: chi `messages.ts`; khong lan Telegram API |
| Session id sau merge | Muc **Quy uoc session id** o phan 3 |
| Risk flat list | **Ma tran rui ro** (L / I) o muc 5 |
| Bang HTTP `rejected` | Phase 3 — 400 / 409 / 400 |
| Human gate | Muc 7 — checklist semantics queue + rejected |

**Ghi chu:** Noi dung plan v2 trong file goc dung **tieng Viet khong dau** de tranh loi encoding khi luu file.

**Buoc tiep theo:** `/lp:implement` hoac trien khai thu cong theo phase 1–7 trong `FIX_IMPLEMENTATION_PLAN_20260413.md`.
