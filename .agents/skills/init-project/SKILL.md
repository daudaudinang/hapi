---
name: init-project
description: Khởi tạo và cập nhật AGENTS.md với context đầy đủ từ .agents/, .cursor/. Dùng khi user chạy /init hoặc yêu cầu "init project/tạo AGENTS.md/cập nhật context cho agent".
---

# Init Project (Workflow cho `/init`)

## Khi nào áp dụng

- User dùng command **`/init`** hoặc yêu cầu tương tự.
- Cần tạo hoặc cập nhật AGENTS.md với context đầy đủ.
- Muốn agent hiểu project structure, commands, code style.

## Mục tiêu

Tạo/cập nhật file `AGENTS.md` (~200-250 lines) tại **root project**, chứa:
1. **Project Structure** — Cấu trúc thư mục (scan thực tế, KHÔNG hardcode)
2. **Commands** — Build, lint, test, dev commands (đọc từ package.json / pyproject.toml)
3. **Tech Stack** — Runtime, frameworks, packages chính (đọc từ dependencies)
4. **Code Style Guidelines** — Import, formatting, types, naming (đọc từ config files)
5. **Key Architecture Decisions** — Tổng hợp từ code patterns thực tế
6. **Skills Overview** — Danh sách skills (scan `.agents/skills/*/SKILL.md`)
7. **Rules & Guidelines** — Tổng hợp từ `.agents/rules/`, `.cursor/rules/`
8. **Response Language** — Vietnamese default
9. **Patterns & Decisions** — Section trống, sẽ được `/close-task` bổ sung
10. **Gotchas** — Section trống, sẽ được `/close-task` bổ sung

---

## PHASE 1: Thu thập Context

> **BẮT BUỘC:** Dùng tool `view_file`, `list_dir`, `grep_search` để thu thập.
> KHÔNG hardcode hay bịa nội dung từ trí nhớ.

### 1.1. Đọc AGENTS.md hiện tại (nếu có)
- `view_file` → `AGENTS.md` tại root
- Nếu đã có: giữ lại sections **Patterns & Decisions** và **Gotchas** (đây là kiến thức tích luỹ, KHÔNG được xóa)

### 1.2. Thu thập Project Info

```
list_dir → root/             # Xác định structure
view_file → package.json     # Scripts, dependencies (Node.js)
view_file → pyproject.toml   # Dependencies, scripts (Python)
view_file → tsconfig.json    # Path aliases, compiler options
view_file → .eslintrc*       # Lint rules
view_file → .prettierrc*     # Format rules
view_file → tailwind.config* # Design tokens (nếu có)
```

### 1.3. Thu thập Rules

```
list_dir → .agents/rules/    # Scan rule files
list_dir → .cursor/rules/    # Scan cursor rules (nếu có)

# Đọc MỖI rule file, tóm tắt 1 dòng
view_file → .agents/rules/<each>.md
```

### 1.4. Thu thập Skills

```
list_dir → .agents/skills/   # Scan skill folders

# Đọc YAML frontmatter + description từ mỗi SKILL.md
view_file → .agents/skills/<each>/SKILL.md (chỉ cần ~10 dòng đầu)
```

---

## PHASE 2: Tổng hợp & Viết AGENTS.md

> AGENTS.md PHẢI phản ánh codebase THỰC TẾ, không phải template.

### Rules khi viết:

1. **KHÔNG hardcode project name hay stack** — lấy từ data thu thập ở Phase 1
2. **KHÔNG bịa commands** — chỉ list commands thực sự có trong package.json / scripts
3. **KHÔNG copy nguyên rule files** — tóm tắt 1 dòng + tên file để tham chiếu
4. **Skills table** — lấy `name` + `description` từ YAML frontmatter của mỗi SKILL.md
5. **Patterns & Decisions + Gotchas** — nếu AGENTS.md cũ có data → giữ nguyên. Nếu mới → tạo section trống với note "sẽ được tự động thêm khi chạy `/close-task`"

### Cấu trúc AGENTS.md bắt buộc:

```markdown
# AGENTS.md - Agentic Coding Guidelines

**[Project Name]** – [Mô tả ngắn].

---

## 1. Project Structure
[Scan từ list_dir, KHÔNG hardcode]

## 2. Commands
[Đọc từ package.json / root scripts]

## 3. Tech Stack
[Đọc từ dependencies — chỉ list frameworks/libs CHÍNH]

## 4. Code Style Guidelines
[Đọc từ config files — formatting, naming, import order]

## 5. Key Architecture Decisions
[Tổng hợp từ codebase patterns — KHÔNG bịa]

## 6. Skills
| Skill | Trigger | Description |
|-------|---------|-------------|
[Scan từ .agents/skills/*/SKILL.md]

## 7. Rules & Guidelines
### Project Rules (`.agents/rules/`)
- **[filename]** – [tóm tắt 1 dòng]
[Mỗi rule file = 1 bullet]

## 8. Response Language
- Vietnamese for discussions
- English for code, comments, technical terms

## 9. Patterns & Decisions
> Lessons learned đã được verify và user approve qua `/close-task` Gate 1-4.
_Chưa có entry nào — sẽ được tự động thêm khi chạy `/close-task`._

## 10. Gotchas
> Cạm bẫy và cách tiếp cận SAI đã thử.
_Chưa có entry nào — sẽ được tự động thêm khi chạy `/close-task`._
```

---

## PHASE 3: Verify

1. `view_file` → AGENTS.md vừa tạo
2. Đếm sections: PHẢI có đủ 10 sections
3. Kiểm tra: không còn placeholder/template text
4. Kiểm tra: Patterns & Decisions và Gotchas từ AGENTS.md cũ đã được giữ lại

---

## Constraints

- 🚫 KHÔNG hardcode nội dung cho project cụ thể — skill này PHẢI portable
- 🚫 KHÔNG xóa Patterns & Decisions / Gotchas từ AGENTS.md cũ — đây là kiến thức tích luỹ
- 🚫 KHÔNG viết quá 250 lines — tóm gọn, concise
- ✅ PHẢI scan codebase thực tế trước khi viết
- ✅ PHẢI giữ format 10 sections nhất quán

---

## Gợi ý sau khi chạy /init

Sau khi tạo AGENTS.md:
1. Chạy `/sync-agents-context` để cập nhật rules chi tiết hơn
2. Review AGENTS.md → chỉnh sửa nếu cần
3. Commit AGENTS.md vào repo
