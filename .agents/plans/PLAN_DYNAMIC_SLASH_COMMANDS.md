# Dynamic Slash Commands & True HAPI Session Handoff

> **Version**: 2.1
> **Tier**: L (Large)
> **Type**: ⬆️ Cải tiến feature có sẵn + bổ sung lifecycle flow
> **Rewritten**: 2026-04-04
> **Agent**: Codex

---

## 1. Mục tiêu

Giải quyết 2 nhóm vấn đề:

1. **Dynamic Slash Commands UI**
   - Web autocomplete phải hiển thị đúng slash commands mà agent thực sự support qua remote.
   - Codex hiện fallback thành `[]`, UX sai.

2. **Agent State Sync / Session Lifecycle Sync**
   - `/clear` không chỉ reset context nội bộ agent.
   - `/clear` phải tạo **HAPI session mới thật**, redirect web sang session mới, giữ session cũ làm audit trail.
   - `/compact` phải tạo **soft context boundary** trong timeline, không duplicate marker, không tạo session mới.

---

## 2. Tóm tắt quyết định kiến trúc

### D1. `/clear` là **control action**, không phải normal chat message
- Không persist raw `/clear` vào bảng `messages`.
- Intercept ở **hub send path** trước khi gọi `MessageService.sendMessage()`.
- Web cũng **không optimistic-append** raw `/clear` vào old timeline.

### D2. `/clear` dùng **session handoff protocol**
- Hub tạo **replacement session** mới.
- Hub yêu cầu CLI session cũ thực hiện native clear trong agent.
- CLI sau khi clear xong sẽ **rebind** từ old HAPI session sang new HAPI session.
- Web **ưu tiên redirect bằng HTTP response** `{ replaced: true, newSessionId }`.
- SSE `session-replaced` chỉ là **secondary sync signal** để patch caches / observers khác, không phải cơ chế redirect duy nhất.

### D3. Session cũ không bị xóa message
- Session cũ giữ nguyên history.
- Session cũ được mark inactive/archived + liên kết tới session mới.
- Đây là **replacement session**, không phải simple `/new`.
- Khác `/new` ở chỗ old/new có lineage rõ ràng: old = before-clear audit trail, new = after-clear continuation.

### D4. `/compact` là **soft boundary**, không phải session replacement
- Persist marker/event vào current session.
- Không emit duplicate marker.
- Canonical source = **compact completed**, không phải compact requested.
- Dùng **payload shape tương thích với web normalizer hiện tại**, không dùng event shape mơ hồ.

### D5. Codex builtin list chỉ hiển thị command remote-safe thật sự
- Không show command chưa có end-to-end sync.
- **Codex remote-safe list trong scope này: `compact`, `clear`, `review`, `plan`, `diff`, `init`**.
- `new` vẫn **out of scope** cho plan này.

### D6. CLI là source of truth khi API available
- Web vẫn giữ fallback local list để survive khi RPC fail.
- Đây là **authoritative runtime source**, không phải literal single source trong codebase.

### D7. Handoff strategy ưu tiên **launcher-local**, chưa mở rộng shared loop sớm
- Không sửa shared `runLocalRemoteLoop()` trước nếu chưa thực sự cần.
- Ownership nằm ở launcher của Claude/Codex.
- Nếu implementation thực tế chứng minh launcher-local handoff không đủ, khi đó mới mở rộng shared loop contract như phase follow-up riêng.

---

## 3. Acceptance Criteria

## 3.1. Verification Matrix

