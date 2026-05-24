# Session Crash Recovery — Root Cause Analysis

Date: 2026-05-15
Status: Analysis
Related: `docs/superpowers/specs/2026-05-12-session-recovery-context-design.md`

---

## 1. Symptom (Triệu chứng)

Sau khi Codex session crash (systemError, 429), user gõ "Tiếp tục", agent phản hồi nhưng **không có bất kỳ ngữ cảnh nào** về công việc trước đó. Agent hành xử như đang ở một session hoàn toàn mới.

### Test case thực tế

**Session:** `550f5c7e-424c-4ac6-b581-7c85a3d832f1` (project: `/home/huynq/projects/nstt`, flavor: `codex`)

| Seq | Thời gian | Nội dung |
|-----|-----------|----------|
| 1 | May 14 18:17 | User: "Cậu ơi, con dự án này mình đã có các file tài liệu..." |
| 24 | May 14 18:19 | Agent: "Mình tóm gọn nhu cầu trước cho rõ: cậu cần tài liệu vừa mô tả flow..." |
| 27 | May 14 18:20 | User: "Đúng rồi cậu. Feature spec." |
| 29 | May 14 18:20 | User: "Đúng rồi cậu. Feature spec. Về cấu trúc..." |
| 31 | May 14 18:21 | Agent: "Hiểu rồi cậu. Khi agent là thực thể thực thi..." |
| 34 | May 14 18:23 | User: "Đồng ý cậu ơi. Mình cho cậu tự động hóa hoàn toàn nhé..." |
| **56** | **May 14 19:45:15** | **Event: "Task failed: Codex thread entered systemError"** |
| **57** | **May 14 19:45:15** | **Event: "Task failed: exceeded retry limit, last status: 429"** |
| **58** | **May 14 19:45:15** | **Event: "Task failed"** |
| **60** | **May 15 08:27:48** | **User: "Cậu có biết cậu đang làm gì không?" ← KIỂM TRA CONTEXT** |
| 73 | May 15 08:28:29 | Agent: "Mình chưa làm gì cụ thể cả, vì cậu mới chỉ hỏi một câu thôi..." |

**Kết quả:** Agent không hề biết về 5 user messages, 4 agent responses, và toàn bộ ngữ cảnh công việc trước đó.

---

## 2. Root Cause (Nguyên nhân gốc rễ)

### Tóm tắt

**Session vẫn `active` sau crash → auto-resume không bao giờ được trigger → recovery context không bao giờ được inject.**

Toàn bộ chain `buildRecoveryContext → RPC → --recovery-context → developerInstructions` đã được implement đúng, nhưng **không bao giờ chạy** vì điều kiện trigger (`!session.active`) không thỏa mãn.

### Phân tích chi tiết

#### 2.1. Kiến trúc HAPI session lifecycle

```
┌──────────────┐     heartbeat      ┌──────────────┐
│  CLI process │ ────────────────── │     Hub      │
│  (PID 399...)│                    │  (in-memory) │
└──────────────┘                    └──────────────┘
       │                                    │
       │  Codex thread chạy bên trong       │  session.active = true/false
       │  CLI process                       │  (chỉ tồn tại trong RAM)
       │                                    │
   ┌───┴───────────┐                       │
   │ Codex thread   │                       │
   │ (app-server)   │                       │
   └───────────────┘                       │
```

- **HAPI CLI process**: long-lived, quản lý kết nối socket đến hub, gửi heartbeat
- **Codex thread**: chạy bên trong CLI process, giao tiếp với Codex app-server
- **`session.active`**: trạng thái in-memory trong hub, được set `true` khi CLI gửi heartbeat, set `false` khi heartbeat timeout (30s)

#### 2.2. Crash không giết CLI process

Khi Codex thread gặp lỗi (`systemError`, `429 Too Many Requests`):

1. **Codex thread chết** — app-server thread không thể resume
2. **HAPI CLI process vẫn sống** — process không exit, socket vẫn mở
3. **CLI tiếp tục gửi heartbeat** → hub duy trì `session.active = true`
4. **Session không bao giờ thành inactive**

Evidence: Process `PID 3997765` (CLI của session `550f5c7e`) vẫn đang chạy từ May 14 đến hiện tại (May 15).

```
$ ps -p 3997765 -o pid,cmd
3997765 /home/huynq/.../hapi codex --hapi-starting-mode remote --started-by runner ...
```

#### 2.3. Điều kiện trigger auto-resume

`hub/src/web/routes/messages.ts:79`:
```typescript
// Auto-resume: if session is inactive, trigger resume and return 202
if (!session.active) {
    // ... triggerAutoResume ...
    return c.json({ status: 'resuming', sessionId }, 202)
}

// ⚠️ Nếu session.active = true, message đi thẳng vào CLI cũ
await engine.sendMessage(sessionId, { ... })
```

