---
name: debug-investigator
description: |
  Điều tra lỗi hệ thống, tìm nguyên nhân gốc rễ (Root Cause Analysis). KHÔNG sửa code.
  Workflow 8 bước: thu thập → reproduce plan → hiểu luồng → hypothesis-driven investigation →
  phân tích code → tổng hợp & xếp hạng → verification → báo cáo + đề xuất fix.
  Kích hoạt khi user chạy `/debug`, hoặc yêu cầu "debug lỗi", "tìm nguyên nhân",
  "investigate bug", "tại sao lỗi X", "fix sao đây" (agent sẽ điều tra trước, đề xuất fix).
---

# Goal

Điều tra nguyên nhân gốc rễ (Root Cause) của lỗi/bất thường trong hệ thống bằng phân tích code có hệ thống — đưa ra báo cáo với confidence score, evidence, và đề xuất fix cụ thể — mà **KHÔNG tự ý sửa code**.

---

# Instructions

> **QUY TRÌNH BẮT BUỘC (CHAIN OF THOUGHT):**
> 1. Mọi phân tích, giả thuyết (Hypothesis), hoặc đọc code của bạn BẮT BUỘC phải nằm trong block `<thinking>...</thinking>`.
> 2. TRONG khối này, hãy phân tích yêu cầu và định hình các lệnh Tool cần gọi (vd: `mcp_gitnexus_query`, `view_file`, `grep_search`).
> 3. **[DỪNG LẠI SAU KHI GỌI TOOL. NGHIÊM CẤM TỰ TẠO RA KẾT LUẬN NẾU CHƯA CÓ KẾT QUẢ TỪ TOOL KHÁM PHÁ CODE]**.
> 4. Bạn chỉ được phép sinh ra Report ở turn tiếp theo, SAU KHI Tool đã trả về log thành công.

## Bước 0: Nhận mô tả lỗi

1. Đọc mô tả lỗi từ user (qua lệnh `/debug <mô tả>` hoặc yêu cầu).
2. **Nếu mô tả quá ngắn hoặc thiếu** → PHẢI hỏi lại để làm rõ TRƯỚC KHI đi sâu.

## Bước 0.5: 🔄 Ensure GitNexus Index

> **Mục đích:** Đảm bảo code knowledge graph luôn fresh trước khi điều tra.
> Project context đã được nạp tự động qua `AGENTS.md` (system prompt).

1. Gọi `mcp_gitnexus_list_repos` — kiểm tra GitNexus MCP có đang chạy không.
2. **Nếu có** → Chạy `npx gitnexus analyze` tại project root (LUÔN CHẠY để đảm bảo index mới nhất, không tự ý skip). Ghi nhận `HAS_GITNEXUS = true`.
3. **Nếu không** → Ghi nhận `HAS_GITNEXUS = false`, dùng `grep_search` / `view_file` làm fallback.

## BƯỚC 1: 📥 Thu thập thông tin ban đầu

### 1.1. Ghi nhận & phân loại sơ bộ

Tóm tắt mô tả lỗi:

```text
MÔ TẢ LỖI (tóm tắt):
- Triệu chứng: [...]
- Bối cảnh: [...]

Phân loại sơ bộ:
- Loại: [Frontend/Backend/Integration/Performance/Data/Logic/Khác]
- Mức độ: [Critical/High/Medium/Low]
- Tần suất: [Luôn/Thỉnh thoảng/Hiếm]
```

### 1.2. Hỏi làm rõ (nếu cần)

**PHẢI hỏi** nếu bất kỳ yếu tố sau chưa rõ:
- **Phạm vi**: Tất cả user/luồng hay chỉ case cụ thể?
- **Timing**: Xảy ra ngay, sau 1 khoảng, hay sau nhiều actions?
- **Điều kiện dữ liệu**: Mọi input hay chỉ input đặc biệt?
- **Error message/log**: Có message cụ thể? Ở UI? Server? Console?
- **Reproduce steps**: Ít nhất 3–5 bước rõ ràng

Nếu user không cung cấp đầy đủ → ghi rõ phần nào còn thiếu để dùng ở bước Cases đặc biệt.

## BƯỚC 1.5: 🔄 Reproduce Plan (Safe Version)

