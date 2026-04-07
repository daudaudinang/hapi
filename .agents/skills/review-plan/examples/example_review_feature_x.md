# Ví dụ End-to-End: Review Plan Feature X

Ví dụ này minh họa toàn bộ workflow review plan từ đầu đến cuối.

---

## Input

```
/review-plan .agents/plans/PLAN_FEATURE_X.md
```

---

## Bước 1: Đọc plan

**Sections đã có:**
- ✅ Mục tiêu
- ✅ Non-goals
- ✅ Bối cảnh hiện trạng
- ✅ Yêu cầu nghiệp vụ
- ✅ Thiết kế kỹ thuật
- ✅ Các thay đổi dự kiến
- ⚠️ Test plan (có nhưng chưa đầy đủ)
- ❌ Thiết kế data model (thiếu)

**Files/components đề cập:**
- `src/components/feature-x/main.tsx`
- `src/types/feature-x.ts`
- `src/api/routes/feature-x.ts`

---

## Bước 2: Đối chiếu

| File path trong plan | Tồn tại? | Mô tả khớp? |
|---------------------|----------|-------------|
| `src/components/feature-x/main.tsx` | ✅ | ✅ Đúng — có function `processFeatureX` |
| `src/types/feature-x.ts` | ✅ | ⚠️ Plan nói có field `status` nhưng thực tế field tên là `state` |
| `src/api/routes/feature-x.ts` | ❌ | File không tồn tại — thực tế route nằm tại `src/api/routes/features/[id].ts` |

**Thiếu sót phát hiện:**
- `grep_search "featureX"` → tìm thấy thêm 1 consumer tại `src/hooks/useFeatureX.ts` mà plan chưa nhắc.
- Hook này đang subscribe data → cần cập nhật khi schema thay đổi.

---

## Bước 3: Đánh giá

| Tiêu chí | Điểm | Nhận xét |
|----------|------|----------|
| Độ chính xác | 7/10 | Tên field `status` vs `state` sai; route path sai |
| Độ đầy đủ | 6/10 | Thiếu `useFeatureX.ts` hook; thiếu data model section |
| Thiết kế rõ ràng | 8/10 | Nhìn chung đủ chi tiết |
| Risks coverage | 7/10 | Chưa cover trường hợp concurrent updates |
| Backward compatibility | 8/10 | Schema changes backward-compatible |
| Test plan | 5/10 | Chỉ có 1 happy path, thiếu edge cases |
| Điểm mở rộng | 8/10 | Có module separation tốt |

---

## Bước 4: Output

```markdown
## 📋 Kết quả Review Plan: Feature X

### ✅ Những điểm Plan làm tốt

| Hạng mục | Đánh giá |
|----------|----------|
| Bối cảnh hiện trạng | ✅ Mô tả chính xác logic tại `main.tsx:23-45` |
| Thiết kế kỹ thuật | ✅ Kiến trúc rõ ràng, tách module hợp lý |
| Backward compatibility | ✅ Schema changes đều nullable — safe |

---

### ⚠️ Những điểm cần bổ sung/điều chỉnh

#### 1. **Tên field sai: `status` vs `state`**

**Vấn đề:** Plan mô tả field `status` nhưng thực tế tại `src/types/feature-x.ts:12` field tên là `state`.

**Đề xuất:** Sửa toàn bộ references từ `status` → `state` trong plan.

#### 2. **Route path sai**

**Vấn đề:** Plan ghi `src/api/routes/feature-x.ts` nhưng file không tồn tại. Thực tế route nằm tại `src/api/routes/features/[id].ts`.

**Đề xuất:** Cập nhật path trong section "Các thay đổi dự kiến".

#### 3. **Thiếu useFeatureX hook**

**Vấn đề:** `grep_search "featureX"` phát hiện `src/hooks/useFeatureX.ts` đang subscribe data — plan chưa nhắc. Hook này sẽ bị ảnh hưởng khi schema thay đổi.

**Đề xuất:** Bổ sung `src/hooks/useFeatureX.ts` vào "Các thay đổi dự kiến" — cần update subscription query.

#### 4. **Test plan thiếu edge cases**

**Vấn đề:** Chỉ có 1 happy path. Thiếu: input empty, concurrent update, large payload.

**Đề xuất:** Bổ sung ít nhất 3 edge cases: (1) input empty → validation error, (2) concurrent update → last-write-wins hoặc optimistic lock, (3) payload >1MB → reject.

---

### 📊 Tổng kết

| Tiêu chí | Điểm | Nhận xét |
|----------|------|----------|
| Độ chính xác | 7/10 | 2 chỗ sai (field name, route path) |
| Độ đầy đủ | 6/10 | Thiếu hook + data model section |
| Thiết kế rõ ràng | 8/10 | Đủ chi tiết nhìn chung |
| Risks coverage | 7/10 | Chưa cover concurrent updates |
| Backward compatibility | 8/10 | Safe |
| Test plan | 5/10 | Thiếu edge cases nghiêm trọng |
| Điểm mở rộng | 8/10 | Modular tốt |

**Kết luận:** ⚠️ **CẦN BỔ SUNG** — Cần sửa 4 điểm trước khi implement.
```
