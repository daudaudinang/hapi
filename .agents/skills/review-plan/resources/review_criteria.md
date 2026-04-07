# Tiêu chí đánh giá Plan (v3 — đồng bộ plan template v3)

Sử dụng bảng tiêu chí này ở BƯỚC 3 để chấm điểm plan.

---

## Bảng tiêu chí

| # | Tiêu chí | Câu hỏi cần trả lời | Trọng số | Hệ số | Cách kiểm tra |
|---|----------|---------------------|----------|-------|---------------|
| 1 | **Độ chính xác** | Mô tả trong plan có khớp code thực tế? | 🔴 Cao | ×3 | Đọc files được đề cập, so sánh types/interfaces/functions |
| 2 | **Độ đầy đủ** | Có thiếu files/components cần thay đổi? | 🔴 Cao | ×3 | `grep_search` keywords liên quan, tìm vị trí chưa nhắc |
| 3 | **Acceptance Criteria** | AC có SMART? Có verify command? | 🔴 Cao | ×3 | Kiểm tra: mỗi AC specific, measurable, có test command |
| 4 | **Execution Boundary** | Có Allowed + Do NOT Modify rõ ràng? | 🔴 Cao | ×3 | Kiểm tra: plan liệt kê đủ files, có guardrails |
| 5 | **Risks coverage** | Dùng Risk Matrix? Có risks chưa cover? | 🔴 Cao | ×3 | Kiểm tra format (bảng Likelihood×Impact), edge cases |
| 6 | **Backward compatibility** | Có rủi ro breaking change? | 🔴 Cao | ×3 | Kiểm tra: API contract, DB schema, public interfaces |
| 7 | **Thiết kế rõ ràng** | Đủ chi tiết để implement ngay? | 🟡 TB | ×2 | Litmus test: "agent khác có implement đúng mà không hỏi thêm?" |
| 8 | **Test plan** | Hướng dẫn test đầy đủ? | 🟡 TB | ×2 | Có happy paths + edge cases + regression? |
| 9 | **Dependencies** | Prerequisites đầy đủ? | 🟡 TB | ×2 | Env vars, services, packages, tasks trước |
| 10 | **Điểm mở rộng** | Tính đến khả năng mở rộng? | 🟢 Thấp | ×1 | Có module separation? Có extensibility notes? |
| 11 | **Implementation Order** | Có dependency graph đúng? | 🟢 Thấp | ×1 | Bảng Order, Depends On, AC mapping hợp lý? |
| 12 | **Pre-flight Check** | Đủ preconditions cho implement? | 🟢 Thấp | ×1 | Deps, services, env vars, branch, plan version? |

---

## Thang điểm

| Mức | Điểm | Ý nghĩa | Icon |
|-----|------|---------|------|
| ĐẠT | 9–10/10 | Không có vấn đề | ✅ |
| CẦN BỔ SUNG | 6–8/10 | Vấn đề nhỏ, bổ sung được nhanh | ⚠️ |
| CẦN XEM LẠI | <6/10 | Vấn đề nghiêm trọng, cần suy nghĩ lại | ❌ |

---

## Chi tiết cách đánh giá từng tiêu chí

### 1. Độ chính xác (Trọng số: Cao)

**Kiểm tra gì:**
- Tên file paths có đúng không?
- Types/interfaces mô tả trong plan có đúng không?
- Function signatures mô tả có khớp không?
- Behavior mô tả có đúng không?

**Red flags:**
- Plan nói "file X có function Y" nhưng thực tế không có
- Plan mô tả flow A → B → C nhưng code thực tế A → C (skip B)
- Tên field/type bị sai

### 2. Độ đầy đủ (Trọng số: Cao)

**Kiểm tra gì:**
- `grep_search` keywords chính → có vị trí code nào chưa nhắc?
- Tìm consumers/callers của functions sẽ thay đổi → chúng có trong plan?
- DB migration cần hay không?
- Config/env changes cần hay không?

**Red flags:**
- Thay đổi function X nhưng không nhắc đến nơi gọi X
- Thêm field vào schema nhưng không nhắc migration
- Thay đổi API nhưng không nhắc update docs/tests

### 3. Acceptance Criteria (Trọng số: Cao) — MỚI

**Kiểm tra gì:**
- Có section "Acceptance Criteria" không?
- Mỗi AC có SMART không? (Specific, Measurable)
- Mỗi AC có verify command / method không?
- AC có cover đủ mục tiêu chính không?

**Red flags:**
- AC viết mơ hồ: "hoạt động tốt", "performance ok"
- AC thiếu verify command
- Plan có 5 mục tiêu nhưng chỉ 2 AC

### 4. Execution Boundary (Trọng số: Cao) — MỚI

**Kiểm tra gì:**
- Có section "Execution Boundary" không?
- Có danh sách "Allowed Files" rõ ràng không?
- Có danh sách "Do NOT Modify" không?
- "Do NOT Modify" có giải thích lý do không?

