---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
inputDocuments:
  - docs/superpowers/plans/2026-07-02-session-scoped-terminal-lifecycle.md
  - _bmad-output/planning-artifacts/prd-session-scoped-terminal-lifecycle.md
  - _bmad-output/planning-artifacts/architecture-session-scoped-terminal-lifecycle.md
---

# hapi - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for hapi, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: Modal terminal và editor terminal phải dùng chung danh sách session terminal.
FR2: Terminal phải sống theo session, không theo browser/modal/component.
FR3: Đóng browser/tab/modal/route/editor tab chỉ detach, không kill process.
FR4: User explicit close một terminal mới kill đúng terminal đó.
FR5: Archive session phải kill toàn bộ terminal của session qua internal path.
FR6: Web/browser không được gọi `close-all`.
FR7: Mỗi session tối đa 3 live terminals.
FR8: CLI `TerminalManager` là source of truth cho list, limit, timer, replay, cleanup.
FR9: Hub chỉ làm authenticated Socket.IO routing/control plane.
FR10: Scope room phải theo exact scope `terminal:session:${sessionId}` hoặc `terminal:machine:${machineId}`.
FR11: Session A không được nhận output/list/warning/close của Session B.
FR12: Machine/project terminals giữ legacy behavior trong wave này.
FR13: CLI crash/restart không được giả terminal cũ còn sống; UI phải hiển thị `lost` hoặc recovery state.
FR14: Reconnect phải nhận bounded output replay đúng terminal, không cross-session.
FR15: Idle warning sau 2h không input/output.
FR16: Idle kill sau 4h không input/output.
FR17: Hard kill sau 24h tổng vòng đời; keepalive không reset hard lifetime.
FR18: UI phải hiển thị warning, close reason, lost/closed CTA, count `n/3`.

### NonFunctional Requirements

NFR1: Không persist raw terminal output ngoài CLI memory.
NFR2: Không log raw output, typed input, command, env, token, cookie.
NFR3: Output replay buffer phải bounded ở `MAX_OUTPUT_BUFFER_CHARS = 200_000`.
NFR4: Cleanup phải clear buffer, timers, process refs.
NFR5: Process cleanup phải dùng SIGTERM rồi SIGKILL grace.
NFR6: Max-3 phải enforce atomic ở CLI; hub preflight chỉ advisory.
NFR7: Timer logic phải test được bằng fake clock hoặc injected clock.
NFR8: Auth/namespace check bắt buộc cho list/create/attach/close/keepalive.
NFR9: Scope routing không được dùng mutable global subscription gây leak.
NFR10: Protocol thay đổi yêu cầu hub + CLI + web cùng build.
NFR11: Rollback bằng revert branch; nếu leak process thì restart CLI hoặc archive session.
NFR12: Logs/metrics chỉ dùng metadata an toàn: namespace, sessionId, terminalId, reason, ageMs, idleMs, clientCount, liveCount.

### Additional Requirements

- Shared protocol in `shared/src/socket.ts` must define typed scope, terminal state, close reason, list/state/warning/keepalive/internal close-all payloads.
- Existing terminal event handling must avoid scattered mixed scope logic; use typed scope or one normalization helper.
- CLI `TerminalManager` must own real shell processes, state machine, max count, timers, bounded replay, and process-group cleanup.
- CLI session API must expose terminal list, keepalive, explicit close-one, and internal close-all handlers.
- Hub terminal handlers must authorize scope, subscribe exact rooms, forward terminal events, detach on disconnect only, and never expose close-all to web.
- Hub archive path must call internal close-all for archived session and reject new terminal create for archived sessions.
- Web hook must support list/create/close-one/keepalive and must not expose close-all.
- Web shared `SessionTerminalTabs` must be used by modal, editor session terminals, and legacy terminal route.
- Editor machine/project terminal behavior must remain legacy in this wave.
- Archive confirmation copy must warn that archiving stops all running session terminals.
- Locales must add idle/age warning, max limit, close confirmation, keepalive, closed/lost, and create-new strings.
- Focused and regression tests must cover shared, CLI, hub, web, and manual E2E scenarios.
- Lifecycle logs must use metadata only and never raw terminal data or secrets.

### UX Design Requirements

UX-DR1: Session terminal tabs must show shared terminal count `n/3` across modal and editor.
UX-DR2: Closing browser/modal/route must be explained as non-destructive with lifecycle hint text.
UX-DR3: Max 3 UX must disable plus at 3/3 and show clear copy telling user to close an old terminal.
UX-DR4: Explicit terminal close must show confirmation copy: stop process and close.
UX-DR5: Idle and age warnings must show visible banner and tab warning badge.
UX-DR6: Warning state from list must render after user returns, even if event happened while away.
UX-DR7: Closed/lost terminal state must remain visible long enough to show reason and CTA to create new terminal.
UX-DR8: Keep terminal action must be visible and must send keepalive without shell input.
UX-DR9: Archive confirmation must show destructive terminal impact and running count when known.
UX-DR10: Localized strings must exist for English, Vietnamese, and Chinese.

### FR Coverage Map