> **Nguyên tắc AN TOÀN:** Agent KHÔNG tự ý chạy reproduce command. Thay vào đó,
> agent **đề xuất reproduce plan cụ thể** cho user xác nhận hoặc tự chạy.
> Lý do: tránh chạy sai môi trường (đặc biệt Python venv), tránh side effects.

### 1.5.1. Xây dựng Reproduce Plan

Dựa trên mô tả lỗi + reproduce steps từ user, đề xuất:

```text
REPRODUCE PLAN:
- Loại lỗi: [Backend/Frontend/Build/Integration]
- Môi trường yêu cầu: [VD: Python 3.11 + uv, Node 20 + bun, ...]
- Thư mục chạy: [VD: servers/fastapi/, servers/nextjs/]

Cách reproduce đề xuất:
  Option A (Command):
    ```bash
    # ⚠️ Chạy trong thư mục: servers/fastapi/
    uv run pytest tests/test_xxx.py -k "test_case_name" -v
    ```
  Option B (Browser):
    1. Mở http://localhost:6003/path
    2. [Thao tác cụ thể]
    3. Quan sát: [kết quả mong đợi vs thực tế]

Expected: [...]
Actual (theo user): [...]
```

### 1.5.2. Chờ xác nhận từ user

- **Nếu user xác nhận lỗi reproduce được** → tiếp tục Bước 2
- **Nếu user nói không reproduce được** → hỏi thêm điều kiện (data, config, timing) trước khi tiếp tục
- **Nếu không thể tạo reproduce plan** (lỗi intermittent, thiếu data) → ghi rõ hạn chế và tiếp tục phân tích code-based

### 1.5.3. Hành động agent ĐƯỢC PHÉP tự chạy (read-only, zero-risk)

Agent CHỈ được tự chạy các hành động **read-only** để thu thập thêm thông tin:
- ✅ `grep_search` / `find_by_name` — tìm pattern, file
- ✅ `view_file` — đọc code, config, logs
- ✅ Mở browser xem UI (không submit form, không thay đổi data)
- ✅ Đọc logs có sẵn (file logs, build output)

Agent **KHÔNG ĐƯỢC** tự chạy:
- 🚫 `python`, `pytest`, `uv run` — risk chạy sai venv/môi trường
- 🚫 `npm run`, `bun run`, build commands — có thể thay đổi state
- 🚫 Bất kỳ command nào ghi/thay đổi data, file, database

## BƯỚC 2: 🏗️ Hiểu hệ thống & luồng liên quan

### 2.1. Tổng quan hệ thống (chỉ làm nếu chưa nắm)

Đọc `README.md`, config files, `package.json` → tóm tắt:

```text
TỔNG QUAN HỆ THỐNG:
- Loại app: [Web app/API/Service/…]
- Tech stack: Frontend [...], Backend [...], DB [...], External [...]
- Kiến trúc: [Monolith/Multi-service/Event-driven/…]
- Patterns đáng chú ý: [State management, error handling, background jobs, ...]
```

### 2.2. Xác định luồng xử lý liên quan

Phác thảo luồng từ trigger → xử lý → output:

```text
LUỒNG XỬ LÝ LIÊN QUAN:
1. [Trigger: hành động user hoặc event hệ thống]
   - Components/Modules: [...]
2. [Xử lý trung gian: validations, transforms, calls]
   - Components/Modules: [...]
3. [Persist/External call/Render/Response]
   - Components/Modules: [...]

→ Lỗi xuất hiện tại bước: [...]
```

## BƯỚC 3: 🎯 Hypothesis-Driven Investigation

> **Nguyên tắc:** Đặt giả thuyết trước, đọc code có mục đích.
> Mỗi lần đọc file phải nhằm **confirm hoặc deny** một hypothesis cụ thể.
> Tránh "boiling the ocean" — đọc hết code rồi mới nghĩ.

### 3.1. Đặt giả thuyết ban đầu (ít nhất 2–3 hypotheses)

Dựa trên triệu chứng + luồng xử lý, đặt các giả thuyết:

