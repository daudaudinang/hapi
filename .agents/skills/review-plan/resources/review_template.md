# Template Output Review (bắt buộc dùng) — v3

Sử dụng template này để xuất kết quả review ở BƯỚC 4.

---

```markdown
## 📋 Kết quả Review Plan: {Plan Name}

> **Tier**: {S / M / L — đọc từ header plan}
> **Review depth**: {Quick (Tier S) / Standard (Tier M) / Deep (Tier L)}

### ✅ Những điểm Plan làm tốt

| Hạng mục | Đánh giá |
|----------|----------|
| {Hạng mục 1} | ✅ {Nhận xét cụ thể, có dẫn chứng từ code: file path + line} |
| {Hạng mục 2} | ✅ {Nhận xét cụ thể} |
| ... | ... |

---

### ⚠️ Những điểm cần bổ sung/điều chỉnh

<!-- Sắp xếp theo severity: Blocker → Major → Minor → Info -->

#### 🔴 Blocker — Chặn implement, PHẢI fix trước

{Nếu không có Blocker → ghi "Không có Blocker."}

##### 1. **{Tiêu đề vấn đề}**

**Vấn đề:** {Mô tả cụ thể, có dẫn chứng file path + line number}

**Đề xuất:** {Đề xuất cách sửa — actionable, có thể implement ngay}

---

#### 🟠 Major — Cần fix trước implement

{Nếu không có Major → ghi "Không có Major."}

##### 1. **{Tiêu đề vấn đề}**

**Vấn đề:** {Mô tả}

**Đề xuất:** {Đề xuất}

---

#### 🟡 Minor — Fix sau cũng được

{Nếu không có Minor → ghi "Không có Minor."}

##### 1. **{Tiêu đề vấn đề}**

**Vấn đề:** {Mô tả}

**Đề xuất:** {Đề xuất}

---

### 📊 Tổng kết

| Tiêu chí | Điểm | Nhận xét |
|----------|------|----------|
| Độ chính xác so với codebase | X/10 | {Nhận xét ngắn + dẫn chứng} |
| Độ đầy đủ | X/10 | {Nhận xét ngắn} |
| Acceptance Criteria | X/10 | {AC SMART? Có verify command?} |
| Execution Boundary | X/10 | {Có Allowed + Do NOT Modify?} |
| Risks coverage (Risk Matrix) | X/10 | {Dùng Risk Matrix? Likelihood×Impact?} |
| Backward compatibility | X/10 | {Nhận xét ngắn} |
| Thiết kế rõ ràng | X/10 | {Nhận xét ngắn} |
| Test plan | X/10 | {Nhận xét ngắn} |
| Dependencies | X/10 | {Nhận xét ngắn} |
| Điểm mở rộng | X/10 | {Nhận xét ngắn} |
| Implementation Order | X/10 | {Có dependency graph? AC mapping?} |
| Pre-flight Check | X/10 | {Deps, services, env vars đủ?} |

**Weighted Score:** {X}/{max} pts ({X}%)

**Kết luận:**
- ✅ **PASS** - Plan đủ cơ sở để triển khai
- ⚠️ **CẦN BỔ SUNG** - Cần bổ sung X điểm trước khi implement
- ❌ **CẦN XEM LẠI** - Có vấn đề nghiêm trọng cần xem lại

---

### 💬 Câu hỏi cho User (nếu có)

- {Câu hỏi 1 cần clarify — kèm options nếu phù hợp}
- {Câu hỏi 2}

### 🔧 Auto-fix (nếu CẦN BỔ SUNG và không có Blocker)

> Muốn mình tự bổ sung {X} điểm vào plan không?
> - Sửa: {liệt kê ngắn gọn các sections sẽ sửa}
> - Không sửa: {những gì cần user quyết định}
```

---

## Hướng dẫn sử dụng

### Phần "Những điểm Plan làm tốt"
- Liệt kê ít nhất 2-3 điểm tốt.
- Mỗi điểm phải có **dẫn chứng** từ codebase (file path, line).
- Mục đích: acknowledge công sức người viết plan, không chỉ chê.

### Phần "Cần bổ sung/điều chỉnh"
- **Phân loại severity** (bắt buộc):
  - 🔴 **Blocker**: Plan sai sót nghiêm trọng, implement sẽ gây bug/regression. VD: file path sai, kiến trúc mô tả sai, thiếu AC.
  - 🟠 **Major**: Plan thiếu sót quan trọng, nên fix trước implement. VD: thiếu files, risks chưa cover, test plan thiếu.
  - 🟡 **Minor**: Cải thiện nhỏ, fix sau cũng không sao. VD: naming, docs, extensibility notes.
- Mỗi vấn đề PHẢI có:
  1. **Mô tả cụ thể** + dẫn chứng
  2. **Đề xuất actionable** (chỉ rõ sửa section nào, thêm gì)
- KHÔNG viết chung chung: "cần xem lại", "nên cải thiện".

### Phần "Tổng kết"
- Chấm điểm **12 tiêu chí** theo thang 1-10 (Tier S: 4 tiêu chí).
- Tính **Weighted Score** theo formula (xem review_criteria.md).
- Kết luận RÕ RÀNG 1 trong 3 mức.
- Tier S chỉ cần chấm tiêu chí bắt buộc (xem triage depth ở SKILL.md).

### Phần "Auto-fix"
- Chỉ xuất hiện khi kết luận **CẦN BỔ SUNG** VÀ **không có Blocker**.
- Liệt kê rõ sẽ sửa gì, không sửa gì.
- Đợi user confirm trước khi sửa.

### Phần "Câu hỏi"
- Chỉ hỏi khi plan có chỗ mơ hồ hoặc chưa chốt.
- Kèm options/đề xuất để user chọn nhanh.
