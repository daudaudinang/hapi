# HAPI — Tài liệu tính năng và kiến trúc hiện tại

**Ngày tổng hợp:** 2026-07-10  
**Repo:** `/home/huynq/notebooks/hapi`  
**Phiên bản package:** `0.17.6`  
**Ngôn ngữ tài liệu:** Tiếng Việt  
**Phạm vi:** tính năng và kiến trúc hiện tại dựa trên source code, README, docs, route/API và schema trong repo.

---

## 1. Tóm tắt điều hành

HAPI là nền tảng **local-first** để chạy và điều khiển các AI coding agent từ xa qua web, PWA, mobile và Telegram Mini App.

Nói ngắn:

> HAPI biến AI coding agent từ một cửa sổ terminal trên máy dev thành một workspace điều khiển từ xa: chat, duyệt quyền, xem/sửa file, git, terminal, nhiều session, nhiều agent và team chat.

HAPI không thay thế Claude Code, Codex, Cursor Agent, Gemini hay OpenCode. HAPI **bọc** các agent đó, giữ trải nghiệm native, rồi thêm lớp điều khiển từ xa, đồng bộ thời gian thực, session management, editor, terminal, file/git và team collaboration.

---

## 2. Bài toán HAPI giải quyết

| Bài toán | Hậu quả khi chưa có HAPI | HAPI giải quyết bằng gì |
|---|---|---|
| Agent chạy trong terminal local | Người dùng phải ngồi trước máy để theo dõi/duyệt | Web/PWA/Telegram Mini App điều khiển từ xa |
| Agent hỏi quyền khi user rời máy | Task đứng, mất thời gian chờ | Permission approval từ web/mobile/Telegram |
| Một người chạy nhiều task/session | Khó quan sát session nào đang chạy, session nào cần xử lý | Dashboard/Mission Control, pin session, trạng thái realtime |
| Cần sửa file/chạy lệnh nhanh từ xa | Phải SSH/mở laptop/IDE | Editor Mode + Terminal tabs + Git panel |
| Muốn dùng nhiều agent khác nhau | Mỗi agent có workflow riêng, khó gom | CLI gateway hỗ trợ Claude, Codex, Cursor, Gemini, OpenCode |
| Muốn spawn session khi không ở terminal | Không tạo được task mới từ xa | Runner daemon + machine list + remote spawn |
| Team/agent cần phối hợp | Context nằm rời trong từng session | Team Chat, mentions, report/handoff tools |

---

## 3. Giá trị chính

### 3.1. Code thật từ xa

HAPI không chỉ hiển thị log. Web app có thể:

- chat với agent,
- xem/sửa file,
- mở terminal,
- xem git status/diff,
- stage/unstage/commit/pull/push,
- tạo session mới,
- tiếp tục session cũ,
- chạy trên web/PWA/mobile.

### 3.2. Đa nhiệm tốt hơn terminal đơn lẻ

Dashboard hiện tại hỗ trợ nhiều session cùng lúc, trạng thái online/thinking/pending, session pinning, context switching nhanh, session list và visual status.

### 3.3. Tuỳ biến workflow quanh agent

HAPI có các lớp mở rộng:

- Permission mode/model/effort theo agent.
- Editor layout riêng.
- Terminal theo session hoặc machine.
- Team Chat và mention tới session/agent.
- HAPI session MCP tools để agent đổi title, report progress, trả lời mention.

### 3.4. Local-first

Mặc định hub, database, session, file/git operation nằm trên máy/hạ tầng của người dùng. External access đi qua HTTPS/tunnel/relay nếu cấu hình.

---

## 4. Tính năng hiện tại

### 4.1. Multi-agent gateway

HAPI CLI hỗ trợ các agent sau:

| Agent | Command | Ghi chú hiện tại |
|---|---|---|
| Claude Code | `hapi` hoặc `hapi claude` | default command, hỗ trợ local/remote handoff |
| OpenAI Codex | `hapi codex` | có resume, permission mode, model/reasoning effort |
| Cursor Agent | `hapi cursor` | hỗ trợ `resume`, `--continue`, `--mode plan|ask`, `--yolo`, `--model` |
| Gemini | `hapi gemini` | qua ACP/multi-agent runner |
| OpenCode | `hapi opencode` | qua ACP/hook plugin, hỗ trợ local/remote |

Nguồn chính:

- `cli/src/commands/registry.ts`
- `cli/README.md`
- `docs/guide/cursor.md`
- `shared/src/modes.ts`

### 4.2. Local/remote handoff

HAPI cho phép:

- bắt đầu làm việc local trong terminal,
- chuyển sang remote mode khi điều khiển từ web/mobile,
- quay lại local mode khi cần,
- giữ cùng session/state thay vì tạo session mới.

Luồng được mô tả trong `docs/guide/how-it-works.md`.

### 4.3. Dashboard / Mission Control

Web dashboard hiện tại là trung tâm quan sát session:

- danh sách session,
- trạng thái active/inactive/thinking,
- pending permission,
- todo progress,
- agent flavor label,
- model/mode display,
- pin/unpin session,
- dashboard desktop/mobile layout.

Nguồn:

- `web/src/routes/dashboard/index.tsx`
- `web/src/components/Dashboard/`
- `web/src/components/SessionList.tsx`

### 4.4. Chat với agent

Session chat hỗ trợ:

