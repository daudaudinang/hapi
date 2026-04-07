# 🧩 Skill Generator v3.2 Expert — Bộ Công Cụ Tạo AI Skill Hoàn Chỉnh

> **Biến ý tưởng + quy trình công việc trong đầu bạn → AI Skill tự động hóa**
> Dành cho Google Antigravity. Đánh giá: 🏆 100/100 S-tier.

---

## 📋 Mục lục

- [Giới thiệu](#giới-thiệu)
- [Cài đặt](#-cài-đặt)
- [Cách sử dụng](#-cách-sử-dụng)
- [Cấu trúc dự án](#-cấu-trúc-dự-án)
- [Tài liệu tham khảo](#-tài-liệu-tham-khảo)
- [Changelog](#-changelog)
- [License](#-license)

---

## Giới thiệu

**Skill Generator** là một AI Skill chuyên biệt cho nền tảng **Google Antigravity**.
Nó giúp bạn **tạo AI Skill mới** — ngay cả khi bạn **KHÔNG biết** skill là gì,
YAML là gì, hay cấu trúc SKILL.md viết thế nào.

**Bạn chỉ cần có:**

- ✅ Ý tưởng về công việc muốn tự động hóa
- ✅ Flow / quy trình / logic trong đầu

**AI sẽ lo phần còn lại:**

- 🎤 Phỏng vấn thông minh để hiểu quy trình
- 🔍 Phát hiện pattern phù hợp
- 🏗️ Sinh toàn bộ skill hoàn chỉnh
- 🧪 Test thử trước khi deploy

### Ai nên dùng?

| Đối tượng | Ví dụ |
| --- | --- |
| **Người không biết code** | Nhân viên kinh doanh muốn AI tự soạn báo giá |
| **Developer** | Muốn AI tự format commit message, review code |
| **Team Lead / Manager** | Muốn chuẩn hóa quy trình team bằng AI |
| **Freelancer** | Tự động hóa các task lặp lại hàng ngày |

---

## 🔧 Cài đặt

### Yêu cầu

- Một nền tảng AI Agent (xem bảng tương thích bên dưới)
- Python 3.8+ (cho scripts kiểm tra — tùy chọn)
- Git (khuyến khích, để cài và cập nhật dễ dàng)

### Bảng tương thích nền tảng

| Nền tảng | Skills/Custom Instructions | Tương thích | Ghi chú |
| --- | --- | --- | --- |
| **Google Antigravity** | ✅ Skills (SKILL.md) | 🟢 100% Native | Được thiết kế chuyên cho nền tảng này |
| **Claude Code** | ✅ Custom Commands (CLAUDE.md) | 🟢 95% | Cần đổi SKILL.md → CLAUDE.md |
| **Cursor** | ✅ Rules (.cursor/rules/) | 🟡 85% | Dùng làm Rule, không có auto-trigger |
| **Windsurf / Codeium** | ✅ Rules (.windsurfrules) | 🟡 85% | Tương tự Cursor |
| **Cline** | ✅ Custom Instructions (.clinerules) | 🟡 80% | Paste nội dung vào System Prompt |
| **GitHub Copilot** | ✅ Instructions (.github/copilot-instructions.md) | 🟡 75% | Chỉ hỗ trợ instructions, không có scripts |
| **OpenClaw** | ✅ System Prompt (Agent Config) | 🟡 80% | Dùng qua Telegram bot, cấu hình trong agent config |
| **Aider** | ⚠️ Conventions (.aider.conf.yml) | 🟠 60% | Hạn chế, chỉ dùng conventions |

---

### 🟢 Google Antigravity (Native — Khuyến khích)

**Bước 1: Clone repository**

```bash
git clone https://github.com/marketingjuliancongdanh79-pixel/skill-generator.git
```

**Bước 2: Copy vào thư mục skills** (chọn 1 trong 2)

| Phạm vi | Đường dẫn | Khi nào dùng |
| --- | --- | --- |
| **Global** | `~/.gemini/antigravity/skills/` | Dùng cho TẤT CẢ dự án |
| **Workspace** | `.agent/skills/` | Chỉ cho 1 dự án cụ thể |

**macOS / Linux:**

```bash
# Global
cp -r skill-generator ~/.gemini/antigravity/skills/skill-generator

# Hoặc Workspace
cp -r skill-generator .agent/skills/skill-generator
```

**Windows (PowerShell):**

```powershell
# Global
Copy-Item -Recurse skill-generator "$env:USERPROFILE\.gemini\antigravity\skills\skill-generator"

# Hoặc Workspace
Copy-Item -Recurse skill-generator ".agent\skills\skill-generator"
```

**Bước 3: Khởi động lại Antigravity** (hoặc mở chat mới)

```
Bạn: tạo skill
AI: (Bắt đầu phỏng vấn → Cài thành công ✅)
```

---

### 🟣 Claude Code (Anthropic)

Claude Code hỗ trợ Custom Commands qua file `CLAUDE.md` — tương tự SKILL.md.

**Bước 1: Clone và copy**

```bash
git clone https://github.com/marketingjuliancongdanh79-pixel/skill-generator.git
```

**Bước 2: Cài đặt** (chọn 1 trong 2)

```bash
# Global — áp dụng cho mọi dự án
cp -r skill-generator ~/.claude/commands/skill-generator

# Workspace — chỉ dự án hiện tại
mkdir -p .claude/commands
cp -r skill-generator .claude/commands/skill-generator
```

**Bước 3: Tạo file bridge** (để Claude Code nhận diện)

```bash
# Tạo file CLAUDE.md ở root dự án (nếu chưa có)
cat >> CLAUDE.md << 'EOF'

## Skill Generator
Khi user yêu cầu "tạo skill", "biến quy trình thành skill", hoặc "tự động hóa công việc":
- Đọc file `.claude/commands/skill-generator/SKILL.md` để biết quy trình
- Tham khảo các file trong `.claude/commands/skill-generator/resources/`
- Tuân theo 5 Phase: Interview → Extract → Detect → Generate → Test
EOF
```

**Bước 4: Sử dụng**

```
Bạn: /skill-generator (hoặc) tạo skill cho em
Claude: (Đọc SKILL.md → Bắt đầu phỏng vấn)
```

---

### 🔵 Cursor

Cursor hỗ trợ Rules — dùng skill-generator làm Custom Rule.

**Bước 1: Clone và copy**

```bash
git clone https://github.com/marketingjuliancongdanh79-pixel/skill-generator.git
```

**Bước 2: Cài vào Cursor Rules**

```bash
# Tạo thư mục rules (nếu chưa có)
mkdir -p .cursor/rules

# Copy skill-generator vào
cp -r skill-generator .cursor/rules/skill-generator
```

**Windows:**

```powershell
New-Item -ItemType Directory -Force -Path ".cursor\rules"
Copy-Item -Recurse skill-generator ".cursor\rules\skill-generator"
```

**Bước 3: Tạo rule file**

Tạo file `.cursor/rules/skill-generator.mdc`:

```markdown
---
description: Tạo AI Skill mới từ ý tưởng hoặc quy trình công việc
globs: 
alwaysApply: false
---

Khi user yêu cầu "tạo skill", "biến quy trình thành skill", "tự động hóa":
- Đọc file `.cursor/rules/skill-generator/SKILL.md`
- Tuân theo quy trình 5 Phase trong đó
- Tham khảo resources/ cho templates và best practices
```

**Bước 4: Sử dụng**

```
Bạn: @skill-generator tạo skill soạn báo giá
Cursor: (Đọc rule → Áp dụng SKILL.md → Bắt đầu phỏng vấn)
```

---

### 🟠 Windsurf / Codeium

Windsurf dùng Cascade Rules — tương tự Cursor.

**Bước 1: Clone và copy**

```bash
git clone https://github.com/marketingjuliancongdanh79-pixel/skill-generator.git
```

**Bước 2: Cài vào Windsurf Rules**

```bash
# Tạo thư mục rules
mkdir -p .windsurf/rules

# Copy skill-generator
cp -r skill-generator .windsurf/rules/skill-generator
```

**Bước 3: Tạo rule file**

Tạo file `.windsurf/rules/skill-generator.md`:

```markdown
---
trigger: manual
description: Tạo AI Skill mới từ ý tưởng hoặc quy trình công việc
---

Khi user yêu cầu "tạo skill", "biến quy trình thành skill", "tự động hóa":
- Đọc file `.windsurf/rules/skill-generator/SKILL.md`
- Tuân theo quy trình 5 Phase trong đó
- Tham khảo resources/ cho templates và best practices
```

**Bước 4: Sử dụng**

```
Bạn: Tạo skill từ quy trình deploy
Windsurf: (Áp dụng rule → Bắt đầu phỏng vấn)
```

---

### 🟤 Cline (VS Code Extension)

Cline dùng Custom Instructions — paste nội dung SKILL.md vào System Prompt.

**Bước 1: Clone**

```bash
git clone https://github.com/marketingjuliancongdanh79-pixel/skill-generator.git
```

**Bước 2: Cài vào dự án**

```bash
# Copy vào thư mục dự án
cp -r skill-generator .clinerules/skill-generator
```

**Bước 3: Cấu hình Cline**

1. Mở VS Code → Cline sidebar
2. Vào **Settings** → **Custom Instructions**
3. Thêm đoạn sau:

```
Khi user yêu cầu "tạo skill" hoặc "tự động hóa":
- Đọc file .clinerules/skill-generator/SKILL.md
- Tuân theo 5 Phase: Interview → Extract → Detect → Generate → Test
- Tham khảo .clinerules/skill-generator/resources/ cho best practices
```

**Bước 4: Sử dụng**

```
Bạn: Tạo skill tự động review code
Cline: (Đọc SKILL.md → Bắt đầu phỏng vấn)
```

---

### ⚫ GitHub Copilot

GitHub Copilot hỗ trợ Custom Instructions ở cấp dự án.

**Bước 1: Clone và copy**

```bash
git clone https://github.com/marketingjuliancongdanh79-pixel/skill-generator.git
cp -r skill-generator .github/skill-generator
```

**Bước 2: Thêm vào Copilot Instructions**

Tạo hoặc mở file `.github/copilot-instructions.md`, thêm:

```markdown
## Skill Generator

Khi user yêu cầu "tạo skill", "biến quy trình thành skill", "tự động hóa":
- Đọc file `.github/skill-generator/SKILL.md` để biết quy trình đầy đủ
- Tuân theo 5 Phase: Interview → Extract → Detect → Generate → Test
- Tham khảo `.github/skill-generator/resources/` cho templates
```

**Bước 3: Sử dụng** (trong Copilot Chat)

```
Bạn: Tạo skill soạn email báo giá
Copilot: (Đọc instructions → Bắt đầu phỏng vấn)
```

> ⚠️ **Lưu ý:** Copilot không hỗ trợ chạy scripts trực tiếp.
> Phần scripts (`validate_skill.py`, `simulate_skill.py`) cần chạy thủ công.

---

### 🐾 OpenClaw (AI Gateway)

OpenClaw là AI Gateway hỗ trợ multi-LLM, thường truy cập qua Telegram bot.
Dùng System Prompt của agent để nhúng skill-generator.

**Bước 1: Clone repository**

```bash
git clone https://github.com/marketingjuliancongdanh79-pixel/skill-generator.git
```

**Bước 2: Copy nội dung SKILL.md vào Agent Config**

1. Mở file cấu hình agent của OpenClaw (thường là `config.yaml` hoặc qua Admin Panel)
2. Tìm phần **System Prompt** hoặc **Agent Instructions** của agent muốn thêm skill
3. Copy toàn bộ nội dung file `SKILL.md` vào phần System Prompt

**Bước 3: Upload tài liệu tham khảo (tùy chọn)**

Nếu OpenClaw hỗ trợ file upload / knowledge base:

- Upload các file trong `resources/` vào knowledge base của agent
- Đặc biệt: `skill_template.md`, `checklist.md`, `anti_patterns.md`

**Bước 4: Sử dụng** (qua Telegram hoặc Web UI)

```
Bạn: Tạo skill tự động trả lời khách hàng
OpenClaw Bot: (Đọc System Prompt → Bắt đầu phỏng vấn)
```

> ⚠️ **Lưu ý:** OpenClaw chạy qua API nên không hỗ trợ tạo file trực tiếp.
> AI sẽ sinh nội dung SKILL.md dạng text → bạn cần tự copy vào file.

---

### 📥 Cài bằng 1 lệnh (Quick Install)

| Nền tảng | 1 lệnh (macOS/Linux) |
| --- | --- |
| **Antigravity (Global)** | `git clone https://github.com/marketingjuliancongdanh79-pixel/skill-generator.git ~/.gemini/antigravity/skills/skill-generator` |
| **Antigravity (Workspace)** | `git clone https://github.com/marketingjuliancongdanh79-pixel/skill-generator.git .agent/skills/skill-generator` |
| **Claude Code** | `git clone https://github.com/marketingjuliancongdanh79-pixel/skill-generator.git .claude/commands/skill-generator` |
| **Cursor** | `git clone https://github.com/marketingjuliancongdanh79-pixel/skill-generator.git .cursor/rules/skill-generator` |
| **Windsurf** | `git clone https://github.com/marketingjuliancongdanh79-pixel/skill-generator.git .windsurf/rules/skill-generator` |
| **Cline** | `git clone https://github.com/marketingjuliancongdanh79-pixel/skill-generator.git .clinerules/skill-generator` |
| **Copilot** | `git clone https://github.com/marketingjuliancongdanh79-pixel/skill-generator.git .github/skill-generator` |
| **OpenClaw** | `git clone https://github.com/marketingjuliancongdanh79-pixel/skill-generator.git` → Copy SKILL.md vào Agent System Prompt |

### Cập nhật phiên bản mới

```bash
# Vào thư mục đã cài, chạy:
cd <đường-dẫn-skill-generator>
git pull
```

---

## 🚀 Cách sử dụng

### Cách 1: Dùng slash command

```
/skill
```

### Cách 2: Nói tự nhiên

AI sẽ tự nhận diện và kích hoạt skill khi bạn nói:

| Câu nói | AI hiểu |
| --- | --- |
| "Tạo skill từ quy trình deploy của em" | → Kích hoạt skill-generator |
| "Em muốn AI tự động viết báo cáo tuần" | → Kích hoạt skill-generator |
| "Biến workflow review code thành skill" | → Kích hoạt skill-generator |
| "Make a new skill for checking PRs" | → Kích hoạt skill-generator |
| "Tự động hóa công việc soạn báo giá" | → Kích hoạt skill-generator |

### Quy trình tạo skill

```text
Bạn nói ý tưởng
    ↓
⚡ Fast Track?
    ├── Nếu bạn nói RÕ flow → AI xác nhận → Sinh skill ngay
    └── Nếu chưa rõ → AI phỏng vấn thông minh (5-10 câu)
         ↓
    🔍 AI phát hiện pattern + tính complexity
         ↓
    🏗️ AI sinh toàn bộ skill (SKILL.md + resources + scripts)
         ↓
    🧪 AI chạy thử (Dry Run) với tình huống thực
         ↓
    ✅ Skill hoàn chỉnh, sẵn sàng deploy!
```

### Ví dụ sử dụng thực tế

**Bạn:** "Em muốn AI tự soạn email báo giá cho khách hàng. Khi nhận email khách hỏi giá, AI sẽ đọc yêu cầu, tra bảng giá, tính chiết khấu theo số lượng (10-49: giảm 5%, 50-99: giảm 10%, ≥100: giảm 15%), cộng VAT 8%, rồi soạn email trả lời."

**AI:** Sẽ tự nhận diện đây là Fast Track (bạn đã cung cấp flow rõ ràng) → xác nhận lại → sinh skill `price-quoter` hoàn chỉnh.

### Scripts hỗ trợ (tùy chọn)

```bash
# Kiểm tra SKILL.md có hợp lệ không (chấm điểm A-F)
python scripts/validate_skill.py ./path/to/my-skill/

# Mô phỏng chạy thử skill
python scripts/simulate_skill.py ./path/to/my-skill/
```

---

## 📁 Cấu trúc dự án

```text
skill-generator/                             (20 files)
├── SKILL.md                                ← 🧠 Bộ não chính (1090+ dòng, 5 Phase)
├── README.md                               ← 📖 File này
│
├── resources/                              ← 📚 Tài liệu tham khảo (12 files)
│   ├── skill_template.md                   ← Template chuẩn SKILL.md
│   ├── checklist.md                        ← Checklist 2-tier (Basic + Expert)
│   ├── advanced_patterns.md                ← 6 pattern kiến trúc nâng cao
│   ├── interview_questions.md              ← 30+ câu hỏi + Expert Probing
│   ├── pattern_detection.md                ← Decision tree + Complexity scoring
│   ├── blueprints.md                       ← 10 skill templates "ăn liền"
│   ├── anti_patterns.md                    ← 15 lỗi phổ biến + cách fix
│   ├── prompt_engineering.md               ← 15 kỹ thuật viết Instructions
│   ├── versioning_guide.md                 ← Hướng dẫn nâng cấp skill
│   ├── industry_questions.md               ← 8 bộ câu hỏi chuyên ngành
│   ├── composition_cookbook.md              ← 5 patterns kết hợp skill
│   └── script_integration.md              ← Tích hợp Scripts (7 lớp bảo mật)
│
├── examples/                               ← 🎯 Ví dụ mẫu (3 files)
│   ├── example_git_commit.md               ← Ví dụ 1: Git commit formatter
│   ├── example_api_docs.md                 ← Ví dụ 2: API docs generator
│   └── example_db_migration.md             ← Ví dụ 3: DB migration helper
│
└── scripts/                                ← 🔧 Công cụ (2 files)
    ├── validate_skill.py                   ← Kiểm tra SKILL.md hợp lệ
    └── simulate_skill.py                   ← Mô phỏng chạy thử skill
```

---

## � Tài liệu tham khảo

### Cho người mới bắt đầu

| File | Mô tả | Khi nào đọc |
| --- | --- | --- |
| `SKILL.md` | Bộ não chính — AI đọc file này | Không cần đọc (AI tự xử lý) |
| `resources/skill_template.md` | Template mẫu SKILL.md | Muốn hiểu cấu trúc skill |
| `resources/blueprints.md` | 10 skill ăn liền | Cần ý tưởng nhanh |
| `resources/checklist.md` | Checklist chất lượng | Kiểm tra skill trước deploy |

### Cho người muốn hiểu sâu

| File | Mô tả | Khi nào đọc |
| --- | --- | --- |
| `resources/prompt_engineering.md` | 15 kỹ thuật viết Instructions | Muốn skill chính xác hơn |
| `resources/anti_patterns.md` | 15 lỗi phổ biến | Debug skill bị lỗi |
| `resources/advanced_patterns.md` | 6 pattern kiến trúc | Skill phức tạp |
| `resources/script_integration.md` | Tích hợp scripts + 7 lớp bảo mật | Skill cần chạy lệnh hệ thống |

### Cho chuyên gia

| File | Mô tả | Khi nào đọc |
| --- | --- | --- |
| `resources/composition_cookbook.md` | 5 patterns kết hợp multi-skill | Xây hệ thống skill |
| `resources/industry_questions.md` | 8 bộ câu hỏi chuyên ngành | Skill cho ngành đặc thù |
| `resources/versioning_guide.md` | Nâng cấp + backward compat | Maintain skill lâu dài |

---

## 📚 Changelog

### v3.2 Expert Edition (2026-03-03)

- Thêm **7 Nguyên Tắc Skill Hoàn Hảo** + triết lý System Architecture vào Mindset
- Thêm **⚡ Fast Track** — lối tắt cho skill đơn giản (skip Phase 1-3)
- Thêm **Atomic Justification** — giải thích tại sao 5 Phases = 1 pipeline
- Thêm **Semantic Precision** — bảng động từ chính xác thay từ mơ hồ
- Thêm **Error Recovery + Decision Tree** — IF exit code, Confidence Score
- Nâng cấp **prompt_engineering.md** (+210 dòng): 5 kỹ thuật expert + Ma Trận
- Nâng cấp **checklist.md** (+100 dòng): Expert Quality Gates + Red Flags
- Nâng cấp **interview_questions.md** (+60 dòng): Expert Probing + Cognitive Extraction
- Nâng cấp **script_integration.md** (+100 dòng): Wrapper Script + 7 lớp bảo mật
- Đạt **100/100 S-tier** theo self-audit 7 nguyên tắc

### v3.0 Ultimate (2026-03-03)

- Thêm `blueprints.md`, `anti_patterns.md`, `prompt_engineering.md`
- Thêm `versioning_guide.md`, `industry_questions.md`, `composition_cookbook.md`
- Thêm `simulate_skill.py`

### v2.0 Pro (2026-03-03)

- Viết lại SKILL.md — Interview-driven (5 Phase)
- Thêm `interview_questions.md`, `pattern_detection.md`

### v1.0 (2026-03-03)

- Initial release

---

## ❓ FAQ

**Q: Cần biết code không?**
A: Không. Skill Generator được thiết kế cho người KHÔNG biết code. Bạn chỉ cần mô tả công việc bằng lời.

**Q: Global hay Workspace?**
A: **Global** (`~/.gemini/antigravity/skills/`) nếu muốn dùng cho tất cả dự án. **Workspace** (`.agent/skills/`) nếu chỉ dùng cho 1 dự án.

**Q: Skill tạo ra lưu ở đâu?**
A: AI sẽ hỏi bạn muốn Global hay Workspace, rồi tự tạo file vào đúng vị trí.

**Q: Có thể sửa skill sau khi tạo không?**
A: Có. Chỉ cần mở file SKILL.md của skill đó và sửa trực tiếp, hoặc nhờ AI sửa.

**Q: Hỗ trợ ngôn ngữ nào?**
A: Tiếng Việt và tiếng Anh. AI sẽ phỏng vấn bằng ngôn ngữ bạn nói.

---

## 🤝 Đóng góp

1. Fork repository
2. Tạo branch mới: `git checkout -b feature/ten-tinh-nang`
3. Commit: `git commit -m "feat: thêm tính năng X"`
4. Push: `git push origin feature/ten-tinh-nang`
5. Tạo Pull Request

---

## 📄 License

MIT — Thoải mái sử dụng, chỉnh sửa, chia sẻ.

---

> 🇻🇳 **Được phát triển bởi Thân Công Hải** — Skill Generator v3.2 Expert Edition
> *"Biến ý tưởng thành AI Skill, biến con người thường thành kiến trúc sư AI."*
