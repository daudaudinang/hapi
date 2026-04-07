---
name: adk-skill-generator
description: |
  Tạo ADK Skill (Google Agent Development Kit) cho Presenton Slide Agent.
  Skill này giúp tạo skill chuẩn ADK format với YAML frontmatter, instructions,
  examples, constraints và subdirectories đúng chuẩn ADK (references/, assets/, scripts/).
  Output là skill sẵn sàng deploy vào agent/skills/ để cả simple_agent và complex_agent sử dụng.
  Kích hoạt khi user nói "tạo skill cho agent", "tạo ADK skill", "thêm skill cho slide agent",
  "create agent skill", "skill mới cho presenton agent", hoặc yêu cầu dạy agent hành vi mới.
---

# Goal

Tạo ADK skill hoàn chỉnh, đúng chuẩn Google ADK format, sẵn sàng deploy vào
`agent/skills/` để Presenton Slide Agent (cả simple và complex path) tự động load
và sử dụng qua `SkillToolset`.

# Instructions

## Kiến trúc ADK Skill — Bắt buộc hiểu trước khi tạo

### ADK Skill Model (3 tầng loading)

```
L1 — Frontmatter (YAML trong SKILL.md)
     → Loaded NGAY khi agent khởi động
     → Dùng để QUYẾT ĐỊNH có trigger skill không
     → name + description là QUAN TRỌNG NHẤT

L2 — Instructions (markdown body của SKILL.md)
     → Loaded KHI skill được trigger
     → Agent đọc và thực thi theo instructions

L3 — Resources (subdirectories)
     → Loaded khi cần (lazy)
     → references/ = tài liệu tham khảo bổ sung
     → assets/ = templates, schemas, data files
     → scripts/ = Python/Bash scripts chạy được
```

### Folder structure chuẩn ADK

```
agent/skills/<tên-skill>/
├── SKILL.md            ← BẮT BUỘC (L1 + L2)
├── references/         ← OPTIONAL: markdown tham khảo thêm
│   └── *.md
├── assets/             ← OPTIONAL: templates, schemas, data
│   └── *.*
└── scripts/            ← OPTIONAL: executable scripts
    └── *.py / *.sh
```

> ⚠️ KHÁC VỚI IDE Skill: ADK dùng `references/` + `assets/` (KHÔNG phải `resources/` + `examples/`)

### Frontmatter validation rules (từ ADK source code)

| Field | Required | Constraints |
|-------|----------|-------------|
| `name` | ✅ BẮT BUỘC | kebab-case, a-z 0-9 hyphens only, ≤64 chars, PHẢI trùng tên folder |
| `description` | ✅ BẮT BUỘC | ≤1024 chars, không được rỗng |
| `license` | ❌ Optional | string |
| `compatibility` | ❌ Optional | ≤500 chars |
| `allowed-tools` | ❌ Optional | tool patterns skill cần dùng |
| `metadata` | ❌ Optional | key-value pairs tùy ý |

### Presenton Agent Tools (skill có thể tham chiếu)

| Tool | Chức năng |
|------|----------|
| `list_presentations` | Liệt kê presentations |
| `get_presentation_detail` | Lấy chi tiết presentation + slides list |
| `get_slide_content` | Đọc nội dung 1 slide |
| `search_in_presentation` | Tìm kiếm trong presentation |
| `ask_about_presentation` | Hỏi đáp về nội dung slides (có grounding) |
| `edit_slide` | Chỉnh sửa nội dung slide |
| `export_presentation` | Xuất PDF/PPTX |
| `get_slide_preview` | Chụp ảnh preview slide |

---

## Phase 1: Thu thập yêu cầu

### 1.1. Đánh giá Fast Track

| Tình huống | Hành động | Phases |
|------------|----------|--------|
| User mô tả RÕ flow + rules + I/O | Fast Track: xác nhận → sinh skill | 1 (ngắn) → 3 |
| User có ý tưởng nhưng chưa rõ | Standard: phỏng vấn ngắn | 1 → 2 → 3 |
| User chỉ biết "muốn dạy agent" | Full Interview | 1 (đầy đủ) → 2 → 3 |

### 1.2. Phỏng vấn (nếu cần)

Hỏi theo trình tự:

1. **Trigger**: "Agent cần làm gì? Khi nào trigger skill này?"
2. **Steps**: "Các bước agent phải thực hiện là gì? Cần gọi tool nào?"
3. **Tools**: "Skill cần dùng những tool nào trong 8 tools trên?"
4. **Rules**: "Có quy tắc nào BẮT BUỘC? Có gì TUYỆT ĐỐI KHÔNG ĐƯỢC?"
5. **Examples**: "Cho 1-2 ví dụ cụ thể: user hỏi gì → agent trả lời gì?"
6. **Edge cases**: "Trường hợp đặc biệt nào cần xử lý?"

