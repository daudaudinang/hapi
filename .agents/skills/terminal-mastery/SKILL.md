---
name: terminal-mastery
# Version: 1.0.0 | Last updated: 2026-03-11
description: |
  Hướng dẫn tối ưu tương tác terminal cho AI Agent (Antigravity).
  Bao gồm: phân loại command, bảng tham số, execution patterns, xử lý lỗi, edge cases.
  Kích hoạt tự động khi agent cần chạy terminal commands, hoặc khi skill khác
  cần thực thi lệnh (implement-plan, debug-investigator, etc.).
  Triggers: "run command", "execute", "terminal", "build", "test", "dev server".
---

# Goal

Đảm bảo agent sử dụng 4 terminal tools (`run_command`, `command_status`,
`send_command_input`, `read_terminal`) **chính xác 100%** — không bao giờ miss
output, không bao giờ bị stuck chờ command đã xong, không bao giờ để command
destructive chạy tự động. Giảm terminal interaction errors xuống 0%.

---

# Instructions

## Bước 1: Phân loại command (BẮT BUỘC trước mỗi lần gọi `run_command`)

```
Command cần chạy
  │
  ├─ Có thay đổi/xóa dữ liệu? ──YES──→ DESTRUCTIVE → SafeToAutoRun = false
  │
  ├─ Có cần user nhập input? ────YES──→ INTERACTIVE → Pattern D
  │   (prompt y/n, editor, REPL)
  │
  ├─ Chạy vô thời hạn? ─────────YES──→ LONG_RUNNING → Pattern C
  │   (dev server, watch, tail -f)
  │
  ├─ Ước lượng thời gian?
  │   ├─ < 2s ──→ INSTANT → Pattern A (WaitMs=3000)
  │   ├─ 2-10s ─→ FAST → Pattern A (WaitMs=5000)
  │   ├─ 10-120s → MEDIUM → Pattern B (WaitMs=10000)
  │   └─ > 120s ─→ LONG → Pattern B (WaitMs=10000 + poll dài)
  │
  └─ Không chắc? ──→ Mặc định MEDIUM (Pattern B)
```

**Parameter Quick Reference (inline):**

| Category | WaitMsBeforeAsync | SafeToAutoRun |
|----------|:-:|:-:|
| INSTANT (< 2s) | `3000` | `true` nếu read-only |
| FAST (2-10s) | `5000` | `true` nếu read-only |
| MEDIUM (10-120s) | `10000` | `true` nếu không destructive |
| LONG (> 120s) | `10000` | Tùy command |
| LONG_RUNNING | `3000-5000` | `true` nếu dev server |
| INTERACTIVE | `2000-3000` | Tùy command |
| DESTRUCTIVE | Theo category gốc | `false` **LUÔN LUÔN** |

## Bước 2: Chọn Execution Pattern và thực thi

### Pattern A — Synchronous (INSTANT / FAST)

Dùng cho: `ls`, `cat`, `git status`, `git log -n 5`, `grep`, `node -e`, `python -c`

1. Gọi `run_command(WaitMsBeforeAsync=3000-5000, SafeToAutoRun=true nếu read-only)`
2. Đọc output trực tiếp từ kết quả tool
3. **Nếu** tool trả về CommandId thay vì output → Command chưa xong → Escalate sang **Pattern B**

**⚠️ LUÔN giới hạn output:**
- `git log` → `git log -n 10`
- `git diff` → `git diff --stat` trước, rồi diff cụ thể từng file
- `find` → thêm `-maxdepth` hoặc `| head -50`
- `grep` → thêm `-l` hoặc `--max-count=20`

### Pattern B — Async with Polling (MEDIUM / LONG)

Dùng cho: `npm install`, `yarn build`, `npm test`, `docker build`, `tsc --noEmit`

1. Gọi `run_command(WaitMsBeforeAsync=10000)`
2. **Nếu** command done → đọc output, **XONG**
3. **Nếu** nhận CommandId → Poll:
   - Lần 1: `command_status(CommandId, WaitDurationSeconds=60, OutputCharacterCount=5000)`
   - **Nếu** done → **XONG**
   - Lần 2: `command_status(CommandId, WaitDurationSeconds=120, OutputCharacterCount=10000)`
   - **Nếu** vẫn running sau ~3 phút → Escalate → **Bước 5**
