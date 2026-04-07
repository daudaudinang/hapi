---
name: create-plan
description: |
  Tạo plan triển khai chi tiết theo workflow 4 pha tuần tự: thu thập yêu cầu →
  khám phá codebase → phân tích & hỏi user chốt quyết định → viết plan.
  Plan đầu ra đủ chi tiết để agent khác implement mà không cần hỏi thêm.
  Kích hoạt khi user chạy `/create-plan`, hoặc yêu cầu "tạo plan",
  "kế hoạch triển khai", "lập plan để implement", "brainstorm → plan".
---

# Goal

Sinh plan triển khai chi tiết, actionable từ yêu cầu của user, đảm bảo agent khác có thể implement mà **không cần hỏi thêm bất kỳ câu hỏi nào**.

---

# Instructions

> **QUY TRÌNH BẮT BUỘC (CHAIN OF THOUGHT):**
> 1. Mọi phân tích, đọc code, hoặc lập luận của bạn BẮT BUỘC phải nằm trong block `<thinking>...</thinking>`.
> 2. TRONG khối này, hãy phân tích yêu cầu và định hình các lệnh Tool cần gọi (vd: `mcp_gitnexus_query`, `view_file`, `grep_search`).
> 3. **[DỪNG LẠI SAU KHI GỌI TOOL. NGHIÊM CẤM TỰ Ý TẠO PLAN NẾU CHƯA CÓ KẾT QUẢ TỪ TOOL QUẢN LÝ]**.
> 4. Bạn chỉ được phép sinh Plan hoặc hỏi User ở turn tiếp theo, SAU KHI Tool đã trả về log thành công.

## Bước 0: Khởi tạo

1. Xác định `<FEATURE_NAME>` từ lệnh `/create-plan <feature_name>` hoặc từ mô tả user.
2. Chuyển thành UPPERCASE + underscore cho tên file plan (VD: `font-combobox` → `PLAN_FONT_COMBOBOX.md`).
3. Kiểm tra xem đã có plan cũ tại `.agents/plans/PLAN_<FEATURE_NAME>.md` chưa:
   - **Nếu có** → Hỏi user: "Đã tồn tại plan này. Muốn tạo mới hay cập nhật?"
     - **Nếu tạo mới** → Archive plan cũ (rename thành `PLAN_<NAME>_v<N>_archived.md`), tạo plan mới.
     - **Nếu cập nhật** → Đọc plan hiện tại, áp dụng **Plan Versioning Protocol** (xem section bên dưới).
   - **Nếu không** → Tiếp tục.

## Bước 0.1: 🎯 Triage Complexity

Đánh giá task theo ma trận để chọn mức chi tiết phù hợp:

| Tier | Tiêu chí | Ảnh hưởng đến workflow |
|------|----------|------------------------|
| **S (Simple)** | ≤ 3 files, 1 module, không cross-cutting, bug fix nhỏ | Plan rút gọn: chỉ giữ Mục tiêu + AC + Execution Boundary + Test plan. Bỏ: UX/Flow, Data Model, Kiến trúc, Extensibility. Có thể skip Phase 3 nếu không có câu hỏi |
| **M (Medium)** | 4–10 files, 2–3 modules, có edge cases | Plan đầy đủ, có thể bỏ sections không liên quan (đánh dấu `<!-- Bỏ -->` trong template) |
| **L (Large)** | >10 files, cross-cutting, cần phasing, nhiều dependencies | Plan đầy đủ + chia story files (xem Context Sharding ở Phase 4) |

1. Ước lượng số files/modules bị ảnh hưởng.
2. Xác định Tier → Ghi vào header plan: `> **Tier**: S / M / L`
3. Tier S → Phase 2 khám phá nhanh, Phase 3 skip nếu không có câu hỏi, Phase 4 dùng template rút gọn.

## Bước 0.5: 🔄 Ensure GitNexus Index

> **Mục đích:** Đảm bảo code knowledge graph luôn fresh trước khi truy vấn.
> Mất ~5-10s nhưng tiết kiệm nhiều token khi query codebase so với grep.
> Project context đã được nạp tự động qua `AGENTS.md` (system prompt).

