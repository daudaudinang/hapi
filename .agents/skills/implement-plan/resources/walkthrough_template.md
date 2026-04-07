# Template Walkthrough File

Sử dụng template này để tạo walkthrough sau mỗi phase tại:
`.agents/plans/<normalized-name>/phase-{N}-walkthrough.md`

---

```markdown
# Phase {N} Walkthrough: {Phase Title}

**Plan:** {plan_name}
**Ngày triển khai:** {YYYY-MM-DD}
**Trạng thái:** ✅ Hoàn thành / ⚠️ Hoàn thành có lưu ý

---

## 📋 Tóm tắt công việc đã thực hiện

### Task 1: {task_title}
- [x] {sub-task 1}
- [x] {sub-task 2}
- Files changed: `path/to/file1.ts`, `path/to/file2.ts`

---

## 🛡️ Hàng rào bảo vệ (Guardrails)

- **Execution Boundary Check:** ✅ Đã tuân thủ nghiêm ngặt (Không sửa file trong danh sách `Do NOT Modify`).
- **Ngoại lệ (nếu có):** {Ghi rõ nếu có xin phép user sửa file ngoài scope}.

---

## ✅ Acceptance Criteria (AC) Verification

| Tên AC | Lệnh Verify (Verify Command) | Kết quả | Trạng thái |
|--------|------------------------------|---------|------------|
| {ac_1} | `{command_1}` | Pass: {output summary} | ✅ PASS / ❌ FAIL |
| {ac_2} | `{command_2} / Manual` | {output summary} | ✅ PASS / ❌ FAIL |

---

## ⚠️ Risks/Issues phát hiện (nếu có)

| Issue | Mức độ | Mô tả | Trạng thái |
|-------|--------|-------|------------|
| {issue_1} | High/Medium/Low | {description} | ✅ Đã xử lý / ⏳ Chưa cover |

---

## 🧪 Hướng dẫn Manual Test

### Preconditions
- {điều kiện cần có trước khi test}

### Test Steps
1. {step 1}
2. {step 2}

### Expected Results
- {expected result}

---

## 📁 Files Changed

| File | Action | Description |
|------|--------|-------------|
| `path/to/file.ts` | Created/Modified/Deleted | {short description} |

---

## ➡️ Next Phase Dependencies

- Phase {N+1} phụ thuộc vào: {dependencies}
- Cần user confirm: {có/không}
```

---

## Hướng dẫn sử dụng

- **Guardrails**: Xác nhận việc tuân thủ Boundary. Đảm bảo thay đổi nằm trong scope an toàn, nếu vi phạm cần giải trình rõ việc xin phép.
- **AC Verification**: Cung cấp bằng chứng đã chạy command kiểm tra thay vì nói suông. Ghi nhận output ngắn gọn để chứng minh pass.
- Bảng **Files Changed**: Tổng hợp minh bạch để user kiểm tra.
