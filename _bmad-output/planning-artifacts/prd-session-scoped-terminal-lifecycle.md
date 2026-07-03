---
title: PRD ngắn - Session-scoped terminal lifecycle
status: input-minimal
date: 2026-07-02
source:
  - docs/superpowers/plans/2026-07-02-session-scoped-terminal-lifecycle.md
---

# PRD ngắn - Session-scoped terminal lifecycle

## 1. Mục tiêu

Làm cho session terminals trong HAPI dùng chung giữa agent modal và editor mode, sống theo session thay vì sống theo browser/modal/component, và chỉ dừng khi user đóng terminal rõ ràng, session bị archive, idle timeout, hoặc hard lifetime timeout.

## 2. Phạm vi

Trong scope:
- Session-scoped terminals cho agent modal, editor session terminal, legacy session terminal route.
- Shared terminal tabs UI.
- Terminal list/count/warning/closed/lost UX.
- Archive session dừng toàn bộ session terminals.
- Idle warning, idle kill, hard kill.
- Auth/scope routing giữa web, hub, CLI.

Ngoài scope trong wave này:
- Thay đổi durability cho machine/project terminals.
- Persist terminal process qua CLI crash/restart.
- Expose close-all cho web API.

## 3. Functional Requirements

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

## 4. Non-Functional Requirements

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

## 5. Acceptance Criteria nguồn

- AC-SHARED-001: Agent modal và editor session terminal view show same session terminal list/count.
- AC-DETACH-001: Browser close/reload/route change/modal close/editor tab switch detach only; no `terminal:close` reaches CLI.
- AC-CLOSE-001: User close kills exactly one terminal after confirm and frees one slot.
- AC-RACE-001: 4+ concurrent create requests across 2 sockets produce at most 3 live terminals/session.
- AC-SCOPE-001: Session A never receives Session B terminal events.
- AC-SCOPE-002: Machine/project terminals keep current behavior.
- AC-SEC-001: Browser/web socket cannot invoke close-all.
- AC-TIMER-001: Fake clock proves 2h warning, 4h idle kill, 24h hard kill, keepalive idle-only reset.
- AC-REPLAY-001: Reconnect gets bounded replay for same terminal only.
- AC-ARCHIVE-001: Archive closes all session terminals via internal path and rejects new create.
- AC-LOST-001: CLI crash/restart marks prior session terminals lost, not running.
- AC-OPS-001: Process cleanup kills shell and child process group with SIGTERM→SIGKILL.
- AC-UX-001: Warnings/closed/lost states visible with CTA.
- AC-MANUAL-001: `sleep 60` survives modal/browser close until explicit close/archive/timeout.