- message thread,
- infinite scroll,
- composer,
- gửi message tới agent,
- queued/pending messages,
- retry message,
- slash command autocomplete,
- skill autocomplete (`$skill`),
- attachment display,
- markdown/code rendering,
- tool card rendering,
- context size/status bar.

Nguồn:

- `web/src/components/SessionChat.tsx`
- `web/src/components/AssistantChat/`
- `web/src/hooks/queries/useMessages.ts`
- `web/src/hooks/mutations/useSendMessage.ts`

### 4.5. Permission approval workflow

Khi agent yêu cầu quyền, HAPI lưu request trong session `agentState.requests`, rồi cho user approve/deny qua web hoặc Telegram.

Các loại quyết định lưu trong schema:

- `approved`,
- `approved_for_session`,
- `denied`,
- `abort`.

API:

- `POST /api/sessions/:id/permissions/:requestId/approve`
- `POST /api/sessions/:id/permissions/:requestId/deny`

Nguồn:

- `hub/src/web/routes/permissions.ts`
- `shared/src/schemas.ts`
- `web/src/components/ToolCard/PermissionFooter.tsx`
- `hub/src/telegram/callbacks.ts`

### 4.6. Permission mode, collaboration mode, model/effort

Permission modes theo agent:

| Agent | Modes |
|---|---|
| Claude | `default`, `acceptEdits`, `bypassPermissions`, `plan` |
| Codex | `default`, `read-only`, `safe-yolo`, `yolo` |
| Gemini | `default`, `read-only`, `safe-yolo`, `yolo` |
| OpenCode | `default`, `yolo` |
| Cursor | `default`, `plan`, `ask`, `yolo` |

Codex collaboration modes:

- `default`,
- `plan`.

API hiện có:

- `POST /api/sessions/:id/permission-mode`
- `POST /api/sessions/:id/collaboration-mode`
- `POST /api/sessions/:id/model`
- `POST /api/sessions/:id/model-reasoning-effort`
- `POST /api/sessions/:id/effort`
- `GET /api/sessions/:id/codex-models`
- `GET /api/sessions/:id/opencode-models`
- `GET /api/machines/:id/codex-models`
- `GET /api/machines/:id/opencode-models`

Nguồn:

- `shared/src/modes.ts`
- `hub/src/web/routes/sessions.ts`
- `hub/src/web/routes/machines.ts`
- `web/src/components/NewSession/`
- `web/src/components/AssistantChat/SessionComposerSettingsPanel.tsx`

### 4.7. New Session / Remote Spawn

Web app có trang tạo session mới:

- chọn machine,
- chọn directory,
- chọn agent type,
- chọn model,
- chọn permission mode / YOLO,
- chọn reasoning effort,
- resume Codex,
- spawn session từ runner.

Runner daemon nhận RPC `spawn-happy-session`, tạo process HAPI mới với starting mode remote, rồi báo session về hub.

Nguồn:

- `web/src/components/NewSession/`
- `hub/src/web/routes/machines.ts`
- `cli/src/runner/README.md`
- `cli/src/runner/run.ts`

### 4.8. Workspace Browser

Workspace Browser hoạt động khi runner start với workspace root:

```bash
hapi runner start --workspace-root <path>
```

Khả năng:

- duyệt cây thư mục được scope,
- chọn subdirectory để spawn session,
- hub gọi machine API `list-directory`,
- runner từ chối path ngoài workspace root.

API:

- `POST /api/machines/:id/list-directory`
- `POST /api/machines/:id/paths/exists`

Nguồn:

- `web/src/components/WorkspaceBrowser.tsx`
- `cli/README.md`
- `cli/src/runner/run.ts`
- `hub/src/web/routes/machines.ts`

### 4.9. Editor Mode

Editor Mode là workspace web để code thật:

- chọn machine/project,
- file tree,
- mở nhiều tab,
- đọc file text,
- đọc file raw/image preview,
- sửa file,
- tạo file,
- xoá file,
- chat panel bên cạnh,
- session list trong editor,
- terminal tích hợp,
- git panel.

Web route:

- `/editor`

API editor:

| API | Vai trò |
|---|---|
| `POST /api/editor/directory` | list directory |
| `POST /api/editor/file` | đọc file text |
| `POST /api/editor/file/raw` | đọc file raw/image |
| `POST /api/editor/file/write` | ghi file |
| `POST /api/editor/file/create` | tạo file |
| `POST /api/editor/file/delete` | xoá file |
| `POST /api/editor/projects` | list project |

Giới hạn editor RPC hiện tại:

- text file max khoảng `5 MB`,
- raw/image max khoảng `10 MB`,
- hỗ trợ image mime: png, jpg/jpeg, gif, svg, webp,
- path được normalize và chặn thoát khỏi editor root.

Nguồn:

- `web/src/routes/editor.tsx`
- `web/src/components/editor/`
- `hub/src/web/routes/editor.ts`
- `cli/src/modules/editorRpc.ts`

### 4.10. Git trong web/editor

Git capabilities có 2 bề mặt:

1. Session file/git routes cũ:
   - `GET /api/sessions/:id/git-status`
   - `GET /api/sessions/:id/git-diff-numstat`
   - `GET /api/sessions/:id/git-diff-file`