| # | Criteria | Verify Command / Method | Expected Result |
|---|----------|--------------------------|-----------------|
| AC-1.1 | Codex autocomplete list | Open Codex session, type `/` | Thấy đúng 6 commands: `compact`, `clear`, `review`, `plan`, `diff`, `init` |
| AC-1.2 | Claude parity | Open Claude session, type `/` | Behavior giữ nguyên như hiện tại |
| AC-1.3 | API command authority | Call `/api/sessions/:id/slash-commands` | Response dùng toàn bộ list từ CLI, gồm cả `builtin` |
| AC-1.4 | Web fallback | Simulate slash command RPC fail | Web fallback sang local builtin list |
| AC-2.1 | `/clear` không persist | Send exact `/clear`, inspect old session messages API | Không có raw `/clear` persisted |
| AC-2.1b | `/clear` không optimistic ghost | Send exact `/clear`, inspect old timeline trước/sau redirect | Old timeline không hiện raw `/clear` pending/sent |
| AC-2.2 → AC-2.8 | Replacement flow | Send exact `/clear`, follow redirect, reload both sessions | new session id khác old; old inactive; old còn history; new sạch |
| AC-3.1 → AC-3.4 | Compact marker + fold UX | Trigger `/compact` trên Claude/Codex | đúng 1 marker; earlier messages collapsed by default |

### Issue 1: Slash Commands UI
- **AC-1.1**: Khi user mở session Codex trên web, autocomplete hiển thị 6 commands remote-safe: `compact`, `clear`, `review`, `plan`, `diff`, `init`
- **AC-1.2**: Khi user mở session Claude, autocomplete giữ nguyên behavior hiện tại
- **AC-1.3**: Khi API `listSlashCommands` available, web dùng toàn bộ command list từ CLI, gồm cả `builtin`
- **AC-1.4**: Khi API fail, web fallback sang local builtin list

### Issue 2: `/clear` → true HAPI session replacement
- **AC-2.1**: Khi web gửi `/clear`, raw `/clear` **không được persist** vào HAPI message history
- **AC-2.1b**: Web **không append optimistic `/clear` message** vào current timeline
- **AC-2.2**: Hub tạo **new HAPI session** với metadata kế thừa từ session cũ
- **AC-2.3**: Hub gửi RPC control action sang CLI session cũ để thực hiện native clear trong agent
- **AC-2.4**: Sau khi CLI clear xong, CLI bắt đầu đồng bộ qua **new HAPI session id**
- **AC-2.5**: Session cũ bị mark archived/inactive và có metadata link tới session mới
- **AC-2.6**: API `/messages` branch của `/clear` trả về `{ ok: true, replaced: true, newSessionId }`
- **AC-2.7**: Web redirect user từ old session sang new session bằng HTTP response; SSE `session-replaced` chỉ sync thêm
- **AC-2.8**: Session mới mở ra với timeline trống hoặc chỉ chứa post-clear traffic mới
- **AC-2.9**: Session cũ **không bị delete**, vẫn mở lại được để xem history before-clear

### Issue 3: `/compact` → soft boundary
- **AC-3.1**: Khi agent compact hoàn tất, hub persist đúng 1 compact marker vào current session
- **AC-3.2**: Web timeline hiển thị compact marker rõ ràng
- **AC-3.3**: Không xuất hiện duplicate compact marker từ nhiều nguồn event
- **AC-3.4**: Messages trước compact marker mặc định được collapse, có nút expand lại

---

## 4. Non-goals

- ❌ Không hỗ trợ Cursor slash commands
- ❌ Không implement true session replacement cho Gemini/OpenCode trong plan này
- ❌ Không hỗ trợ `/new` cho Codex trong scope này
- ❌ Không xóa messages khỏi DB
- ❌ Không delete old session record trong flow `/clear`
- ❌ Không sửa Claude SDK internals hoặc Codex app-server protocol internals
- ❌ Không mở rộng shared loop contract sang toàn bộ agent types nếu launcher-local handoff đã đủ

---

## 5. Vấn đề của plan v1

### 5.1. `/clear` bị persist quá sớm
Current flow:

```text
Web POST /sessions/:id/messages
→ hub MessageService.sendMessage()
→ store.messages.addMessage()
→ CLI nhận message
→ agent xử lý /clear
```

=> Nếu chỉ emit `context-clear` từ CLI sau khi xử lý, raw `/clear` đã nằm trong DB.

### 5.2. Hub không thể tự tạo session mới rồi “hy vọng” CLI tự theo
Current CLI transport:
- `ApiSessionClient.sessionId` bind theo HAPI session cụ thể
- socket auth hiện gắn với session đó
- remote launcher/session object giữ client này xuyên suốt loop

