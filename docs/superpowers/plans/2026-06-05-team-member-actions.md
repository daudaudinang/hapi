# Team Member Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Team Chat member action menu with View, Configure, and Remove, while reusing existing session composer settings logic for session configuration.

**Architecture:** Keep Team Chat member actions in the right panel, backed by existing participant archive endpoint plus a small PATCH participant endpoint for alias/role/color. Extract the existing `HappyComposer` settings body into a reusable `SessionComposerSettingsPanel` and use it from both the composer popup and Team member config modal so provider/model checks remain identical.

**Tech Stack:** React, TypeScript, TanStack Query, Hono routes, Vitest, Bun.

---

### Task 1: API surface for participant remove/update

**Files:**
- Modify: `hub/src/store/teamChatStore.ts`
- Modify: `hub/src/sync/teamChatService.ts`
- Modify: `hub/src/sync/syncEngine.ts`
- Modify: `hub/src/web/routes/teamChats.ts`
- Modify: `hub/src/web/routes/teamChats.test.ts`
- Modify: `web/src/api/client.ts`
- Modify: `web/src/api/client.teamChat.test.ts`
- Modify: `web/src/hooks/mutations/useTeamChatActions.ts`

- [ ] Write failing hub route test for `PATCH /api/team-chats/:id/participants/:participantId` updating `displayName`, `role`, and `color`.
- [ ] Run focused hub test and confirm failure from missing route/service method.
- [ ] Implement store/service/engine/route update method with duplicate alias validation and archived participant guard.
- [ ] Write failing web API/action test for `deleteTeamParticipant` and `updateTeamParticipant`.
- [ ] Implement ApiClient methods and TanStack mutations with participant/session-membership invalidation.
- [ ] Run focused tests and commit.

### Task 2: Reusable session composer settings panel

**Files:**
- Create: `web/src/components/AssistantChat/SessionComposerSettingsPanel.tsx`
- Modify: `web/src/components/AssistantChat/HappyComposer.tsx`
- Create/Modify: `web/src/components/AssistantChat/SessionComposerSettingsPanel.test.tsx`

- [ ] Write failing component tests proving the extracted panel renders model/reasoning/effort sections with the same props and calls the same callbacks.
- [ ] Extract settings UI from `HappyComposer` without changing the gating booleans/options computed in `HappyComposer`.
- [ ] Replace the inline settings body in `HappyComposer` with `SessionComposerSettingsPanel`.
- [ ] Run focused AssistantChat tests and commit.

### Task 3: Team member menu and config modal

**Files:**
- Modify: `web/src/components/TeamChat/TeamChatRightPanel.tsx`
- Modify: `web/src/components/TeamChat/TeamChatRightPanel.test.tsx`
- Modify: `web/src/routes/team-chats/$teamChatId.tsx`

- [ ] Write failing tests for the member `⋯` menu showing `Xem`, `Cấu hình`, and `Remove khỏi Team Chat`.
- [ ] Implement click/right-click/long-press menu; make `Xem` call existing `onOpenSession`.
- [ ] Write failing tests for remove confirmation calling `onRemoveParticipant`.
- [ ] Implement remove confirmation UI.
- [ ] Write failing tests for config modal Member tab updating alias/role/color.
- [ ] Implement Member tab wired to `onUpdateParticipant`.
- [ ] Write failing tests that Session tab renders `SessionComposerSettingsPanel` and uses existing session API callbacks.
- [ ] Implement Session tab by computing the same provider-aware options/hooks as session chat path and passing them into `SessionComposerSettingsPanel`.
- [ ] Run web tests/typecheck and commit.

### Task 4: Final verification and merge

**Files:**
- No production files unless verification exposes a defect.

- [ ] Run `git diff --check`.
- [ ] Run `bun run typecheck:web`.
- [ ] Run focused hub/web tests plus `bun run test:web` if practical.
- [ ] Merge branch to `main` only after passing verification.
- [ ] Do not build/restart the Hapi service; user will do manual rebuild/restart/e2e.