1. Gọi `mcp_gitnexus_list_repos` — kiểm tra GitNexus MCP có đang chạy không.
2. **Nếu có** → Chạy `npx gitnexus analyze` tại project root (LUÔN CHẠY để đảm bảo index mới nhất, không tự ý skip). Ghi nhận `HAS_GITNEXUS = true`.
3. **Nếu không** → Ghi nhận `HAS_GITNEXUS = false`, sử dụng `grep_search` / `view_file` / `find_by_name` làm fallback.

## PHASE 1: 📥 Thu thập yêu cầu

1. **Đọc và hiểu yêu cầu** từ message/context user cung cấp.
2. **Xác định loại yêu cầu:**
   - 🆕 Feature mới
   - ⬆️ Cải tiến feature có sẵn
   - 🐛 Bug fix
   - 🔄 Refactor
3. **Xác định scope ban đầu:**
   - **Goal**: User muốn đạt được gì?
   - **Non-goals**: Những gì KHÔNG làm ở phase này.
   - **Priority/deadline**: Nếu user đề cập.
4. **Liệt kê điểm chưa rõ:**
   - Những gì user đề cập nhưng chưa đủ chi tiết.
   - Những gì có thể hiểu theo nhiều cách.
   - ⚠️ **CHƯA hỏi user** — ghi nhận để hỏi sau khi khám phá codebase (Phase 3).

## PHASE 2: 🔍 Khám phá codebase (CỬA ẢI BẮT BUỘC)

> **VERIFICATION GATE (CHỐNG LƯỜI):** Kỷ luật thép yêu cầu bạn KHÔNG ĐƯỢC PHÉP tạo Plan hoặc hỏi User nếu chưa từng gọi các lệnh khám phá codebase (`mcp_gitnexus_query`, `view_file`...). Việc dựa vào bộ nhớ tĩnh để đoán file/folder bị coi là LỪA DỐI (Hallucination). Mọi component được đưa vào Plan phải được xác thực tồn tại bằng Bash Log.

1. **Tìm files/modules liên quan** bằng các tools:

   **Nếu `HAS_GITNEXUS = true` (Ưu tiên):**
   - `mcp_gitnexus_query` — tìm execution flows và processes liên quan đến feature
   - `mcp_gitnexus_context` — xem 360° của 1 symbol (callers, callees, imports, processes)
   - `mcp_gitnexus_impact` — phân tích blast radius của thay đổi
   - `view_file` — đọc chi tiết code khi cần xem implementation

   **Nếu `HAS_GITNEXUS = false` (Fallback):**
   - `grep_search` — tìm keywords, function/class definitions
   - `find_by_name` — tìm files theo tên/pattern
   - `view_file` — đọc chi tiết code cần thiết
2. **Đọc code có mục tiêu** — tập trung vào:
   - **Entrypoints**: routes, controllers, API endpoints
   - **Business logic**: services, workflows, use cases
   - **Types/interfaces**: data models, schema definitions
   - **Tests**: test files liên quan (nếu có)
3. **Xác định patterns đang dùng:**
   - Naming conventions (file, function, variable)
   - Folder structure conventions
   - State management patterns
   - Error handling patterns
4. **Xác định impacts:**
   - Files nào cần thay đổi/thêm mới?
   - Có breaking changes không?
   - Dependencies với modules khác?
   - Side effects tiềm ẩn?
5. **Depth Check** (sau khi liệt kê files ban đầu):

   Với MỖI file cần thay đổi, kiểm tra:
   - **Nếu `HAS_GITNEXUS`**: Dùng `mcp_gitnexus_context` (symbol name) → xem callers, consumers, processes tự động. Hoặc `mcp_gitnexus_impact` (target, direction="upstream") → blast radius.
   - **Nếu không**: `grep_search` tên function/component → tìm callers/consumers thủ công.
   - **Middleware/Interceptors**: có layer ẩn nào xử lý trước/sau?
   - **Existing tests**: đã có test nào cho file này?

   Ghi kết quả:
   ```text
   DEPTH CHECK:
   - [file1]: 3 callers, 1 middleware, 2 tests
   - [file2]: no callers (entrypoint), no tests ⚠️
   - Impact chain: file1 → file3 → file4 (indirect impact)
   ```

   > **Mục đích:** Tránh bỏ sót middleware, hooks, event listeners ẩn — nguyên nhân phổ biến
   > khiến plan thiếu edge cases và implement bị lỗi.

