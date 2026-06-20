# AISAA Intake — HAPI

## 1. Tóm tắt dự án

- Project name: HAPI
- Short description: Nền tảng local-first để chạy Claude Code, Codex, Cursor Agent, Gemini, OpenCode trên máy người dùng và điều khiển từ xa qua Web/PWA/Telegram.
- Business problem: Người dùng muốn agent coding tiếp tục chạy trên máy của mình nhưng vẫn có thể theo dõi, gửi lệnh, duyệt quyền, xem file/diff và mở terminal từ điện thoại hoặc trình duyệt khi rời máy.
- Target users:
  - Lập trình viên dùng AI coding agent.
  - Người dùng muốn self-host thay vì phụ thuộc server trung tâm.
  - Nhóm nhỏ cần tách namespace trên cùng một hub.
- Current status: production-like / internal_tool. Repo có version npm, build single executable, tài liệu cài đặt, test và release script; chưa thấy tài liệu SLA production.
- Source repo/path: `/home/huynq/notebooks/hapi`
- Owner/team: Chưa xác định từ codebase. `package.json` có author `daudaudinang` cho CLI và `weishu` cho hub, nhưng owner vận hành hiện tại chưa thấy trong tài liệu.
- Confidence: high cho kiến trúc và luồng chính; medium cho mức maturity vì suy luận từ package/docs/test, không có tài liệu vận hành production chính thức.

## 2. Luồng nghiệp vụ

Người dùng chạy hub → chạy CLI bọc agent coding → CLI đăng ký session với hub → Web/PWA/Telegram nhận cập nhật → người dùng gửi lệnh/duyệt quyền từ xa → hub chuyển lệnh về CLI → CLI chuyển cho agent → agent trả kết quả về hub → web nhận realtime update.

Giải thích ngắn:

1. Người dùng khởi động `hapi hub` hoặc `hapi hub --relay` để có điểm điều phối trung tâm.
2. Người dùng chạy `hapi`, `hapi codex`, `hapi cursor`, `hapi gemini`, hoặc `hapi opencode` trên máy có project.
3. CLI tạo session, lấy machine/session metadata, kết nối hub qua Socket.IO.
4. Hub lưu session/message/machine vào SQLite, phát cập nhật qua SSE cho Web/PWA.
5. Người dùng mở web app hoặc Telegram Mini App để xem session, gửi message, duyệt permission, xem file/diff, mở terminal.
6. Với runner, người dùng có thể spawn session mới từ web trên máy đang online.
7. Khi agent cần quyền, CLI gửi request lên hub; user approve/deny trên web/Telegram; hub RPC về CLI; agent tiếp tục hoặc dừng.

Failure/edge cases quan trọng:

- CLI hoặc runner mất kết nối hub → web không thể điều khiển session đó.
- Token sai hoặc namespace sai → bị từ chối truy cập session/machine.
- Public hub không có HTTPS/CORS đúng → PWA/Telegram Mini App/SSE có thể lỗi.
- Remote terminal/file browser nếu scope sai có thể chạm dữ liệu ngoài project; code có kiểm tra root nhưng vẫn là khu vực rủi ro cao.
- SQLite lưu plaintext trên máy hub; nếu máy bị lộ quyền đọc file thì session/message có thể bị đọc.

## 3. Input / Output

| Direction | Name | Type | Format | Source/Target | Required | Evidence |
|---|---|---|---|---|---:|---|
| Input | Agent command | text/json | message text + optional attachments | Web/PWA/Telegram → Hub REST → CLI | true | `hub/src/web/routes/messages.ts`, `cli/README.md` |
| Input | Agent event/message | json | session/message/update payload | AI agent → CLI → Hub Socket.IO | true | `shared/src/socket.ts`, `docs/guide/how-it-works.md` |
| Input | Permission decision | json | approve/deny + mode/allowTools/answers | Web/Telegram → Hub → CLI RPC | true | `hub/src/sync/rpcGateway.ts`, `hub/src/web/routes/permissions.ts` |
| Input | Remote spawn request | json | directory, agent, model, yolo, sessionType | Web → Hub REST → Runner RPC | false | `hub/src/web/routes/machines.ts`, `cli/src/runner/README.md` |
| Input | File upload | json/base64 | filename, content, mimeType, max 50MB | Web → Hub → CLI/upload handler | false | `hub/src/web/routes/sessions.ts` |
| Input | Voice request | audio/token/json | WebRTC via ElevenLabs ConvAI | Browser → ElevenLabs → Hub/agent | false | `docs/guide/voice-assistant.md`, `hub/src/web/routes/voice.ts` |
| Output | Session list/detail | json | session summary/detail | Hub REST → Web | true | `hub/src/web/routes/sessions.ts`, `web/README.md` |
| Output | Live update stream | event/json | SSE `/api/events` | Hub → Web/PWA | true | `hub/README.md`, `web/src/hooks/useSSE.ts` |
| Output | Agent response | json/text | message objects, seq pagination | CLI → Hub SQLite/SSE → Web | true | `hub/src/store/messages.ts`, `hub/src/web/routes/messages.ts` |
| Output | Notification | notification/message | Telegram bot message or Web Push | Hub → Telegram/Web Push | false | `hub/src/telegram/bot.ts`, `hub/src/web/routes/push.ts` |
| Output | File/diff/terminal data | text/json/stream | file content, git status, terminal bytes | CLI RPC/Socket.IO → Hub → Web | false | `cli/src/modules/editorRpc.ts`, `hub/src/socket/handlers/terminal.ts` |

## 4. Component có thể đưa vào catalog

### 4.1. hapi_cli_agent_gateway

- Name: HAPI CLI Agent Gateway
- Description: CLI wrapper chạy các agent coding chính thức, đăng ký session/machine với hub, đồng bộ message/state, bridge permission và cung cấp RPC handler cho file/git/search/terminal/upload.
- Source location:
  - Repo path: `cli/`
  - Important files: `cli/src/commands/registry.ts`, `cli/src/agent/sessionFactory.ts`, `cli/src/claude/runClaude.ts`, `cli/src/codex/runCodex.ts`, `cli/src/cursor/runCursor.ts`, `cli/src/gemini/runGemini.ts`, `cli/src/opencode/runOpencode.ts`, `cli/src/modules/common/registerCommonHandlers.ts`, `cli/src/api/api.ts`
- Inputs:
  - command-line arguments và environment variables.
  - message/permission/RPC request từ hub.
  - output/event từ Claude/Codex/Cursor/Gemini/OpenCode.
- Outputs:
  - session metadata, agent state, messages, RPC registrations, terminal/file/git responses.
- Capabilities:
  - multi_agent_gateway
  - agent_session_orchestration
  - realtime_session_sync
  - permission_approval_workflow
  - workspace_file_browsing
  - remote_terminal_access
- Deployment: CLI / single executable / npm package.
- API / Interface: CLI commands (`hapi`, `hapi codex`, `hapi cursor`, `hapi gemini`, `hapi opencode`, `hapi mcp`, `hapi hub`, `hapi runner`). Socket.IO client and REST client to hub.
- Dependencies: Bun, Socket.IO client, MCP SDK, agent CLIs, ripgrep/difftastic/git helpers, Zod.
- Owner: Chưa xác định.
- Tags: `cli`, `agent`, `coding-agent`, `socketio`, `rpc`, `local-first`
- Maturity: reusable / production-like.
- Limitations:
  - Phụ thuộc agent CLI đã được cài và đăng nhập trên máy người dùng.
  - Remote file/terminal phải kiểm soát scope cẩn thận.
  - Một số agent có hành vi local/remote khác nhau.