```text
HYPOTHESES:

H1 (Confidence ~X%): [Mô tả ngắn về nguyên nhân nghi ngờ]
   - Test strategy: Đọc file [path], tìm [pattern/logic cụ thể]
   - If TRUE → giải thích triệu chứng: [...]
   - If FALSE → loại bỏ, chuyển hypothesis khác

H2 (Confidence ~X%): [...]
   - Test strategy: [...]
   - If TRUE → [...]
   - If FALSE → [...]

H3 (Confidence ~X%): [...]
   ...
```

### 3.2. Danh sách files cần xem (theo hypothesis)

Liệt kê files theo thứ tự test hypothesis, KHÔNG phải theo alphabetical:

```text
INVESTIGATION PLAN:
1. [path/to/file] (Priority: High) — Test H1: [tìm gì?]
2. [path/to/file] (Priority: High) — Test H1 + H2: [tìm gì?]
3. [path/to/file] (Priority: Medium) — Test H3: [tìm gì?]
...
```

### 3.3. Pivot checkpoint (sau mỗi 2–3 files)

Sau khi đọc 2–3 files, TỰ HỎI:
- Hypothesis nào đã bị **loại bỏ** (và tại sao)?
- Hypothesis nào **tăng confidence** (evidence gì)?
- Cần thêm hypothesis **mới** nào không?
- Cần đọc thêm file nào NGOÀI danh sách ban đầu?

Cập nhật Investigation Log (xem section Investigation Log bên dưới).

## BƯỚC 4: 🔍 Phân tích code chi tiết (CỬA ẢI BẮT BUỘC)

> **VERIFICATION GATE (CHỐNG LỪA DỐI):** Bạn KHÔNG ĐƯỢC PHÉP bịa ra rủi ro dựa trên trí nhớ. Rủi ro chỉ được công nhận khi nó LÀ KẾT QUẢ TỪ VIỆC GỌI TOOL đọc code (`view_file`, `mcp_gitnexus_context`, ...). Nếu chưa gọi Tool, mọi giả thuyết đều vô nghĩa.

Cho TỪNG file trong scope (ưu tiên High trước):

### 4.1. Đọc & phân tích

**Nếu `HAS_GITNEXUS = true` (Ưu tiên):**
- Truy vấn symbol liên quan → `mcp_gitnexus_context` (xem callers, callees, processes)
- Tìm execution flows → `mcp_gitnexus_query` (query mô tả luồng lỗi)
- Blast radius → `mcp_gitnexus_impact` (target symbol, direction="upstream")
- Đọc code chi tiết → `view_file` (khi cần xem implementation cụ thể)

**Fallback (`HAS_GITNEXUS = false`):**
- File nhỏ/vừa → `view_file`
- File lớn/chưa rõ vị trí → `grep_search` keywords liên quan
- Tìm callers/consumers → `grep_search` tên function/component

### 4.2. Ghi nhận rủi ro

Với mỗi điểm nghi ngờ:

```text
⚠️ Rủi ro #N:
- Mô tả: [...]
- Location: path/to/file:line(s)
- Code snippet: [ngắn, đủ context]
- Tại sao là rủi ro: [null? race condition? sai assumption? error không handle?]
- Hypothesis liên quan: [H1/H2/H3]
- Khớp triệu chứng user?
  - Scope: [Match/Không match]
  - Timing: [Match/Không match]
  - Frequency: [Match/Không match]
- Likelihood: [High/Medium/Low]
```

### 4.3. Liên kết files liên quan

- **Frontend**: parent components, siblings (shared context), custom hooks, re-render sources
- **Backend**: router → middleware → controller → service → repository, error handling chain, DTO mapping

### 4.4. Cập nhật Investigation Log

Sau mỗi file, GHI VÀO Investigation Log (xem section bên dưới). Bao gồm cả **negative findings** (đã đọc nhưng KHÔNG phát hiện vấn đề).

## BƯỚC 5: 📊 Tổng hợp rủi ro & Xếp hạng

### 5.1. Bảng tổng hợp

```text
TỔNG HỢP RỦI RO:
1. [Rủi ro 1] – File: path – Lines: [...] – Hypothesis: H? – Likelihood: [...]
2. [Rủi ro 2] – File: path – Lines: [...] – Hypothesis: H? – Likelihood: [...]
...
```