=> Nếu hub tạo new session nhưng CLI không rebind, traffic tiếp theo vẫn chảy vào old session.

### 5.2b. HTTP-only / SSE-only redirect đều chưa đủ nếu không chốt ownership
- Web hiện subscribe SSE theo selected session id khi đang mở detail view.
- `App.tsx` hiện chưa có redirect logic cho `session-replaced`.
- `useSendMessage` hiện append optimistic user message trước khi API trả về.

=> `/clear` cần chốt rõ:
1. redirect owner = **HTTP response path**
2. SSE = secondary sync
3. optimistic `/clear` phải bypass

### 5.3. `/compact` có nguy cơ marker duplicate
V1 định emit lúc request và lúc `thread/compacted` complete.
=> cần canonical completion signal.

---

## 6. Thiết kế chi tiết

## Phase 1 — Slash Commands UI cleanup

### 1.1. CLI builtin list cho Codex
File: `cli/src/modules/common/slashCommands.ts`

Đổi từ `codex: []` sang:

```ts
codex: [
    { name: 'compact', description: 'Summarize conversation to free up context', source: 'builtin' },
    { name: 'clear', description: 'Clear terminal and start a new chat', source: 'builtin' },
    { name: 'review', description: 'Review current changes and find issues', source: 'builtin' },
    { name: 'plan', description: 'Switch to Plan mode', source: 'builtin' },
    { name: 'diff', description: 'Show git diff including untracked files', source: 'builtin' },
    { name: 'init', description: 'Create an AGENTS.md file', source: 'builtin' },
],
```

### 1.2. Web fallback builtin list
File: `web/src/lib/codexSlashCommands.ts`

Mirror đúng 6 command trên.

### 1.3. useSlashCommands merge logic
File: `web/src/hooks/queries/useSlashCommands.ts`

Nếu API available:
- return toàn bộ `query.data.commands`

Nếu API fail:
- fallback `getBuiltinSlashCommands(agentType)`

Không filter chỉ `user/plugin/project` nữa.

### 1.4. Unsupported Codex builtin list
File: `web/src/lib/codexSlashCommands.ts`

Giữ block các command chưa support remote end-to-end, ví dụ:

```ts
const UNSUPPORTED_CODEX_BUILTIN_COMMANDS = new Set([
    'new',
    'undo',
    'status',
])
```

`review` và `diff` không còn bị block.

---

## Phase 2 — Shared sync model cho session replacement

## 2.1. Thêm sync event mới: `session-replaced`
File: `shared/src/schemas.ts`

Thêm variant mới vào `SyncEventSchema`:

```ts
{
    type: 'session-replaced',
    sessionId: string,      // oldSessionId for scoped SSE delivery
    oldSessionId: string,
    newSessionId: string,
    data?: {
        reason: 'clear'
    },
    namespace?: string
}
```

Mục đích:
- cache invalidation semantics rõ ràng
- secondary sync signal cho web/notification
- không overload `session-updated`

## 2.2. Metadata links giữa old/new session
File: `shared/src/schemas.ts`

Mở rộng `MetadataSchema` bằng fields optional:

```ts
predecessorSessionId?: string
successorSessionId?: string
replacedAt?: number
replacementReason?: 'clear'
```

Mục đích:
- trace lineage
- future “continue from previous session” UI
- phân biệt `/clear replacement` với `/new`

---

## Phase 3 — Hub create replacement session

## 3.1. Tạo API/service riêng để tạo replacement session
Không dùng `getOrCreateSession(tag, ...)` vì hàm này dedupe theo tag.

Cần API/store path mới:
- `store.sessions.createSession(...)`
- hoặc `sessionCache.createReplacementSession(oldSessionId, ...)`

### Required behavior
Input:
- old session id
- namespace
- cloned metadata
- cloned model/effort
- cloned permission/collaboration mode nếu cần ở cache layer

Output:
- new session object với **new id thật**
- old session **không bị delete**