4. Verify Success → Xem Bước 3

### Pattern C — Long-Running Service

Dùng cho: `npm run dev`, `yarn dev`, `docker-compose up`

1. Gọi `run_command(WaitMsBeforeAsync=5000)` → Ghi nhận CommandId
2. Check startup: `command_status(CommandId, WaitDurationSeconds=15, OutputCharacterCount=3000)`
3. Tìm **SUCCESS** patterns trong output:
   - Next.js: `"Ready in"`, `"✓ Ready"`
   - Vite: `"ready in"`, `"Local:"`
   - Express/Medusa: `"listening on port"`, `"Medusa server is ready"`
4. Tìm **FAILURE** patterns: `"EADDRINUSE"`, `"Cannot find module"`, `"Error:"`, `"FATAL"`
5. **Nếu** failure → `send_command_input(CommandId, Terminate=true, WaitMs=1000)` → Fix root cause → Retry (max 2 lần)
6. **Nếu** success → Ghi nhớ CommandId, KHÔNG poll liên tục
7. **Nếu** retry 2 lần vẫn fail → Escalate → **Bước 5**

**Port conflict:** `kill -9 $(lsof -ti:<PORT>)` rồi retry

### Pattern D — Interactive Command

Dùng cho: `npm init`, `npx create-*`, commands cần input

1. **PHÒNG TRÁNH trước**: Ưu tiên non-interactive flags (`-y`, `--yes`, `--force`, `-m`)
2. **Nếu PHẢI interactive**: `run_command(WaitMsBeforeAsync=3000)` → nhận CommandId
3. Check prompt: `command_status(CommandId, WaitDurationSeconds=5, OutputCharacterCount=2000)`
4. Respond: `send_command_input(CommandId, Input="yes\n", WaitMs=3000)`
5. Lặp lại bước 3-4 cho mỗi prompt (max 5 lần)
6. Khi xong → `command_status` để verify complete
7. **Nếu** > 5 prompts hoặc không rõ prompt → Escalate → **Bước 5**

### Pattern E — Piped / Chained Commands

- **Ưu tiên**: Tách commands thành từng `run_command` riêng biệt
- Pipe (`|`): WaitMsBeforeAsync theo command **chậm nhất**
- AND (`&&`): WaitMsBeforeAsync = tổng estimated time (cap 10000ms)

## Bước 3: Verify kết quả (BẮT BUỘC sau mỗi command)

Tìm trong output:

| Loại | Keywords |
|------|----------|
| **CRITICAL** (fail chắc) | `Error:`, `FATAL`, `FAIL`, `Cannot find module`, `SyntaxError`, `ENOENT`, `EADDRINUSE`, `Build failed`, `killed`, `OOM`, `command not found` |
| **WARNING** (có thể OK) | `Warning:`, `deprecated`, `peer dep` |
| **SUCCESS** (pass) | `compiled successfully`, `Done in`, `Tests: X passed`, `added X packages`, `Ready in` |

Checklist:
```
□ Status = "done"?
□ Output KHÔNG chứa CRITICAL keywords?
□ Output CÓ chứa SUCCESS pattern?
□ Nếu tạo file → verify tồn tại?
```

## Bước 4: Error Recovery (nếu command fail)

| Lỗi | Xử lý |
|------|--------|
| **Command hung** (running >3 phút, không output mới) | `send_command_input(Terminate=true)` → Chạy lại với non-interactive flags |
| **EADDRINUSE** | `kill -9 $(lsof -ti:<PORT>)` → Retry |
| **Module not found** | `npm install <package>` → Retry |
| **Permission denied** | KHÔNG sudo tự động → Thông báo user |
| **OOM / Killed** | Báo user → Gợi ý `NODE_OPTIONS=--max-old-space-size=4096` |
| **command not found** | Kiểm tra PATH, binary tồn tại → Báo user install |
| **Status "running" nhưng command đã xong** | Poll thêm `WaitDurationSeconds=10-30` → Nếu output có pattern → coi như done → Fallback: `read_terminal(ProcessID)` |

**⚠️ Mỗi error chỉ retry tối đa 2 lần.** Nếu vẫn fail → Bước 5.

## Bước 5: Escalation Protocol (khi nào DỪNG và hỏi user)

**DỪNG ngay và báo user khi:**