### 1.3. Tổng kết và confirm

Trước khi tạo skill, TÓM TẮT cho user xác nhận:

```
📌 Skill: <tên>
🎯 Mục tiêu: <1 câu>
📝 Quy trình: <N bước>
🔧 Tools cần: <danh sách>
⚠️ Quy tắc: <N điều>
```

BẮT BUỘC user confirm trước khi chuyển Phase 2.

---

## Phase 2: Phân tích & thiết kế

### 2.1. Đặt tên skill (PHẢI match folder name)

- Format: `kebab-case`, chỉ a-z 0-9 và `-`
- Tối đa 64 ký tự
- Công thức: `[hành-động]-[đối-tượng]`
- Ví dụ: `grounding-enforcement`, `add-summary`, `check-consistency`

### 2.2. Viết Description "trigger mạnh"

Description là thứ agent đọc ĐẦU TIÊN để quyết định trigger. Phải:

1. Nói rõ skill LÀM GÌ (dòng 1)
2. Nói rõ KHI NÀO dùng (trigger phrases — ít nhất 3)
3. ≤1024 chars (ADK hard limit)

Template:
```
<Hành động chính> <đối tượng> <phương pháp/chuẩn>.
<Chi tiết bổ sung>.
Triggers when the user asks to <trigger 1>, <trigger 2>, <trigger 3>.
```

### 2.3. Complexity assessment → cấu trúc folder

| Mức | Điều kiện | Cấu trúc |
|-----|----------|----------|
| 🟢 Đơn giản | ≤5 bước, ít rules | Chỉ `SKILL.md` |
| 🟡 Trung bình | 6-10 bước hoặc nhiều rules | `SKILL.md` + `references/` |
| 🟠 Phức tạp | >10 bước, cần templates | `SKILL.md` + `references/` + `assets/` |
| 🔴 Rất phức tạp | Cần chạy scripts | Full structure + `scripts/` |

---

## Phase 3: Sinh Skill

### 3.1. Tạo SKILL.md

```markdown
---
name: <kebab-case, match folder name>
description: |
  <Dòng 1: Hành động + đối tượng>
  <Dòng 2: Chi tiết>
  <Dòng 3: Trigger phrases>
---

# <Skill Title>

## When to Use

Use this skill when the user wants to:
- <trigger 1>
- <trigger 2>
- <trigger 3>

## Workflow

### Step 1: <Tên bước>
<Hướng dẫn cụ thể, gọi tool nào, logic nào>

### Step 2: ...

## Examples

### Example 1: <Happy path>
**Input:** <user message>
**Expected behavior:** <agent gọi tool gì, trả lời gì>

### Example 2: <Edge case>
**Input:** <user message bất thường>
**Expected behavior:** <agent xử lý thế nào>

## Constraints

- 🚫 KHÔNG ĐƯỢC <điều cấm>
- ✅ LUÔN LUÔN <điều bắt buộc>

## Tips

- <Lưu ý thêm>
```

### 3.2. Quy tắc viết Instructions chất lượng cao (ADK-specific)

1. **Mỗi step gọi rõ tool name**: "Use `get_slide_content` to..." (KHÔNG nói "đọc slide")
2. **Logic rẽ nhánh tường minh**:
   ```
   3. Check result:
      - **If** found → Use data to respond
      - **If** not found → Tell user "information not available"
   ```
3. **Verification step cuối cùng**: "Use `get_slide_content` to confirm..."
4. **Tối đa 10 steps** — ADK agent có `max_steps=15`, skill không nên chiếm quá 10

### 3.3. Tạo subdirectories (nếu cần)