## 3.2. Clone metadata có chọn lọc
Clone các field:
- `path`
- `host`
- `machineId`
- `flavor`
- `worktree`
- `startedBy` nếu hữu ích
- `summary` / `name` nếu muốn giữ title/context summary

Không clone:
- `claudeSessionId` / `codexSessionId` cũ
- pending tool requests
- old agent state
- old todos/teamState nếu muốn session mới thật sự sạch

Set thêm:
- `predecessorSessionId = old.id`
- ở old session set `successorSessionId = new.id`
- `replacementReason = 'clear'`
- `replacedAt = now`

## 3.3. SyncEngine API mới
File: `hub/src/sync/syncEngine.ts`

Thêm method kiểu:

```ts
async clearSession(sessionId: string, namespace: string): Promise<
  | { type: 'success'; newSessionId: string }
  | { type: 'error'; message: string }
>
```

Flow:
1. resolve old session access
2. create replacement session
3. call RPC `clear-and-handoff` on old session, payload `{ newSessionId }`
4. wait for CLI ack success
5. optionally wait until new session observable/active
6. archive/deactivate old session
7. emit:
   - `session-added` for new session
   - `session-updated` for old session metadata/active=false
   - `session-replaced` with `sessionId = oldSessionId`, `oldSessionId`, `newSessionId`
8. return HTTP payload `{ ok: true, replaced: true, newSessionId }`

## 3.4. Archive timing
**Không archive old session trước khi CLI handoff thành công.**

Safer order:
1. create new session
2. CLI ack handoff completion
3. mark old session inactive/archived
4. emit redirect/sync event
5. return response with `newSessionId`

Nếu handoff fail:
- old session vẫn active
- new session có thể giữ inactive để debug, hoặc cleanup theo implementation đã chốt
- trả lỗi về web

---

## Phase 4 — Hub intercept `/clear` trước persistence

## 4.1. Intercept ở web route
File: `hub/src/web/routes/messages.ts`

Pseudo-flow:

```ts
const trimmed = parsed.data.text.trim()
if (trimmed === '/clear' && (!attachments || attachments.length === 0)) {
    const result = await engine.clearSession(sessionId, namespace)
    if (result.type === 'error') {
        return c.json({ error: result.message }, 500)
    }
    return c.json({ ok: true, replaced: true, newSessionId: result.newSessionId })
}
```

### Rules
- chỉ intercept exact `/clear`
- `/clear foo` không valid special clear command
- `/clear` + attachments: reject 400 hoặc treat unsupported
- response của branch này là **authoritative redirect contract** cho web

## 4.2. Không persist raw `/clear`
`MessageService.sendMessage()` không được gọi trong branch này.

---

## Phase 5 — Web `/clear` redirect contract

## 5.1. Web send path không được optimistic append `/clear`
Files:
- `web/src/hooks/mutations/useSendMessage.ts`
- `web/src/api/client.ts`
- `web/src/router.tsx`
- `web/src/lib/message-window-store.ts`

Rules:
- detect exact `/clear` trước optimistic append
- nếu API trả `{ replaced: true, newSessionId }`:
  - không giữ optimistic `/clear`
  - seed/copy message window nếu cần
  - redirect ngay sang session mới
- route-level redirect là owner chính, không phụ thuộc vào SSE-only path

## 5.2. API client response shape
`api.sendMessage()` cần support response union, ví dụ:

```ts
{ ok: true }
```

hoặc

```ts
{ ok: true, replaced: true, newSessionId: string }
```

---

## Phase 6 — CLI handoff protocol

## 6.1. RPC mới từ hub sang CLI session
Transport hiện có RPC infra qua `rpcGateway` / `RpcHandlerManager`.

Thêm method mới, ví dụ:
- `clear-and-handoff`

Payload:

```ts
{
    newSessionId: string
}
```

Response:

```ts
{
    ok: true
}
```

hoặc error.