### 5.2. Phân tích sâu top 3

Với từng rủi ro quan trọng:
- Trace scenario gây lỗi step-by-step
- Evidence ủng hộ vs Evidence chống
- Kết luận: nguyên nhân gốc hay phụ/trung gian?

### 5.3. Xếp hạng

```text
BẢNG XẾP HẠNG:
| Rank | Nguyên nhân       | Hypothesis | Likelihood | Evidence | Confidence |
|------|-------------------|------------|------------|----------|------------|
| 1    | [...]             | H1         | High       | 8/10     | 80–90%     |
| 2    | [...]             | H2         | Medium     | 6/10     | ~60–70%    |
| 3    | [...]             | H3         | Medium/Low | 5/10     | ~50–60%    |
```

Giải thích tại sao Rank 1 > Rank 2 (match triệu chứng hơn ở điểm nào).

## BƯỚC 6: ✅ Verification

### 6.1. Tự phản biện (Falsification Protocol - BẮT BUỘC)

> **Nguyên lý Falsification:** Tránh Confirmation Bias (thiên kiến xác nhận). Bạn phải ĐÓNG VAI là kẻ thù của chính mình để bẻ gãy giả thuyết (Root Cause) Rank 1 hiện tại trước khi chốt hạ.

1. **Đóng vai Devil's Advocate (Kẻ phản biện):** Đứng lên chống lại Root Cause đang xếp Rank 1 của bạn.
2. **Tìm bằng chứng bác bỏ:** Hãy in ra text ít nhất **1 lý do hoặc viễn cảnh giải thích tại sao giả thuyết này có thể SAI KHUẤY.** (Ví dụ: "Nếu API thiếu timeout, thì log đáng lẽ phải hiện TimeoutError ở Network tab chứ ko phải là silent fail").
3. **Verify lại nghi ngờ:** BẮT BUỘC dùng lệnh `view_file` hoặc `grep_search` kiểm tra thêm ít nhất 1 file/luồng nữa nhằm mục đích BÁC BỎ sự nghi ngờ đó. Nếu không bác bỏ được -> Giả thuyết của bạn đã sai -> Hủy nó đi và đôn Rank 2 lên.
4. **Kiểm tra chéo Log:**
   - Nguyên nhân này có đi ngược lại bằng chứng nào trong Investigation Log không?
   - Có logic "ẩn" (middleware, interceptors, background jobs, cache state) nào chưa xem không?

### 6.2. Đề xuất verification

Chọn 1 hoặc kết hợp:
- **Trace code sâu hơn** — đi lại code path với input cụ thể từ user
- **Thêm logging** — `logger.info`/`logger.warn`/`logger.error` tại điểm nghi ngờ
- **Test/Spec** — đề xuất test case cụ thể
- **Browser verification** — dùng browser tools kiểm tra UI/network/console

### 6.3. Kết quả verification

```text
VERIFICATION:
- Phương pháp: [Logging/Test/Trace/Browser/...]
- Kết quả: [Những gì quan sát được]
- Confidence trước: [X%] → Confidence sau: [Y%]
- Kết luận: [Đạt/Chưa đạt mức >90% confidence]
```

Nếu chưa đạt >90% → Liệt kê thông tin cần thêm + user actions cần làm.

## BƯỚC 7: 📝 Báo cáo kết quả

Xuất report theo template tại `resources/debug_report_template.md`, bao gồm:

1. **Executive Summary** — lỗi gì, nguyên nhân chính, confidence
2. **Impact Analysis** — phạm vi ảnh hưởng, data integrity, workaround
3. **Reproduce** — command/steps cụ thể để xác nhận lỗi
4. **Chi tiết nguyên nhân** — file, function, code, evidence, hypothesis
5. **Nguyên nhân phụ** (nếu có)
6. **Đề xuất fix** — vị trí, code hiện tại → code đề xuất, risk level
7. **Regression Scope** — files bị ảnh hưởng, tests cần chạy, luồng UI cần kiểm tra
8. **Investigation Log** — audit trail đầy đủ
9. **Action items** — checklist trước/khi/sau fix