6. **Ghi nhận research:**
   - **Nếu phức tạp** (nhiều modules, cross-cutting concerns) → Lưu vào `<feature_name>_research/codebase-analysis.md`
   - **Nếu đơn giản** → Giữ trong context, nhưng vẫn cite paths rõ ràng

> **Hook Multi-Merchant:** Nếu plan đụng tới **Multi-Merchant Marketplace**, ưu tiên đọc `.cursor/rules/context-rule.mdc` hoặc `.agents/rules/context-rule.md` để bám contract "đã chốt" và tài liệu source-of-truth.

## PHASE 3: 💬 Phân tích & Hỏi user chốt quyết định

1. **Tổng hợp phát hiện** từ Phase 2.
2. **Phân loại câu hỏi** cần hỏi:

   | Loại | Ví dụ | Khi nào hỏi |
   |------|-------|-------------|
   | **Nghiệp vụ** | "Giới hạn recent fonts là bao nhiêu?" | Cần con số/quy tắc cụ thể |
   | **UX** | "Khi user gõ font không hợp lệ thì hiển thị gì?" | Có nhiều cách xử lý |
   | **Kỹ thuật** | "Lưu vào config block hay global store?" | Có trade-offs rõ ràng |
   | **Scope** | "Phase này có cần làm X không?" | Không chắc nằm trong scope |
   | **Confirm** | "Mình hiểu Y như vậy đúng không?" | Cần xác nhận giả định |

3. **Nhóm câu hỏi** theo chủ đề (tối đa 5–7 câu/lượt).
4. **Đặt câu hỏi** theo template (tham khảo `resources/question_template.md`):
   - Mỗi nhóm có: **Ngữ cảnh** (vì sao hỏi) + **Câu hỏi** + **Đề xuất** (options + pros/cons)
   - ❌ KHÔNG hỏi "nhỏ giọt" từng câu một
   - ❌ KHÔNG hỏi những gì có thể tự tìm được từ codebase
5. **Ghi nhận câu trả lời** và đánh dấu "đã chốt" trong plan.
6. Nếu câu trả lời tạo ra câu hỏi mới → Nhóm và hỏi tiếp (tối đa 2 lượt hỏi).

## PHASE 4: 📝 Viết plan & Lưu file

1. **Viết plan** theo template chuẩn tại `resources/plan_template.md`.
2. **Điền header**: Version, Tier (từ Bước 0.1), Type, Created date.
3. **Đảm bảo mỗi section trả lời được câu hỏi kiểm tra:**

   | Section | Câu hỏi kiểm tra | Bắt buộc |
   |---------|------------------|----------|
   | Mục tiêu | Agent biết đang làm gì? | ✅ Bắt buộc (S/M/L) |
   | Acceptance Criteria | Agent biết "xong" là khi nào? Verify bằng gì? | ✅ Bắt buộc (S/M/L) |
   | Non-goals | Agent biết KHÔNG làm gì? | ✅ Bắt buộc (M/L) |
   | Bối cảnh | Agent biết code hiện tại ra sao? | ✅ Bắt buộc (M/L) |
   | Dependencies | Agent biết cần gì sẵn trước khi bắt đầu? | ✅ Bắt buộc (M/L) |
   | Yêu cầu nghiệp vụ | Agent biết các con số/quy tắc cụ thể? | ✅ Bắt buộc (M/L) |
   | Thiết kế | Agent biết cần tạo gì, ở đâu, kiến trúc thế nào? | Bỏ qua cho Tier S |
   | Execution Boundary | Agent biết sửa files nào, CẤM sửa gì? | ✅ Bắt buộc (S/M/L) |
   | Test plan | Agent biết verify thế nào? | ✅ Bắt buộc (S/M/L) |
   | Decisions đã chốt | Agent biết những gì KHÔNG cần hỏi lại? | ✅ Bắt buộc nếu có Phase 3 |

