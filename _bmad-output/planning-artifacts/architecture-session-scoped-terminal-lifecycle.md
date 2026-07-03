---
title: Architecture ngắn - Session-scoped terminal lifecycle
status: input-minimal
date: 2026-07-02
source:
  - docs/superpowers/plans/2026-07-02-session-scoped-terminal-lifecycle.md
---

# Architecture ngắn - Session-scoped terminal lifecycle

## 1. Quyết định kiến trúc chính

CLI-side `TerminalManager` là source of truth cho session terminal lifecycle. React chỉ attach/detach view. Hub chỉ routing/control plane qua authenticated Socket.IO và scope rooms.

## 2. Luồng hệ thống

Web modal/editor/route → Hub terminal namespace → CLI session socket → CLI `TerminalManager` → shell process.

CLI lifecycle/state/warning/output → Hub CLI handlers → exact scope room → Web subscribers.

Archive session → Hub internal cleanup helper → CLI `terminal:close-all` internal → `TerminalManager.closeAll()` → process group cleanup.

## 3. Lifecycle contract

- `detach`: UI socket/view đi mất, không kill process.
- `close-one`: user explicit close một terminal, có confirm, kill một process.
- `close-all-internal`: chỉ archive path hub→CLI, không expose web API.
- Live states count toward max 3: `running`, `detached`, `warning_idle`, `warning_age`.
- Closed/lost/exited không count sau cleanup.
- Idle = không có input và không có output; heartbeat không reset idle.
- `terminal:keepalive` reset idle nhưng không reset hard lifetime.
- CLI restart: old terminals become `lost`/recovery state, not fake running.

## 4. Shared protocol

`shared/src/socket.ts` cần typed terminal scope:
- `scopeType: 'session' | 'machine'`
- `TerminalState`
- `TerminalCloseReason`
- `TerminalListRequest/Payload`
- `TerminalWarningPayload`
- `TerminalKeepalivePayload`
- `TerminalCloseAllPayload` internal session-only

## 5. CLI responsibilities

`cli/src/terminal/TerminalManager.ts`:
- Own process list and lifecycle.
- Atomic max 3 live terminals/session.
- State metadata without raw output in list payload.
- Bounded replay buffer, clear on close.
- Idle warning 2h, idle kill 4h, hard kill 24h.
- Fake-clock/testable timer design.
- Process group cleanup SIGTERM→SIGKILL.
- Idempotent close/closeAll.

`cli/src/api/apiSession.ts`:
- Handle list, keepalive, close-one, internal close-all.
- Emit list/state/warning/close reason.

Machine API keeps legacy behavior.

## 6. Hub responsibilities

`hub/src/socket/handlers/terminal.ts`:
- Authorize scope.
- Subscribe/unsubscribe exact scope rooms.
- Forward create/list/attach/close-one/keepalive to CLI.
- Detach on disconnect only.
- No web handler for close-all.
- Preflight max 3 optional/advisory only.

`hub/src/socket/handlers/cli/terminalHandlers.ts`:
- Validate CLI payloads.
- Forward list/warning/state/output/close to exact room only.

`hub/src/socket/sessionTerminalControl.ts` or equivalent:
- Internal archive-only close-all helper.

`hub/src/sync/syncEngine.ts`:
- Archive calls internal close-all best-effort before/with killSession.
- Archived session rejects new terminal create.

## 7. Web responsibilities

`web/src/hooks/useTerminalSocket.ts`:
- Expose `terminals`, `listTerminals`, `createTerminal`, `closeTerminal`, `keepaliveTerminal`.
- Do not expose `closeAllTerminals`.
- Unmount disconnects/detaches, not close.

`web/src/components/Terminal/SessionTerminalTabs.tsx`:
- Shared tabs for session terminals.
- Render list/count `n/3`, warnings, lost/closed state, CTA.
- Plus disabled at 3/3 but CLI remains source of truth.
- Explicit close confirm means stop process.
- Keep terminal sends keepalive.

Integration points:
- `TerminalModal.tsx` uses shared tabs.
- `EditorTerminal.tsx` uses shared tabs for session, legacy for machine.
- `EditorLayout.tsx` no destructive pagehide for session terminals.
- `routes/sessions/terminal.tsx` uses shared tabs.
- Archive UI copy warns about terminal kill.
- Locales en/vi/zh add terminal lifecycle strings.

## 8. Security and logging

- Auth/namespace required on all terminal control/list events.
- No raw terminal data in hub/web logs.
- `close-all` unavailable to web.
- Exact scope rooms prevent session/machine leak.
- Allowed log fields: namespace, sessionId, terminalId, reason, ageMs, idleMs, clientCount, liveCount.

## 9. Backward compatibility boundary

- No backward compatibility required for old protocol formats by repo rule.
- Machine/project terminals preserve legacy behavior in this wave.
- Hub + CLI + web must deploy from same build.