**Auto-resume CHỈ trigger khi `session.active === false`.** Nhưng sau crash, session luôn `active === true` vì CLI process vẫn alive và gửi heartbeat.

#### 2.4. Message đến CLI cũ không có recovery context

Khi message đến CLI cũ qua socket:

1. `codexRemoteLauncher.runMainLoop()` nhận message
2. `hasThread === false` (vì thread cũ đã crash)
3. Tạo thread mới qua `startThread()` — nhưng `this.recoveryContext === null`
4. `developerInstructions` chỉ chứa `codexSystemPrompt`, không có conversation history

```typescript
// cli/src/codex/codexRemoteLauncher.ts:808
const threadParams = buildThreadStartParams({
    developerInstructions: this.recoveryContext ?? undefined,  // ← null, vì CLI được start KHÔNG có --recovery-context
    ...
});
```

---

## 3. Trigger Conditions (Trường hợp gây lỗi)

### 3.1. Điều kiện cần

| # | Điều kiện | Luôn đúng? |
|---|-----------|------------|
| 1 | Session flavor là `codex` hoặc `opencode` | Chỉ 2 flavor này dùng recovery context |
| 2 | Codex thread crash nhưng CLI process không exit | **Luôn đúng với systemError và 429** |
| 3 | CLI process tiếp tục gửi heartbeat sau crash | **Luôn đúng** (heartbeat là independent loop) |
| 4 | User gửi message khi session vẫn active | **Luôn đúng** nếu user gửi trong vòng 30s sau crash |

### 3.2. Điều kiện đủ để auto-resume KHÔNG trigger

Auto-resume không trigger khi **tất cả** các điều kiện sau đúng:

1. `session.active === true` trong hub (in-memory)
2. User gửi message đến session đó

→ Message route thẳng vào CLI cũ → thread mới không có recovery context.

### 3.3. Khi nào auto-resume CÓ trigger?

Auto-resume CHỈ trigger khi:

1. CLI process thực sự chết (exit/crash) → heartbeat ngừng → sau 30s session thành inactive
2. Runner bị kill → tất cả session thành inactive
3. Mất mạng giữa CLI và hub → socket disconnect → session inactive

Trong thực tế, các lỗi phổ biến nhất (`429`, `systemError`) đều **không giết CLI process**, nên auto-resume **hầu như không bao giờ trigger**.

---

## 4. Frequency (Tần suất)

### Phân loại lỗi Codex thread

| Loại lỗi | CLI process chết? | Auto-resume trigger? | Tần suất |
|----------|-------------------|---------------------|----------|
| `429 Too Many Requests` | Không | Không | **Rất cao** (rate limit) |
| `systemError` | Không | Không | **Cao** (thread corruption) |
| `prompt too long` | Không | Không | **Cao** (context overflow) |
| `network error` | Không | Không | Trung bình |
| Process OOM kill | Có | Có | Thấp |
| Process crash (SEGFAULT) | Có | Có | Rất thấp |

**Ước lượng: >90% crash cases rơi vào nhóm "CLI process không chết" → auto-resume không trigger → recovery context không hoạt động.**

### Tần suất thực tế

Dựa trên session history của user:
- 15 sessions codex cho project nstt từ May 9-15
- Ít nhất 2 sessions gặp crash (550f5c7e, 6f3d5b92)
- **0 lần recovery context hoạt động**

---

## 5. Impact Analysis

### Những gì hoạt động đúng

Toàn bộ chain implementation của recovery context đều đúng:

| Layer | Status | Evidence |
|-------|--------|----------|
| `buildRecoveryContext()` | ✅ | Test với session `550f5c7e` → output 8237 chars context đầy đủ |
| `resumeSession` build context | ✅ | Code review: gọi `getAllSessionMessages` + `buildRecoveryContext` |
| `rpcGateway.spawnSession` | ✅ | Code review: truyền `recoveryContext` qua RPC |
| `apiMachine.ts` destructure | ✅ | Code review: destructure và pass `recoveryContext` |
| `buildCliArgs` base64 encode | ✅ | Code review: `Buffer.from(recoveryContext).toString("base64")` |
| CLI `codex.ts` parse | ✅ | Code review: parse `--recovery-context`, base64 decode |
| `runCodex` → `loop` → launcher | ✅ | Code review: pass through toàn bộ chain |
| `buildThreadStartParams` injection | ✅ | Code review: `developerInstructions: this.recoveryContext` |
| `resolveInstructions` composition | ✅ | Code review: append recovery context sau `codexSystemPrompt` |
| 14/14 unit tests | ✅ | Tất cả pass |

### Những gì KHÔNG hoạt động