1. ❌ Command fail **3 lần liên tiếp** (kể cả sau retry)
2. ❌ Poll **3 lần** mà command vẫn "running" không có output mới
3. ❌ Gặp lỗi **không nằm trong Error Recovery table** (Bước 4)
4. ❌ Interactive command hỏi prompt mà agent **không hiểu** nội dung
5. ❌ Command cần **credentials/tokens** mà agent không có
6. ❌ Tổng thời gian xử lý 1 command **> 5 phút**

**Khi escalate, BẮT BUỘC cung cấp cho user:**
```
📋 Command: [command đã chạy]
❌ Error: [error message cụ thể]
🔄 Đã thử: [liệt kê các retry đã làm]
💡 Gợi ý: [đề xuất hướng xử lý nếu có]
```

**TUYỆT ĐỐI KHÔNG** tự ý thử cách khác ngoài Error Recovery table mà không hỏi user.

---

# Examples

## Ví dụ 1: Build project (Happy path — Pattern B)

**Context:** Agent cần build project để verify changes sau khi sửa code.

**Input:** Cần chạy `yarn build` trong project Next.js

**Thought Process:**
- `yarn build` → Category: MEDIUM (ước lượng 30-60s)
- Pattern B → WaitMsBeforeAsync = 10000
- SafeToAutoRun = true (build là read+write nhưng không destructive)

**Execution:**
```
1. run_command("yarn build", WaitMsBeforeAsync=10000, SafeToAutoRun=true)
   → Nhận CommandId: "cmd_abc123"

2. command_status("cmd_abc123", WaitDurationSeconds=60, OutputCharacterCount=5000)
   → status: "done"
   → output chứa: "✓ Compiled successfully" + "Done in 23.4s"

3. Verify: ✅ status=done, ✅ có success pattern, ✅ không có error keywords
   → PASS
```

## Ví dụ 2: Dev server bị port conflict (Edge case — Pattern C)

**Context:** Agent start dev server nhưng port 3000 đã bị chiếm.

**Input:** Cần chạy `yarn dev` trên port 3000

**Thought Process:**
- `yarn dev` → Category: LONG_RUNNING
- Pattern C → WaitMsBeforeAsync = 5000
- Cần check startup success/failure

**Execution:**
```
1. run_command("yarn dev", WaitMsBeforeAsync=5000)
   → Nhận CommandId: "cmd_def456"

2. command_status("cmd_def456", WaitDurationSeconds=15, OutputCharacterCount=3000)
   → output chứa: "Error: listen EADDRINUSE: address already in use :::3000"
   → ❌ FAILURE detected

3. Error Recovery:
   3a. send_command_input("cmd_def456", Terminate=true, WaitMs=1000)
   3b. run_command("kill -9 $(lsof -ti:3000)", WaitMsBeforeAsync=3000, SafeToAutoRun=false)
       → User approves → PID killed
   3c. run_command("sleep 2", WaitMsBeforeAsync=3000, SafeToAutoRun=true)
   3d. run_command("yarn dev", WaitMsBeforeAsync=5000) → Nhận CommandId mới

4. command_status(newCommandId, WaitDurationSeconds=15, OutputCharacterCount=3000)
   → output chứa: "✓ Ready in 3.2s"
   → ✅ SUCCESS
```

## Ví dụ 3: Command xong nhưng tool vẫn báo running (Tool edge case)

**Context:** Agent chạy `npm test`, command đã xong nhưng `command_status` vẫn trả "running".

**Thought Process:**
- Đây là edge case của tool — cần polling strategy kiên nhẫn hơn
- Tăng WaitDurationSeconds và OutputCharacterCount
- Fallback cuối cùng: `read_terminal`

**Execution:**
```
1. run_command("npm test", WaitMsBeforeAsync=10000)
   → Nhận CommandId: "cmd_ghi789"

2. command_status("cmd_ghi789", WaitDurationSeconds=60, OutputCharacterCount=5000)
   → status: "running" ← Bất thường!
   → output chứa: "Tests: 42 passed, 42 total" + "Done in 15.3s"
   → Output đã có SUCCESS pattern nhưng status vẫn "running"

3. Poll thêm: command_status("cmd_ghi789", WaitDurationSeconds=10, OutputCharacterCount=5000)
   → Nếu status = "done" → XONG
   → Nếu vẫn "running" nhưng output có "Done in" → Coi như đã xong

4. Fallback: read_terminal(ProcessID) để double-check raw output

5. Kết luận: Output xác nhận command đã thành công → Tiếp tục workflow
```

