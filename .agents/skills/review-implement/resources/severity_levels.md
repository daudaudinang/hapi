# Severity Levels & Review Criteria

## Severity Levels

| Level | Icon | Ý nghĩa | Hành động |
|-------|------|---------|-----------|
| **Critical** | 🔴 | Bug nghiêm trọng, security issue, data corruption | **PHẢI fix** trước merge |
| **Major** | 🟠 | Logic sai, missing validation, potential bug | **NÊN fix** trước merge |
| **Minor** | 🟡 | Code style, naming, minor improvements | **NÊN cải thiện** khi có thời gian |
| **Info** | 🔵 | Suggestion, best practice, optimization | **CÓ THỂ apply** |

---

## Quy tắc xếp hạng

### 🔴 Critical — Khi nào dùng?

- **Vi phạm Execution Boundary (Sửa file trong list `Do NOT Modify` hoặc ngoài vùng `Allowed Files`).**
- Security vulnerability (SQL injection, XSS, auth bypass)
- Data corruption potential (write sai DB, mất data)
- Logic bug gây crash ở production
- Race condition gây inconsistency dữ liệu

**Ví dụ:**
```
🔴 Critical | Boundary | Sửa lậu vào `src/core/security.ts` (thuộc Do NOT Modify) | Revert ngay file này
🔴 Critical | auth.ts:23 | Token validation bị skip cho admin routes | Thêm validateToken() check
```

### 🟠 Major — Khi nào dùng?

- Logic sai nhưng không crash (trả kết quả sai)
- Missing input validation (user có thể gửi bad data)
- Error handling thiếu (unhandled promise rejection)
- Missing null/undefined check ở critical path

**Ví dụ:**
```
🟠 Major | api.ts:45 | Không validate `quantity` field → cho phép số âm | Thêm: if (quantity < 0) throw BadRequest
```

### 🟡 Minor — Khi nào dùng?

- Naming convention khác chuẩn project
- Magic numbers/strings cần extract
- Comment thiếu cho logic phức tạp
- Code duplication nhỏ

**Ví dụ:**
```
🟡 Minor | utils.ts:12 | Magic number `86400000` | Extract to `const ONE_DAY_MS = 86400000`
```

### 🔵 Info — Khi nào dùng?

- Best practice suggestion
- Performance optimization tiềm năng
- Refactoring suggestion
- Architecture improvement

**Ví dụ:**
```
🔵 Info | - | Hàm `processOrder()` dài 80 dòng | Nên tách thành `validateOrder()` + `executeOrder()`
```

---

## 4 Tiêu chí Review Code

### 1. Traceability (Bám sát Plan)

| Câu hỏi | Nếu ✅ | Nếu ❌ |
|---------|--------|--------|
| Code implement đủ requirements? | OK | 🟠 Major: Missing requirement |
| Có scope creep? | OK | 🟡 Minor: Implement thừa |
| Mỗi requirement traceable? | OK | 🟡 Minor: Hard to trace |

### 2. Correctness (Tính đúng đắn)

| Câu hỏi | Nếu ✅ | Nếu ❌ |
|---------|--------|--------|
| Logic đúng? | OK | 🔴/🟠 tùy mức độ |
| Async/await đúng? | OK | 🟠 Major: Race condition |
| Thuật toán chính xác? | OK | 🔴 Critical: Wrong result |

### 3. Robustness (Tính bền vững)

| Câu hỏi | Nếu ✅ | Nếu ❌ |
|---------|--------|--------|
| Error handling đủ? | OK | 🟠 Major |
| Input validation đủ? | OK | 🟠 Major |
| Null check kỹ? | OK | 🟠 Major |

### 4. Clarity & Style

| Câu hỏi | Nếu ✅ | Nếu ❌ |
|---------|--------|--------|
| Naming convention đúng? | OK | 🟡 Minor |
| Dễ đọc/bảo trì? | OK | 🟡 Minor |
| Không hardcode? | OK | 🟡/🟠 tùy context |