FR1: Epic 1 - Modal/editor dùng chung session terminal list.
FR2: Epic 1 - Terminal sống theo session thay vì browser/modal/component.
FR3: Epic 1 - Browser/modal/route/editor tab close chỉ detach.
FR4: Epic 1 - Explicit close-one kill đúng một terminal.
FR5: Epic 3 - Archive session kill toàn bộ session terminals.
FR6: Epic 3 - Web/browser không thể gọi close-all.
FR7: Epic 1 + Epic 4 - Max 3 behavior lõi + race hardening.
FR8: Epic 1 - CLI TerminalManager là source of truth.
FR9: Epic 1 + Epic 3 - Hub chỉ routing/control plane, archive dùng internal path.
FR10: Epic 1 + Epic 3 - Exact scope rooms cho session/machine.
FR11: Epic 3 + Epic 4 - No cross-session leak trong archive/routing/hardening.
FR12: Epic 1 + Epic 3 + Epic 4 - Machine/project terminals giữ legacy behavior.
FR13: Epic 4 - CLI crash/restart hiển thị lost/recovery state, không fake running.
FR14: Epic 1 + Epic 4 - Bounded replay đúng terminal, không cross-session.
FR15: Epic 2 - Idle warning sau 2h không input/output.
FR16: Epic 2 - Idle kill sau 4h không input/output.
FR17: Epic 2 - Hard kill sau 24h, keepalive không reset hard lifetime.
FR18: Epic 1 + Epic 2 + Epic 4 - Count/warning/closed/lost UX.

### NFR Coverage Map

NFR1: Stories 1.2, 4.3 - Không persist raw terminal output ngoài CLI memory.
NFR2: Stories 2.2, 4.3 - Không log raw output, typed input, command, env, token, cookie.
NFR3: Stories 1.2, 4.3 - Output replay buffer bounded ở `MAX_OUTPUT_BUFFER_CHARS = 200_000`.
NFR4: Stories 2.2, 4.3 - Cleanup clear buffer, timers, process refs.
NFR5: Story 2.2 - Process cleanup SIGTERM rồi SIGKILL grace.
NFR6: Stories 1.2, 4.2 - Max-3 enforce atomic ở CLI; hub preflight advisory.
NFR7: Stories 2.1, 2.2 - Timer logic test bằng fake clock hoặc injected clock.
NFR8: Stories 1.3, 4.2 - Auth/namespace check cho list/create/attach/close/keepalive.
NFR9: Stories 1.3, 4.2 - Scope routing không dùng mutable global subscription.
NFR10: Story 4.4 - Hub + CLI + web deploy cùng build vì protocol đổi.
NFR11: Story 4.4 - Rollback bằng revert branch; nếu leak process thì restart CLI hoặc archive session.
NFR12: Stories 2.2, 4.3 - Logs/metrics chỉ dùng metadata an toàn.

### UX-DR Coverage Map

UX-DR1: Story 1.4 - Shared count `n/3` across modal/editor.
UX-DR2: Story 1.4 - Lifecycle hint: closing UI does not stop terminal.
UX-DR3: Story 1.4 - Max 3 UX disabled plus + copy.
UX-DR4: Story 1.4 - Explicit close confirmation copy.
UX-DR5: Story 2.3 - Idle/age warning banner and badge.
UX-DR6: Story 2.3 - Warning from list renders after user returns.
UX-DR7: Stories 2.3, 4.1 - Closed/lost reason and CTA.
UX-DR8: Story 2.3 - Keep terminal action sends keepalive.
UX-DR9: Story 3.3 - Archive confirm terminal-impact copy and count.
UX-DR10: Stories 2.3, 3.3 - Localized terminal lifecycle strings in en/vi/zh.

## Epic List

### Epic 1: Terminal session dùng chung, detach an toàn
User có thể mở terminal từ agent modal, editor, hoặc session terminal route và thấy cùng danh sách terminal theo session. Đóng browser/modal/route chỉ detach, không kill process. User explicit close mới dừng đúng một terminal. Max 3/session được enforce ở CLI, hub/web chỉ phản ánh state.
**FRs covered:** FR1, FR2, FR3, FR4, FR7, FR8, FR9, FR10, FR12, FR14, FR18

### Epic 2: Tự bảo vệ tài nguyên terminal theo idle/age
User thấy idle/age warning, có thể keep terminal khi còn cần, và hệ thống tự dọn terminal theo 4h idle hoặc 24h hard lifetime mà không leak process hay secret.
**FRs covered:** FR15, FR16, FR17, FR18

### Epic 3: Archive session dọn terminal qua internal path
Khi archive session, toàn bộ session terminals bị dừng qua internal hub→CLI cleanup path. Web/browser không thể gọi close-all, archive UI cảnh báo tác động destructive, và archived session không tạo terminal mới.
**FRs covered:** FR5, FR6, FR9, FR10, FR11, FR12

### Epic 4: Phục hồi niềm tin vận hành và hardening trước khi dev/ship
User không bị lừa rằng terminal cũ còn sống sau CLI crash/restart; operator có release gates rõ để khóa rủi ro race, scope leak, replay memory, logging secret, process cleanup, và machine/project terminal regression trước khi sẵn sàng dev/ship. Đây là release-readiness epic, không mở rộng scope feature mới.
**FRs covered:** FR7, FR11, FR12, FR13, FR14, FR18



## Epic 1: Terminal session dùng chung, detach an toàn

User có thể mở terminal từ agent modal, editor, hoặc session terminal route và thấy cùng danh sách terminal theo session. Đóng browser/modal/route chỉ detach, không kill process. User explicit close mới dừng đúng một terminal. Max 3/session được enforce ở CLI, hub/web chỉ phản ánh state.