## Ví dụ 4: Interactive command — npx create (Pattern D)

**Context:** Agent cần tạo project mới với `npx create-next-app`.

**Input:** Cần chạy `npx create-next-app my-app`

**Thought Process:**
- `npx create-next-app` → Category: INTERACTIVE (sẽ hỏi nhiều prompt)
- Bước 0: Tìm non-interactive flags → `--yes --use-npm` có sẵn!
- Ưu tiên dùng non-interactive mode

**Execution:**
```
1. PHÒNG TRÁNH: Dùng flags non-interactive
   run_command("npx -y create-next-app my-app --yes --use-npm",
               WaitMsBeforeAsync=10000, SafeToAutoRun=true)
   → Nhận CommandId (vì install mất thời gian)

2. command_status(CommandId, WaitDurationSeconds=60, OutputCharacterCount=5000)
   → status: "done"
   → output chứa: "Success! Created my-app"
   → ✅ PASS — Không cần interactive handling nhờ flags
```

## Ví dụ 5: Command không tồn tại (Bad Input case)

**Context:** Agent cần chạy 1 tool nhưng gõ sai tên.

**Input:** Chạy `yarn biuld` (typo)

**Thought Process:**
- `yarn biuld` → Category: MEDIUM (giả sử là build)
- Pattern B → WaitMsBeforeAsync = 10000

**Execution:**
```
1. run_command("yarn biuld", WaitMsBeforeAsync=10000, SafeToAutoRun=true)
   → status: "done" (exit nhanh)
   → output chứa: "error Command \"biuld\" not found."

2. Verify: ❌ CRITICAL keyword "error" + "not found"
   → FAIL — Không retry (lỗi ở command, không phải hệ thống)

3. Sửa: Chạy "yarn build" (fix typo)
```

---

# Constraints

## Bảo mật (Ưu tiên cao nhất)

- 🚫 **TUYỆT ĐỐI KHÔNG** set `SafeToAutoRun=true` cho commands destructive (`rm`, `git reset --hard`, `DROP`, `npm publish`, `docker push`)
- 🚫 **TUYỆT ĐỐI KHÔNG** tự ý chạy `sudo` — luôn hỏi user trước
- 🚫 **TUYỆT ĐỐI KHÔNG** tự ý kết nối SSH — luôn hỏi user trước

## Vận hành (Ưu tiên cao)

- 🚫 **KHÔNG BAO GIỜ** set `WaitDurationSeconds=0` trong `command_status` — tối thiểu `5`
- 🚫 **KHÔNG BAO GIỜ** set `OutputCharacterCount` < `2000` — output quá ít = miss errors
- 🚫 **KHÔNG BAO GIỜ** đọc output > `15000` chars trừ khi redirect ra file trước
- 🚫 **KHÔNG BAO GIỜ** poll quá 3 lần liên tiếp cho cùng 1 command — nếu cần hơn → Escalate (Bước 5)
- 🚫 **KHÔNG BAO GIỜ** bỏ qua output mà chỉ check status — LUÔN đọc output
- 🚫 **KHÔNG BAO GIỜ** tự ý thử cách fix ngoài Error Recovery table — phải hỏi user
- ✅ **LUÔN LUÔN** phân loại command TRƯỚC khi chọn WaitMsBeforeAsync
- ✅ **LUÔN LUÔN** verify kết quả sau mỗi command (Bước 3)
- ✅ **LUÔN LUÔN** thêm flags giới hạn output (`-n`, `--stat`, `-l`, `--no-color`)
- ✅ **LUÔN LUÔN** dùng non-interactive flags khi có thể (`-y`, `--yes`, `-m`)

## Quy ước

- ✅ Ưu tiên tách commands chain (`&&`) thành từng `run_command` riêng biệt
- ✅ Dùng `NO_COLOR=1` hoặc `--no-color` để tránh ANSI escape codes nhiễu output
- ✅ Redirect output lớn: `command > /tmp/output.log 2>&1` rồi đọc bằng `tail -100`
- ✅ Khi restart dev server: Terminate cũ → `sleep 2` → Start mới

<!-- Generated by Skill Generator v3.2 -->
