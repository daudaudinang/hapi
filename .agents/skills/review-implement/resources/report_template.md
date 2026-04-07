# Template Review Report

Sử dụng template này ở PHASE 4 để xuất kết quả review.

---

```markdown
# 🕵️ IMPLEMENTATION REVIEW REPORT

**Plan Review:** {Tên Plan}
**Reviewer:** Agent
**Date:** {YYYY-MM-DD}
**Status:** ✅ APPROVED / ⚠️ APPROVED WITH NOTES / ❌ CHANGES REQUESTED

---

## 📊 Tóm tắt thay đổi

- **Số lượng files thay đổi:** {Số lượng}
- **Phases đã review:** {Phase 1, Phase 2...}
- **Các files chính:**
    - `path/to/important_file.ts`
    - ...

---

## 🛡️ Guardrails & AC Check

- **Execution Boundary:** ✅ Tuân thủ (Không phát hiện vi phạm thẻ cấm `Do NOT Modify`) / 🔴 VI PHẠM (Chỉ ra file nào sửa lậu).
- **AC Verification Status:** ✅ Bằng chứng Test Passed / ❌ Thiếu Verify Command trong walkthrough / ⚠️ Pass nhưng output log đáng ngờ. 

### Plan v3 Compliance (nếu áp dụng)
- **Implementation Order:** ✅ Đúng thứ tự / ⚠️ Không theo / N/A
- **Risk Matrix coverage:** ✅ Risks được address / ⚠️ Thiếu mitigations / N/A
- **Pre-flight Check:** ✅ Walkthrough ghi nhận / ⚠️ Không có / N/A
- **Plan version match:** ✅ / ⚠️ / N/A 

---

## 🔍 Chi tiết đánh giá

### 1. Bám sát Plan & Requirements

- [✅/❌] **Requirement A:** implemented at `file.ts:line`
- [✅/❌] **Requirement B:** ...
- **Nhận xét:** {Nhận xét tổng quan về việc tuân thủ plan, có scope creep không?}

### 2. Code Quality & Logic

- **Logic & Correctness:** {Đánh giá logic, thuật toán, async flows}
- **Robustness (Error/Null):** {Đánh giá việc bắt lỗi, check bounds/nulls}
- **Clarity & Style:** {Đánh giá naming, structure, magic numbers}

### 3. Impact & Risks

- **Regression Risk:** {Low/Medium/High} - {Khả năng gãy vỡ module chung}
- **Integration Risk:** {Low/Medium/High} - {Thay đổi API Contract, v.v.}
- **Data/Performance Risk:** {Mô tả N+1, leaks, DB changes}

---

## 🛠 Issues & Recommendations

| Severity | Location | Issue Description | Recommendation (kèm Auto-fix nếu có) |
|----------|----------|-------------------|--------------------------------------|
| 🔴 **Critical** | `file.ts:10` | {Mô tả issue} | {Fix suggestion cụ thể} |
| 🟠 **Major** | `file.ts:25` | {Mô tả issue} | {Fix suggestion cụ thể} |
| 🟡 **Minor** | `file.ts:30` | {Mô tả bug style/tên}| ```ts\n// Gợi ý copy-paste fix\nexport const V = ...\n``` |
| 🔵 **Info** | - | {Observation} | {Suggestion kiến trúc} |

---

## ✅ Kết luận

**Weighted Score:** {X}/130 pts ({X}%)

**{Kết luận cuối cùng}**

(Ví dụ: "Code bám sát plan, ko vượt rào Boundary, AC verified đủ. Tuy nhiên cần fix gấp lỗi Major ở file X trước khi merge. Các lỗi Minor có patch sẵn để dev copy paste.")
```

---

## Hướng dẫn sử dụng

### Status
- ✅ **APPROVED:** Không có Critical/Major issues → sẵn sàng merge
- ⚠️ **APPROVED WITH NOTES:** Chỉ có Minor/Info issues → merge được, nên fix
- ❌ **CHANGES REQUESTED:** Vi phạm Boundary (Critical) hoặc có ≥1 Major → PHẢI fix trước merge

### Guardrails
- Nếu Boundary bị phá (sửa Do NOT Modify), bắt buộc status phải là ❌ **CHANGES REQUESTED** và đánh Critical ở dưới bảng.
- Nếu không tìm thấy log chạy `Verify Command` trong walkthrough, báo Major/Minor yêu cầu phải test.

### Bảng Issues & Auto-fix
- Mỗi Minor Issue cố gắng CUNG CẤP 코드 SNIPPET để user thay lẹ (vì thay đổi nhỏ nhẹ).
- Description ngắn gọn nhưng Recommendation cần tính "Thực hành".
