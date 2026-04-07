## /debug – Điều tra lỗi có hệ thống, ưu tiên độ chính xác

> **🔗 SKILL BẮT BUỘC**: Trước khi thực hiện workflow này, PHẢI đọc skill file:
> `.agents/skills/debug-investigator/SKILL.md`
>
> Skill file là **source of truth** — chứa instructions chi tiết, templates, examples,
> investigation log format, hypothesis-driven protocol, và constraints.
> File này chỉ là **tổng quan nhanh** cho reference.

Command này dùng khi cần **điều tra nguyên nhân gốc rễ** của lỗi/bất thường trong hệ thống.
Trong chế độ này, **KHÔNG tự ý sửa code**, chỉ phân tích và đề xuất.

---

## Cách dùng

```text
/debug <mô tả lỗi hoặc log/stacktrace>
```

Nếu mô tả quá ngắn hoặc thiếu, agent **PHẢI** hỏi lại để làm rõ trước khi đi sâu.

---

## Nguyên tắc chung

- **Không giả định**: mọi kết luận phải có evidence từ code/log/test.
- **Không sửa code**: chỉ phân tích và đề xuất.
- **Không tự chạy command**: chỉ đề xuất reproduce plan cho user (read-only actions OK).
- **Hypothesis-driven**: đặt giả thuyết trước, đọc code có mục đích.
- **Investigation Log**: ghi lại mọi hành động, kể cả negative findings.
- **Tôn trọng rules repo**:
  - Logger: `logger.info`, `logger.warn`, `logger.error` — **KHÔNG** `console.log`.
  - Runtime: ưu tiên `bun`/`bunx` — **KHÔNG** `npm`/`npx`.
  - Python: ưu tiên `uv run` — **KHÔNG** `python` trực tiếp (tránh sai venv).

---

## Workflow 8 bước (overview)

> 📖 Chi tiết đầy đủ: xem `.agents/skills/debug-investigator/SKILL.md`

| Bước | Tên | Mô tả ngắn |
|------|-----|-------------|
| 0 | Nhận mô tả lỗi | Đọc input, hỏi làm rõ nếu thiếu |
| 0.5 | Nạp Project Context | Hook tự động nạp context nếu có skill |
| 1 | 📥 Thu thập thông tin | Phân loại sơ bộ (loại/mức độ/tần suất) |
| 1.5 | 🔄 Reproduce Plan | Đề xuất reproduce command/steps cho user (**KHÔNG tự chạy**) |
| 2 | 🏗️ Hiểu hệ thống | Tổng quan tech stack + luồng xử lý liên quan |
| 3 | 🎯 Hypothesis-Driven | Đặt 2–3 hypotheses, liệt kê files theo hypothesis |
| 4 | 🔍 Phân tích code | Đọc code per-hypothesis, ghi rủi ro, cập nhật Investigation Log |
| 5 | 📊 Tổng hợp & xếp hạng | Bảng rủi ro, phân tích sâu top 3, bảng xếp hạng |
| 6 | ✅ Verification | Tự phản biện, đề xuất verification strategy |
| 7 | 📝 Báo cáo | Report đầy đủ: impact + reproduce + evidence + fix + regression |

---

## Output: Báo cáo điều tra

Report bao gồm (template: `resources/debug_report_template.md`):

1. **Executive Summary** — lỗi gì, nguyên nhân chính, confidence %
2. **Impact Analysis** — phạm vi ảnh hưởng, workaround, urgency
3. **Reproduce** — command/steps cụ thể + cảnh báo môi trường
4. **Chi tiết nguyên nhân** — file, function, code, evidence, hypothesis
5. **Đề xuất fix** — code hiện tại vs đề xuất, risk level
6. **Regression Scope** — files + tests + luồng UI cần check
7. **Investigation Log** — audit trail đầy đủ
8. **Action items** — checklist trước/khi/sau fix

---

## Cases đặc biệt

| Case | Cách xử lý |
|------|------------|
| Không tìm được nguyên nhân | Ghi rõ đã trace gì, loại trừ gì, đề xuất thêm log |
| Nhiều nguyên nhân kết hợp | Liệt kê mức đóng góp, đề xuất thứ tự fix |
| Race condition | Mô tả timeline events, đề xuất đồng bộ/queue/debounce |
| Re-render / state issue | Check parent/context/hooks, đề xuất memoization |
| Performance issue | Xác định bottleneck, đề xuất quick win + long-term |

---

## Kết thúc flow `/debug`

Flow hoàn thành khi:
- Có executive summary + nguyên nhân gốc (hoặc tập hợp) + confidence + action items.
- Hoặc: đã nêu rõ hạn chế + thông tin cần thêm từ user.

Nếu user muốn **sửa code**:
- Kết thúc `/debug`.
- Chuyển sang `/implement` với kết quả debug làm input.