2. Editor git API mới:
   - `POST /api/editor/git-status-v2`
   - `POST /api/editor/git-diff-file`
   - `POST /api/editor/git-stage-file`
   - `POST /api/editor/git-unstage-file`
   - `POST /api/editor/git-stage-all`
   - `POST /api/editor/git-unstage-all`
   - `POST /api/editor/git-commit`
   - `POST /api/editor/git-pull`
   - `POST /api/editor/git-push`
   - `POST /api/editor/git-list-branches`
   - `POST /api/editor/git-checkout`
   - `POST /api/editor/git-create-branch`
   - `POST /api/editor/git-fetch`
   - `POST /api/editor/git-discard-file`
   - `POST /api/editor/git-discard-all`
   - `POST /api/editor/git-stash-list`
   - `POST /api/editor/git-stash-push`
   - `POST /api/editor/git-stash-pop`

Nguồn:

- `hub/src/web/routes/editor.ts`
- `hub/src/web/routes/git.ts`
- `cli/src/modules/editorGitRpc.ts`
- `web/src/components/editor/EditorGitPanel.tsx`

### 4.11. File browser và search theo session

Session routes hỗ trợ:

- đọc file,
- search file bằng ripgrep,
- list directory,
- xem git diff/status.

API:

- `GET /api/sessions/:id/file`
- `GET /api/sessions/:id/files`
- `GET /api/sessions/:id/directory`

Nguồn:

- `hub/src/web/routes/git.ts`
- `cli/src/modules/common/handlers/files`
- `cli/src/modules/common/handlers/ripgrep`
- `web/src/routes/sessions/files.tsx`
- `web/src/routes/sessions/file.tsx`

### 4.12. Remote terminal

HAPI có terminal realtime qua Socket.IO, dùng xterm.js ở web.

Khả năng:

- tạo terminal,
- ghi input,
- resize,
- close/detach,
- list terminal,
- terminal tabs,
- terminal scope theo session hoặc machine,
- trạng thái terminal: running, detached, warning_idle, warning_age, closed, exited, lost,
- close reason: user_close, idle_timeout, hard_timeout, archive, process_exit, cli_lost, spawn_error.

Socket events chính:

- `terminal:create`
- `terminal:write`
- `terminal:resize`
- `terminal:close`

Nguồn:

- `shared/src/socket.ts`
- `hub/src/socket/handlers/terminal.ts`
- `hub/src/socket/terminalRegistry.ts`
- `cli/src/terminal/TerminalManager.ts`
- `web/src/components/Terminal/`
- `web/src/hooks/useTerminalSocket.ts`

Lưu ý: docs hiện tại ghi remote terminal hỗ trợ Linux/macOS host; Windows chưa hỗ trợ do Bun PTY API POSIX-only.

### 4.13. Team Chat và agent collaboration

Team Chat là lớp phối hợp giữa user và agent sessions.

Tính năng:

- tạo team chat theo project,
- thêm participant kiểu `user` hoặc `session`,
- role participant: `backend`, `frontend`, `tests`, `reviewer`, `docs`, `general`,
- message timeline,
- reply context,
- mention session/agent,
- session nhận mention request,
- trạng thái mention: pending/delivered/seen/processing/responded/no_action/superseded/failed,
- report type: reply/progress/done/blocked/question/handoff,
- context snapshot gồm goal, decisions, open questions, relevant files,
- file references trong team message.

API chính:

- `GET /api/team-chats`
- `POST /api/team-chats`
- `GET /api/team-chats/:id`
- `DELETE /api/team-chats/:id`
- `GET /api/team-chats/:id/messages`
- `GET /api/team-chats/:id/messages/:messageId/context`
- `POST /api/team-chats/:id/messages`
- `POST /api/team-chats/:id/reports`
- `GET /api/team-chats/:id/participants`
- `POST /api/team-chats/:id/participants`
- `PATCH /api/team-chats/:id/participants/:participantId`
- `DELETE /api/team-chats/:id/participants/:participantId`
- `GET /api/sessions/:id/team-mentions`
- `GET /api/sessions/:id/team-memberships`
- `POST /api/sessions/:id/team-mentions/:requestId/seen`
- `PATCH /api/sessions/:id/team-mentions/:requestId`

Web components:

- `web/src/components/TeamChat/`
- `web/src/routes/team-chats`
- `web/src/routes/team-chats/$teamChatId`

Nguồn:

- `hub/src/web/routes/teamChats.ts`
- `hub/src/sync/teamChatService.ts`
- `hub/src/sync/teamMentionDeliveryService.ts`
- `hub/src/store/teamChatStore.ts`
- `shared/src/schemas.ts`

### 4.14. HAPI session MCP tools

HAPI cung cấp session MCP tools để agent tương tác với chính phiên HAPI:

| Tool | Vai trò |
|---|---|
| `change_title` | đổi title session hiện tại |
| `report_to_team` | gửi progress/done/blocked/question/handoff vào Team Chat |
| `mark_team_mention_no_action` | đánh dấu mention là đã xem nhưng không cần phản hồi |

Nguồn:

- `cli/src/mcp/hapiSessionTools.ts`

### 4.15. Voice assistant

Voice assistant dùng ElevenLabs.

- Hub cấp conversation token qua `POST /api/voice/token`.
- Web dùng `@elevenlabs/react`.
- Cần `ELEVENLABS_API_KEY`; `ELEVENLABS_AGENT_ID` có thể set hoặc auto-create theo docs.

Nguồn:

- `docs/guide/voice-assistant.md`
- `hub/src/web/routes/voice.ts`
- `web/src/api/voice.ts`
- `web/src/components/VoiceErrorBanner.tsx`

### 4.16. Notifications

HAPI có nhiều kênh notification:

- Web Push/PWA Push,
- Telegram bot,
- Telegram Mini App deep link,
- permission request approve/deny buttons,
- session ready notifications.

API Push:

- `GET /api/push/vapid-public-key`
- `POST /api/push/subscribe`
- `DELETE /api/push/subscribe`

Telegram commands:

- `/start`,
- `/app`.

Nguồn:

- `hub/src/notifications/`
- `hub/src/telegram/`
- `hub/src/web/routes/push.ts`
- `web/src/hooks/usePushNotifications.ts`

### 4.17. Upload/attachments

Session API hỗ trợ upload file base64 và delete uploaded file:

- `POST /api/sessions/:id/upload`
- `POST /api/sessions/:id/upload/delete`

Docs hub ghi giới hạn upload max `50 MB`.

Nguồn:

- `hub/README.md`
- `hub/src/web/routes/sessions.ts`
- `cli/src/modules/common/handlers/uploads`
- `web/src/components/AssistantChat/AttachmentItem.tsx`

### 4.18. Auth, namespace và multi-account nhẹ

HAPI dùng `CLI_API_TOKEN` làm shared secret.

Cơ chế:

- Web login bằng `CLI_API_TOKEN` hoặc `CLI_API_TOKEN:<namespace>`.
- CLI/hub dùng base token.
- Namespace được append để tách dữ liệu người dùng/team nhẹ.
- Telegram binding dùng initData + token namespace.
- JWT token dùng cho web sau auth.

API:

- `POST /api/auth`
- `POST /api/bind`

Nguồn:

- `hub/src/web/routes/auth.ts`
- `hub/src/web/routes/bind.ts`
- `docs/guide/namespace.md`
- `hub/src/store/namespace.test.ts`

### 4.19. Diagnostics và process cleanup

CLI có:

- `hapi doctor`,
- `hapi doctor clean`,
- `hapi runner status`,
- `hapi runner logs`,
- `hapi runner stop-session`,
- runaway process detection/cleanup.

Nguồn:

- `cli/src/commands/doctor.ts`
- `cli/src/ui/doctor.ts`
- `cli/src/runner/doctor.ts`
- `cli/src/runner/README.md`

### 4.20. MCP stdio bridge

CLI có command:

```bash
hapi mcp
```

Vai trò: MCP stdio bridge cho external tools, có thể bridge tới HTTP MCP target mặc định qua `HAPI_HTTP_MCP_URL`.

Nguồn:

- `cli/README.md`
- `cli/src/commands/mcp.ts`
- `cli/src/codex/happyMcpStdioBridge.ts`

---

## 5. Kiến trúc tổng thể

### 5.1. Các khối chính

```text
┌──────────────────────────────────────────────────────────────────────┐
│                          Người dùng                                  │
│        Web Browser · PWA · Mobile · Telegram Mini App                │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ REST + SSE + Socket.IO terminal
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│                              HAPI Hub                                │
│ REST API · SSE · Socket.IO · RPC Gateway · SQLite · Auth · Notify     │
└───────────────┬───────────────────────┬──────────────────────────────┘
                │ Socket.IO / RPC        │ serves static/embedded web
                ▼                       ▼
┌──────────────────────────────┐   ┌───────────────────────────────────┐
│          HAPI CLI             │   │              Web App              │
│ Agent wrapper · RPC handlers  │   │ React PWA · Dashboard · Editor    │
│ Terminal · File/Git/Search    │   │ Team Chat · Terminal · Settings   │
└───────────────┬──────────────┘   └───────────────────────────────────┘
                │
                ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         AI Coding Agents                             │
│ Claude Code · Codex · Cursor Agent · Gemini · OpenCode               │
└──────────────────────────────────────────────────────────────────────┘

Optional:
┌──────────────────────────────┐
│        Runner Daemon          │
│ machine heartbeat · remote spawn · process tracking · workspace root │
└──────────────────────────────┘
```

### 5.2. Component catalog

| Component | Vai trò | Source chính |
|---|---|---|
| CLI Agent Gateway | Bọc agent, tạo session, đồng bộ message/state, expose RPC file/git/terminal/search | `cli/src/`, `cli/src/commands/registry.ts`, `cli/src/modules/common/registerCommonHandlers.ts` |
| Hub Realtime Gateway | REST API, Socket.IO, SSE, RPC routing, SQLite persistence, auth, notifications | `hub/src/`, `hub/src/web/routes/`, `hub/src/sync/`, `hub/src/socket/` |
| Web Remote Console | Dashboard, chat, editor, terminal, team chat, settings, PWA | `web/src/`, `web/src/router.tsx`, `web/src/components/` |
| Runner Daemon | Background service, machine state, remote session spawn, process tracking | `cli/src/runner/` |
| Shared Protocol | Zod schema, types, modes, socket payload contract | `shared/src/` |
| Notification/Voice Bridge | Telegram, Web Push, ElevenLabs token | `hub/src/telegram/`, `hub/src/notifications/`, `hub/src/web/routes/voice.ts` |
| Team Collaboration Layer | Team Chat, participants, mentions, reports, mention lifecycle | `hub/src/sync/team*`, `hub/src/web/routes/teamChats.ts`, `web/src/components/TeamChat/` |

---

## 6. Luồng xử lý chính

### 6.1. Start session từ terminal