### Story 1.1: Contract và state model cho session terminal

As a HAPI developer,
I want terminal lifecycle contract chuẩn hóa trong shared protocol,
So that CLI, hub, web dùng cùng state model và không hiểu sai detach/close/archive.

**Acceptance Criteria:**

**Given** shared socket contract hiện có
**When** thêm terminal typed scope
**Then** có schema/type cho session và machine scope
**And** scope dùng `scopeType: 'session' | 'machine'`.

**Given** session terminal lifecycle đã chốt
**When** thêm state và close reason
**Then** hỗ trợ đủ states: `running`, `detached`, `warning_idle`, `warning_age`, `closed_idle`, `closed_age`, `closed_user`, `closed_archive`, `exited`, `lost`
**And** hỗ trợ đủ close reasons: `user_close`, `idle_timeout`, `hard_timeout`, `archive`, `process_exit`, `cli_lost`, `spawn_error`.

**Given** CLI là source of truth
**When** terminal list payload được emit
**Then** payload chứa metadata cần cho UI: terminal id, label, cwd, cols/rows, status, close reason, created/last activity/idle warning/hard expiry
**And** không chứa raw output hoặc output buffer.

**Given** web cần keepalive và warning
**When** contract được cập nhật
**Then** có schema/type cho `terminal:list`, `terminal:warning`, `terminal:keepalive`.

**Given** archive cleanup là destructive path
**When** contract thêm `terminal:close-all`
**Then** payload chỉ cho `scopeType: 'session'`
**And** comment/documentation ghi rõ internal hub→CLI only, web handlers không được accept.

**Given** legacy event payload còn dùng `{ sessionId } | { machineId }`
**When** migration contract được thiết kế
**Then** hoặc migrate sang typed scope trong story này
**Or** tạo một normalization helper duy nhất
**And** không để mixed scope logic rải rác nhiều file.

**Given** schema tests chạy bằng Bun/Vitest
**When** chạy `bun test shared/src/socket.test.ts`
**Then** tests pass cho list payload, warning payload, close-all session-only
**And** test fail nếu close-all dùng machine scope.

**Definition of Done:**

- `shared/src/socket.ts` có đầy đủ schema/type mới.
- `shared/src/socket.test.ts` có schema coverage.
- Không raw terminal output trong list/state schema.
- Internal-only close-all được ghi rõ trong code comment.
- Test command được ghi lại trong dev evidence.

**Dependencies:** none.

**Verification:**

- `bun test shared/src/socket.test.ts`
- Optional: `bun run typecheck` nếu shared export ảnh hưởng package khác.

### Story 1.2: CLI TerminalManager quản lý session terminal list và max 3

As a HAPI user,
I want session terminal process được giữ bởi CLI thay vì UI,
So that terminal còn sống khi tôi đóng modal/browser và không vượt quá giới hạn an toàn.

**Acceptance Criteria:**

**Given** session terminal được tạo từ web
**When** CLI `TerminalManager` nhận create request
**Then** terminal được lưu trong manager với metadata: id, label, cwd, cols/rows, status, timestamps, close reason
**And** manager list trả về metadata không chứa raw output.

**Given** user đóng modal/browser/route
**When** CLI nhận detach cho session terminal
**Then** terminal chuyển sang `detached` hoặc giữ live state phù hợp
**And** process không bị kill
**And** legacy 5-minute detached cleanup không áp dụng cho session terminals.

**Given** user explicit close một terminal
**When** CLI nhận close-one với terminal id
**Then** chỉ terminal đó bị cleanup
**And** close reason là `user_close` / state `closed_user`
**And** slot được giải phóng.

**Given** session đã có 3 live terminals
**When** request tạo terminal thứ 4 tới CLI, kể cả hub không preflight
**Then** CLI reject với stable error code/message
**And** không spawn process thứ 4.

**Given** nhiều browser/tab tạo terminal cùng lúc
**When** 4+ create requests đến gần đồng thời
**Then** CLI atomic check-and-create đảm bảo tối đa 3 live terminals/session
**And** test xác nhận spawn chỉ gọi tối đa 3 lần.

**Given** terminal output phát sinh
**When** output được buffer cho replay
**Then** buffer bounded theo `MAX_OUTPUT_BUFFER_CHARS = 200_000`
**And** truncation marker tồn tại khi buffer bị cắt
**And** buffer bị clear khi terminal close.

**Given** browser reconnect vào cùng terminal
**When** web attach/list lại terminal đó
**Then** CLI có thể replay bounded output đúng terminal
**And** không replay output của terminal/session khác.

**Given** machine/project terminal path hiện có
**When** session lifecycle logic được thêm
**Then** behavior legacy của machine/project terminal không bị đổi trong story này.

**Definition of Done:**

- `cli/src/terminal/TerminalManager.ts` owns session terminal metadata/list.
- Max 3 live terminals/session enforce ở CLI.
- Detach session terminal không kill process.
- Close-one idempotent, chỉ kill một terminal.
- Output replay bounded, không expose trong list.
- Machine/project legacy behavior không đổi.
- Tests cover detach, close-one, max 3, concurrent create, list no output, bounded replay.

**Dependencies:** Story 1.1.

**Verification:**

- `bun test cli/src/terminal/TerminalManager.test.ts`
- Focus test cases: detach no kill, max 3, concurrent create, list no output, replay bound.
- Optional: `bun run typecheck` nếu TerminalManager types thay đổi.