- Evidence: `cli/README.md`, `cli/src/commands/registry.ts`, `cli/src/agent/sessionFactory.ts`, `cli/src/modules/common/registerCommonHandlers.ts`.

### 4.2. hapi_hub_realtime_gateway

- Name: HAPI Hub Realtime Gateway
- Description: Service trung tâm cung cấp REST API, Socket.IO, SSE, RPC gateway, SQLite persistence, auth/namespace, notifications và phục vụ web app.
- Source location:
  - Repo path: `hub/`
  - Important files: `hub/src/web/routes/`, `hub/src/socket/server.ts`, `hub/src/sync/syncEngine.ts`, `hub/src/sync/rpcGateway.ts`, `hub/src/store/index.ts`, `hub/src/configuration.ts`
- Inputs:
  - CLI Socket.IO events.
  - Web REST requests.
  - Terminal Socket.IO events.
  - Telegram initData hoặc access token.
- Outputs:
  - SSE updates, Socket.IO RPC requests, REST responses, persisted SQLite records, notifications.
- Capabilities:
  - realtime_session_sync
  - remote_agent_control
  - permission_approval_workflow
  - namespace_isolation
  - notification_delivery
  - session_persistence
- Deployment: Bun service; bundled hub in single executable; can run local, self-hosted, or behind relay/tunnel.
- API / Interface: REST `/api/*`, CLI REST `/cli/*`, Socket.IO namespace `/cli`, Socket.IO namespace `/terminal`, SSE `/api/events`.
- Dependencies: Hono, Socket.IO, Bun SQLite, jose/JWT, grammy, web-push, Zod.
- Owner: Chưa xác định.
- Tags: `hub`, `realtime`, `sse`, `socketio`, `sqlite`, `self-hosted`
- Maturity: reusable / production-like.
- Limitations:
  - SQLite local plaintext; cần bảo vệ máy chủ/hub.
  - Public access cần HTTPS/CORS/token cấu hình đúng.
  - Single hub phù hợp cá nhân/nhóm nhỏ hơn là multi-tenant cloud lớn.
- Evidence: `hub/README.md`, `hub/src/web/routes/auth.ts`, `hub/src/socket/server.ts`, `hub/src/store/index.ts`.

### 4.3. hapi_web_remote_console

- Name: HAPI Web Remote Console
- Description: React PWA/Mini App để xem session, chat với agent, duyệt quyền, chọn model/mode, xem file/diff, mở terminal, spawn session và nhận realtime updates.
- Source location:
  - Repo path: `web/`
  - Important files: `web/src/router.tsx`, `web/src/components/SessionChat.tsx`, `web/src/components/SessionList.tsx`, `web/src/components/NewSession/`, `web/src/hooks/useSSE.ts`, `web/src/api/client.ts`, `web/src/components/Terminal/TerminalView.tsx`
- Inputs:
  - JWT/auth token, session/user actions, SSE updates, terminal stream.
- Outputs:
  - REST mutations to hub, terminal Socket.IO events, rendered PWA UI, cached/offline state.
- Capabilities:
  - remote_agent_control
  - permission_approval_workflow
  - workspace_file_browsing
  - remote_terminal_access
  - pwa_offline_access
  - voice_agent_control
- Deployment: Static web app served by hub or standalone hosting.
- API / Interface: Browser/PWA UI, Telegram Mini App surface, REST/SSE/Socket.IO client.
- Dependencies: React, Vite, TanStack Router/Query, assistant-ui, xterm.js, Workbox, ElevenLabs React SDK.
- Owner: Chưa xác định.
- Tags: `pwa`, `react`, `remote-control`, `telegram-mini-app`, `terminal`
- Maturity: reusable / production-like.
- Limitations:
  - Phụ thuộc hub và token hợp lệ.
  - Offline mode chỉ hỗ trợ cache/queue cơ bản, không thay thế kết nối agent thật.
  - Voice phụ thuộc ElevenLabs và browser microphone permission.
- Evidence: `web/README.md`, `docs/guide/pwa.md`, `docs/guide/voice-assistant.md`.

### 4.4. hapi_runner_daemon

- Name: HAPI Runner Daemon
- Description: Background daemon trên máy người dùng, giữ machine online, nhận RPC spawn/stop session, quản lý process con, workspace root và lifecycle/heartbeat.
- Source location:
  - Repo path: `cli/src/runner/`
  - Important files: `cli/src/runner/README.md`, `cli/src/runner/run.ts`, `cli/src/runner/controlServer.ts`, `cli/src/runner/controlClient.ts`, `cli/src/runner/worktree.ts`
- Inputs:
  - RPC `spawn-happy-session`, `stop-session`, `stop-runner` từ hub.
  - Local HTTP control commands.
  - Workspace root, directory, agent/model/mode options.
- Outputs:
  - Spawned HAPI child process, runner state, machine heartbeat, process lifecycle reports.
- Capabilities:
  - remote_session_spawn
  - machine_lifecycle_management
  - workspace_scoping
  - agent_session_orchestration
- Deployment: Background CLI daemon, local Fastify HTTP server on localhost.
- API / Interface: CLI `hapi runner *`; local HTTP endpoints; machine RPC through hub.
- Dependencies: Fastify, Socket.IO client, OS process control, filesystem, git worktree utilities.
- Owner: Chưa xác định.
- Tags: `runner`, `daemon`, `remote-spawn`, `machine`, `process-management`
- Maturity: reusable.
- Limitations:
  - Process cleanup và webhook timeout là điểm dễ sinh ghost/orphan session.
  - Remote spawn có rủi ro nếu workspace root không được scope đúng.
  - Phụ thuộc quyền hệ điều hành để kill process/create directory.
- Evidence: `cli/src/runner/README.md`, `cli/src/runner/run.ts`, `hub/src/web/routes/machines.ts`.

### 4.5. hapi_notification_and_voice_bridge

- Name: HAPI Notification and Voice Bridge
- Description: Khối tùy chọn gửi Telegram/Web Push notification và cấp token ElevenLabs để điều khiển agent bằng giọng nói.
- Source location:
  - Repo path: `hub/src/telegram/`, `hub/src/notifications/`, `hub/src/web/routes/voice.ts`, `hub/src/web/routes/push.ts`, `web/src/api/voice.ts`
  - Important files: `hub/src/telegram/bot.ts`, `hub/src/telegram/callbacks.ts`, `hub/src/notifications/notificationHub.ts`, `hub/src/web/routes/voice.ts`, `hub/src/web/routes/push.ts`
- Inputs:
  - Permission/ready events, browser push subscription, Telegram binding, ElevenLabs API key/agent ID.
- Outputs:
  - Telegram messages/buttons, Web Push notifications, ElevenLabs conversation token.
- Capabilities:
  - notification_delivery
  - voice_agent_control
  - permission_approval_workflow
- Deployment: Hub module, optional external integrations.
- API / Interface: Telegram Bot API, Web Push API, `POST /api/voice/token`.
- Dependencies: grammy, web-push, ElevenLabs ConvAI API.
- Owner: Chưa xác định.
- Tags: `telegram`, `notification`, `web-push`, `voice`, `elevenlabs`
- Maturity: reusable.
- Limitations:
  - Telegram cần public HTTPS URL và bot token.
  - Voice phụ thuộc ElevenLabs quota/API và không nên log/copy API key.
  - Notification không thay thế được kiểm soát access token/namespace.