```text
User chạy `hapi` / `hapi codex` / ...
  ↓
CLI launch agent tương ứng
  ↓
CLI tạo/load session qua hub REST `/cli/sessions`
  ↓
CLI kết nối Socket.IO namespace `/cli`
  ↓
CLI gửi metadata/state/message
  ↓
Hub persist SQLite + update cache
  ↓
Web nhận SSE `/api/events`
  ↓
Session xuất hiện trên Dashboard
```

### 6.2. Remote spawn từ web/mobile

```text
User mở New Session trên web/mobile
  ↓
Web gọi `POST /api/machines/:id/spawn`
  ↓
Hub route sang runner bằng RPC `spawn-happy-session`
  ↓
Runner spawn process HAPI mới ở directory/agent/model/mode đã chọn
  ↓
Process mới tạo session với hub
  ↓
Runner nhận `/session-started`
  ↓
Hub/Web nhận session mới realtime
```

### 6.3. Message flow

```text
Web/PWA composer
  ↓ POST /api/sessions/:id/messages
Hub message service
  ↓ Socket.IO RPC/message to CLI
CLI đưa input vào agent
  ↓
Agent stream output/event
  ↓
CLI gửi message/update về hub
  ↓
Hub lưu SQLite + publish SSE
  ↓
Web update chat thread realtime
```

### 6.4. Permission approval flow

```text
Agent cần quyền tool
  ↓
CLI gửi agentState.requests lên hub
  ↓
Hub lưu request + notify SSE/Telegram/Push
  ↓
User approve/deny trên web/mobile/Telegram
  ↓
Hub gọi CLI qua Socket.IO/RPC
  ↓
CLI trả quyết định cho agent
  ↓
Agent tiếp tục hoặc dừng
```

### 6.5. Editor file write flow

```text
User sửa file trong Editor Mode
  ↓ POST /api/editor/file/write
Hub xác định machine + gọi RPC tới CLI/runner
  ↓
CLI editor RPC normalize path, kiểm tra path nằm trong editor root
  ↓
CLI ghi file bằng filesystem local
  ↓
Kết quả trả về Hub → Web
```

### 6.6. Remote terminal flow

```text
User mở terminal tab
  ↓ Socket.IO terminal:create
Hub tạo terminal scope/session room
  ↓ RPC/Socket.IO tới CLI
CLI TerminalManager spawn/attach PTY
  ↓
Terminal bytes stream CLI ↔ Hub ↔ Web xterm.js
```

### 6.7. Team mention/report flow

```text
User hoặc session post message trong Team Chat
  ↓
Message có mentions tới session participant
  ↓
Hub tạo TeamMentionRequest + context snapshot
  ↓
Target session thấy mention trong chat bar/tooling
  ↓
Agent dùng `report_to_team` hoặc user trả lời
  ↓
Mention status chuyển responded/no_action/...
```

---

## 7. Web routes hiện tại

| Route | Vai trò |
|---|---|
| `/` | redirect/root app |
| `/sessions` | Dashboard/session list |
| `/sessions/$sessionId` | Session chat |
| `/sessions/$sessionId/files` | File browser theo session |
| `/sessions/$sessionId/file` | File viewer/diff |
| `/sessions/$sessionId/terminal` | Terminal theo session |
| `/sessions/new` | Tạo session mới |
| `/browse` | Workspace browser |
| `/editor` | Editor Mode |
| `/settings` | Settings |
| `/team-chats` | Team Chat list |
| `/team-chats/$teamChatId` | Team Chat detail |

Nguồn: `web/src/router.tsx`.

---

## 8. Hub API map

### 8.1. Auth

| Method | Path | Vai trò |
|---|---|---|
| POST | `/api/auth` | login web bằng Telegram initData hoặc CLI token |
| POST | `/api/bind` | bind Telegram account với namespace |

### 8.2. Sessions

| Method | Path | Vai trò |
|---|---|---|
| GET | `/api/sessions` | list sessions |
| POST | `/api/sessions/archive-all` | archive all sessions |
| DELETE | `/api/sessions/archived` | delete archived sessions |
| GET | `/api/sessions/:id` | get session detail |
| POST | `/api/sessions/:id/resume` | resume inactive session |
| POST | `/api/sessions/:id/upload` | upload attachment |
| POST | `/api/sessions/:id/upload/delete` | delete upload |
| POST | `/api/sessions/:id/abort` | abort session |
| POST | `/api/sessions/:id/archive` | archive session |
| POST | `/api/sessions/:id/switch` | switch to remote mode |
| POST | `/api/sessions/:id/permission-mode` | set permission mode |
| POST | `/api/sessions/:id/collaboration-mode` | set collaboration mode |
| POST | `/api/sessions/:id/model` | set model |
| POST | `/api/sessions/:id/model-reasoning-effort` | set model reasoning effort |
| POST | `/api/sessions/:id/effort` | set effort |
| PATCH | `/api/sessions/:id` | rename/update session |
| DELETE | `/api/sessions/:id` | delete inactive session |
| GET | `/api/sessions/:id/slash-commands` | list slash commands |
| GET | `/api/sessions/:id/skills` | list skills |
| GET | `/api/sessions/:id/codex-models` | list Codex models |
| GET | `/api/sessions/:id/opencode-models` | list OpenCode models |

### 8.3. Messages

| Method | Path | Vai trò |
|---|---|---|
| GET | `/api/sessions/:id/messages` | paginated messages |
| POST | `/api/sessions/:id/messages` | send message |

### 8.4. Machines/runner