### Story 1.3: Hub routing/auth qua exact scope rooms

As a HAPI user,
I want terminal events chỉ đi tới đúng session/machine của tôi,
So that terminal output/state không bị leak sang session khác và hub không tự quyết lifecycle.

**Acceptance Criteria:**

**Given** web socket muốn xem terminal của một session
**When** web gửi subscribe/list/create/attach/close-one/keepalive
**Then** hub xác thực namespace và quyền với target session
**And** reject/ignore request nếu socket không sở hữu session/machine scope đó.

**Given** web subscribe session terminal
**When** scope hợp lệ
**Then** socket join đúng room `terminal:session:${sessionId}`
**And** machine scope dùng room `terminal:machine:${machineId}`
**And** không dùng mutable global scope subscription dễ bị overwrite/leak.

**Given** CLI emit `terminal:list`, `terminal:warning`, output, state, close event
**When** hub nhận payload typed scope
**Then** hub validate schema
**And** forward chỉ tới exact scope room tương ứng.

**Given** Session A và Session B cùng namespace hoặc khác namespace
**When** CLI emit terminal event cho Session A
**Then** web socket đang subscribe Session B không nhận event đó.

**Given** web disconnect, modal close, route change, browser close
**When** hub cleanup socket routing
**Then** hub detach attached client only
**And** không forward `terminal:close` destructive tới CLI.

**Given** web cố gửi `terminal:close-all`
**When** hub terminal namespace nhận event đó
**Then** không có handler web-callable nào gọi CLI close-all
**And** test chứng minh CLI không nhận `terminal:close-all`.

**Given** session đã có 3 live terminals theo hub registry/preflight
**When** web request create terminal thứ 4
**Then** hub có thể emit max-limit error sớm
**And** CLI vẫn là source of truth; hub preflight không được thay thế CLI enforcement.

**Given** machine/project terminal legacy behavior
**When** hub xử lý typed session terminal routing mới
**Then** machine/project terminal route vẫn dùng behavior hiện có hoặc scope machine riêng
**And** không bị đưa vào session terminal list/count.

**Definition of Done:**

- `hub/src/socket/handlers/terminal.ts` có subscribe/list/create/attach/close-one/keepalive với scope auth.
- `hub/src/socket/handlers/cli/terminalHandlers.ts` forward CLI events tới exact scope rooms.
- Không web-callable `terminal:close-all`.
- Disconnect/modal/browser close chỉ detach.
- Tests prove no cross-session/machine leak.
- Tests prove hub preflight advisory, CLI vẫn authoritative.

**Dependencies:** Story 1.1, Story 1.2.

**Verification:**

- `bun test hub/src/socket/handlers/terminal.test.ts hub/src/socket/handlers/cli/terminalHandlers.test.ts`
- Focus test cases: subscribe room, Session A/B isolation, no web close-all, detach no close, machine/session separation.

### Story 1.4: Shared React SessionTerminalTabs cho modal/editor/route

As a HAPI user,
I want cùng một session terminal UI ở modal, editor, và route,
So that tôi thấy cùng terminal list/count và không làm chết process khi đóng UI.

**Acceptance Criteria:**

**Given** user mở terminal modal trong session
**When** modal render
**Then** UI dùng `SessionTerminalTabs`
**And** hiển thị terminal list/count từ CLI-backed list.

**Given** user mở editor session terminal cho cùng session
**When** editor render
**Then** UI dùng cùng `SessionTerminalTabs`
**And** list/count khớp với modal.

**Given** user mở legacy session terminal route
**When** route render
**Then** route dùng `SessionTerminalTabs`
**And** không giữ path cleanup single-terminal cũ.

**Given** session terminal list rỗng khi user mở UI lần đầu
**When** component có đủ kích thước terminal để tạo process
**Then** UI tạo terminal đầu tiên qua CLI-backed create path
**And** terminal id/list vẫn ổn định khi browser reload và list lại từ CLI.

**Given** user đóng modal, đổi route, đóng tab browser, hoặc unmount component
**When** component cleanup chạy
**Then** hook chỉ disconnect/detach
**And** không gọi destructive close terminal.

**Given** user bấm close trên một terminal tab
**When** confirm “Stop process and close” được accept
**Then** UI gọi close-one cho đúng terminal id
**And** không close các terminal khác.

**Given** session có 0-3 terminal
**When** tabs render
**Then** UI hiển thị count `0/3`, `1/3`, `2/3`, `3/3`
**And** nút plus disabled ở `3/3` với copy rõ: đóng terminal cũ trước khi tạo mới.

**Given** list payload chứa terminal closed/lost state
**When** UI render
**Then** terminal không biến mất ngay lập tức
**And** hiển thị reason + CTA tạo terminal mới.

**Given** user không biết lifecycle mới
**When** session terminal UI render
**Then** có lifecycle hint: đóng cửa sổ không dừng terminal, terminal sống theo session và tự dừng theo giới hạn thời gian.

**Given** terminal output replay được nhận lại sau reconnect
**When** user reopen modal/editor
**Then** UI attach đúng terminal id
**And** hiển thị bounded replay đúng terminal.

**Given** machine/project terminal trong editor
**When** editor tab là machine scope
**Then** giữ legacy machine terminal UI/behavior
**And** không dùng session list/count.