- Evidence: `hub/README.md`, `hub/src/telegram/bot.ts`, `hub/src/web/routes/voice.ts`, `hub/src/web/routes/push.ts`.

## 5. Capability đề xuất thêm vào ontology

| Capability | Description | Category | Provided by | Evidence/Reasoning |
|---|---|---|---|---|
| multi_agent_gateway | Bọc nhiều agent coding khác nhau sau một interface điều khiển chung. | integration | hapi_cli_agent_gateway | `cli/README.md`, `cli/src/commands/registry.ts` |
| agent_session_orchestration | Tạo, resume, abort, switch mode và theo dõi lifecycle của agent session. | workflow | hapi_cli_agent_gateway, hapi_hub_realtime_gateway, hapi_runner_daemon | `docs/guide/how-it-works.md`, `hub/src/sync/syncEngine.ts`, `cli/src/agent/sessionFactory.ts` |
| realtime_session_sync | Đồng bộ message/state/session/machine realtime giữa CLI, hub và web. | workflow | hapi_hub_realtime_gateway, hapi_cli_agent_gateway, hapi_web_remote_console | `shared/src/socket.ts`, `hub/README.md`, `web/src/hooks/useSSE.ts` |
| remote_agent_control | Gửi lệnh và điều khiển agent từ web/mobile thay vì terminal local. | interaction | hapi_web_remote_console, hapi_hub_realtime_gateway | `web/README.md`, `hub/src/web/routes/messages.ts` |
| permission_approval_workflow | Nhận request quyền từ agent và cho user approve/deny từ web/Telegram. | workflow | hapi_cli_agent_gateway, hapi_hub_realtime_gateway, hapi_web_remote_console, hapi_notification_and_voice_bridge | `hub/src/sync/rpcGateway.ts`, `hub/src/web/routes/permissions.ts`, `hub/src/telegram/callbacks.ts` |
| remote_session_spawn | Tạo session coding mới từ xa trên máy đang chạy runner. | workflow | hapi_runner_daemon, hapi_hub_realtime_gateway, hapi_web_remote_console | `cli/src/runner/README.md`, `hub/src/web/routes/machines.ts` |
| workspace_file_browsing | Duyệt file, xem nội dung, tìm kiếm, xem git diff/status trong workspace qua web. | document | hapi_cli_agent_gateway, hapi_web_remote_console | `web/README.md`, `cli/src/modules/editorRpc.ts`, `cli/src/modules/editorGitRpc.ts` |
| remote_terminal_access | Mở terminal từ web và stream input/output tới CLI/machine/session. | interaction | hapi_cli_agent_gateway, hapi_hub_realtime_gateway, hapi_web_remote_console | `hub/src/socket/handlers/terminal.ts`, `web/README.md` |
| namespace_isolation | Cô lập session/machine/user theo namespace trên cùng một hub. | compliance | hapi_hub_realtime_gateway | `docs/guide/namespace.md`, `hub/src/web/routes/guards.ts`, `hub/src/web/routes/auth.ts` |
| notification_delivery | Gửi thông báo khi agent cần user hoặc đã sẵn sàng. | interaction | hapi_notification_and_voice_bridge | `docs/guide/pwa.md`, `hub/src/telegram/bot.ts`, `hub/src/web/routes/push.ts` |
| voice_agent_control | Điều khiển agent coding qua giọng nói và xử lý permission bằng voice. | interaction | hapi_notification_and_voice_bridge, hapi_web_remote_console | `docs/guide/voice-assistant.md`, `hub/src/web/routes/voice.ts` |
| pwa_offline_access | Cung cấp remote console dạng PWA có cache/offline/basic queued actions. | interaction | hapi_web_remote_console | `docs/guide/pwa.md`, `web/README.md` |
| session_persistence | Lưu session, message, machine, user, push subscription và team chat vào local database. | storage | hapi_hub_realtime_gateway | `hub/src/store/index.ts` |
| workspace_scoping | Giới hạn browse/spawn vào workspace root đã cấu hình. | compliance | hapi_runner_daemon, hapi_cli_agent_gateway | `cli/README.md`, `cli/src/modules/editorRpc.ts`, `cli/src/runner/run.ts` |

## 6. Pattern kiến trúc đề xuất

- Pattern ID: local_first_remote_agent_control_pipeline
- Name: Local-first Remote Coding Agent Control Pipeline
- Description: Kiến trúc cho hệ thống chạy agent trên máy người dùng nhưng điều khiển từ xa qua hub realtime, PWA/Telegram, và runner tùy chọn.
- Category: agent_orchestration
- Complexity: high
- Trigger keywords:
  - remote coding agent
  - mobile approve permissions
  - local-first agent control
  - self-hosted AI agent dashboard
  - remote terminal for coding agent
  - spawn coding session from phone
  - Telegram Mini App agent control
- Requirements:
  - Agent chạy trên máy/local workspace của người dùng.
  - User có thể xem session và gửi lệnh từ web/mobile.
  - Permission request phải được user approve/deny từ xa.
  - Có realtime updates giữa CLI, hub và web.
  - Có cơ chế auth/token và namespace isolation.
  - Có lưu session/message để refresh hoặc reconnect.
  - Nếu cần spawn từ xa, phải có runner daemon và workspace scoping.
- Capabilities needed:
  - multi_agent_gateway
  - agent_session_orchestration
  - realtime_session_sync
  - remote_agent_control
  - permission_approval_workflow
  - namespace_isolation
  - session_persistence
  - remote_session_spawn
  - workspace_file_browsing
  - remote_terminal_access
  - notification_delivery
- Components:
  - hapi_cli_agent_gateway: chạy/bọc agent, bridge message/permission/RPC.
  - hapi_hub_realtime_gateway: trung tâm auth, persistence, REST/SSE/Socket.IO/RPC.
  - hapi_web_remote_console: UI điều khiển web/mobile/PWA.
  - hapi_runner_daemon: optional background remote spawn/machine lifecycle.
  - hapi_notification_and_voice_bridge: optional notification/voice integration.
- Data flow:
  - Web/PWA → Hub REST: login, send message, approve/deny permission, spawn session.
  - Hub → Web SSE: session/message/machine realtime update.
  - CLI → Hub Socket.IO: message, metadata, state, machine heartbeat, RPC register.
  - Hub → CLI Socket.IO/RPC: user message, permission decision, terminal/file/git/spawn request.
  - Hub → SQLite: sessions, machines, messages, users, push subscriptions, team data.
  - Hub → Telegram/Web Push/ElevenLabs: optional notification/voice token path.
- Deployment:
  - Type: single binary or Bun workspace; local/self-hosted; optional public relay/tunnel.
  - Estimated services: 2 core processes (`hub`, `cli`) + optional `runner`; web can be embedded static assets.
- Estimates:
  - Cost: low to medium. Core is local/self-hosted; cost increases with relay/cloud host, Telegram optional, ElevenLabs voice.
  - Latency: realtime path depends on Socket.IO/SSE/network; local hub low latency, public relay/tunnel higher.
  - Setup time: 0.5-2 days for basic reuse; 3-7 days if adapting auth/agent interfaces/terminal/file scope for another product.