## 6.2. Trách nhiệm của CLI khi nhận `clear-and-handoff`
1. Thực hiện native clear trong agent runtime
2. Tạo `ApiSessionClient` mới bind tới `newSessionId`
3. Swap session transport sang client mới
4. Restart / continue remote flow trên new client
5. Keepalive, messages, metadata updates sau đó đi vào new session
6. Chỉ ack success sau khi rebind hoàn tất tối thiểu ở mức transport/session wrapper

## 6.3. Rebind strategy
Current blocker:
- `AgentSessionBase.client` là `readonly`
- `ApiSessionClient.sessionId` là `readonly`
- remote launcher giữ reference cũ xuyên suốt

### Chọn strategy: **launcher-local handoff with new client**
Không mutate low-level socket object tại chỗ.

Implementation direction:
- handoff ownership nằm ở **launcher của Claude/Codex**
- launcher tạo `ApiSessionClient` mới từ `newSessionId`
- rebuild `Session` / `CodexSession` wrapper nếu cần
- restart remote iteration bằng client mới
- shared `runLocalRemoteLoop` chỉ được sửa nếu implementation thực tế chứng minh launcher-local handoff không đủ

Lợi ích:
- ít mutation ẩn
- ít blast radius sang Gemini/Cursor/OpenCode
- cleanup socket cũ an toàn hơn

## 6.4. Claude behavior
Files:
- `cli/src/claude/claudeRemoteLauncher.ts`
- `cli/src/claude/claudeRemote.ts`
- `cli/src/claude/session.ts`

Khi nhận handoff request:
- trigger Claude native clear/reset
- suppress old-session completion chatter nếu cần
- sau clear hoàn tất, launcher/session wrapper rebind sang new client
- chỉ sau đó ack về hub

## 6.5. Codex behavior
Files:
- `cli/src/codex/codexRemoteLauncher.ts`
- `cli/src/codex/utils/appServerEventConverter.ts`
- `cli/src/codex/session.ts`

Khi nhận handoff request:
- gửi native `/clear` vào Codex app-server / appropriate control path
- chờ turn/thread clear complete đủ tin cậy
- launcher/session wrapper rebind sang new client
- chỉ sau đó ack về hub

---

## Phase 7 — `/compact` canonical boundary

## 7.1. Chỉ emit compact marker khi compact complete
### Claude
Có thể hook tại point sau khi compact result/completion thật sự xong.
Không emit marker lúc chỉ mới detect `/compact` request.

### Codex
Handle canonical completion từ app-server converter:
- `thread/compacted`
- và/hoặc wrapped event `context_compacted`

Chỉ một nơi map sang normalized completion event.

## 7.2. Persist compact marker qua existing event path
Không invent message content format mới nếu không cần.

Tận dụng existing web path đã support event compact:
- `web/src/chat/normalizeAgent.ts`
- `web/src/chat/presentation.ts`

Canonical payload trong scope này:

```ts
{
    type: 'system',
    subtype: 'compact_boundary',
    compactMetadata?: {
        trigger: 'manual',
        preTokens?: number
    }
}
```

Không dùng payload mơ hồ kiểu chỉ `{ type: 'compact' }` nếu web normalizer chưa support trực tiếp.

## 7.3. Fold messages trước boundary
Web reducer/render layer thêm logic:
- tìm latest compact boundary block
- collapse blocks trước boundary by default
- button: `Show earlier messages`

---

## 8. Dependencies / Prerequisites

- Có active remote Codex session để verify slash commands + handoff
- Có active remote Claude session để verify compact + clear parity
- Hub + Web đang chạy đồng thời từ repo root
- Có thể gọi targeted tests cho `cli`, `hub`, `web`
- Người implement hiểu distinction giữa `/new` và `/clear replacement`

---

## 9. Execution Boundary