**Red flags:**
- Plan nói sửa 5 files nhưng Execution Boundary chỉ liệt kê 3
- Thiếu "Do NOT Modify" → agent implement có thể drift ngoài scope
- "Allowed Files" quá rộng, không cụ thể

### 5. Risks coverage (Trọng số: Cao)

**Kiểm tra gì:**
- Plan dùng **Risk Matrix** (bảng Likelihood × Impact) hay flat list?
- Có đầy đủ cột: Trigger, Mitigation, Owner?
- Có ưu tiên xử lý risks High×High trước?

**Checklist risks phổ biến:**
- [ ] Input null/undefined/empty
- [ ] Concurrent access / race condition
- [ ] Large data / pagination
- [ ] Permission / authentication
- [ ] Error propagation
- [ ] State inconsistency

**Red flags:**
- Dùng flat list thay vì bảng matrix (⚠️ warn, không block)
- Thiếu Likelihood hoặc Impact → không biết ưu tiên
- Risks liệt kê nhưng thiếu Mitigation cụ thể

### 6. Backward compatibility (Trọng số: Cao)

**Checklist:**
- [ ] API contract giữ nguyên? (endpoints, request/response format)
- [ ] Database schema backward-compatible? (new fields nullable/default?)
- [ ] Public interfaces/types giữ nguyên?
- [ ] Existing tests vẫn pass?

### 7. Thiết kế rõ ràng (Trọng số: Trung bình)

**Test litmus:** Nếu đưa plan cho 1 agent khác, agent đó có implement đúng mà KHÔNG cần hỏi thêm không?

**Red flags:**
- "Cần thêm logic xử lý" — xử lý THẾ NÀO?
- "Tối ưu performance" — tối ưu CÁI GÌ, bằng cách nào?
- Thiếu thông tin: enum values, validation rules, error messages

### 8. Test plan (Trọng số: Trung bình)

**Checklist:**
- [ ] Có happy paths? (ít nhất 2-3)
- [ ] Có edge cases? (ít nhất 2-3)
- [ ] Có regression checks?
- [ ] Test steps cụ thể (không chỉ "test X hoạt động")?
- [ ] Expected results rõ ràng?

### 9. Dependencies (Trọng số: Trung bình) — MỚI

**Kiểm tra gì:**
- Có section "Dependencies / Prerequisites" không?
- Env vars cần thiết có liệt kê không?
- Services cần chạy trước có nhắc không?
- Packages cần cài có version không?
- Task dependencies (task nào phải xong trước)?

**Red flags:**
- Plan cần gọi API backend nhưng không nhắc cần chạy backend trước
- Plan cần env var `API_KEY` nhưng không liệt kê
- Plan phụ thuộc task khác nhưng không nhắc

### 10. Điểm mở rộng (Trọng số: Thấp)

**Kiểm tra:**
- Plan có section "Những điểm dễ thay đổi trong tương lai"?
- Code design có modular? (tách functions/components hợp lý?)
- Config có hardcode không? (magic numbers, hardcoded URLs, ...)

### 11. Implementation Order (Trọng số: Thấp) — MỚI

**Kiểm tra gì:**
- Có section "Implementation Order" không?
- Có bảng với cột: Order, File, Depends On, AC(s)?
- Dependency chain hợp lý? (file phụ thuộc phải implement trước)
- AC mapping đúng? (mỗi AC có ít nhất 1 file liên quan)

**Red flags:**
- File A depends on File B nhưng Order(A) < Order(B)
- AC nhắc trong plan nhưng không có trong Implementation Order
- Thiếu section này ở Tier M/L

### 12. Pre-flight Check (Trọng số: Thấp) — MỚI

**Kiểm tra gì:**
- Có section "Pre-flight Check" không?
- Liệt kê dependencies cần cài? (uv sync / bun install)
- Liệt kê services cần chạy? (backend, DB)
- Liệt kê env vars cần set?
- Có nhắc tạo branch?
- Có nhắc kiểm tra plan version?

**Red flags:**
- Plan cần backend chạy nhưng Pre-flight không nhắc
- Plan cần env vars nhưng không liệt kê
- Thiếu section này ở Tier M/L

---

## Scoring Formula

```text
Weighted Score = Σ(score_i × hệ_số_i)

Tier M/L:
- Cao (×3):   tiêu chí 1-6  → max 180 pts
- TB (×2):    tiêu chí 7-9  → max 60 pts
- Thấp (×1): tiêu chí 10-12 → max 30 pts
- Total: max 270 pts

Tier S:
- Cao (×3):   tiêu chí 1-4  → max 120 pts

Thresholds:
- ≥ 90% → ✅ PASS
- 60–89% → ⚠️ CẦN BỔ SUNG
- < 60% → ❌ CẦN XEM LẠI

Override:
- Bất kỳ tiêu chí Cao nào ≤ 5/10 → auto-downgrade
- Bất kỳ Blocker nào → auto-downgrade xuống CẦN XEM LẠI
```