- Security notes:
  - Treat CLI_API_TOKEN, Telegram bot token, ElevenLabs API key, VAPID keys as secrets; never store values in catalog docs.
  - Hub stores session/message data plaintext in SQLite; protect filesystem and backups.
  - Remote terminal and file access are high-risk; require namespace/root scope checks and audit/monitoring.
  - Public access needs HTTPS, strict CORS, token validation, and careful tunnel/relay setup.
- Implementation notes:
  - Use shared schemas/types for contract between CLI/hub/web.
  - Keep Socket.IO for bidirectional CLI/RPC, SSE for web update fanout, REST for explicit user actions.
  - Separate runner from session process to make remote spawn and process cleanup manageable.
  - Use namespace as the first isolation boundary for sessions/machines/users.

## 7. Data flow

- `hapi_web_remote_console` → `hapi_hub_realtime_gateway`: login, list sessions, send messages, approve/deny permission, spawn session; REST JSON.
- `hapi_hub_realtime_gateway` → `hapi_web_remote_console`: live session/message/machine updates; SSE JSON from `/api/events`.
- `hapi_cli_agent_gateway` → `hapi_hub_realtime_gateway`: session metadata, messages, state updates, machine heartbeat, RPC registrations; Socket.IO `/cli`.
- `hapi_hub_realtime_gateway` → `hapi_cli_agent_gateway`: user messages, permission decisions, terminal/file/git RPC; Socket.IO/RPC.
- `hapi_hub_realtime_gateway` → local SQLite: sessions, messages, machines, users, push subscriptions, team chats; JSON columns and relational tables.
- `hapi_web_remote_console` → `hapi_hub_realtime_gateway` → `hapi_runner_daemon`: spawn/stop/list machine/session; REST then RPC.
- `hapi_notification_and_voice_bridge` → Telegram/Web Push: permission/ready notifications; external API.
- Browser → ElevenLabs → `hapi_hub_realtime_gateway`/agent: voice conversation token and voice-mediated agent commands; WebRTC/external API plus hub route.

## 8. API / Interface / Deployment

- API endpoints:
  - Auth: `POST /api/auth`, `POST /api/bind`.
  - Sessions: `GET /api/sessions`, `GET /api/sessions/:id`, `POST /api/sessions/:id/messages`, `GET /api/sessions/:id/messages`, `POST /api/sessions/:id/abort`, `POST /api/sessions/:id/resume`, `POST /api/sessions/:id/switch`, `POST /api/sessions/:id/upload`, `PATCH /api/sessions/:id`, `DELETE /api/sessions/:id`.
  - Permissions: `POST /api/sessions/:id/permissions/:requestId/approve`, `POST /api/sessions/:id/permissions/:requestId/deny`.
  - Machines: `GET /api/machines`, `POST /api/machines/:id/spawn`, `POST /api/machines/:id/list-directory`, `POST /api/machines/:id/paths/exists`.
  - Events: `GET /api/events`.
  - Voice/Push: `POST /api/voice/token`, `GET /api/push/vapid-public-key`, `POST /api/push/subscribe`, `DELETE /api/push/subscribe`.
  - CLI: `POST /cli/sessions`, `GET /cli/sessions/:id`, `GET /cli/sessions/:id/messages`, `POST /cli/machines`, `GET /cli/machines/:id`.
- CLI commands:
  - `hapi`, `hapi claude`, `hapi codex`, `hapi codex resume <sessionId>`, `hapi cursor`, `hapi gemini`, `hapi opencode`.
  - `hapi hub`, `hapi server`.
  - `hapi runner start|stop|status|list|stop-session|logs`.
  - `hapi auth status|login|logout`, `hapi doctor`, `hapi mcp`.
- Queue topics/webhooks:
  - Không thấy message queue broker.
  - Local runner webhook/control server có `/session-started`, `/list`, `/stop-session`, `/spawn-session`, `/stop` theo `cli/src/runner/README.md`.
- Docker/Kubernetes/serverless:
  - Không thấy Dockerfile/docker-compose trong repo root qua kiểm tra file.
  - Deployment chính: npm package, Bun source, prebuilt/single executable, self-host/tunnel/relay.
- Environment variables, chỉ ghi tên biến, không ghi giá trị secret:
  - `CLI_API_TOKEN`
  - `HAPI_API_URL`
  - `HAPI_HOME`
  - `HAPI_EXPERIMENTAL`
  - `HAPI_EXTRA_HEADERS_JSON`
  - `HAPI_CLAUDE_PATH`
  - `HAPI_HTTP_MCP_URL`
  - `HAPI_RUNNER_HEARTBEAT_INTERVAL`
  - `HAPI_RUNNER_HTTP_TIMEOUT`
  - `HAPI_RUNNER_WEBHOOK_TIMEOUT_MS`
  - `HAPI_WORKTREE_BASE_PATH`
  - `HAPI_WORKTREE_BRANCH`
  - `HAPI_WORKTREE_NAME`
  - `HAPI_WORKTREE_PATH`
  - `HAPI_WORKTREE_CREATED_AT`
  - `TELEGRAM_BOT_TOKEN`
  - `TELEGRAM_NOTIFICATION`
  - `HAPI_PUBLIC_URL`
  - `HAPI_LISTEN_HOST`
  - `HAPI_LISTEN_PORT`
  - `CORS_ORIGINS`
  - `DB_PATH`
  - `HAPI_RELAY_API`
  - `HAPI_RELAY_AUTH`
  - `HAPI_RELAY_FORCE_TCP`
  - `VAPID_SUBJECT`
  - `ELEVENLABS_API_KEY`
  - `ELEVENLABS_AGENT_ID`
  - `HAPI_TERMINAL_IDLE_TIMEOUT_MS`
  - `HAPI_TERMINAL_MAX_TERMINALS`
  - `HAPI_HOSTNAME`
- Health check:
  - Chưa thấy endpoint `/health` trong tài liệu đã đọc.
  - Runner có heartbeat/state file và local control server.
  - Hub/machine/session liveness dựa trên alive events, heartbeat và active timestamps.

## 9. Dependency và cấu hình

| Dependency | Type | Used by | Purpose | Evidence |
|---|---|---|---|---|
| Bun | runtime/build | all workspaces | Run/build/test, SQLite runtime | `package.json`, package scripts |
| TypeScript | language/tooling | cli/hub/web/shared | Strict TS source/typecheck | `package.json`, package scripts |
| Hono | web framework | hub | REST API routes/middleware | `hub/package.json`, `hub/src/web/routes/*` |
| Socket.IO | realtime | hub/cli/web terminal | CLI↔Hub and terminal bidirectional events | `hub/package.json`, `cli/package.json`, `shared/src/socket.ts` |
| Bun SQLite | database | hub | Local persistence | `hub/src/store/index.ts` |
| jose | auth/crypto | hub | JWT signing/verification | `hub/package.json`, `hub/src/web/routes/auth.ts` |
| grammy | external integration | hub telegram | Telegram Bot API | `hub/package.json`, `hub/src/telegram/bot.ts` |
| web-push | external integration | hub push | Browser push notifications | `hub/package.json`, `hub/src/web/routes/push.ts` |
| ElevenLabs ConvAI | external service | hub/web voice | Voice assistant | `docs/guide/voice-assistant.md`, `hub/src/web/routes/voice.ts` |
| React/Vite | frontend | web | PWA UI | `web/package.json`, `web/README.md` |
| TanStack Router/Query | frontend state/routing | web | Routes and server state | `web/package.json`, `web/README.md` |
| xterm.js | frontend terminal | web | Remote terminal UI | `web/package.json`, `web/README.md` |
| Workbox | PWA | web | Service worker/cache/offline support | `web/package.json`, `docs/guide/pwa.md` |
| @modelcontextprotocol/sdk | MCP | cli | MCP stdio bridge | `cli/package.json`, `cli/README.md` |
| Agent CLIs | external tools | cli | Claude/Codex/Cursor/Gemini/OpenCode execution | `cli/README.md`, `docs/guide/installation.md` |
| git/ripgrep/difftastic | local tools | cli RPC modules | File search and diff/status tooling | `cli/src/modules/common/registerCommonHandlers.ts` |
| tunwg relay tooling | networking | hub/single exe | Public relay with WireGuard + TLS | `README.md`, `docs/guide/why-hapi.md`, `package.json` |