### ✅ Allowed
- `cli/src/modules/common/slashCommands.ts`
- `cli/src/api/apiSession.ts`
- `cli/src/agent/sessionBase.ts`
- `cli/src/claude/claudeRemote.ts`
- `cli/src/claude/claudeRemoteLauncher.ts`
- `cli/src/claude/session.ts`
- `cli/src/codex/codexRemoteLauncher.ts`
- `cli/src/codex/session.ts`
- `cli/src/codex/utils/appServerEventConverter.ts`
- `hub/src/web/routes/messages.ts`
- `hub/src/sync/syncEngine.ts`
- `hub/src/sync/sessionCache.ts`
- `hub/src/store/sessions.ts`
- `hub/src/store/sessionStore.ts`
- `hub/src/sync/rpcGateway.ts`
- `hub/src/sse/sseManager.ts`
- `hub/src/socket/handlers/cli/*`
- `shared/src/schemas.ts`
- `web/src/App.tsx`
- `web/src/router.tsx`
- `web/src/api/client.ts`
- `web/src/lib/codexSlashCommands.ts`
- `web/src/hooks/queries/useSlashCommands.ts`
- `web/src/hooks/useSSE.ts`
- `web/src/hooks/mutations/useSendMessage.ts`
- `web/src/components/SessionChat.tsx`
- `web/src/chat/*`
- `web/src/lib/message-window-store.ts`

### 🚫 Do not modify
- `cli/src/claude/sdk/*`
- `cli/src/codex/codexAppServerClient.ts`
- `cli/src/cursor/*`
- shared loop contract outside Codex/Claude path unless launcher-local handoff proves insufficient
- DB delete-message semantics

---

## 10. Pre-flight Check

- [ ] Confirm current branch sạch hoặc change scope đã được isolate
- [ ] Confirm plan version = 2.1
- [ ] Confirm `/api/sessions/:id/slash-commands` đang hoạt động
- [ ] Confirm SSE connected trong web app
- [ ] Confirm ít nhất 1 session Codex remote đang active để test handoff
- [ ] Confirm ít nhất 1 session Claude remote đang active để test parity

---

## 11. Implementation Order

| Order | File / Area | Depends On | AC(s) |
|------|-------------|------------|-------|
| 1 | CLI Codex builtin commands + web fallback list | none | AC-1.1, AC-1.2, AC-1.4 |
| 2 | `useSlashCommands` merge logic | 1 | AC-1.3, AC-1.4 |
| 3 | shared schema: `session-replaced` + metadata lineage | none | AC-2.5, AC-2.7, AC-2.9 |
| 4 | hub store/session replacement primitives | 3 | AC-2.2, AC-2.5 |
| 5 | hub `/clear` intercept + response contract | 4 | AC-2.1, AC-2.6 |
| 6 | web `/clear` non-optimistic send + redirect | 5 | AC-2.1b, AC-2.7 |
| 7 | CLI `clear-and-handoff` RPC + launcher-local handoff | 4, 5 | AC-2.3, AC-2.4 |
| 8 | old session archive + secondary SSE sync | 6, 7 | AC-2.5, AC-2.7, AC-2.9 |
| 9 | compact canonical completion mapping | none | AC-3.1, AC-3.3 |
| 10 | compact marker persist + fold UI | 9 | AC-3.2, AC-3.4 |

---

## 12. Risk Matrix

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| New session created but CLI fails to handoff | Medium | High | create new session first, archive old only after ack/success |
| Old socket keeps sending into old session | Medium | High | restart remote flow with new `ApiSessionClient`; do not mutate in place silently |
| Web misses `session-replaced` while viewing old session | Medium | High | redirect via HTTP response first; SSE only syncs caches |
| Optimistic `/clear` still appears in old timeline | High | Medium | bypass optimistic append for exact `/clear` |
| Shared loop change regresses other agents | Medium | High | prefer launcher-local handoff; do not widen shared contract early |
| Codex clear completion signal unreliable | Medium | Medium | support both `thread/compacted` and wrapped `context_compacted`; test with logs |
| Web redirects before new session active | Low | Medium | emit `session-replaced` only after new session observable/active |
| Duplicate compact markers | Medium | Low | canonical completion-only emission |
| Replacement session accidentally dedupes to old session | Low | High | do not use `getOrCreateSession(tag)` for replacement creation |
| Double-submit `/clear` creates duplicate replacements | Medium | Medium | reject or serialize `/clear` while handoff in flight |

---

## 13. Test Plan

