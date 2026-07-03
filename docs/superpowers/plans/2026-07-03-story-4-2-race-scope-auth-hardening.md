# Story 4.2 Race Scope Auth Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock terminal lifecycle against max-limit races, malformed scopes, scope leaks, and idempotent close regressions.

**Architecture:** This is a hardening gate: add focused regression tests over existing CLI manager and hub Socket.IO routing. Only patch implementation if a new test exposes a Red/Yellow bug. CLI remains source of process truth; hub remains auth/routing/control plane.

**Tech Stack:** TypeScript, Bun test, Vitest, Socket.IO handler fakes, Zod schemas.

---

## File Structure

- Modify `cli/src/terminal/TerminalManager.test.ts`: ensure max-3 same-tick burst and double close idempotency remain covered.
- Modify `hub/src/socket/handlers/terminal.test.ts`: add two-web-socket same-session max-3 race test; add typed close twice does not close unrelated terminal; assert stable max-limit error.
- Modify `hub/src/socket/handlers/cli/terminalHandlers.test.ts`: already covers room separation, malformed list, access denied; add any missing output/list/warning scope leak case only if absent.
- Modify `shared/src/socket.test.ts`: already covers malformed mixed scopes; add no broad fallback if gap appears.

---

### Task 1: CLI race/idempotency audit

- [ ] Confirm tests exist for same-tick 4 creates => 3 spawned max.
- [ ] Confirm tests exist for repeated close => single SIGTERM and unrelated process alive.
- [ ] If missing, add tests in `cli/src/terminal/TerminalManager.test.ts`.
- [ ] Run `cd cli && bun test src/terminal/TerminalManager.test.ts`.

### Task 2: Hub multi-socket max-3 race gate

- [ ] Add test in `hub/src/socket/handlers/terminal.test.ts` with two terminal web sockets in same namespace/session and one CLI socket.
- [ ] Fire four `terminal:create` requests alternating sockets.
- [ ] Expect exactly three CLI `terminal:open` emits.
- [ ] Expect rejected socket gets stable `terminal:error` containing `max 3`.
- [ ] Run `cd hub && bun test src/socket/handlers/terminal.test.ts`.

### Task 3: Hub close-one idempotency/scope gate

- [ ] Add test in `hub/src/socket/handlers/terminal.test.ts` with two registered session terminals.
- [ ] Close terminal `t1` twice from typed session close path.
- [ ] Expect no close emitted for `t2`; registry keeps `t2`.
- [ ] Run `cd hub && bun test src/socket/handlers/terminal.test.ts`.

### Task 4: Scope leak/malformed verification

- [ ] Run existing shared and hub CLI-handler tests:

```bash
cd shared && bun test src/socket.test.ts
cd hub && bun test src/socket/handlers/cli/terminalHandlers.test.ts src/socket/handlers/terminal.test.ts
```

- [ ] If any scope leak test gap is found by review, add focused test before completion.

### Task 5: Full verification

```bash
cd cli && bun test src/terminal/TerminalManager.test.ts
cd shared && bun test src/socket.test.ts
cd hub && bun test src/socket/handlers/terminal.test.ts src/socket/handlers/cli/terminalHandlers.test.ts
bun run typecheck
```