## 10. Rủi ro bảo mật / vận hành / chi phí

- Đỏ:
  - Remote terminal/file/git access có thể đọc/sửa dữ liệu project nếu auth/root scope lỗi. Evidence: `hub/src/socket/handlers/terminal.ts`, `cli/src/modules/editorRpc.ts`.
  - `CLI_API_TOKEN` là shared secret chính; lộ token đồng nghĩa có thể truy cập hub/namespace tương ứng. Evidence: `hub/src/web/routes/auth.ts`, `hub/src/socket/server.ts`.
  - SQLite lưu session/message/machine/user/push data plaintext trên máy hub; mất quyền filesystem có thể lộ nội dung coding session. Evidence: `hub/src/store/index.ts`, `docs/guide/why-hapi.md`.
- Vàng:
  - Public relay/tunnel cần HTTPS/CORS/token đúng; sai cấu hình có thể làm app không dùng được hoặc mở nhầm origin. Evidence: `hub/README.md`, `docs/guide/installation.md`.
  - Telegram/Push/ElevenLabs tích hợp dịch vụ ngoài; cần quản lý secret, quota, rate limit và quyền dữ liệu. Evidence: `hub/src/telegram/bot.ts`, `hub/src/web/routes/voice.ts`, `hub/src/web/routes/push.ts`.
  - Runner spawn process từ xa có thể tạo/kill process sai nếu tracking, webhook timeout hoặc workspace root cấu hình sai. Evidence: `cli/src/runner/README.md`, `cli/src/runner/run.ts`.
  - Namespace isolation phù hợp nhóm nhỏ; chưa đánh giá đầy đủ cho multi-tenant cloud lớn. Evidence: `docs/guide/namespace.md`, `hub/src/web/routes/guards.ts`.
- Xanh:
  - Không thấy payment hoặc dữ liệu tài chính là luồng chính.
  - Core deployment không bắt buộc database ngoài/queue ngoài, giảm chi phí vận hành.
  - Build/test/typecheck có script rõ ở root package.

## 11. Mapping sang file AISAA cần tạo/sửa

| AISAA file | Action | Content summary |
|---|---|---|
| `catalog/components/hapi_cli_agent_gateway.yaml` | create draft | CLI wrapper/agent gateway component |
| `catalog/components/hapi_hub_realtime_gateway.yaml` | create draft | Hub REST/SSE/Socket.IO/SQLite/RPC gateway component |
| `catalog/components/hapi_web_remote_console.yaml` | create draft | React PWA remote control console component |
| `catalog/components/hapi_runner_daemon.yaml` | create draft | Background runner / remote spawn daemon component |
| `catalog/components/hapi_notification_and_voice_bridge.yaml` | create draft | Telegram/Web Push/ElevenLabs optional bridge component |
| `ontology/capabilities.yaml` | update draft | Add/reuse capabilities listed in section 5 |
| `ontology/mappings.yaml` | update draft | Map capabilities to HAPI components |
| `patterns/local_first_remote_agent_control_pipeline.yaml` | create draft | Reusable local-first remote agent control architecture pattern |
| `tests/acceptance/scenarios.yaml` | update draft | Add scenario for remote control of local coding agent |

Lưu ý: `ontology/capabilities.yaml` và `ontology/mappings.yaml` được xem là knowledge layer/roadmap theo yêu cầu intake; không khẳng định AISAA runtime tự dùng trực tiếp nếu code AISAA chưa load hai file này.

## 12. Thông tin chưa rõ cần hỏi lại

| Question | Why it matters | Suggested owner |
|---|---|---|
| Owner/team vận hành HAPI hiện tại là ai? | Điền `owner` trong catalog và biết người duyệt reuse/security. | Maintainer dự án |
| HAPI đang được dùng production với SLA nào chưa? | Xác nhận maturity `production` hay `reusable/internal_tool`. | Maintainer/ops |
| Có endpoint health check chính thức không? | Điền deployment health_check cho component hub. | Backend/ops |
| Chính sách lưu retention cho SQLite messages/session là gì? | Ảnh hưởng bảo mật và chi phí lưu trữ. | Maintainer/ops |
| Có audit log cho terminal/file/permission actions không? | Rủi ro cao khi đưa vào môi trường doanh nghiệp. | Backend/security |
| Có yêu cầu encrypt-at-rest cho SQLite không? | Dữ liệu coding session có thể nhạy cảm. | Security/ops |
| Relay `hapi hub --relay` có giới hạn chi phí/quota/region không? | Ước lượng cost/latency khi reuse pattern. | Ops/maintainer |
| Team Chat trong code có phải capability chính thức muốn catalog không? | Code có module team chat, nhưng docs tổng quan chưa nhấn mạnh. | Product/maintainer |

## 13. Evidence từ codebase cũ

| Claim | Evidence path/command | Confidence |
|---|---|---|
| HAPI chạy agent local và điều khiển qua Web/PWA/Telegram. | `README.md`, `docs/guide/how-it-works.md`, `cli/README.md`, `web/README.md` | high |
| Repo gồm CLI, hub, web, shared, docs, website trong Bun workspaces. | `package.json`, `find cli hub web shared -maxdepth 2 -type f -name README.md -o -name package.json` | high |
| CLI hỗ trợ Claude, Codex, Cursor, Gemini, OpenCode. | `cli/README.md`, `cli/src/commands/registry.ts` | high |
| Hub cung cấp REST API, Socket.IO, SSE, SQLite, Telegram, push, voice. | `hub/README.md`, `hub/src/web/routes/*`, `hub/src/socket/server.ts`, `hub/src/store/index.ts` | high |
| Web là React PWA có session chat, permission, files, terminal, new session. | `web/README.md`, `docs/guide/pwa.md`, `web/src/components/*` | high |
| Runner quản lý background sessions và remote spawn. | `cli/src/runner/README.md`, `cli/src/runner/run.ts`, `hub/src/web/routes/machines.ts` | high |
| Auth dùng CLI_API_TOKEN/Telegram initData và JWT namespace. | `hub/src/web/routes/auth.ts`, `hub/src/web/middleware/auth.ts`, `hub/src/socket/server.ts` | high |
| Namespace cô lập sessions/machines/users. | `docs/guide/namespace.md`, `hub/src/web/routes/guards.ts`, `hub/src/web/routes/cli.ts` | high |
| SQLite schema lưu sessions/messages/machines/users/push/team chat. | `hub/src/store/index.ts` | high |
| Environment variables gồm token, hub URL, CORS, Telegram, ElevenLabs, relay, runner. | `cli/README.md`, `hub/README.md`, `hub/src/configuration.ts`, `cli/src/configuration.ts` | high |
| Không thấy Dockerfile/docker-compose ở độ sâu kiểm tra ban đầu. | `find . -maxdepth 2 -type f \( -name 'docker-compose*.yml' -o -name 'Dockerfile*' \)` | medium |
| Current status production-like/internal_tool. | `package.json` version/build/release scripts, docs and tests; không thấy SLA production. | medium |

