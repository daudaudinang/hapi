# Ví dụ: Tài liệu Conventional Commits → Skill `git-commit-formatter`

## Tài liệu đầu vào (input của user)

> Conventional Commits là quy ước viết commit message theo format:
> `<type>(<scope>): <description>`
>
> **Types:**
>
> - `feat` — Tính năng mới
> - `fix` — Sửa lỗi
> - `docs` — Tài liệu
> - `style` — Format, không thay đổi logic
> - `refactor` — Tái cấu trúc, không thêm tính năng hay sửa lỗi
> - `test` — Thêm hoặc sửa test
> - `chore` — Công việc bảo trì (cập nhật deps, config)
>
> **Quy tắc:**
>
> - Scope là tùy chọn, đặt trong ngoặc tròn
> - Description viết bằng tiếng Anh, bắt đầu bằng chữ thường
> - Không kết thúc description bằng dấu chấm
> - Giới hạn 72 ký tự cho dòng đầu tiên

---

## Skill được sinh ra (output)

### Cấu trúc thư mục

```
skills/git-commit-formatter/
├── SKILL.md
└── examples/
    └── commit_examples.md
```

### Nội dung SKILL.md

```markdown
---
name: git-commit-formatter
description: Định dạng tin nhắn commit Git theo chuẩn Conventional Commits (feat, fix, docs, style, refactor, test, chore). Phân tích staged changes và đề xuất commit message phù hợp.
---

# Goal
Đảm bảo mọi commit message đều tuân thủ chuẩn Conventional Commits, rõ ràng và nhất quán.

# Instructions
1. Chạy `git diff --cached --stat` để xem danh sách file đang staged.
2. Chạy `git diff --cached` để xem nội dung thay đổi chi tiết.
3. Phân tích thay đổi để xác định type phù hợp nhất (feat/fix/docs/...).
4. Xác định scope — module hoặc component chính bị ảnh hưởng.
5. Viết description ngắn gọn (≤72 ký tự), bắt đầu bằng chữ thường.
6. Đề xuất lệnh `git commit -m "<type>(<scope>): <description>"`.
7. Nếu có breaking change, thêm `!` sau type: `feat!: <description>`.

# Examples

## Ví dụ 1: Thêm tính năng đăng nhập
**Input:** Staged files: `src/auth/login.ts`, `src/auth/login.test.ts`
**Output:** `git commit -m "feat(auth): add login functionality with unit tests"`

## Ví dụ 2: Sửa lỗi giao diện
**Input:** Staged files: `src/components/Header.tsx` (sửa 3 dòng CSS)
**Output:** `git commit -m "fix(ui): resolve header alignment issue on mobile"`

## Ví dụ 3: Cập nhật tài liệu
**Input:** Staged files: `README.md`, `docs/setup.md`
**Output:** `git commit -m "docs: update setup instructions and readme"`

# Constraints
- KHÔNG ĐƯỢC viết description bằng tiếng Việt (trừ khi user yêu cầu)
- KHÔNG ĐƯỢC kết thúc description bằng dấu chấm
- KHÔNG ĐƯỢC vượt quá 72 ký tự cho dòng commit đầu tiên
- LUÔN LUÔN bắt đầu description bằng chữ thường
- LUÔN LUÔN chọn type chính xác nhất
```

---

## Phân tích quá trình chuyển đổi

| Yếu tố tài liệu | Phần trong SKILL.md |
|---|---|
| Format `<type>(<scope>): <description>` | Instructions bước 3-6 |
| Danh sách types | Description (trigger words) |
| Quy tắc viết description | Constraints |
| Ví dụ format | Examples (mở rộng thêm) |
