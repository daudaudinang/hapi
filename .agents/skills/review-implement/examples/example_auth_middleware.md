# Ví dụ End-to-End: Review Implementation Auth Middleware

Ví dụ này minh họa toàn bộ workflow review-implement từ đầu đến cuối, bao gồm phát hiện Critical issue.

---

## Input

```
/review-implement .agent/plans/PLAN_AUTH_MIDDLEWARE.md
```

---

## Phase 1: Thu thập Context

### Đọc Plan gốc
- Plan: Thêm auth middleware cho API routes
- Requirements:
  1. Validate JWT token cho mọi `/api/*` routes
  2. Skip validation cho `/api/public/*`
  3. Return 401 nếu token invalid
  4. Inject user info vào request context

### Đọc Walkthroughs
- `phase-1-walkthrough.md` → 2 tasks, 3 files changed
- `phase-2-walkthrough.md` → 1 task, 2 files changed

### Files Changed (tổng hợp)
| File | Action |
|------|--------|
| `src/middleware/auth.ts` | Created |
| `src/middleware/index.ts` | Modified |
| `src/types/request.ts` | Modified |
| `src/api/routes/index.ts` | Modified |
| `src/api/routes/public.ts` | Modified |

---

## Phase 2: Review Code & Logic

### Traceability
- [✅] Req 1: JWT validation at `auth.ts:15-30`
- [✅] Req 2: Skip logic at `auth.ts:8-12`
- [✅] Req 3: 401 response at `auth.ts:35`
- [❌] Req 4: User injection — **MISSING**: `request.user` chưa được set

### Correctness
- 🔴 **Critical issue**: `auth.ts:10` — path matching dùng `path.includes('/public')` → path `/api/publicdata` cũng bị skip → **security bypass**
  - **Fix:** Dùng `path.startsWith('/api/public/')` thay vì `path.includes('/public')`

### Robustness
- 🟠 Token decode không wrap trong try-catch → invalid token gây crash
- ✅ Null check cho Authorization header OK

### Clarity
- 🟡 Variable `t` at line 15 → nên rename thành `decodedToken`

---

## Phase 3: Impact & Risk Analysis

### Regression
- **Medium risk**: Middleware áp dụng cho MỌI `/api/*` routes → có thể break existing routes chưa test
- Cần kiểm tra: các API integration tests có pass không?

### Integration
- Module `src/api/routes/index.ts` đã update import → OK
- Module `src/types/request.ts` thêm `user?: DecodedToken` → backward-compatible ✅

### Performance
- Token decode mỗi request → OK nếu dùng symmetric key
- Không có heavy operations

---

## Phase 4: Report

```markdown
# 🕵️ IMPLEMENTATION REVIEW REPORT

**Plan Review:** Auth Middleware
**Reviewer:** Agent
**Date:** 2026-03-03
**Status:** ❌ CHANGES REQUESTED

---

## 📊 Tóm tắt thay đổi

- **Số lượng files thay đổi:** 5
- **Phases đã review:** Phase 1, Phase 2
- **Các files chính:** `src/middleware/auth.ts`, `src/api/routes/index.ts`

---

## 🔍 Chi tiết đánh giá

### 1. Bám sát Plan & Requirements

- [✅] **JWT validation:** implemented at `auth.ts:15-30`
- [✅] **Skip public routes:** logic at `auth.ts:8-12` (nhưng có bug)
- [✅] **401 response:** at `auth.ts:35`
- [❌] **User injection:** MISSING — `request.user` chưa được set sau decode

**Nhận xét:** 3/4 requirements implemented, 1 missing (user injection), 1 có bug (path matching).

### 2. Code Quality & Logic

- **Logic:** Path matching sai → security vulnerability
- **Error Handling:** Token decode thiếu try-catch
- **Code Style:** Biến `t` cần rename

### 3. Impact & Risks

- **Impact Scope:** Medium — ảnh hưởng mọi API routes
- **Risks:**
    - 🔴 **Critical:** Security bypass via path manipulation
    - 🟠 **Major:** Missing user injection, unhandled decode error

---

## 🛠 Issues & Recommendations

| Severity | Location | Issue | Recommendation |
|----------|----------|-------|----------------|
| 🔴 Critical | `auth.ts:10` | `path.includes('/public')` cho phép bypass bằng path `/api/publicXXX` | Đổi thành `path.startsWith('/api/public/')` |
| 🟠 Major | `auth.ts:15-30` | Token decode thiếu try-catch → crash khi invalid token | Wrap trong `try { ... } catch { return res.status(401) }` |
| 🟠 Major | `auth.ts` | Missing Req 4: không inject `request.user` | Thêm `req.user = decodedToken` sau decode thành công |
| 🟡 Minor | `auth.ts:15` | Variable `t` không rõ nghĩa | Rename thành `decodedToken` |

---

## ✅ Kết luận

Code có 1 lỗi Critical (security bypass) và 2 lỗi Major. PHẢI fix Critical + Major trước khi merge. Fix xong chạy lại `/review-implement` để verify.
```