**Definition of Done:**

- `web/src/components/Terminal/SessionTerminalTabs.tsx` được tạo.
- `web/src/hooks/useTerminalSocket.ts` expose list/create/close-one/keepalive/detach API, không expose close-all.
- `TerminalModal.tsx`, `EditorTerminal.tsx`, `routes/sessions/terminal.tsx` dùng shared tabs cho session terminals.
- `EditorLayout.tsx` không destructive close session terminals on pagehide.
- Max 3, close confirm, lifecycle hint, closed/lost CTA render đúng.
- Tests cover modal/editor/route integration and unmount detach-only.

**Dependencies:** Story 1.1, Story 1.2, Story 1.3.

**Verification:**

- `bun test web/src/components/Terminal/SessionTerminalTabs.test.tsx`
- `bun test web/src/components/modals/TerminalModal.test.tsx`
- `bun test web/src/components/editor/EditorTerminal.test.tsx web/src/components/editor/EditorLayout.test.tsx`
- `bun test web/src/routes/sessions/terminal.test.tsx`
- Manual: run `sleep 60`, close modal/browser, reopen, process remains alive.

### Story 1.5: Machine/project terminal legacy boundary

As a HAPI user,
I want session terminal lifecycle mới không làm đổi project/machine terminals,
So that feature mới an toàn và không phá luồng terminal cũ.

**Acceptance Criteria:**

**Given** machine/project terminal behavior hiện có
**When** session-scoped terminal lifecycle được thêm
**Then** machine/project terminals vẫn dùng lifecycle legacy trong wave này
**And** không bị đưa vào session terminal list/count.

**Given** editor có cả session tab và machine/project tab
**When** user đóng browser/pagehide/project switch
**Then** session terminal detach only
**And** machine/project terminal giữ cleanup behavior cũ theo rule hiện tại.

**Given** hub routing thêm typed session scope
**When** machine terminal events đi qua hub
**Then** events dùng machine scope hoặc legacy path tương thích
**And** không broadcast vào `terminal:session:${sessionId}` room.

**Given** CLI `TerminalManager` thêm session durable behavior
**When** machine terminal manager/path chạy
**Then** legacy detached cleanup, close behavior, và tests hiện có không bị regression.

**Given** web hook/shared tabs chỉ dùng cho session terminals
**When** editor render machine/project terminal
**Then** không render session count `n/3`
**And** không áp dụng session max 3/session vào machine/project terminal.

**Given** test suite hiện có cho machine/project terminals
**When** chạy regression tests
**Then** behavior cũ vẫn pass
**And** nếu test cũ cần đổi vì scope typing, đổi chỉ để phản ánh protocol wrapper, không đổi nghiệp vụ.

**Definition of Done:**

- Session/machine scope boundary rõ trong code.
- Machine/project terminal không nằm trong session list/count/archive cleanup.
- Pagehide/project switch behavior của machine/project terminal không bị đổi ngoài ý muốn.
- Regression tests cho editor/machine/hub/CLI terminal vẫn pass.
- Dev notes ghi rõ machine/project durability out of scope.

**Dependencies:** Story 1.1, Story 1.3, Story 1.4.

**Verification:**

- `bun test cli/src/api/apiMachine.test.ts`
- `bun test hub/src/socket/handlers/terminal.test.ts`
- `bun test web/src/components/editor/EditorTerminal.test.tsx web/src/components/editor/EditorLayout.test.tsx`
- Manual: open machine/project terminal, confirm existing close/cleanup behavior unchanged.

## Epic 2: Tự bảo vệ tài nguyên terminal theo idle/age

User thấy idle/age warning, có thể keep terminal khi còn cần, và hệ thống tự dọn terminal theo 4h idle hoặc 24h hard lifetime mà không leak process hay secret.

### Story 2.1: Idle/age timer policy trong CLI TerminalManager

As a HAPI user,
I want terminal cảnh báo trước khi bị dừng do idle hoặc quá tuổi,
So that tôi có cơ hội giữ terminal khi vẫn cần dùng.

**Acceptance Criteria:**

**Given** session terminal đang live
**When** terminal không có user input và không có output trong 2 giờ
**Then** CLI phát `terminal:warning` reason `idle`
**And** warning chỉ phát một lần cho chu kỳ idle hiện tại.

**Given** terminal đã phát idle warning
**When** user gửi input, terminal có output, hoặc user bấm keepalive
**Then** idle timer reset
**And** `idleWarningAt` được clear hoặc cập nhật theo chu kỳ mới.

**Given** socket heartbeat hoặc browser reconnect
**When** heartbeat/reconnect xảy ra
**Then** idle timer không reset.

**Given** terminal gần đạt 24h hard lifetime
**When** đến mốc age warning mặc định 30 phút trước hard expiry hoặc mốc test-configured
**Then** CLI phát `terminal:warning` reason `age`
**And** `closesAt` trỏ tới hard expiry
**And** threshold cấu hình được trong tests.

**Given** keepalive được gửi sau age warning
**When** CLI nhận `terminal:keepalive`
**Then** idle timer reset
**And** hard lifetime không reset.

**Given** tests timer chạy trong CI
**When** test idle/age warning
**Then** dùng fake clock hoặc injected `now()`
**And** không phụ thuộc sleep dài/flaky timeout.

**Definition of Done:**

