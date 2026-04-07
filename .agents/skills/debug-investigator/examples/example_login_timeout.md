# Ví dụ End-to-End: Debug Login Timeout

Ví dụ minh họa toàn bộ workflow `/debug` từ đầu đến cuối.

---

## Input

```
/debug Login page hiện "Loading..." mãi không vào được dashboard.
Xảy ra với tất cả user, bắt đầu từ hôm nay.
```

---

## Bước 1: Thu thập thông tin

```text
MÔ TẢ LỖI (tóm tắt):
- Triệu chứng: Login page hiện "Loading..." vô hạn, không redirect tới dashboard
- Bối cảnh: Xảy ra từ hôm nay, ảnh hưởng tất cả users

Phân loại sơ bộ:
- Loại: Frontend + Integration
- Mức độ: Critical (block toàn bộ users)
- Tần suất: Luôn (100%)
```

**Hỏi làm rõ:**
- ✅ Phạm vi: Tất cả users → confirmed
- ✅ Timing: Ngay khi click Login → confirmed
- ❓ Error UI: Có hiện error gì không? → User: "Không, chỉ loading mãi"
- ❓ Console: Có lỗi trong console? → User: "Có lỗi `net::ERR_CONNECTION_TIMED_OUT`"

```text
THÔNG TIN ĐÃ LÀM RÕ:
- Error: net::ERR_CONNECTION_TIMED_OUT — fetch tới /auth/login
- Không có error UI
- Reproduce: 1. Mở /login → 2. Nhập credentials → 3. Click Login → 4. Loading mãi
```

---

## Bước 2: Hiểu hệ thống

```text
LUỒNG XỬ LÝ LIÊN QUAN:
1. [User click Login] → LoginForm submit handler
   - Components: LoginForm, useAuth hook
2. [Call API] → authService.login(email, password) → fetch('/auth/login')
   - Modules: auth.service.ts
3. [Handle response] → setSession() → redirect to /dashboard
   - Components: AuthContext, useRouter

→ Lỗi xuất hiện tại bước: 2 (fetch timeout, response không bao giờ tới)
```

---

## Bước 3: Scope

```text
PHẠM VI ĐIỀU TRA:
1. src/components/login-form.tsx — Priority: High (UI component nơi lỗi hiện ra)
2. src/services/auth.service.ts — Priority: High (nơi gọi API)
3. src/contexts/auth-context.tsx — Priority: Medium (session management)
4. .env / config — Priority: Medium (API URL configuration)
```

---

## Bước 4: Phân tích code

### File: auth.service.ts

```text
⚠️ Rủi ro #1:
- Mô tả: fetch() không có timeout hoặc AbortController
- Location: auth.service.ts:23
- Code: `const res = await fetch('/auth/login', { method: 'POST', body })`
- Tại sao là rủi ro: Nếu server không response, fetch sẽ chờ vô hạn
- Khớp triệu chứng:
  - Scope: Match (tất cả users đều gọi cùng endpoint)
  - Timing: Match (luôn xảy ra)
- Likelihood: High
```

### File: login-form.tsx

```text
⚠️ Rủi ro #2:
- Mô tả: Loading state set true nhưng không reset khi error
- Location: login-form.tsx:45-52
- Code:
  ```tsx
  setLoading(true);
  await authService.login(email, password);
  // setLoading(false) chỉ ở success path
  ```
- Tại sao: Nếu fetch throw/timeout, loading mãi không tắt
- Likelihood: High (phụ trợ cho Rủi ro #1)
```

### File: .env

```text
⚠️ Rủi ro #3:
- Mô tả: API_BASE_URL trỏ sai sau deploy hôm nay
- Location: .env:3
- Code: `API_BASE_URL=https://api-staging.example.com`
- Tại sao: Nếu URL sai → connection refused/timeout
- Khớp triệu chứng: Match (bắt đầu từ hôm nay = có deploy gần đây?)
- Likelihood: High
```

---

## Bước 5: Xếp hạng

```text
BẢNG XẾP HẠNG:
| Rank | Nguyên nhân              | Likelihood | Evidence | Confidence |
|------|--------------------------|------------|----------|------------|
| 1    | API_BASE_URL sai sau deploy | High     | 7/10     | 75%        |
| 2    | fetch() thiếu timeout    | High       | 8/10     | 70%        |
| 3    | Loading state không reset | High      | 9/10     | 95% (phụ)   |

Giải thích: Rank 1 > Rank 2 vì "bắt đầu từ hôm nay" = thay đổi gần đây (deploy?).
Rank 2 là nguyên nhân kỹ thuật sâu hơn (thiếu timeout).
Rank 3 là hệ quả (loading mãi = vì không handle error).
```

---

## Bước 6: Verification

```text
VERIFICATION:
- Phương pháp: Check .env + check deploy history
- Đề xuất: User kiểm tra API_BASE_URL trong .env có đúng không
- Nếu đúng → Rank 2 lên Rank 1 (fetch thiếu timeout là root cause)
- Confidence: Cần user confirm → hiện tại ~75%
```

---

## Bước 7: Report

```text
═══════════════════════════════════════════
BÁO CÁO ĐIỀU TRA LỖI

LỖI: Login page hiện "Loading..." vô hạn
LOẠI: Frontend + Integration
MỨC ĐỘ: Critical

KẾT LUẬN CHÍNH:
- NGUYÊN NHÂN GỐC (Confidence ~75%): API_BASE_URL sai sau deploy
  HOẶC fetch() thiếu timeout + error handling
- Location: .env:3, auth.service.ts:23, login-form.tsx:45

ĐỀ XUẤT FIX:
1. Kiểm tra & sửa API_BASE_URL trong .env
2. auth.service.ts:23 → Thêm AbortController với timeout 10s
3. login-form.tsx:45 → Thêm try-catch, set loading=false + hiện error UI

ACTION ITEMS:
- [ ] Kiểm tra .env API_BASE_URL
- [ ] Kiểm tra deploy gần đây có thay đổi env không
- [ ] Fix timeout + error handling (nếu env đúng rồi)
═══════════════════════════════════════════
```