> **🔄 Handoff Protocol (debug → fix):**
> Khi user muốn sửa code, agent PHẢI:
> 1. **Fix phức tạp (≥4 files):** Tạo plan từ debug report → gọi `create-plan` với debug report làm input. Các constraint read-only của `/debug` TỰ ĐỘNG HẾT HIỆU LỰC khi chuyển sang implement.
> 2. **Fix đơn giản (≤3 files):** Hỏi user: "Fix này đơn giản (Tier S), muốn mình sửa luôn không?" → Nếu OK, sửa trực tiếp theo đề xuất fix trong report, KHÔNG cần tạo plan.
> 3. **Kết thúc `/debug`** → chuyển sang workflow implement, dùng kết quả debug làm input.

---

# Investigation Log

> **Mục đích:** Ghi lại TOÀN BỘ hành động điều tra theo thời gian, bao gồm cả **negative findings**.
> Giúp user hiểu reasoning path, giúp agent tránh đọc lại file đã check, và tăng transparency.

Agent PHẢI duy trì investigation log xuyên suốt Bước 3–6, cập nhật sau mỗi file/action:

```text
INVESTIGATION LOG:

| #  | Action              | File/Resource          | Finding                    | Hypothesis Impact        |
|----|---------------------|------------------------|----------------------------|--------------------------|
| 1  | Read file           | auth.service.ts        | fetch() thiếu timeout      | H1: ↑ confidence (70→85%)|
| 2  | grep "setSession"   | 3 files found          | Chỉ được gọi ở auth-ctx   | H2: neutral              |
| 3  | Read file           | auth-context.tsx       | Session logic đúng, ko lỗi | H2: ✗ eliminated         |
| 4  | Read file           | login-form.tsx         | loading=true, no catch     | H1: ↑ confirmed          |
| 5  | grep "AbortController"| 0 results             | Không dùng timeout ở đâu   | H1: ↑ strengthened       |

Eliminated hypotheses: H2 (session logic OK, evidence tại step #3)
Active hypotheses: H1 (confidence ~85%)
```

**Rules cho Investigation Log:**
- ✅ Ghi CẢ findings "không có gì" (negative) — chứng minh đã loại trừ
- ✅ Ghi rõ impact lên hypothesis nào
- ✅ Cập nhật confidence sau mỗi finding quan trọng
- 🚫 KHÔNG bỏ qua files đã đọc chỉ vì không tìm thấy lỗi

---

# Examples

## Ví dụ 1: Debug lỗi Frontend — Login timeout

**Input:**
```
/debug Login page hiện "Loading..." mãi không vào được dashboard
```

**Agent thực hiện:**

1. **Bước 1:** Phân loại: Frontend, High, Luôn xảy ra
2. **Bước 1.5:** Reproduce Plan:
   ```text
   REPRODUCE PLAN:
   - Loại lỗi: Frontend
   - Môi trường: Node 20 + bun, servers/nextjs/
   - Cách reproduce: Mở http://localhost:6003/login → nhập credentials → click Login
   - Expected: Redirect tới /dashboard trong 3s
   - Actual: Loading spinner vô hạn
   ```
3. **Bước 2:** Luồng: LoginForm → authService.login() → API /auth/login → setSession → redirect
4. **Bước 3:** Hypotheses:
   - H1 (~60%): fetch() thiếu timeout/error handling → loading state mãi true
   - H2 (~30%): Session set sai → redirect không trigger
   - H3 (~10%): API server chậm/down
5. **Bước 4:** Phân tích code theo hypothesis:
   - `auth.service.ts:23` — `await fetch('/auth/login')` thiếu timeout → H1 ↑ (85%)
   - `login-form.tsx:45` — loading state chỉ set `true`, không có catch → H1 confirmed
   - `auth-context.tsx:12` — session check đúng → H2 ✗ eliminated
6. **Bước 5:** Xếp hạng:
   - Rank 1: Missing timeout + error handling ở fetch (Confidence 85%, H1)
   - Rank 2: API server cold start chậm (Confidence 40%, H3)
7. **Bước 7:** Report với Investigation Log đầy đủ

---

## Ví dụ 2: Debug lỗi phức tạp — Race condition