- CLI `TerminalManager` có configurable idle warning, idle timeout, hard lifetime, age warning.
- Keepalive reset idle only.
- Heartbeat/reconnect không reset idle.
- Warning payload đúng typed scope.
- Fake-clock tests cover warning once, reset on activity, keepalive idle-only reset.

**Dependencies:** Story 1.1, Story 1.2.

**Verification:**

- `bun test cli/src/terminal/TerminalManager.test.ts`
- Focus: idle warning once, output/input reset, keepalive reset idle only, age warning, no heartbeat reset.

### Story 2.2: Idle kill 4h và hard kill 24h với process cleanup

As a HAPI operator,
I want idle/hard timeout luôn dọn sạch terminal process,
So that hệ thống không leak shell hoặc child process chạy ngầm.

**Acceptance Criteria:**

**Given** session terminal không có input/output trong 4 giờ
**When** idle timeout đến hạn
**Then** CLI cleanup terminal với reason `idle_timeout`
**And** state/close reason phản ánh `closed_idle`.

**Given** terminal đạt 24 giờ tổng vòng đời
**When** hard lifetime timeout đến hạn
**Then** CLI cleanup terminal với reason `hard_timeout`
**And** state/close reason phản ánh `closed_age` kể cả terminal đang có activity.

**Given** event loop bị pause hoặc machine sleep
**When** CLI hoạt động lại
**Then** periodic sweep so timestamp và enforce idle/hard timeout trên tick kế tiếp hoặc activity kế tiếp.

**Given** terminal process có child process
**When** cleanup chạy do idle/hard/user/archive
**Then** CLI gửi SIGTERM cho process group trước
**And** gửi SIGKILL sau grace timeout nếu process chưa thoát.

**Given** cleanup chạy
**When** terminal được đóng
**Then** timers, output buffer, attached refs, process refs được clear
**And** close operation idempotent.

**Given** process kill thất bại
**When** CLI log lifecycle event
**Then** log không chứa raw command/output/env/token
**And** chỉ chứa metadata an toàn.

**Definition of Done:**

- Idle kill 4h và hard kill 24h enforce bằng timer + sweep.
- Process group cleanup SIGTERM→SIGKILL có tests bằng fake subprocess.
- Cleanup idempotent và clear resources.
- No-secret lifecycle logging cho close/kill failure.
- Tests cover idle kill, hard kill despite activity, sweep after clock jump, SIGKILL fallback.

**Dependencies:** Story 2.1.

**Verification:**

- `bun test cli/src/terminal/TerminalManager.test.ts`
- Manual: command spawn child process, close/timeout, no child remains.

### Story 2.3: Idle/age warning UX và keep terminal action

As a HAPI user,
I want thấy cảnh báo idle/age rõ ràng trong terminal UI,
So that tôi biết terminal sắp dừng và có thể giữ lại nếu cần.

**Acceptance Criteria:**

**Given** CLI emit idle warning
**When** web nhận `terminal:warning`
**Then** active terminal hiển thị warning banner
**And** tab có badge cảnh báo.

**Given** warning đã xảy ra khi user vắng mặt
**When** user reopen modal/editor và nhận terminal list có warning state
**Then** UI vẫn hiển thị warning banner từ list state.

**Given** user bấm “Keep terminal”
**When** web gửi `terminal:keepalive`
**Then** UI không viết input vào shell
**And** warning UI được clear hoặc cập nhật theo server state kế tiếp.

**Given** terminal bị đóng do idle hoặc hard age
**When** user quay lại UI
**Then** UI hiển thị lý do đóng đúng copy
**And** có CTA tạo terminal mới.

**Given** UI strings cần đa ngôn ngữ
**When** thêm warning/limit/closed/keepalive copy
**Then** locales en, vi, zh có đầy đủ key.

**Definition of Done:**

- Warning banner và tab badge render từ event và list state.
- Keep terminal action gọi keepalive, không ghi shell input.
- Closed idle/age copy và CTA render đúng.
- Locales en/vi/zh đủ terminal lifecycle strings.
- Tests cover warning event, warning from list, keepalive action, closed idle/age state.

**Dependencies:** Story 1.4, Story 2.1, Story 2.2.

**Verification:**

- `bun test web/src/components/Terminal/SessionTerminalTabs.test.tsx`
- `bun run typecheck:web`
- Manual with test env timers: warning then keepalive then auto-close.

## Epic 3: Archive session dọn terminal qua internal path

Khi archive session, toàn bộ session terminals bị dừng qua internal hub→CLI cleanup path. Web/browser không thể gọi close-all, archive UI cảnh báo tác động destructive, và archived session không tạo terminal mới.

### Story 3.1: Internal close-all path từ hub tới CLI

As a HAPI operator,
I want archive cleanup có đường close-all nội bộ an toàn,
So that session terminals được dọn mà không mở API destructive cho web.

**Acceptance Criteria:**

**Given** hub cần dọn terminals của một session
**When** internal helper được gọi với namespace và sessionId
**Then** hub tìm đúng CLI socket thuộc namespace/session
**And** emit `terminal:close-all` typed payload tới CLI only.

**Given** web terminal namespace nhận event `terminal:close-all`
**When** browser cố gọi event này
**Then** không có handler web-callable forward tới CLI
**And** test xác nhận CLI không nhận event.

**Given** hub terminal registry có attached routing state
**When** close-all internal chạy
**Then** registry cleanup chỉ xóa attached routing cho session
**And** không coi registry là source of truth lifecycle.

