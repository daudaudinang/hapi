## /debug-agents – Điều tra lỗi bằng subagents (bám sát `/debug`)

**Cách dùng**

```text
/debug-agents <mô tả lỗi hoặc log/stacktrace>
```

---

## Nguyên tắc

- Không giả định; mọi kết luận phải có evidence từ code/log/test.
- Không sửa code trong flow này; chỉ phân tích và đề xuất.
- Không tự chạy command (chỉ đề xuất reproduce plan cho user).
- Hypothesis-driven: đặt giả thuyết trước, đọc code có mục đích.
- Nếu không invoke được một subagent, hãy tự làm phần đó theo đúng output contract (fallback).
- Nếu xảy ra "collision" khi invoke bằng `/name`, hãy invoke bằng câu lệnh tự nhiên:
  - "Use the `debug-triage` subagent to …"
  - "Have the `debug-flow-mapper` subagent …"

---

## Workflow

1) Dùng `debug-triage` để tóm tắt lỗi và xác định thông tin còn thiếu.
   - Nếu thiếu thông tin để đi tiếp: chỉ hỏi làm rõ và dừng.

2) **Reproduce Plan**: Dựa trên triage output, đề xuất reproduce command/steps cho user.
   - ⚠️ **KHÔNG tự chạy** — chỉ đề xuất kèm cảnh báo môi trường.
   - Chờ user xác nhận trước khi tiếp tục.

3) Dùng `debug-flow-mapper` để dựng luồng xử lý, đặt hypotheses, và tạo investigation plan (hypothesis-driven).

4) Dùng `debug-risk-register` để đọc các files ưu tiên và lập danh sách rủi ro.
   - Ghi rõ mỗi rủi ro liên quan hypothesis nào.
   - Duy trì **Investigation Log** xuyên suốt (bao gồm negative findings).

5) Dùng `debug-root-cause-ranker` để xếp hạng nguyên nhân (có cột Hypothesis) và nêu confidence.

6) Dùng `debug-verification-planner` để đề xuất kế hoạch xác minh (logging/test/browser/trace).

7) Dùng `debug-report-writer` để tổng hợp báo cáo cuối cùng theo format `/debug`, bao gồm:
   - Impact analysis + reproduce command + regression scope + investigation log.

---

## Logging & Bảo mật

- **Không log**: env vars, database credentials, oauth tokens, secrets/keys, raw request bodies chứa dữ liệu nhạy cảm.
- Khi đề xuất logging, ưu tiên:
  - Log "shape" và metadata (request id, workspace id, counts, durations).
  - Redact/omit fields nhạy cảm.

---

## Ví dụ (copy/paste)

```text
/debug-agents

Triệu chứng: ...
Bối cảnh: ...
Logs/stacktrace:
...
Steps reproduce:
1) ...
2) ...
3) ...
```