| Method | Path | Vai trò |
|---|---|---|
| GET | `/api/machines` | list online machines |
| POST | `/api/machines/:id/spawn` | remote spawn session |
| POST | `/api/machines/:id/list-directory` | list scoped directory |
| POST | `/api/machines/:id/paths/exists` | check path exists |
| GET | `/api/machines/:id/codex-models` | machine Codex models |
| GET | `/api/machines/:id/opencode-models` | machine OpenCode models |

### 8.5. Files/git theo session

| Method | Path | Vai trò |
|---|---|---|
| GET | `/api/sessions/:id/git-status` | git status |
| GET | `/api/sessions/:id/git-diff-numstat` | diff summary |
| GET | `/api/sessions/:id/git-diff-file` | diff file |
| GET | `/api/sessions/:id/file` | read file |
| GET | `/api/sessions/:id/files` | search files |
| GET | `/api/sessions/:id/directory` | list directory |

### 8.6. Editor API

Xem mục 4.9 và 4.10.

### 8.7. Team Chat API

Xem mục 4.13.

### 8.8. Events/visibility

| Method | Path | Vai trò |
|---|---|---|
| GET | `/api/events` | SSE stream realtime updates |
| POST | `/api/visibility` | report client visibility |

### 8.9. Voice/Push

| Method | Path | Vai trò |
|---|---|---|
| POST | `/api/voice/token` | ElevenLabs conversation token |
| GET | `/api/push/vapid-public-key` | VAPID public key |
| POST | `/api/push/subscribe` | subscribe push |
| DELETE | `/api/push/subscribe` | unsubscribe push |

---

## 9. Realtime protocol

### 9.1. CLI ↔ Hub

- Socket.IO namespace: `/cli`.
- CLI sends:
  - `message`,
  - `update-metadata`,
  - `update-state`,
  - `session-alive`,
  - `session-end`,
  - `machine-alive`,
  - `machine-update-metadata`,
  - `machine-update-state`,
  - `rpc-register`,
  - `rpc-unregister`.
- Hub sends:
  - `update`,
  - `rpc-request`.

### 9.2. Hub ↔ Web

- REST for mutations/actions.
- SSE `/api/events` for session/message/machine/team updates.
- Socket.IO terminal namespace/events for terminal stream.

### 9.3. RPC gateway

RPC is used for operations that must execute on the machine where files/agent live:

- file read/search,
- git status/diff/actions,
- editor file/write/delete,
- terminal create/write/resize/close,
- spawn session via runner,
- stop session/runner,
- model discovery.

Nguồn:

- `hub/src/sync/rpcGateway.ts`
- `hub/src/socket/rpcRegistry.ts`
- `cli/src/api/rpc/RpcHandlerManager.ts`
- `cli/src/modules/common/registerCommonHandlers.ts`

---

## 10. Data model chính

### 10.1. Session

Session lưu:

- `id`, `namespace`, `machineId`,
- `metadata`, `metadataVersion`,
- `agentState`, `agentStateVersion`,
- `model`, `modelReasoningEffort`, `effort`,
- `todos`,
- `teamState`,
- `active`, `activeAt`, `seq`,
- `createdAt`, `updatedAt`.

`metadata` gồm path, host, version, name, OS, agent session id theo flavor, tools, slash commands, worktree, cached model lists, lifecycle state.

Nguồn:

- `hub/src/store/types.ts`
- `shared/src/schemas.ts`

### 10.2. Message

Message lưu:

- `id`,
- `sessionId`,
- `content`,
- `createdAt`,
- `seq`,
- `localId`,
- `invokedAt`.

Nguồn:

- `hub/src/store/types.ts`
- `hub/src/store/messageStore.ts`

### 10.3. Machine

Machine lưu:

- `id`, `namespace`,
- `metadata`, `metadataVersion`,
- `runnerState`, `runnerStateVersion`,
- `active`, `activeAt`, `seq`,
- `createdAt`, `updatedAt`.

Machine metadata gồm host/platform/version/home paths. Runner state gồm status, pid, httpPort, startedAt/shutdown info.

Nguồn:

- `hub/src/store/types.ts`
- `cli/src/runner/README.md`

### 10.4. Terminal

Terminal state gồm:

- scopeType: `session` hoặc `machine`,
- `terminalId`, `label`, `cwd`,
- `cols`, `rows`,
- `status`, `closeReason`,
- `createdAt`, `lastActivityAt`,
- `idleWarningAt`, `hardExpiresAt`.

Nguồn:

- `shared/src/socket.ts`

### 10.5. Team Chat

Team Chat data gồm:

- team chat,
- participant,
- team message,
- mention request,
- mention context snapshot,
- shared context snapshot.

Nguồn:

- `shared/src/schemas.ts`
- `hub/src/store/types.ts`

---

## 11. Storage

### 11.1. Local HAPI home

Mặc định:

```text
~/.hapi/
```

CLI lưu:

- `settings.json`,
- `runner.state.json`,
- `runner.state.json.lock`,
- `logs/`,
- `access.key` legacy/private key path hiện còn trong config.

Hub lưu:

- `hapi.db` SQLite mặc định tại `~/.hapi/hapi.db`, trừ khi set `DB_PATH`.

Nguồn:

- `cli/src/configuration.ts`
- `hub/src/configuration.ts`
- `cli/README.md`
- `hub/README.md`

### 11.2. SQLite tables/types

Các nhóm data chính:

- sessions,
- messages,
- machines,
- users,
- push subscriptions,
- team chats,
- team participants,
- team messages,
- team mention requests.