**Given** CLI nhận internal close-all cho session
**When** payload valid
**Then** `TerminalManager.closeAll()` được gọi với reason `archive`
**And** list/state sau đó phản ánh terminals đã closed/cleared theo policy.

**Definition of Done:**

- Internal hub helper exists for close-all session terminals.
- Web cannot invoke close-all.
- CLI session API handles close-all internal payload only.
- Tests prove internal path works and web path blocked.

**Dependencies:** Story 1.1, Story 1.2, Story 1.3, Story 2.2.

**Verification:**

- `bun test hub/src/socket/handlers/terminal.test.ts hub/src/socket/handlers/cli/terminalHandlers.test.ts`
- `bun test cli/src/api/apiSession.test.ts`

### Story 3.2: Archive flow kills session terminals and rejects new create

As a HAPI user,
I want archiving a session to stop its terminals completely,
So that archived sessions do not leave running processes or accept new terminal work.

**Acceptance Criteria:**

**Given** session has running/detached/warning terminals
**When** user archives the session
**Then** hub calls internal close-all best-effort before or with `killSession`
**And** CLI closes all live session terminals with archive reason.

**Given** CLI is offline during archive
**When** archive completes
**Then** session is still archived
**And** future terminal list/create cannot show those terminals as running.

**Given** terminal create is in-flight while archive starts
**When** archive marks session inactive/archived
**Then** new terminal create is rejected
**And** no terminal remains live for archived session.

**Given** machine/project terminals exist
**When** a session is archived
**Then** machine/project terminals are not included in session archive cleanup unless legacy behavior already does so.

**Definition of Done:**

- `SyncEngine` or archive path has injected internal close-all dependency.
- Archive rejects new terminal create for archived sessions.
- Archive cleanup best-effort does not block archive completion forever.
- Tests cover CLI online, CLI offline, create/archive race, machine boundary.

**Dependencies:** Story 3.1.

**Verification:**

- `bun test hub/src/sync/syncEngine.test.ts`
- `bun test hub/src/socket/handlers/terminal.test.ts`
- Manual: archive session, all session terminal processes killed.

### Story 3.3: Archive confirmation copy shows terminal impact

As a HAPI user,
I want archive confirmation to warn me about running session terminals,
So that I do not accidentally stop long-running jobs.

**Acceptance Criteria:**

**Given** session has known terminal count greater than 0
**When** archive confirm opens
**Then** copy says archive will stop all running terminals in this session
**And** shows `Terminal đang chạy: n/3`.

**Given** terminal count is 0 or unknown
**When** archive confirm opens
**Then** UI does not show misleading running-terminal count
**And** base archive warning still appears.

**Given** user confirms archive
**When** archive request completes
**Then** terminal UI receives closed/archive state or list clears according to server state
**And** no web close-all event is used.

**Definition of Done:**

- Archive confirmation copy updated in all archive entry points.
- Terminal count included when available.
- Archive terminal-impact copy localized in en/vi/zh.
- Tests cover count >0, count 0/unknown, no web close-all.

**Dependencies:** Story 1.4, Story 3.2.

**Verification:**

- `bun test web/src/components/SessionHeader.test.tsx web/src/components/SessionList.test.tsx`
- Include dashboard archive tests if dashboard has separate confirm path.

## Epic 4: Phục hồi niềm tin vận hành và hardening trước khi dev/ship

User không bị lừa rằng terminal cũ còn sống sau CLI crash/restart; operator có release gates rõ để khóa rủi ro race, scope leak, replay memory, logging secret, process cleanup, và machine/project terminal regression trước khi sẵn sàng dev/ship. Đây là release-readiness epic, không mở rộng scope feature mới.

### Story 4.1: CLI crash/restart lost state và recovery UX

As a HAPI user,
I want terminal cũ được đánh dấu lost khi CLI crash/restart,
So that UI không nói dối rằng process vẫn đang chạy.

**Acceptance Criteria:**

**Given** CLI-owned terminal existed before CLI disconnect/restart
**When** web reconnects or requests list after CLI restart
**Then** UI does not show it as running
**And** if prior terminal metadata exists in hub/session cache, UI must show `lost` with CLI restart/disconnect reason
**And** if terminal-level metadata is unavailable, UI must show a session-level recovery banner: CLI restarted; previous terminals may be lost.

**Given** terminal is lost
**When** user views terminal tab/state
**Then** UI shows reason: CLI disconnected/restarted
**And** CTA lets user create a new terminal.

**Given** CLI startup has no live subprocess registry
**When** terminal list is requested
**Then** CLI must not pretend old terminals still exist.

**Given** hub/session cache has stale attached routing
**When** CLI disconnect/reconnect happens
**Then** stale routing is cleared or ignored
**And** no output/list events route to old fake terminal.

**Definition of Done:**

- CLI restart/lost policy represented in state/UI.
- Stale terminal routing cleared or ignored safely.
- Tests cover CLI disconnect/reconnect and lost/session-level recovery UX.

**Dependencies:** Story 1.2, Story 1.3, Story 1.4.

**Verification:**

- `bun test cli/src/api/apiSession.test.ts hub/src/socket/handlers/terminal.test.ts`
- `bun test web/src/components/Terminal/SessionTerminalTabs.test.tsx`
- Manual: restart CLI, old terminals show `lost` or session-level recovery banner, not running.