Commands run:

- `pwd && git status --short && find . -maxdepth 2 -type f ...`
- `find docs -maxdepth 2 -type f | sort | head -80`
- `sed -n '1,220p' README.md`
- `sed -n '1,260p' cli/README.md`
- `sed -n '1,280p' hub/README.md`
- `sed -n '1,240p' web/README.md`
- `cat package.json cli/package.json hub/package.json web/package.json shared/package.json`
- `sed -n '1,260p' docs/guide/how-it-works.md`
- `sed -n '1,260p' docs/guide/installation.md`
- `sed -n '1,220p' docs/guide/namespace.md`
- `find hub/src/...`, `find cli/src ...`, `find web/src ...`
- `sed -n ... shared/src/schemas.ts`, `shared/src/socket.ts`, hub route/store/socket/runner files.

## 14. Phụ lục YAML nháp

### 14.1. Component YAML draft

```yaml
# catalog/components/hapi_cli_agent_gateway.yaml
component:
  id: hapi_cli_agent_gateway
  name: "HAPI CLI Agent Gateway"
  version: "1.0.0"
  description: >
    CLI wrapper that runs local coding agents, registers sessions and machines
    with the hub, synchronizes messages/state, bridges permission decisions,
    and exposes RPC handlers for workspace, git, terminal, and upload operations.

inputs:
  - type: "text"
    description: "User commands and agent instructions from terminal or remote web UI."
  - type: "json"
    description: "Hub RPC requests, permission decisions, session config, and agent state payloads."

outputs:
  - type: "json"
    description: "Session metadata, agent state updates, messages, and RPC responses."
  - type: "event"
    description: "Socket.IO events sent to the HAPI hub."

capabilities:
  - multi_agent_gateway
  - agent_session_orchestration
  - realtime_session_sync
  - permission_approval_workflow
  - workspace_file_browsing
  - remote_terminal_access

deployment:
  type: cli
  image: ""
  ports: []
  environment:
    - CLI_API_TOKEN
    - HAPI_API_URL
    - HAPI_HOME
    - HAPI_EXTRA_HEADERS_JSON
    - HAPI_CLAUDE_PATH
    - HAPI_HTTP_MCP_URL
  health_check: "hapi doctor"
  resources: {}

owner: "Chưa xác định"

api:
  protocol: CLI
  start_claude: "hapi"
  start_codex: "hapi codex"
  start_cursor: "hapi cursor"
  start_gemini: "hapi gemini"
  start_opencode: "hapi opencode"
  mcp_bridge: "hapi mcp"

dependencies:
  - "@hapi/protocol"
  - "socket.io-client"
  - "@modelcontextprotocol/sdk"
  - "Claude Code CLI / Codex CLI / Cursor Agent CLI / Gemini CLI / OpenCode CLI"
  - "git"
  - "ripgrep"
  - "difftastic"

tags:
  - cli
  - coding-agent
  - local-first
  - socketio
  - rpc
```

```yaml
# catalog/components/hapi_hub_realtime_gateway.yaml
component:
  id: hapi_hub_realtime_gateway
  name: "HAPI Hub Realtime Gateway"
  version: "1.0.0"
  description: >
    Self-hosted hub service that coordinates CLI agents and web clients using
    REST, SSE, Socket.IO, RPC routing, JWT auth, namespace isolation, and local
    SQLite persistence.

inputs:
  - type: "json"
    description: "REST requests from web clients and CLI REST endpoints."
  - type: "event"
    description: "Socket.IO events from CLI sessions, machines, and terminals."

outputs:
  - type: "json"
    description: "REST responses and persisted session, message, machine, user, and notification records."
  - type: "event"
    description: "SSE updates and Socket.IO RPC requests to CLI clients."

capabilities:
  - realtime_session_sync
  - remote_agent_control
  - permission_approval_workflow
  - namespace_isolation
  - notification_delivery
  - session_persistence

deployment:
  type: cli
  image: ""
  ports:
    - 3006
  environment:
    - CLI_API_TOKEN
    - TELEGRAM_BOT_TOKEN
    - TELEGRAM_NOTIFICATION
    - HAPI_PUBLIC_URL
    - HAPI_LISTEN_HOST
    - HAPI_LISTEN_PORT
    - CORS_ORIGINS
    - HAPI_HOME
    - DB_PATH
    - HAPI_RELAY_API
    - HAPI_RELAY_AUTH
    - HAPI_RELAY_FORCE_TCP
    - VAPID_SUBJECT
    - ELEVENLABS_API_KEY
    - ELEVENLABS_AGENT_ID
  health_check: "Chưa xác định"
  resources: {}

owner: "Chưa xác định"

api:
  protocol: REST/SSE/Socket.IO
  auth: "POST /api/auth"
  sessions: "GET /api/sessions"
  messages: "GET|POST /api/sessions/:id/messages"
  permissions: "POST /api/sessions/:id/permissions/:requestId/approve|deny"
  machines: "GET /api/machines; POST /api/machines/:id/spawn"
  events: "GET /api/events"
  cli_sessions: "POST /cli/sessions"
  cli_machines: "POST /cli/machines"

dependencies:
  - "@hapi/protocol"
  - "hono"
  - "socket.io"
  - "bun:sqlite"
  - "jose"
  - "grammy"
  - "web-push"
  - "zod"

tags:
  - hub
  - realtime
  - sse
  - socketio
  - sqlite
  - self-hosted
```

```yaml
# catalog/components/hapi_web_remote_console.yaml
component:
  id: hapi_web_remote_console
  name: "HAPI Web Remote Console"
  version: "1.0.0"
  description: >
    React PWA and Telegram Mini App interface for monitoring and controlling
    coding agent sessions, approving permissions, viewing files and diffs,
    opening remote terminals, spawning sessions, and using voice control.

inputs:
  - type: "json"
    description: "Session data, messages, machine data, permissions, SSE updates, and terminal events from the hub."
  - type: "text"
    description: "User instructions, permission decisions, directory paths, and settings from the UI."

outputs:
  - type: "json"
    description: "REST mutations to send messages, approve permissions, spawn sessions, and configure sessions."
  - type: "event"
    description: "Terminal Socket.IO events and PWA push subscription requests."

capabilities:
  - remote_agent_control
  - permission_approval_workflow
  - workspace_file_browsing
  - remote_terminal_access
  - pwa_offline_access
  - voice_agent_control

deployment:
  type: serverless
  image: ""
  ports: []
  environment: []
  health_check: "served by hub or static host"
  resources: {}

owner: "Chưa xác định"

api:
  protocol: REST/SSE/Socket.IO
  hub_api: "/api/*"
  events: "GET /api/events"
  terminal_socket: "/terminal Socket.IO namespace"

dependencies:
  - "react"
  - "vite"
  - "@tanstack/react-router"
  - "@tanstack/react-query"
  - "@assistant-ui/react"
  - "@xterm/xterm"
  - "workbox"
  - "@elevenlabs/react"

tags:
  - web
  - pwa
  - remote-control
  - terminal
  - telegram-mini-app
```

