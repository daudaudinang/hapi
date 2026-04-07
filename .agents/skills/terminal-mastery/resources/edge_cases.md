# Edge Cases Handbook — Terminal Mastery

> Tài liệu tham chiếu chi tiết cho các tình huống đặc biệt khi tương tác terminal.
> Đọc khi gặp vấn đề không nằm trong Instructions chính của SKILL.md.

---

## 1. npm/yarn prompts "proceed? (y/n)"

```
Phòng tránh: Dùng --yes, --force, hoặc CI=true environment variable
Nếu bị stuck: send_command_input(Input="y\n", WaitMs=2000)
```

## 2. Git commit mở editor

```
Phòng tránh: LUÔN dùng git commit -m "message"
Nếu bị stuck: send_command_input(Terminate=true) → chạy lại với -m flag
Biến môi trường: GIT_EDITOR=true (skip editor)
```

## 3. Command output quá lớn (> context window)

```
Chiến lược:
  1. Dùng OutputCharacterCount nhỏ ở lần đầu (2000-3000)
  2. Nếu cần chi tiết → tăng lên 10000-15000
  3. Redirect output: command > /tmp/output.log 2>&1
     Sau đó: tail -100 /tmp/output.log (đọc cuối)
     Hoặc: head -50 /tmp/output.log (đọc đầu)
  4. Dùng grep để filter: command 2>&1 | grep -i "error\|fail\|warn"
```

## 4. Multiple commands cần chạy song song

```
Chỉ chạy song song KHI:
  - Commands KHÔNG ảnh hưởng lẫn nhau (khác thư mục, khác resource)
  - Cả hai đều là read-only

KHÔNG chạy song song KHI:
  - Cùng thay đổi filesystem
  - Cùng dùng chung port
  - Command B phụ thuộc output command A
```

## 5. Dev server restart sau khi thay đổi config

```
Bước 1: Terminate server cũ
  send_command_input(oldCommandId, Terminate=true, WaitMs=1000)

Bước 2: Chờ port được release
  run_command("sleep 2", WaitMsBeforeAsync=3000)

Bước 3: Start server mới → Theo Pattern C
```

## 6. Command chạy lâu hơn dự kiến

```
Nếu command vượt quá 3x estimated time:
  1. Check output để xem có đang làm việc hay bị stuck
  2. Nếu có progress (output mới) → tiếp tục chờ
  3. Nếu không có output mới → có thể bị hung → xem xét terminate
  4. Thông báo user nếu > 5 phút
```

## 7. ANSI escape codes trong output

```
Phòng tránh: Thêm flags disable color
  - Jest: --no-colors
  - ESLint: --no-color
  - npm: --no-color
  - Chung: Prefix với NO_COLOR=1 hoặc FORCE_COLOR=0

Nếu output bị nhiễu: Vẫn đọc được, bỏ qua escape sequences
```

## 8. SSH / Remote commands

```
⚠️ KHÔNG tự ý kết nối SSH
SafeToAutoRun = false LUÔN LUÔN
Nếu cần → hỏi user trước
```

## 9. Package manager lockfile conflicts

```
Triệu chứng: npm install / yarn install báo lockfile conflict
Xử lý:
  1. Xác định lockfile nào đang dùng (package-lock.json vs yarn.lock)
  2. Nếu cả 2 tồn tại → hỏi user dùng cái nào
  3. Chạy lại với đúng package manager
```

## 10. TypeScript compilation chậm bất thường

```
Triệu chứng: tsc --noEmit chạy > 2 phút
Xử lý:
  1. Check output cho "error TS" patterns
  2. Nếu có circular dependencies → báo user
  3. Gợi ý: tsc --noEmit --incremental (cache lại)
```