| # | Bug | Severity |
|---|-----|----------|
| 1 | **Session active sau crash → auto-resume không trigger** | **CRITICAL** |
| 2 | `triggerAutoResume` không log error result | HIGH |
| 3 | `getMessages` hard-cap 200 messages | MEDIUM |
| 4 | Race condition: session active giữa web route check và resumeSession check | MEDIUM |
| 5 | Sau merge, web UI gửi message đến session cũ đã bị xóa | MEDIUM |

---

## 6. Proposed Solution

### Phương án A: CLI chủ động báo crash → hub set inactive (Recommended)

**Ý tưởng:** Khi CLI detect Codex thread crash, gửi một tín hiệu đến hub để set `session.active = false`. Lần sau user gửi message, auto-resume sẽ trigger đúng.

**Implementation:**

1. **CLI side** (`codexRemoteLauncher.ts`): Khi nhận event `"Task failed"`, emit một socket event mới hoặc set flag trong metadata:

```typescript
// Trong codexRemoteLauncher, khi nhận event crash:
if (eventMessage.includes('Task failed')) {
    session.sendSessionEvent({
        type: 'thread-crashed',
        message: eventMessage
    });
}
```

2. **Hub side** (`sessionCache.ts` hoặc `sessionHandlers.ts`): Khi nhận event `thread-crashed`, set `session.active = false`:

```typescript
// Trong hub handler:
if (event.type === 'thread-crashed') {
    session.active = false;
    // Không cần update DB vì active là in-memory
}
```

**Ưu điểm:**
- Tận dụng toàn bộ flow recovery context đã implement
- Thay đổi tối thiểu (~20 LOC)
- Đúng về mặt ngữ nghĩa: session thực sự không thể xử lý message khi thread đã crash

**Nhược điểm:**
- Cần thêm 1 socket event type mới
- Có độ trễ nhỏ giữa crash và inactive

### Phương án B: Hub-side detect crash event message

**Ý tưởng:** Hub lắng nghe message stream, khi thấy event `"Task failed"` → tự động set session inactive.

**Implementation:**

```typescript
// Trong messageService.ts, sau khi insert message:
if (content.type === 'event' && content.data?.type === 'message' && 
    content.data.message?.includes('Task failed')) {
    session.active = false;
}
```

**Ưu điểm:**
- Không cần sửa CLI
- Không cần thêm socket event mới

**Nhược điểm:**
- Hub phải parse message content (fragile, dựa trên string matching)
- Có thể false positive nếu user gửi message chứa "Task failed"

### Phương án C: Luôn inject recovery context khi tạo thread mới

**Ý tưởng:** CLI tự build recovery context từ DB messages của chính session nó mỗi khi `!hasThread`.

**Implementation:**

CLI gọi hub API để lấy messages, build context, inject vào `developerInstructions`. Không phụ thuộc vào auto-resume.

**Ưu điểm:**
- Không phụ thuộc vào active/inactive state

**Nhược điểm:**
- Cần thêm API endpoint hoặc RPC method
- Tăng latency mỗi lần tạo thread mới
- Duplicate logic buildRecoveryContext ở cả hub và CLI

---

## 7. Recommendation

**Phương án A** — CLI chủ động báo crash. Đây là giải pháp:

1. **Đúng nhất về mặt ngữ nghĩa**: thread crash → session không thể xử lý message → nên inactive
2. **Ít thay đổi nhất**: chỉ thêm 1 socket event + 1 handler
3. **Tận dụng toàn bộ code đã viết**: recovery context chain không cần sửa gì

---

## 8. Verification Steps

Sau khi fix, verify bằng:

1. Tạo session codex, chat vài turns
2. Gây crash (gửi request lớn để trigger 429 hoặc prompt too long)
3. Đợi session thành inactive (kiểm tra qua API)
4. Gửi message từ web UI
5. Kiểm tra agent response có reference đến ngữ cảnh cũ không

---

## 9. Appendix: Database Evidence

### Session `550f5c7e` metadata

```json
{
  "flavor": "codex",
  "lifecycleState": "running",
  "hostPid": 3997765,
  "path": "/home/huynq/projects/nstt",
  "codexSessionId": "019e293f-3510-7e60-8d4d-1ea524e7cb2f",
  "lastUserRequest": "Cậu có biết cậu đang làm gì không?"
}
```

### Message breakdown (75 total)

| Type | Count |
|------|-------|
| `user/text` | 5 |
| `agent/codex/message` | 4 |
| `agent/codex/token_count` | 34 |
| `agent/codex/tool-call` | 12 |
| `agent/codex/tool-call-result` | 12 |
| `agent/event/message` | 3 (crash events) |
| `agent/event/ready` | 5 |

### Process still running

```
PID 3997765: /home/huynq/.../hapi codex --hapi-starting-mode remote --started-by runner
             --model kr/claude-opus-4.7 --model-reasoning-effort medium --yolo
             (started May 14, still running May 15)
```