4. **Review nội bộ** trước khi lưu:
   - [ ] Mọi AC đều SMART (Specific, Measurable)?
   - [ ] Execution Boundary rõ ràng (Allowed + Do NOT Modify)?
   - [ ] Implementation Order có dependency đúng? (file phụ thuộc liệt kê trước)
   - [ ] Risk Matrix đầy đủ (Likelihood + Impact + Mitigation)?
   - [ ] Pre-flight Check đầy đủ (deps, services, env vars, branch)?
   - [ ] Đủ thông tin để implement mà KHÔNG cần hỏi thêm?
   - [ ] Không mâu thuẫn với context/rules?
   - [ ] Risks & edge cases đã cover?
   - [ ] Non-goals rõ ràng?
   - [ ] Dependencies liệt kê đủ?
   - [ ] Nếu cập nhật plan cũ → Change Log đã ghi?
5. **Lưu file** vào `.agents/plans/PLAN_<FEATURE_NAME>.md`
6. **Thông báo user** kết quả + gợi ý chạy `/review-plan` để review.

### Context Sharding (chỉ Tier L)

Nếu plan có >3 phases hoặc >300 dòng, chia thành story files:

```
.agents/plans/<FEATURE>_stories/
├── story-1-<tên_phase>.md
├── story-2-<tên_phase>.md
└── story-3-<tên_phase>.md
```

Mỗi story file có format:
- **Parent Plan**: link đến plan chính
- **Scope**: chỉ files/changes thuộc phase này
- **AC**: acceptance criteria CỤ THỂ cho phase này
- **Dependencies**: phase nào phải xong trước
- **Execution Boundary**: chỉ files thuộc phase

> Mục đích: Agent implement chỉ cần load 1 story (~100 dòng) thay vì toàn bộ plan → giảm context pollution, tăng accuracy.

---

# Examples

## Ví dụ 1: Tạo plan đơn giản — Font Combobox

**Input:**
```
/create-plan font-combobox

Mình muốn thay dropdown chọn font trong Template Editor
thành combobox có search, cho phép gõ tên font custom,
và lưu recent fonts theo block.
```

**Agent thực hiện:**

1. **Phase 1:** Hiểu user muốn:
   - Thay dropdown → combobox + search
   - Cho phép custom font
   - Lưu recent theo block

2. **Phase 2:** Khám phá codebase:
   - `grep_search` "fontFamily" → phát hiện 3 vị trí sử dụng
   - `view_file` trên `types.ts` → thấy `TemplateCellStyle` có `fontFamily`
   - `view_file` trên `template-editor-dialog` → thấy cách normalize config

3. **Phase 3:** Hỏi user:
   ```markdown
   ## 📋 Cần confirm một số điểm

   ### 1) Giới hạn recent fonts

   **Ngữ cảnh:** Google Sheets thường giới hạn ~8 recent fonts.
   **Câu hỏi:** Muốn giới hạn bao nhiêu?
   **Đề xuất:** 8 (giống Google Sheets)

   ### 2) Preset fonts

   **Ngữ cảnh:** Cần một list fonts mặc định.
   **Câu hỏi:** Muốn list fonts như thế nào?
   **Đề xuất:** "Phổ biến như Google Sheets" - gồm web-safe + Google Fonts phổ biến
   ```

4. **Phase 4:** Tạo plan đầy đủ → lưu file

**Output:**
```
✅ Đã tạo plan: .agent/plans/PLAN_FONT_COMBOBOX.md

Plan bao gồm:
- 3 vị trí cần thay đổi (cell-level, segment-level, forEach child)
- Schema mở rộng: editor.recentFonts
- Preset fonts: 25 fonts (web-safe + Google Fonts)
- Test plan: 6 happy paths + 4 edge cases

Bạn có thể review bằng: /review-plan .agent/plans/PLAN_FONT_COMBOBOX.md
```

---

## Ví dụ 2: Plan phức tạp — Multi-Merchant Feature

**Input:**
```
/create-plan seller-dashboard

Cần tạo trang Seller Dashboard cho marketplace,
hiển thị thống kê doanh số, đơn hàng pending, sản phẩm low stock.
```

**Agent thực hiện:**

1. **Phase 1:** Xác định scope:
   - ✅ Goal: Dashboard cho seller xem tổng quan kinh doanh
   - ❌ Non-goals: Không làm analytics chi tiết, không làm export report

2. **Phase 2:** Khám phá codebase + đọc context-rule (vì đây là Multi-Merchant):
   - Đọc `.agents/rules/context-rule.md` để nắm contract đã chốt
   - Tìm hiểu existing seller pages, existing dashboard patterns
   - Xác định API endpoints liên quan (orders, products, analytics)