**references/**: Markdown files bổ sung
- Thêm khi skill cần hướng dẫn chi tiết hơn SKILL.md
- Ví dụ: `references/hallucination_patterns.md`

**assets/**: Templates, schemas, data
- Thêm khi skill cần mẫu output cố định
- Ví dụ: `assets/report_template.md`

**scripts/**: Executable scripts
- Thêm khi skill cần tính toán hoặc I/O phức tạp
- Ví dụ: `scripts/calculate_score.py`
- Script PHẢI có `--help` flag

### 3.4. Validation tự động

Trước khi deploy, kiểm tra:

- [ ] Tên folder = `name` trong YAML frontmatter
- [ ] `name` là kebab-case, ≤64 ký tự
- [ ] `description` không rỗng, ≤1024 ký tự
- [ ] Instructions gọi đúng tool names (1 trong 8 tools)
- [ ] Ít nhất 2 examples (Input/Output)
- [ ] Ít nhất 1 constraint
- [ ] SKILL.md parse được YAML hợp lệ
- [ ] Chạy `uv run pytest tests/test_skills_loading.py` PASS

### 3.5. Deploy & verify

1. Tạo folder: `agent/skills/<tên-skill>/SKILL.md`
2. Restart agent: `pm2 restart presenton-agent`
3. Kiểm tra logs: skill loaded OK, không có error
4. Test bằng curl hoặc UI: gửi message trigger → verify skill activated

Hiển thị cho user:

```
✅ ADK Skill `<tên>` đã tạo xong!

📁 Vị trí: agent/skills/<tên>/
📊 Mức độ: [Đơn giản/Trung bình/Phức tạp]
📄 Files: [danh sách]

🚀 Đã deploy — restart agent để load skill mới.
🧪 Test: gửi message "<trigger phrase>" để kiểm tra.

📦 Generated by ADK Skill Generator v1.0
```

---

# Examples

## Ví dụ 1: Tạo skill đơn giản — Grounding Enforcement

**Context:** User muốn ngăn agent hallucinate khi trả lời câu hỏi về presentation.

**Input:** "Tạo skill dạy agent lúc nào phải gọi tool và không được tự trả lời"

**Thought Process:**
- Trigger: Khi user hỏi factual question về slides
- Tools cần: `ask_about_presentation`
- Rules: PHẢI gọi tool trước, KHÔNG ĐƯỢC dùng training data
- Complexity: 🟢 Đơn giản (4 bước, 6 rules) → chỉ SKILL.md

**Output:**
```
agent/skills/grounding-enforcement/
└── SKILL.md    # 4 steps, 4 examples, 6 constraints
```

---

## Ví dụ 2: Tạo skill phức tạp — Analyze Presentation

**Context:** User muốn agent phân tích toàn bộ presentation và đánh giá chất lượng.

**Input:** "Tạo skill phân tích bài thuyết trình, cho điểm và gợi ý cải thiện"

**Thought Process:**
- Trigger: "phân tích presentation", "đánh giá bài thuyết trình", "score slides"
- Tools cần: `get_presentation_detail`, `get_slide_content`, `get_slide_preview`
- Steps: nhiều (đọc tất cả slides → phân tích → scoring → recommendations)
- Cần template báo cáo → assets/
- Complexity: 🟡 Trung bình → SKILL.md + assets/

**Output:**
```
agent/skills/analyze-presentation/
├── SKILL.md
└── assets/
    └── report_template.md
```

---

## Ví dụ 3: Khác biệt ADK vs IDE skill

| Aspect | ADK Skill | IDE Skill (skill-generator) |
|--------|-----------|---------------------------|
| Vị trí | `agent/skills/` | `.agents/skills/` |
| Loader | `google.adk.skills.load_skill_from_dir()` | IDE agent internal |
| Thư mục con | `references/`, `assets/`, `scripts/` | `resources/`, `examples/`, `scripts/` |
| Name validation | kebab-case, ≤64 chars, PHẢI match folder name | kebab-case, ≤30 chars |
| Description limit | ≤1024 chars | Không giới hạn cứng |
| Runtime | Gemini LLM (production agent) | Claude/Gemini (coding agent) |
| Tools tham chiếu | 8 Presenton tools | IDE tools (file, terminal, search) |

---

# Constraints

## Về ADK compliance
- 🚫 KHÔNG ĐƯỢC đặt tên folder khác `name` trong YAML → ADK sẽ raise `ValueError`
- 🚫 KHÔNG ĐƯỢC dùng uppercase, space, hoặc ký tự đặc biệt trong `name`
- 🚫 KHÔNG ĐƯỢC viết `description` > 1024 ký tự → ADK sẽ raise `ValueError`
- 🚫 KHÔNG ĐƯỢC dùng thư mục `resources/` hoặc `examples/` → ADK chỉ nhận `references/`, `assets/`, `scripts/`
- ✅ LUÔN LUÔN validate YAML frontmatter trước khi deploy

## Về chất lượng skill
- 🚫 KHÔNG ĐƯỢC tạo skill "ôm đồm" nhiều chức năng — 1 skill = 1 việc
- 🚫 KHÔNG ĐƯỢC viết instructions mơ hồ — phải gọi đúng tool name
- 🚫 KHÔNG ĐƯỢC bỏ qua Examples — thiếu ví dụ = agent hành xử sai
- ✅ LUÔN LUÔN thêm ít nhất 2 examples
- ✅ LUÔN LUÔN chạy `uv run pytest tests/test_skills_loading.py` sau khi tạo
- ✅ LUÔN LUÔN restart agent và test thực tế sau deploy

## Về bảo mật
- 🚫 KHÔNG ĐƯỢC hardcode API keys vào skill
- 🚫 KHÔNG ĐƯỢC tạo skill thao tác destructive mà không có confirmation
- ✅ LUÔN LUÔN thêm Safety Check cho skill thao tác nhạy cảm

## Dấu ấn nguồn gốc
- ✅ LUÔN LUÔN thêm `<!-- Generated by ADK Skill Generator v1.0 -->` vào cuối SKILL.md

<!-- Generated by ADK Skill Generator v1.0 -->