**Input:**
```
/debug Giỏ hàng thỉnh thoảng hiện sai số lượng sau khi thêm sản phẩm,
nhưng reload lại thì đúng
```

**Agent thực hiện:**

1. **Bước 1:** Phân loại: Frontend + Backend, Medium, Thỉnh thoảng
2. **Bước 1.5:** Reproduce Plan:
   ```text
   REPRODUCE PLAN:
   - Khó reproduce 100% vì intermittent
   - Đề xuất: Click nút "Thêm vào giỏ" nhanh liên tục 3-4 lần
   - Quan sát: Số lượng trong cart icon có khớp không
   ```
3. **Bước 3:** Hypotheses:
   - H1 (~50%): Race condition — optimistic update bị override bởi API response
   - H2 (~30%): State mutation trực tiếp thay vì immutable update
   - H3 (~20%): API trả về stale data (caching issue)
4. **Bước 4:** Phân tích → phát hiện optimistic update ở `cart-context.tsx` + race condition khi 2 requests thêm SP gần nhau
5. **Bước 5:** Xếp hạng:
   - Rank 1: Race condition — 2 `addToCart()` calls gần nhau, response 2 override response 1 (Confidence 80%, H1)
6. **Case đặc biệt:** Race condition → đề xuất debounce + queue request

---

# Constraints

## Guardrails

- 🚫 **KHÔNG SỬA CODE** — Chỉ phân tích và đề xuất. Nếu user muốn fix → kết thúc `/debug`, chuyển sang workflow implement.
- 🚫 **KHÔNG GIẢ ĐỊNH** — Mọi kết luận PHẢI có evidence từ code/log/test. Không đoán mò.
- 🚫 **KHÔNG HALLUCINATE** — Nếu không đọc được file, PHẢI báo, KHÔNG đoán logic.
- 🚫 **KHÔNG TỰ CHẠY COMMAND** — Chỉ đề xuất reproduce plan cho user (xem Bước 1.5). Agent chỉ được thực hiện hành động read-only (grep, view_file, browse UI).

## Chất lượng phân tích

- ✅ LUÔN LUÔN dẫn chứng bằng **file path + line number + code snippet**.
- ✅ LUÔN LUÔN so sánh rủi ro với **triệu chứng user mô tả** (scope, timing, frequency).
- ✅ LUÔN LUÔN tự phản biện (Bước 6.1) trước khi kết luận.
- ✅ LUÔN LUÔN đưa ra **confidence score** cho mỗi nguyên nhân.
- ✅ LUÔN LUÔN duy trì **Investigation Log** xuyên suốt quá trình điều tra.
- ✅ LUÔN LUÔN ghi nhận **negative findings** (files đã check nhưng không có lỗi).
- ✅ Ưu tiên tìm **đủ** các khả năng hơn là vội kết luận một nguyên nhân.
- ✅ Mỗi file đọc phải gắn với **hypothesis cụ thể** (hypothesis-driven, không scan mù).

## Tuân thủ rules repo

- ✅ Đề xuất logging: dùng `logger.info`/`logger.warn`/`logger.error` — **KHÔNG dùng** `console.log`.
- ✅ Đề xuất code: nhắc dùng TSDoc, không chỉnh global styles nếu không cần.
- ✅ Chạy lệnh: ưu tiên `bun`/`bunx` — **KHÔNG dùng** `npm`/`npx`.

## Dừng và hỏi user

- Mô tả lỗi quá ngắn/mơ hồ → PHẢI hỏi rõ trước khi phân tích
- Reproduce plan cần user xác nhận → DỪNG, chờ feedback trước khi tiếp tục
- Không thể xác định nguyên nhân → báo rõ đã làm gì + cần thêm thông tin gì
- Debug xong, user muốn fix → kết thúc `/debug`, gợi ý chuyển sang workflow implement

## Cases đặc biệt (tham khảo `resources/special_cases.md`)

- **Không tìm được nguyên nhân** → ghi rõ đã trace gì, loại trừ gì, đề xuất thêm log
- **Nhiều nguyên nhân kết hợp** → liệt kê mức đóng góp, đề xuất thứ tự fix
- **Race condition** → mô tả timeline events, đề xuất đồng bộ/queue/debounce
- **Re-render/state issue** → check parent/context/hooks, đề xuất memoization
- **Performance issue** → xác định bottleneck, đề xuất quick win + long-term