```yaml
# catalog/components/hapi_runner_daemon.yaml
component:
  id: hapi_runner_daemon
  name: "HAPI Runner Daemon"
  version: "1.0.0"
  description: >
    Background machine daemon that registers machine state with the hub,
    receives remote spawn and stop requests, starts detached HAPI sessions,
    tracks child processes, and enforces workspace-root scoping for remote spawn.

inputs:
  - type: "json"
    description: "Machine RPC requests for spawning or stopping sessions."
  - type: "text"
    description: "Workspace paths, agent type, model, permission mode, and session type options."

outputs:
  - type: "json"
    description: "Runner state, machine heartbeat, spawn result, and tracked session metadata."
  - type: "event"
    description: "Machine Socket.IO events and local session-started webhook reports."

capabilities:
  - remote_session_spawn
  - machine_lifecycle_management
  - workspace_scoping
  - agent_session_orchestration

deployment:
  type: cli
  image: ""
  ports: []
  environment:
    - CLI_API_TOKEN
    - HAPI_API_URL
    - HAPI_HOME
    - HAPI_RUNNER_HEARTBEAT_INTERVAL
    - HAPI_RUNNER_HTTP_TIMEOUT
    - HAPI_RUNNER_WEBHOOK_TIMEOUT_MS
  health_check: "hapi runner status"
  resources: {}

owner: "Chưa xác định"

api:
  protocol: CLI/REST/RPC
  start: "hapi runner start"
  stop: "hapi runner stop"
  status: "hapi runner status"
  spawn_rpc: "spawn-happy-session"
  stop_session_rpc: "stop-session"

dependencies:
  - "fastify"
  - "socket.io-client"
  - "OS process management"
  - "filesystem"
  - "git worktree"

tags:
  - runner
  - daemon
  - remote-spawn
  - machine-lifecycle
  - workspace-scope
```

```yaml
# catalog/components/hapi_notification_and_voice_bridge.yaml
component:
  id: hapi_notification_and_voice_bridge
  name: "HAPI Notification and Voice Bridge"
  version: "1.0.0"
  description: >
    Optional hub module that sends Telegram and Web Push notifications for
    agent readiness and permission requests, and issues ElevenLabs ConvAI
    conversation tokens for voice-based agent control.

inputs:
  - type: "event"
    description: "Permission request and ready events from the hub session engine."
  - type: "json"
    description: "Telegram binding data, push subscription data, and voice token requests."

outputs:
  - type: "notification"
    description: "Telegram bot messages and Web Push notifications."
  - type: "json"
    description: "ElevenLabs conversation token response."

capabilities:
  - notification_delivery
  - voice_agent_control
  - permission_approval_workflow

deployment:
  type: library
  image: ""
  ports: []
  environment:
    - TELEGRAM_BOT_TOKEN
    - TELEGRAM_NOTIFICATION
    - HAPI_PUBLIC_URL
    - VAPID_SUBJECT
    - ELEVENLABS_API_KEY
    - ELEVENLABS_AGENT_ID
  health_check: "Chưa xác định"
  resources: {}

owner: "Chưa xác định"

api:
  protocol: REST/external_api
  voice_token: "POST /api/voice/token"
  push_subscribe: "POST /api/push/subscribe"
  telegram_commands: "/start, /app"

dependencies:
  - "grammy"
  - "web-push"
  - "ElevenLabs ConvAI API"

tags:
  - telegram
  - notification
  - web-push
  - voice
  - elevenlabs
```

### 14.2. Capability YAML draft

```yaml
# ontology/capabilities.yaml
capabilities:
  multi_agent_gateway:
    description: "Provide a common control layer over multiple coding agent CLIs."
    category: "integration"
    examples:
      - "Run Claude Code, Codex, Gemini, Cursor Agent, or OpenCode behind one remote-control interface."
      - "Normalize agent session control for a web dashboard."

  agent_session_orchestration:
    description: "Create, resume, abort, switch mode, and track lifecycle of AI agent sessions."
    category: "workflow"
    examples:
      - "Start a local coding agent and continue it from a phone."
      - "Resume an inactive session after a remote message."

  realtime_session_sync:
    description: "Synchronize session messages, metadata, machine state, and agent state across clients in real time."
    category: "workflow"
    examples:
      - "Show live agent output in a PWA while the agent runs locally."
      - "Broadcast permission request state to all connected clients."

  remote_agent_control:
    description: "Allow users to send instructions and control an AI agent from a remote web or mobile interface."
    category: "interaction"
    examples:
      - "Send a coding instruction from a phone to a running local agent."
      - "Switch an agent session from local terminal mode to remote mode."

  permission_approval_workflow:
    description: "Route agent permission requests to a human approver and relay approve or deny decisions back to the agent."
    category: "workflow"
    examples:
      - "Approve a file edit request from a phone."
      - "Deny a risky command requested by an agent."

  remote_session_spawn:
    description: "Start new agent sessions remotely on an online machine or workspace."
    category: "workflow"
    examples:
      - "Open the mobile app and start a Codex session in a selected repository."
      - "Spawn a worktree-backed session from a web dashboard."

  workspace_file_browsing:
    description: "Browse workspace files, search code, and inspect git status or diffs from a remote UI."
    category: "document"
    examples:
      - "View a modified file from the phone before approving changes."
      - "Search a project directory from the web app."

  remote_terminal_access:
    description: "Open and control a terminal session remotely through a web interface."
    category: "interaction"
    examples:
      - "Run a command in the project terminal from a browser."
      - "Attach to a session terminal while away from the desktop."

  namespace_isolation:
    description: "Isolate users, machines, sessions, and notifications under namespace-scoped access tokens."
    category: "compliance"
    examples:
      - "Let multiple teammates share one hub without seeing each other's sessions."
      - "Bind Telegram users to separate namespaces."

  notification_delivery:
    description: "Deliver notifications when an agent needs attention or is ready for the next instruction."
    category: "interaction"
    examples:
      - "Send a Telegram notification for a permission request."
      - "Send a browser push notification when an agent is waiting."

  voice_agent_control:
    description: "Use voice input and spoken interaction to control an AI coding agent."
    category: "interaction"
    examples:
      - "Ask a coding agent to refactor a module by voice."
      - "Approve or deny a permission request verbally."

  pwa_offline_access:
    description: "Provide an installable web app with cached UI and limited offline behavior."
    category: "interaction"
    examples:
      - "Open previously loaded session messages while offline."
      - "Queue simple actions until the connection returns."

  session_persistence:
    description: "Persist sessions, messages, machines, users, and notification subscriptions for reconnect and history."
    category: "storage"
    examples:
      - "Refresh the browser and keep session history."
      - "Store machine state and active session metadata locally."

  workspace_scoping:
    description: "Restrict remote file browsing or session spawning to an approved workspace root."
    category: "compliance"
    examples:
      - "Allow remote spawn only inside a configured workspace directory."
      - "Reject file reads outside the editor root."
```

### 14.3. Mapping YAML draft