Nguồn: `hub/src/store/types.ts`.

---

## 12. Bảo mật và phân quyền

### 12.1. Authentication

- `CLI_API_TOKEN` là shared secret.
- Hub auto-generate token nếu chưa có.
- Web login bằng token hoặc Telegram initData.
- Telegram account cần bind với token namespace.
- Web dùng JWT sau khi auth.

### 12.2. Namespace isolation

Client có thể dùng:

```text
CLI_API_TOKEN:<namespace>
```

Namespace tách sessions, machines, team chat, push subscriptions, Telegram binding theo scope nhẹ.

### 12.3. Path security

Editor/file operations kiểm tra path nằm trong root:

- normalize root bằng `realpath`,
- resolve target,
- chặn path `..` hoặc absolute path thoát root,
- new file cũng kiểm tra nearest existing path và parent directory.

Nguồn:

- `cli/src/modules/editorRpc.ts`
- `cli/src/modules/editorGitRpc.ts`
- `cli/src/modules/common/pathSecurity.ts`

### 12.4. Network security

- Local-first, hub mặc định listen `127.0.0.1:3006`.
- LAN/mobile cần set `HAPI_LISTEN_HOST=0.0.0.0` hoặc config tương ứng.
- External access cần HTTPS qua reverse proxy/tunnel/relay.
- Relay trong README dùng WireGuard + TLS cho E2E encrypted relay.

### 12.5. Rủi ro cần lưu ý

| Rủi ro | Ghi chú |
|---|---|
| Token lộ | Người có token có thể truy cập hub/namespace tương ứng |
| Public hub không HTTPS | Dễ lộ token/session data |
| YOLO/bypass permission | Agent có thể thao tác rộng hơn, cần dùng có kiểm soát |
| Remote file/write/git | Cần đảm bảo workspace root scope đúng |
| Terminal remote | Là shell thật trên máy host; quyền theo user chạy HAPI |
| SQLite local plaintext | Cần bảo vệ máy/hub host |
| Voice/Telegram/Push | Phụ thuộc dịch vụ ngoài, cần quản lý token/key |

---

## 13. Deployment và build

### 13.1. Workspace

Repo dùng Bun workspaces:

```text
cli/     CLI binary, agent wrappers, runner daemon
hub/     HTTP API, Socket.IO, SSE, Telegram, SQLite
web/     React PWA/web app
shared/  Protocol types/schemas/modes
website/ Marketing site
docs/    VitePress docs
```

### 13.2. Commands chính

```bash
bun install
bun run dev              # hub + web
bun run build            # cli + hub + web
bun run build:single-exe # build single binary with embedded web assets
bun typecheck
bun run test
```

### 13.3. Single executable

`build:single-exe` chạy:

1. download tunwg,
2. build web,
3. generate embedded web assets trong hub,
4. build CLI all-in-one binary.

Nguồn:

- root `package.json`
- `cli/package.json`
- `hub/package.json`

### 13.4. Standalone web hosting

Web có thể build riêng và host static, sau đó trỏ về hub origin qua Hub picker/CORS.

Nguồn:

- `web/README.md`
- `hub/README.md`

---

## 14. Tech stack

| Package | Stack chính |
|---|---|
| CLI | Bun, TypeScript, Socket.IO client, Fastify, Ink, MCP SDK, Zod, axios |
| Hub | Bun, Hono, Socket.IO, SQLite, jose/JWT, grammy Telegram bot, web-push, Zod |
| Web | React 19, Vite, TanStack Router/Query, Tailwind, assistant-ui, CodeMirror, xterm.js, ElevenLabs React, Workbox, Shiki |
| Shared | TypeScript, Zod schemas |
| Docs | VitePress |

Nguồn:

- `cli/package.json`
- `hub/package.json`
- `web/package.json`
- `shared/package.json`

---

## 15. Source map theo module

### 15.1. CLI

| Path | Vai trò |
|---|---|
| `cli/src/commands/` | command registry và handlers |
| `cli/src/claude/` | Claude Code integration |
| `cli/src/codex/` | Codex integration |
| `cli/src/cursor/` | Cursor Agent integration |
| `cli/src/gemini/` | Gemini integration |
| `cli/src/opencode/` | OpenCode integration |
| `cli/src/agent/` | agent abstraction / ACP support |
| `cli/src/api/` | hub REST + Socket.IO client |
| `cli/src/modules/common/` | common RPC handlers: bash/file/dir/git/search/upload/models/skills |
| `cli/src/modules/editorRpc.ts` | editor file/directory RPC |
| `cli/src/modules/editorGitRpc.ts` | editor git RPC |
| `cli/src/runner/` | runner daemon |
| `cli/src/terminal/` | terminal manager |
| `cli/src/mcp/` | HAPI session MCP tools |

### 15.2. Hub

| Path | Vai trò |
|---|---|
| `hub/src/web/routes/` | REST API routes |
| `hub/src/socket/` | Socket.IO setup, CLI/terminal handlers, RPC registry |
| `hub/src/sync/` | session/message/machine/team logic |
| `hub/src/store/` | SQLite persistence |
| `hub/src/sse/` | SSE event manager |
| `hub/src/telegram/` | Telegram bot, callbacks, renderer |
| `hub/src/notifications/` | notification hub, push parsing/session notification |
| `hub/src/visibility/` | client visibility tracking |
| `hub/src/config/` | settings/token generation |

