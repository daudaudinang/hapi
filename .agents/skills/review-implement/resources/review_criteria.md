# Review Criteria (5 Tiêu chí Deep Dive)

Chi tiết 5 tiêu chí review cho PHASE 2, với hướng dẫn cách kiểm tra và red flags. Đặc biệt chú ý tiêu chí 0.

---

## 0. Boundary Compliance & Guardrails (Tiếu chí sống còn)

### Cách kiểm tra
1. Đối chiếu danh sách `Files Changed` thực tế lấy từ Walkthrough với danh sách `Allowed Files` + `Do NOT Modify` do Plan ban đầu đề ra.
2. Kiểm tra log lệnh test: Xem Phase đó người triển khai có cung cấp data/log màn hình đã verify các Acceptance Criteria chưa?

### Red flags
- Xuất hiện file sửa nằm chình ình trong danh sách `Do NOT Modify`.
- Xuất hiện file mới không thuộc quyền hạn `Allowed Files`.
- Điền "✅ Đã test" nhưng không có bằng chứng lệnh test chạy ra gì.

---

## 1. Traceability & AC (Bám sát Plan)

### Cách kiểm tra
1. Liệt kê TẤT CẢ requirements từ Plan.
2. Với mỗi requirement → tìm code tương ứng → đánh dấu ✅/❌.
3. Tìm code dư thừa (scope creep).

### Red flags
- Requirement có trong Plan không thấy implement.
- Code chứa feature lạ (scope creep).
- Code bịa "//TODO: Will implement later" mà ko báo trước.

---

## 2. Correctness (Tính đúng đắn)

### Cách kiểm tra
1. **Trace flow logic**: Input → processing → output.
2. **Mental test**: Tính nhẩm logic if/else, state changes.
3. **Check async**: `await` đủ, Promise handle đàng hoàng.

### Red flags
- `await` thiếu trong async map/for loop.
- State mutation lỏng lẻo.
- Off-by-one errors trong index arrays.

---

## 3. Robustness (Tính bền vững)

### Cách kiểm tra
1. **Error bounds**: try/catch cho db/api calls.
2. **Validation**: API input từ frontend gửi xuống server được validate Zod chưa?
3. **Null safeties**: Mảng trả về rỗng, biến map undefined → check optionals `?.`

### Red flags
- `req.body.data.id` chết code nếu data null.
- Lỗi DB bắn thẳng ra client mà không xử lý message.
- Response API map bậy type.

---

## 4. Clarity & Style

### Cách kiểm tra
1. **Naming**: Biến, Hàm mô tả WHAT/HOW.
2. **Extracts**: Quá 3 lần if/else giống nhau → extract function?
3. **Hardcodes**: IP server, Key, string literal.

### Red flags
- `let a = 1;` trừ loop for i.
- Hardcode URL backend localhost:6001.
- Logic lồng 4-5 tầng If.

---

## Weighted Scoring Formula

```text
| # | Tiêu chí              | Hệ số |
|---|----------------------|-------|
| 0 | Boundary Compliance  | ×4    |
| 1 | Traceability & AC    | ×3    |
| 2 | Correctness          | ×3    |
| 3 | Robustness           | ×2    |
| 4 | Clarity & Style      | ×1    |

Max: (10×4) + (10×3) + (10×3) + (10×2) + (10×1) = 130 pts

Thresholds:
- ≥ 117 (90%) → ✅ APPROVED
- 78–116 (60–89%) → ⚠️ APPROVED WITH NOTES
- < 78 (<60%) → ❌ CHANGES REQUESTED

Override:
- Boundary ≤ 5/10 → auto ❌
- Bất kỳ Critical issue → auto ❌
```