3. **Phase 3:** Hỏi user 1 lượt (nhóm 4 câu):
   - Thời gian thống kê mặc định (7 ngày / 30 ngày?)
   - Low stock threshold (bao nhiêu?)
   - Realtime hay poll interval?
   - Có cần responsive mobile không?

4. **Phase 4:** Viết plan + lưu file

---

# Constraints

## Quy trình

- 🚫 KHÔNG ĐƯỢC hỏi user ngay khi nhận yêu cầu — PHẢI khám phá codebase TRƯỚC (Phase 2 trước Phase 3).
- 🚫 KHÔNG ĐƯỢC hỏi những gì có thể tự tìm được từ code (VD: "project dùng framework gì?" khi đã thấy package.json).
- 🚫 KHÔNG ĐƯỢC hỏi quá 7 câu trong 1 lượt, và KHÔNG quá 2 lượt hỏi.
- ✅ LUÔN LUÔN nhóm câu hỏi theo chủ đề + kèm đề xuất mặc định.
- ✅ LUÔN LUÔN đánh dấu "đã chốt" cho yêu cầu nghiệp vụ đã được user confirm.

## Chất lượng Plan

- 🚫 KHÔNG ĐƯỢC viết plan "sơ sài" — agent implement phải KHÔNG CẦN hỏi thêm.
- 🚫 KHÔNG ĐƯỢC bỏ qua Non-goals — tránh scope creep.
- 🚫 KHÔNG ĐƯỢC bỏ qua Test plan — mỗi plan phải có test cases.
- 🚫 KHÔNG ĐƯỢC viết test assert theo hành vi sai (buggy behavior) — test PHẢI assert hành vi **đúng/mong đợi**. Nếu code có bug, test phải **FAIL** để exposed bug, KHÔNG được dùng `it.failing()`, `it.skip()`, hay assert output sai để giữ test suite green.
- ✅ Với mỗi 🔶 SPEC CHECK / Bug item: plan phải ghi rõ test sẽ assert **hành vi đúng** (cho phép test fail khi bug tồn tại).
- 🚫 KHÔNG ĐƯỢC bỏ qua Acceptance Criteria — mỗi AC phải SMART.
- 🚫 KHÔNG ĐƯỢC bỏ qua Execution Boundary — phải ghi rõ Allowed + Do NOT Modify.
- ✅ LUÔN LUÔN cite file paths cụ thể khi mô tả code hiện tại.
- ✅ LUÔN LUÔN ghi rõ file nào cần sửa/tạo mới trong section "Execution Boundary".
- ✅ LUÔN LUÔN liên kết với existing patterns trong codebase — giữ consistency.
- ✅ LUÔN LUÔN ghi Decisions đã chốt nếu Phase 3 có hỏi user.

## Naming & Output

- ✅ Plan file: `PLAN_<FEATURE_NAME>.md` (UPPERCASE, underscore) tại `.agents/plans/`
- ✅ Research folder: `<feature_name>_research/` (lowercase, underscore) tại `.agents/plans/`
- ✅ Story files (Tier L): `<FEATURE>_stories/story-N-<name>.md` tại `.agents/plans/`
- ✅ Đặt tên plan rõ ràng: `PLAN_FEATURE_NAME` — KHÔNG `PLAN_UPDATE_1`
- ✅ LUÔN LUÔN gợi ý `/review-plan` sau khi tạo xong.

## Recovery khi disconnect

- Có research notes → Đọc lại `.agents/plans/<feature_name>_research/`
- Có plan draft → Tiếp tục từ draft
- Không có gì → Bắt đầu lại từ Phase 1

---

# Plan Versioning Protocol

> **Áp dụng khi:** User yêu cầu cập nhật plan đã tồn tại (Bước 0).

Khi cập nhật plan cũ (thay vì tạo mới):

1. **Bump version**: `1.0` → `1.1` (minor change), `1.0` → `2.0` (major scope change)
2. **Cập nhật header**: `> **Version**: 1.1` + `> **Updated**: YYYY-MM-DD`
3. **Ghi Change Log** cuối plan:

```text
## Change Log

| Version | Date       | Changes                          | Reason                    |
|---------|------------|----------------------------------|---------------------------|
| 1.1     | 2026-03-11 | Thêm API endpoint X, bỏ AC-3    | User yêu cầu scope change |
| 1.0     | 2026-03-10 | Initial plan                     | -                         |
```

4. **Đánh dấu AC thay đổi**:
   - AC mới → `[NEW]`
   - AC sửa → `[MODIFIED]` + ghi lý do
   - AC xóa → chuyển sang "Removed ACs" section + ghi lý do
5. **Thông báo implement agent**: nếu đã có agent đang implement → cảnh báo "plan đã thay đổi, verify version trước khi tiếp tục"

---

# Planning Checklist (tự kiểm trước khi giao)

```markdown
## Planning Checklist

- [ ] **BƯỚC 0: KHỞI TẠO**
  - [ ] Xác định FEATURE_NAME
  - [ ] Kiểm tra plan cũ (nếu có → hỏi tạo mới/cập nhật)
  - [ ] Nếu cập nhật → áp dụng Plan Versioning Protocol

- [ ] **BƯỚC 0.1: TRIAGE COMPLEXITY**
  - [ ] Đánh giá Tier: S / M / L
  - [ ] Ghi Tier vào plan header

- [ ] **BƯỚC 0.5: NẠP CONTEXT** (nếu có)
  - [ ] Load project context

- [ ] **PHASE 1: THU THẬP YÊU CẦU**
  - [ ] Đọc yêu cầu user
  - [ ] Xác định scope (feature mới/cải tiến/fix)
  - [ ] Liệt kê điểm chưa rõ

- [ ] **PHASE 2: KHÁM PHÁ CODEBASE**
  - [ ] Tìm files liên quan
  - [ ] Hiểu cấu trúc hiện tại
  - [ ] Xác định patterns trong project
  - [ ] Xác định impacts
  - [ ] **Depth Check**: callers, consumers, middleware, tests cho TỪNG file

- [ ] **PHASE 3: HỎI USER** (skip nếu Tier S không có câu hỏi)
  - [ ] Nhóm câu hỏi theo chủ đề
  - [ ] Đề xuất options cho mỗi câu hỏi
  - [ ] Ghi nhận câu trả lời

- [ ] **PHASE 4: TẠO PLAN**
  - [ ] Điền đủ header: Version, Tier, Type, Date
  - [ ] Acceptance Criteria — SMART, có verify command
  - [ ] Execution Boundary — Allowed + Do NOT Modify
  - [ ] Risk Matrix (Likelihood × Impact)
  - [ ] Implementation Order (dependency graph)
  - [ ] Pre-flight Check
  - [ ] Dependencies / Prerequisites
  - [ ] Decisions đã chốt (nếu Phase 3 có hỏi)
  - [ ] Test plan
  - [ ] Change Log (nếu cập nhật plan cũ)
  - [ ] Review nội bộ (checklist ở Phase 4)
  - [ ] Context Sharding nếu Tier L (>300 dòng)
  - [ ] Lưu file vào `.agents/plans/`
  - [ ] Thông báo user + gợi ý review
```

---

# Các Skills liên quan

- `.agents/skills/implement-plan/SKILL.md` — Triển khai plan đã tạo
- `.agents/skills/review-plan/SKILL.md` — Review plan trước khi implement
- `.agents/skills/review-implement/SKILL.md` — Review code sau implement

---
🚨 **CRITICAL DIRECTIVE (ĐỌC CUỐI CÙNG TRƯỚC KHI HÀNH ĐỘNG)** 🚨
1. Output Plan của bạn bị coi là VÔ GIÁ TRỊ (Hallucination) nếu trước đó bạn KHÔNG thực hiện lệnh `mcp_gitnexus_query`, `view_file` hay `grep_search` nào.
2. Tuyệt đối không tự suy diễn cấu trúc folder/hàm tĩnh. Mọi Path/Symbol đề cập trong Plan PHẢI khớp 100% với thực tế codebase.
3. NGAY BÂY GIỜ, hãy bắt đầu câu trả lời của bạn bằng thẻ `<thinking>`. NẾU BẠN BỎ QUA `<thinking>`, TOÀN BỘ QUY TRÌNH SẼ BỊ REJECT.
---

<!-- Generated by Skill Generator v3.2 / Upgraded Anti-Hallucination v3 -->