### 15.3. Web

| Path | Vai trò |
|---|---|
| `web/src/router.tsx` | route map |
| `web/src/components/Dashboard/` | mission control/dashboard |
| `web/src/components/AssistantChat/` | chat composer/thread/status/team mention UI |
| `web/src/components/editor/` | editor mode |
| `web/src/components/Terminal/` | terminal tabs/view/quick keys |
| `web/src/components/TeamChat/` | team chat UI |
| `web/src/components/NewSession/` | new session flow |
| `web/src/components/ToolCard/` | tool call rendering and permission/request UI |
| `web/src/hooks/queries/` | TanStack Query read hooks |
| `web/src/hooks/mutations/` | mutation hooks |
| `web/src/hooks/useSSE.ts` | realtime SSE |
| `web/src/hooks/useTerminalSocket.ts` | terminal socket client |
| `web/src/api/client.ts` | API client |

### 15.4. Shared

| Path | Vai trò |
|---|---|
| `shared/src/schemas.ts` | Zod schemas + core data types |
| `shared/src/modes.ts` | permission/model/collaboration modes |
| `shared/src/socket.ts` | terminal/socket payload schemas |
| `shared/src/messages.ts` | message parsing utilities |
| `shared/src/types.ts` | re-export core types |

---

## 16. Khả năng ứng dụng thực tế

| Use case | Mô tả |
|---|---|
| Code từ xa | Sửa file/chạy terminal/chat agent từ web/mobile/PWA |
| Can thiệp khi AFK | Approve permission, trả lời agent, xem tiến độ khi rời máy |
| Multi-task AI coding | Một người điều phối nhiều session/agent song song |
| Remote spawn | Tạo session mới trên machine đã bật runner từ điện thoại/web |
| Review nhanh | Xem file/git diff/status trước khi quyết định |
| On-call/hotfix | Terminal/editor mobile giúp xử lý nhanh khi không có laptop |
| Team collaboration | Team Chat + mentions + report/handoff giúp nhiều agent/session phối hợp |
| Voice control | Điều khiển agent bằng giọng nói qua ElevenLabs |
| Self-host/local-first | Chạy trên máy cá nhân/hạ tầng nội bộ, dữ liệu không cần lên cloud của bên thứ ba |

---

## 17. Giới hạn hiện tại / điểm cần cẩn trọng

| Nhóm | Giới hạn / rủi ro |
|---|---|
| Agent dependency | Cần cài và login CLI agent tương ứng trên host |
| Terminal | Windows host chưa hỗ trợ remote terminal theo docs hiện tại |
| Public access | Cần HTTPS/tunnel/CORS/token cấu hình đúng |
| Runner | Process lifecycle có rủi ro ghost/orphan nếu crash/restart; runner README cũng ghi cần cải thiện state file/process tracking |
| Editor | File size có limit; binary lớn không phải mục tiêu editor text |
| Permission bypass | `yolo`/`bypassPermissions` nguy hiểm nếu dùng sai context |
| Voice | Phụ thuộc ElevenLabs API key/quota/browser mic permission |
| Telegram | Cần bot token và public HTTPS URL |
| Data | SQLite local plaintext; cần bảo vệ host |
| Namespace | Là isolation nhẹ theo token namespace, không phải multi-tenant enterprise ACL đầy đủ |

---

## 18. Tài liệu/nguồn đã đọc

### Root/package/docs

- `AGENTS.md` context trong prompt
- `README.md`
- `package.json`
- `cli/README.md`
- `hub/README.md`
- `web/README.md`
- `docs/guide/how-it-works.md`
- `docs/guide/installation.md`
- `docs/guide/faq.md`
- `docs/guide/cursor.md`
- `docs/guide/pwa.md`
- `docs/guide/voice-assistant.md`
- `docs/guide/namespace.md`
- `docs/aisaa-intake/hapi.md`

### Source chính

- `web/src/router.tsx`
- `web/src/routes/dashboard/index.tsx`
- `web/src/routes/editor.tsx`
- `hub/src/web/routes/*.ts`
- `hub/src/sync/*.ts`
- `hub/src/store/types.ts`
- `shared/src/schemas.ts`
- `shared/src/modes.ts`
- `shared/src/socket.ts`
- `cli/src/commands/registry.ts`
- `cli/src/modules/common/registerCommonHandlers.ts`
- `cli/src/modules/editorRpc.ts`
- `cli/src/modules/editorGitRpc.ts`
- `cli/src/runner/README.md`
- `cli/src/mcp/hapiSessionTools.ts`
- `cli/package.json`, `hub/package.json`, `web/package.json`, `shared/package.json`

---

## 19. Kiểm chứng đã thực hiện

Đã kiểm chứng bằng đọc source/docs local:

- route web từ `web/src/router.tsx`,
- endpoint hub bằng trích trực tiếp `app.get/post/patch/delete(...)` từ route files,
- permission modes từ `shared/src/modes.ts`,
- data model từ `shared/src/schemas.ts` và `hub/src/store/types.ts`,
- editor/git capabilities từ `hub/src/web/routes/editor.ts`, `cli/src/modules/editorRpc.ts`, `cli/src/modules/editorGitRpc.ts`,
- runner lifecycle từ `cli/src/runner/README.md`,
- tech stack từ package files.

Chưa chạy runtime E2E trong lần tổng hợp này. Các phần “hiện tại” dựa trên source code và docs trong repo tại thời điểm đọc.