### Slash Commands
- [ ] Codex session → `/` shows 6 commands
- [ ] Claude session autocomplete unchanged
- [ ] API fail → fallback builtin list still works
- [ ] `/review` và `/diff` không bị block trên web
- [ ] Targeted tests:
  - `cd cli && bun test src/modules/common/slashCommands.test.ts`
  - `cd web && bun test src/lib/codexSlashCommands.test.ts`

### `/clear` session replacement
- [ ] Web gửi exact `/clear` → route không persist raw message
- [ ] Web không append optimistic `/clear` vào old session
- [ ] Hub tạo new session id khác old session id
- [ ] CLI nhận RPC `clear-and-handoff`
- [ ] Sau handoff, keepalive/messages mới đi vào new session
- [ ] Old session inactive/archived + metadata có `successorSessionId`
- [ ] New session metadata có `predecessorSessionId`
- [ ] API trả `{ replaced: true, newSessionId }`
- [ ] SSE gửi `session-replaced`
- [ ] Web redirect sang new session
- [ ] Reload browser vẫn thấy old session history và new session trống/sạch
- [ ] Targeted tests:
  - `cd hub && bun test src/web/routes/sessions.test.ts`
  - thêm tests mới cho `messages.ts`, `useSendMessage.ts`, `useSSE.ts`, `sseManager.ts`, `sessionCache.ts`

### `/compact`
- [ ] Claude compact hoàn tất → đúng 1 compact marker
- [ ] Codex compact hoàn tất → đúng 1 compact marker
- [ ] Marker hiển thị trong chat timeline
- [ ] Messages trước marker collapsed by default
- [ ] Click expand → hiện lại đầy đủ
- [ ] Targeted tests:
  - `cd cli && bun test src/codex/utils/appServerEventConverter.test.ts`
  - thêm tests mới cho `web/src/chat/normalizeAgent.ts` / reducer path

---

## 14. Open Questions / cần verify khi implement

1. Claude native clear có signal completion ổn định nào ngoài current local completion event không?
2. Codex native clear có nên đi qua normal `startTurn('/clear')` hay control path riêng?
3. Session mới có nên clone `summary` / `name` hay reset title hoàn toàn?
4. Có cần preserve `worktree` + `machineId` đầy đủ trong replacement session không? (current answer: có)
5. Nếu handoff fail giữa chừng, có nên auto-delete replacement session hay giữ lại inactive để debug?
6. Nếu later muốn hỗ trợ `/clear` cho Gemini/OpenCode thì có nên tái sử dụng replacement-session contract này hay design riêng?

---

## 15. Files hiện trạng quan trọng đã verify

- Raw web send path persist quá sớm: `hub/src/web/routes/messages.ts`, `hub/src/sync/messageService.ts`
- Session sync event model hiện chưa có replace event: `shared/src/schemas.ts`
- Session creation hiện dedupe theo tag: `hub/src/store/sessions.ts:getOrCreateSession`
- CLI session transport bind cứng theo session id: `cli/src/api/apiSession.ts`
- Agent session wrapper giữ `client` readonly: `cli/src/agent/sessionBase.ts`
- Web hiện đã có event presentation cho compact: `web/src/chat/normalizeAgent.ts`, `web/src/chat/presentation.ts`
- Web hiện append optimistic message trước khi API trả về: `web/src/hooks/mutations/useSendMessage.ts`
- SSE hiện filter theo `sessionId` cho session-scoped subscription: `hub/src/sse/sseManager.ts`
- App hiện chưa có redirect logic cho `session-replaced`: `web/src/App.tsx`

---

## 16. Final scope statement

Plan này **không còn coi `/clear` là simple event sync**.

Plan này coi `/clear` là **session lifecycle transition** gồm:
- hub interception
- replacement session creation
- HTTP-first redirect contract
- CLI handoff RPC
- transport rebind sang new session
- old session archive + lineage metadata
- SSE secondary sync

Đó là mức thay đổi tối thiểu để đạt đúng yêu cầu: **“new HAPI session thực sự”** mà vẫn giữ old session làm audit trail before-clear.
