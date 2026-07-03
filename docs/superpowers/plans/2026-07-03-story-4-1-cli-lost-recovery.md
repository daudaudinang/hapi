# Story 4.1 CLI Lost Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When CLI disconnects/restarts, previously known session terminals show as `lost`, not `running`.

**Architecture:** Hub keeps a metadata-only terminal list snapshot from CLI `terminal:list`. On owning CLI socket disconnect, hub marks those session terminal snapshots `lost` with `cli_lost`; if no terminal metadata was ever listed, hub stores a session-level recovery marker from the CLI session room. Later web subscribe/list receives cached lost metadata or recovery marker even if CLI is offline. A restarted CLI empty list must not wipe existing lost metadata. CLI `TerminalManager` remains source of live truth; hub cache is recovery UX only and contains no output.

**Tech Stack:** TypeScript, Socket.IO, Zod shared protocol, React, Bun/Vitest.

---

## File Structure

- Modify `hub/src/socket/terminalSessionState.ts`: add lost snapshot marking, cached list lookup, session-level lost marker, and merge policy that preserves lost records across restarted CLI empty lists.
- Modify `hub/src/socket/terminalSessionState.test.ts`: cover lost conversion, namespace isolation, no raw output.
- Modify `hub/src/socket/handlers/terminal.ts`: emit cached lost list on subscribe/list when no CLI route is available.
- Modify `hub/src/socket/handlers/cli/index.ts`: on CLI disconnect, mark terminal snapshots lost instead of deleting them.
- Modify `hub/src/socket/server.ts`: pass `terminalSessionState` to web terminal handlers.
- Modify `web/src/components/Terminal/SessionTerminalTabs.tsx`: lost state already has CTA; add session-level recovery banner only when controller reports recovery but no terminal metadata.
- Modify `web/src/hooks/useTerminalSocket.ts`: accept optional recovery field from `terminal:list` payload.
- Modify `shared/src/socket.ts`: add optional `recovery?: { reason:'cli_lost'; at:number }` to session `terminal:list` only.
- Tests: `shared/src/socket.test.ts`, `hub/src/socket/handlers/terminal.test.ts`, `hub/src/socket/terminalSessionState.test.ts`, `web/src/components/Terminal/SessionTerminalTabs.test.tsx`.

---

### Task 1: Shared list recovery contract

- [ ] Add optional `recovery` field to session `TerminalListPayloadSchema` only.
- [ ] Test valid session list with `recovery.reason='cli_lost'`.
- [ ] Test machine list rejects recovery.
- [ ] Run `cd shared && bun test src/socket.test.ts`.

### Task 2: Hub lost snapshot model

- [ ] Add `markLostByCliSocket(cliSocketId, at, fallbackSession?)` in `TerminalSessionStateStore`.
- [ ] Convert live session terminal states (`running`, `detached`, `warning_idle`, `warning_age`) to `{ status:'lost', closeReason:'cli_lost' }`.
- [ ] Preserve closed/exited records unchanged.
- [ ] If fallback session exists and no snapshot exists, store empty list with `recovery: { reason: 'cli_lost', at }`.
- [ ] Add `getCachedSessionList(sessionId, namespace)` returning `TerminalListPayload | null` with optional recovery.
- [ ] `updateFromList` from a restarted CLI must preserve prior `lost` records when new list is empty or only contains new live terminals.
- [ ] Add tests for detached→lost, namespace isolation, fallback session-level recovery with no terminal metadata, and restarted CLI empty-list preserving lost snapshots.
- [ ] Run `cd hub && bun test src/socket/terminalSessionState.test.ts`.

### Task 3: Hub routing serves cached lost list safely

- [ ] Inject `terminalSessionState` into `registerTerminalHandlers`.
- [ ] On web `terminal:subscribe`, after joining room, emit cached list if present, then request CLI list if route exists.
- [ ] On web `terminal:list`, emit cached recovery list if present before/when route unavailable so UX is consistent; if CLI route exists, still request fresh list.
- [ ] Keep machine behavior unchanged; no cached machine recovery.
- [ ] On CLI disconnect, call `terminalSessionState.markLostByCliSocket(socket.id, Date.now(), { namespace, sessionId })` before cleanup registry.
- [ ] Tests: CLI disconnect then web list/subscription gets lost list; CLI restart empty list does not wipe lost; no-metadata fallback banner list; stale routing ignored; machine unaffected.
- [ ] Run `cd hub && bun test src/socket/handlers/terminal.test.ts src/socket/terminalSessionState.test.ts`.

### Task 4: Web lost/recovery UX

- [ ] Extend `useSessionTerminalSocket` state with `recoveryReason` from `terminal:list.recovery`.
- [ ] `SessionTerminalTabs` already shows `terminal.closed.lost` for lost terminal; add banner `terminal.recovery.cliLost` only when `terminals.length === 0 && recoveryReason === 'cli_lost'`.
- [ ] Tests: lost terminal shows lost copy and CTA; recovery-only list shows banner + create CTA; no raw message displayed.
- [ ] CLI `apiSession` test: socket disconnect does not close terminals and terminal list after restart is empty from CLI, not fake-running.
- [ ] Run `cd web && bun run test -- src/components/Terminal/SessionTerminalTabs.test.tsx src/hooks/useTerminalSocket.test.tsx`.

### Task 5: Verification

- [ ] Run focused tests:

```bash
cd shared && bun test src/socket.test.ts
cd hub && bun test src/socket/terminalSessionState.test.ts src/socket/handlers/terminal.test.ts src/socket/handlers/cli/terminalHandlers.test.ts
cd cli && bun test src/api/apiSession.test.ts
cd web && bun run test -- src/components/Terminal/SessionTerminalTabs.test.tsx src/hooks/useTerminalSocket.test.tsx
bun run typecheck
```

Expected: all pass.