---

# Debug Process Checklist

```markdown
## Checklist /debug

- [ ] **BƯỚC 0: NHẬN MÔ TẢ**
  - [ ] Đọc mô tả lỗi
  - [ ] Hỏi làm rõ nếu quá ngắn/thiếu

- [ ] **BƯỚC 0.5: NẠP CONTEXT**
  - [ ] Load project context (nếu có skill)

- [ ] **BƯỚC 1: THU THẬP**
  - [ ] Tóm tắt mô tả lỗi
  - [ ] Phân loại sơ bộ (loại/mức độ/tần suất)
  - [ ] Hỏi làm rõ nếu cần

- [ ] **BƯỚC 1.5: REPRODUCE PLAN**
  - [ ] Đề xuất reproduce command/steps (KHÔNG tự chạy)
  - [ ] Ghi rõ môi trường + thư mục yêu cầu
  - [ ] Chờ user xác nhận (hoặc ghi hạn chế nếu không thể)

- [ ] **BƯỚC 2: HIỂU HỆ THỐNG**
  - [ ] Tổng quan tech stack (nếu chưa biết)
  - [ ] Xác định luồng xử lý liên quan

- [ ] **BƯỚC 3: HYPOTHESIS-DRIVEN INVESTIGATION**
  - [ ] Đặt ít nhất 2–3 hypotheses với confidence ban đầu
  - [ ] Liệt kê files theo hypothesis (không theo alphabet)
  - [ ] Khởi tạo Investigation Log

- [ ] **BƯỚC 4: PHÂN TÍCH CODE**
  - [ ] Đọc & phân tích từng file (ưu tiên High)
  - [ ] Ghi nhận rủi ro (location + snippet + hypothesis + likelihood)
  - [ ] Liên kết files liên quan
  - [ ] Cập nhật Investigation Log sau mỗi file
  - [ ] Pivot checkpoint sau mỗi 2–3 files

- [ ] **BƯỚC 5: TỔNG HỢP**
  - [ ] Bảng rủi ro tổng hợp
  - [ ] Phân tích sâu top 3
  - [ ] Bảng xếp hạng nguyên nhân (có cột Hypothesis)

- [ ] **BƯỚC 6: VERIFICATION**
  - [ ] Tự phản biện (kèm kiểm tra Investigation Log)
  - [ ] Đề xuất verification strategy
  - [ ] Confidence score final

- [ ] **BƯỚC 7: BÁO CÁO**
  - [ ] Executive summary
  - [ ] Impact analysis + reproduce command
  - [ ] Chi tiết nguyên nhân + evidence
  - [ ] Đề xuất fix + regression scope
  - [ ] Investigation Log đầy đủ
  - [ ] Action items
```

---

# Các Skills liên quan

- `.agents/skills/create-plan/SKILL.md` — Tạo plan fix (sau khi debug xong)
- `.agents/skills/implement-plan/SKILL.md` — Implement fix
- `.agents/skills/review-implement/SKILL.md` — Review code fix

- `.agents/skills/review-implement/SKILL.md` — Review code fix

---
🚨 **CRITICAL DIRECTIVE (ĐỌC CUỐI CÙNG TRƯỚC KHI HÀNH ĐỘNG)** 🚨
1. Output Report của bạn bị coi là VÔ GIÁ TRỊ (Hallucination) nếu trước đó bạn KHÔNG thực hiện gọi Tool (`view_file`, `grep_search`, `mcp_gitnexus_impact`...) để thu thập bằng chứng.
2. Tuyệt đối không tự suy diễn các file/logic không tồn tại. Mọi Code Snippet đưa vào Báo cáo PHẢI khớp 100% với file gốc trong codebase.
3. NGAY BÂY GIỜ, hãy bắt đầu câu trả lời của bạn bằng thẻ `<thinking>`. NẾU BẠN BỎ QUA `<thinking>`, TOÀN BỘ QUY TRÌNH SẼ BỊ REJECT.
---

<!-- Generated by Skill Generator v3.2 / Upgraded Anti-Hallucination v3 -->
