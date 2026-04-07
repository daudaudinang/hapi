---
name: sync-agents-context
description: Đọc và tổng hợp toàn bộ context rules từ .agents/ và .cursor/ vào AGENTS.md. Dùng khi user chạy /sync-agents-context hoặc yêu cầu "sync context/cập nhật AGENTS.md/cập nhật rules cho OpenCode".
---

# Sync Agents Context (Workflow cho `/sync-agents-context`)

## Khi nào áp dụng

- User dùng command **`/sync-agents-context`**.
- User yêu cầu: "sync context", "cập nhật AGENTS.md", "cập nhật rules cho OpenCode".
- Thêm mới context rules và muốn tổng hợp vào AGENTS.md.

## Mục tiêu

Tổng hợp toàn bộ context từ:
- `.agent/` - Plans, docs, note_flow (workflows, research)
- `.agents/rules/*.md` - Project-level rules
- `.agents/rules/*.mdc` - Project-level context rules
- `.agents/skills/*/SKILL.md` - Skills
- `.cursor/rules/*.md` - Cursor-specific rules
- `.cursor/rules/*.mdc` - Cursor-specific context rules

Vào file `AGENTS.md` ở root project để OpenCode có thể đọc và hiểu context.

---

## Workflow tổng hợp

### PHASE 1: Thu thập files

```
1. Tìm tất cả rules files
   → .agents/rules/*.md, *.mdc
   → .cursor/rules/*.md, *.mdc

2. Tìm tất cả skills
   → .agents/skills/*/SKILL.md

3. Tìm .agent/ contents
   → .agent/plans/*.md
   → .agent/docs/*.md
   → .agent/note_flow/*.md
```

### PHASE 2: Đọc nội dung

```
1. Đọc AGENTS.md hiện tại (để biết cấu trúc)
2. Đọc từng rules file
3. Đọc từng skill file
```

### PHASE 3: Tổng hợp

```
1. Xác định sections cần thêm:
   - Rules & Guidelines
   - Skills Overview
   - Context Rules

2. Tổng hợp nội dung:
   - Loại bỏ trùng lặp
   - Giữ nguyên format của AGENTS.md
   - Thêm references đến files gốc

3. Cập nhật AGENTS.md
```

---

## Cấu trúc AGENTS.md target

```markdown
# AGENTS.md - Agentic Coding Guidelines

{Multi-Merchant B2B Marketplace (Medusa v2) codebase.}

---

## 1. Project Structure

...

---

## 2. Commands

...

---

## N. Plans & Documentation

### Active Plans (.agent/plans/)

| Plan | Description | Status |
|------|-------------|--------|
| PLAN_XXX | ... | Phase N |

### Docs (.agent/docs/)

| Doc | Description |
|-----|-------------|
| ... | ... |

### Note Flow (.agent/note_flow/)

| Flow/SPEC | Description |
|-----------|-------------|
| ... | ... |

---

## N+1. Rules & Guidelines

### Project Rules (.agents/rules/)

| Rule | Description | File |
|------|-------------|------|
| context-rule | Multi-Merchant context | `.agents/rules/context-rule.md` |
| ... | ... | ... |

### Cursor Rules (.cursor/rules/)

| Rule | Description | File |
|------|-------------|------|
| context-rule | Multi-Merchant context | `.cursor/rules/context-rule.md` |
| ... | ... | ... |

---

## N+2. Skills

| Skill | Description | Trigger |
|-------|-------------|---------|
| create-plan | Tạo plan triển khai | `/create-plan` |
| implement-plan | Triển khai plan | `/implement-plan` |
| implement-review | Review implementation | `/review-implement` |
| ... | ... | ... |

---

## N+3. Context Reference

Chi tiết các rules được tổng hợp từ:

### .agents/rules/

#### context-rule.md
{Trích xuất nội dung chính}

### .cursor/rules/

#### context-rule.md
{Trích xuất nội dung chính}

...
```

---

## Template Sections để thêm vào AGENTS.md

### Rules Overview Section

```markdown
---

## {N}. Rules & Guidelines

### Project Rules (.agents/rules/)

| Rule | Description | File |
|------|-------------|------|
| {rule-name} | {description} | `.agents/rules/{filename}` |

### Cursor Rules (.cursor/rules/)

| Rule | Description | File |
|------|-------------|------|
| {rule-name} | {description} | `.cursor/rules/{filename}` |
```

### Skills Overview Section

```markdown
---

## {M}. Skills

| Skill | Description | Trigger |
|-------|-------------|---------|
| {skill-name} | {description} | `/{trigger}` |
```

---

## Checklist Sync

```markdown
## Checklist /sync-agents-context

- [ ] **PHASE 1: THU THẬP**
  - [ ] Tìm tất cả rules files (.agents/rules/, .cursor/rules/)
  - [ ] Tìm tất cả skills (.agents/skills/*/SKILL.md)
  - [ ] Tìm .agent/ contents (.agent/plans/, .agent/docs/, .agent/note_flow/)

- [ ] **PHASE 2: ĐỌC NỘI DUNG**
  - [ ] Đọc AGENTS.md hiện tại
  - [ ] Đọc từng rules file
  - [ ] Đọc từng skill file

- [ ] **PHASE 3: TỔNG HỢP**
  - [ ] Xác định sections cần thêm/cập nhật
  - [ ] Tổng hợp nội dung
  - [ ] Cập nhật AGENTS.md
  - [ ] Verify nội dung cuối
```

---

## Anti-Patterns

❌ **Không copy toàn bộ nội dung** - Chỉ tổng hợp overview và references
❌ **Không làm mất nội dung hiện tại** - Append, không overwrite hoàn toàn
❌ **Không bỏ qua trùng lặp** - Dùng bảng để trình bày thay vì trùng lặp nội dung

---

## Recovery khi disconnect

1. **Đã đọc được files** → Tiếp tục tổng hợp
2. **Chưa đọc đủ** → Đọc lại từ đầu PHASE 2
3. **Đã có draft** → Tiếp tục từ PHASE 3