### Story 4.2: Race, scope leak, and auth hardening gates

As a HAPI operator,
I want terminal lifecycle protected against races and scope leaks,
So that concurrent users/tabs cannot exceed limits or see each other’s terminal data.

**Acceptance Criteria:**

**Given** 4+ create requests arrive from 2 sockets for same session
**When** requests race
**Then** at most 3 live terminals exist
**And** all rejected creates have stable max-limit error.

**Given** a socket owns Session A but requests Session B terminal data
**When** request reaches hub
**Then** hub rejects/ignores it before forwarding to CLI.

**Given** machine and session terminal rooms both exist
**When** session terminal output/list/warning emits
**Then** machine room does not receive it
**And** other session rooms do not receive it.

**Given** browser sends malformed scope or mixed legacy payload
**When** hub/CLI parses it
**Then** invalid payload is rejected safely
**And** no fallback broadcasts broadly.

**Given** terminal close is called twice from multiple tabs
**When** close-one races
**Then** cleanup is idempotent
**And** no unrelated terminal is killed.

**Definition of Done:**

- Race tests for max 3 at CLI and hub path.
- Scope/auth negative tests for session/machine separation.
- Malformed payload tests.
- Idempotent close tests.

**Dependencies:** Story 1.1, Story 1.2, Story 1.3.

**Verification:**

- `bun test cli/src/terminal/TerminalManager.test.ts`
- `bun test hub/src/socket/handlers/terminal.test.ts hub/src/socket/handlers/cli/terminalHandlers.test.ts`

### Story 4.3: Replay memory and no-secret logging hardening

As a HAPI operator,
I want terminal replay and lifecycle logs bounded and secret-safe,
So that long-lived terminals do not leak sensitive data or grow memory unbounded.

**Acceptance Criteria:**

**Given** terminal outputs more than replay buffer limit
**When** replay buffer exceeds `MAX_OUTPUT_BUFFER_CHARS = 200_000`
**Then** older output is truncated
**And** replay includes a truncation marker.

**Given** terminal list/state/warning payloads are emitted
**When** payloads are inspected
**Then** they contain no raw output, typed input, command lines, env vars, tokens, cookies, or provider keys.

**Given** lifecycle logs emit create/detach/close/warning/kill/lost events
**When** logs are inspected in tests or snapshots
**Then** allowed fields are limited to metadata: namespace, sessionId, terminalId, reason, ageMs, idleMs, clientCount, liveCount
**And** raw terminal data is absent.

**Given** terminal closes by user/idle/hard/archive/process exit/lost
**When** cleanup completes
**Then** replay buffer is cleared
**And** no raw output remains reachable through manager list/state.

**Definition of Done:**

- Replay memory bound enforced and tested.
- Terminal list/state/warning payloads secret-safe.
- Lifecycle logging helper or conventions exclude raw terminal data.
- Cleanup clears output buffers.

**Dependencies:** Story 1.2, Story 2.2.

**Verification:**

- `bun test cli/src/terminal/TerminalManager.test.ts`
- `bun test shared/src/socket.test.ts`
- Optional grep/manual log inspection for forbidden fields.

### Story 4.4: Backward compatibility boundary and regression sweep

As a HAPI maintainer,
I want final regression gates for old terminal behavior and full lifecycle,
So that development can start with clear DoD and no hidden migration breakage.

**Acceptance Criteria:**

**Given** old terminal payloads or routes exist
**When** session terminal protocol changes land
**Then** migration path is explicit: either typed scope everywhere or one normalization helper
**And** no scattered mixed scope handling remains.

**Given** machine/project terminals keep legacy behavior this wave
**When** focused regression tests run
**Then** machine/project terminal tests pass without behavior change.

**Given** all feature stories are done
**When** focused test sweep runs
**Then** shared, CLI, hub, web focused tests pass.

**Given** focused tests pass
**When** repo-wide checks run
**Then** `bun run typecheck` passes
**And** `bun run test` passes or pre-existing unrelated failures are documented with exact output.

**Given** manual E2E is required
**When** tester runs browser scenarios
**Then** checklist covers modal/editor shared list, `sleep 60` detach survival, explicit close, archive cleanup, concurrent create, scope isolation, CLI restart lost state, child process cleanup, and short test timers.

**Readiness Checklist:**

- [ ] Decisions covered: shared modal/editor source, session lifecycle, detach no kill, archive kills, max 3, idle/age timers, close-all internal only, CLI source of truth, hub routing only, shared SessionTerminalTabs, machine/project legacy.
- [ ] FR/NFR/UX-DR coverage maps complete.
- [ ] Focused test commands listed by package.
- [ ] Full `bun run typecheck` and `bun run test` result captured, or unrelated failures documented with exact output.
- [ ] Manual E2E checklist completed or marked not run with explicit risk.
- [ ] Rollback notes captured: revert branch, restart CLI/archive if leaked processes, deploy hub+CLI+web same build.

**Definition of Done:**

- Migration/backward compatibility notes captured.
- Focused test suite commands documented.
- Full typecheck/test result captured.
- Manual E2E checklist completed or explicitly marked not run with risk.
- Release-readiness checklist completed before dev handoff.

**Dependencies:** Stories 1.1-4.3.

**Verification:**

- Focused test suite from plan.
- `bun run typecheck`
- `bun run test`
- Manual browser/E2E checklist with test timer env.