```yaml
# ontology/mappings.yaml
mappings:
  multi_agent_gateway:
    - component: hapi_cli_agent_gateway
      fit: primary
      notes: "CLI command registry and agent runners expose multiple coding agents behind HAPI."

  agent_session_orchestration:
    - component: hapi_cli_agent_gateway
      fit: primary
      notes: "Bootstraps sessions and coordinates agent lifecycle locally."
    - component: hapi_hub_realtime_gateway
      fit: primary
      notes: "Stores sessions and routes resume/abort/switch actions."
    - component: hapi_runner_daemon
      fit: secondary
      notes: "Spawns and tracks remote-started sessions."

  realtime_session_sync:
    - component: hapi_hub_realtime_gateway
      fit: primary
      notes: "Provides Socket.IO and SSE realtime sync."
    - component: hapi_cli_agent_gateway
      fit: primary
      notes: "Sends agent events and receives remote commands."
    - component: hapi_web_remote_console
      fit: secondary
      notes: "Consumes SSE updates and sends REST mutations."

  remote_agent_control:
    - component: hapi_web_remote_console
      fit: primary
      notes: "Primary browser/mobile UI for remote control."
    - component: hapi_hub_realtime_gateway
      fit: primary
      notes: "Routes remote instructions to active CLI sessions."

  permission_approval_workflow:
    - component: hapi_hub_realtime_gateway
      fit: primary
      notes: "Stores and routes permission approvals/denials."
    - component: hapi_web_remote_console
      fit: primary
      notes: "Renders approval UI."
    - component: hapi_notification_and_voice_bridge
      fit: secondary
      notes: "Allows Telegram notification buttons and voice permission handling."
    - component: hapi_cli_agent_gateway
      fit: primary
      notes: "Receives decisions and communicates with the local agent."

  remote_session_spawn:
    - component: hapi_runner_daemon
      fit: primary
      notes: "Starts detached HAPI sessions on an online machine."
    - component: hapi_hub_realtime_gateway
      fit: primary
      notes: "Routes machine spawn requests via RPC."
    - component: hapi_web_remote_console
      fit: secondary
      notes: "Provides new session UI."

  workspace_file_browsing:
    - component: hapi_cli_agent_gateway
      fit: primary
      notes: "RPC handlers read files, list directories, search, and inspect git status."
    - component: hapi_web_remote_console
      fit: primary
      notes: "Displays browser, file content, git status, and diffs."

  remote_terminal_access:
    - component: hapi_hub_realtime_gateway
      fit: primary
      notes: "Routes terminal Socket.IO events between web and CLI."
    - component: hapi_cli_agent_gateway
      fit: primary
      notes: "Executes terminal side operations."
    - component: hapi_web_remote_console
      fit: primary
      notes: "Provides xterm.js terminal UI."

  namespace_isolation:
    - component: hapi_hub_realtime_gateway
      fit: primary
      notes: "Validates tokens and scopes sessions, machines, and users by namespace."

  notification_delivery:
    - component: hapi_notification_and_voice_bridge
      fit: primary
      notes: "Sends Telegram and Web Push notifications."
    - component: hapi_hub_realtime_gateway
      fit: secondary
      notes: "Publishes notification-worthy events."

  voice_agent_control:
    - component: hapi_notification_and_voice_bridge
      fit: primary
      notes: "Provides ElevenLabs token and voice bridge integration."
    - component: hapi_web_remote_console
      fit: secondary
      notes: "Provides browser voice UI."

  pwa_offline_access:
    - component: hapi_web_remote_console
      fit: primary
      notes: "PWA app shell, service worker, and offline UX."

  session_persistence:
    - component: hapi_hub_realtime_gateway
      fit: primary
      notes: "SQLite persistence for sessions, machines, messages, users, push, and team data."

  workspace_scoping:
    - component: hapi_runner_daemon
      fit: primary
      notes: "Runner can enforce workspace-root for browse/spawn."
    - component: hapi_cli_agent_gateway
      fit: secondary
      notes: "Editor RPC functions check root containment for file operations."
```

### 14.4. Pattern YAML draft

```yaml
# patterns/local_first_remote_agent_control_pipeline.yaml
pattern:
  id: local_first_remote_agent_control_pipeline
  name: "Local-first Remote Coding Agent Control Pipeline"
  description: >
    Run coding agents on a user's own machine while enabling remote control,
    realtime monitoring, permission approval, workspace browsing, terminal access,
    and optional remote session spawning through a self-hosted realtime hub.
  category: "agent_orchestration"
  complexity: high

trigger_keywords:
  - remote coding agent
  - mobile approve permissions
  - local-first agent control
  - self-hosted AI agent dashboard
  - remote terminal for coding agent
  - spawn coding session from phone
  - Telegram Mini App agent control

requirements:
  - "Agent execution must stay on the user's own machine or workspace."
  - "Users must be able to send instructions from web or mobile."
  - "Agent permission requests must be approved or denied remotely."
  - "Session and message updates must be streamed in real time."
  - "Session history must survive browser refresh and reconnect."
  - "Access must be protected by token/JWT and namespace isolation."
  - "Remote spawn should be optional and scoped to an approved workspace root."

capabilities_needed:
  - multi_agent_gateway
  - agent_session_orchestration
  - realtime_session_sync
  - remote_agent_control
  - permission_approval_workflow
  - namespace_isolation
  - session_persistence
  - remote_session_spawn
  - workspace_file_browsing
  - remote_terminal_access
  - notification_delivery

components:
  - id: hapi_cli_agent_gateway
    role: "Run local coding agents and bridge agent events, permissions, file/git/terminal RPC to the hub."
  - id: hapi_hub_realtime_gateway
    role: "Coordinate auth, persistence, REST actions, SSE updates, Socket.IO, and RPC routing."
  - id: hapi_web_remote_console
    role: "Provide web/mobile/PWA UI for chat, approval, session management, files, diffs, and terminal."
  - id: hapi_runner_daemon
    role: "Optionally keep machines online and spawn/stop sessions remotely."
  - id: hapi_notification_and_voice_bridge
    role: "Optionally notify users and provide voice-control integration."

data_flow:
  - from: hapi_web_remote_console
    to: hapi_hub_realtime_gateway
    data: "JWT-authenticated REST actions such as send message, approve permission, list sessions, and spawn session."
  - from: hapi_hub_realtime_gateway
    to: hapi_web_remote_console
    data: "SSE updates for sessions, messages, machines, and agent state."
  - from: hapi_cli_agent_gateway
    to: hapi_hub_realtime_gateway
    data: "Socket.IO events for messages, metadata, state updates, machine heartbeat, and RPC registration."
  - from: hapi_hub_realtime_gateway
    to: hapi_cli_agent_gateway
    data: "Socket.IO/RPC requests for user messages, permission decisions, file/git/terminal operations, and session config."
  - from: hapi_hub_realtime_gateway
    to: hapi_runner_daemon
    data: "Machine RPC requests to spawn or stop sessions."
  - from: hapi_hub_realtime_gateway
    to: hapi_notification_and_voice_bridge
    data: "Permission/ready events and voice token requests."
```

### 14.5. Acceptance scenario YAML draft

```yaml
# tests/acceptance/scenarios.yaml
scenarios:
  - id: local_first_remote_agent_control_pipeline
    name: "Local-first remote coding agent control"
    requirement: >
      Build a self-hosted system where a coding agent runs on the user's own
      machine, while the user can monitor the session, send messages, approve
      permissions, inspect workspace files or diffs, and optionally spawn new
      sessions from a web/mobile interface.
    expected_capabilities:
      - multi_agent_gateway
      - agent_session_orchestration
      - realtime_session_sync
      - remote_agent_control
      - permission_approval_workflow
      - namespace_isolation
      - session_persistence
      - remote_session_spawn
      - workspace_file_browsing
      - remote_terminal_access
      - notification_delivery
    expected_components:
      - hapi_cli_agent_gateway
      - hapi_hub_realtime_gateway
      - hapi_web_remote_console
      - hapi_runner_daemon
      - hapi_notification_and_voice_bridge
```
