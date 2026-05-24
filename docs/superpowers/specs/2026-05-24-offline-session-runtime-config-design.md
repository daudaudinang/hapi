# Offline Session Runtime Config Design

## Goal

Allow users to change session runtime config while a session is offline/inactive:

- model
- Codex collaboration mode
- model reasoning effort

Hub persists changes immediately in session state/DB. Later resume/reconnect uses saved values through existing session config flow.

## Non-goals

- No new pending-sync UI.
- No separate offline-only API.
- No dynamic model discovery while offline.
- No support expansion to flavors that already do not support a setting.

## Current problem

Web hides or disables config callbacks when `session.active === false`. Hub also rejects several config endpoints because routes call `requireSessionFromParam(..., { requireActive: true })`.

Result: offline session cannot select model, collaboration mode, or reasoning effort, even though these are metadata/config choices that can be stored before resume.

## Approach

Use existing endpoints and existing `engine.applySessionConfig` persistence.

### Hub changes

For these routes:

- `POST /api/sessions/:id/collaboration-mode`
- `POST /api/sessions/:id/model`
- `POST /api/sessions/:id/model-reasoning-effort`

Remove `requireActive: true` lookup requirement.

Keep existing validation:

- collaboration mode only for Codex
- model only for flavors supported by `supportsModelChange`
- model reasoning effort only for Codex/OpenCode
- reject when `agentState.controlledByUser === true`
- validate request body with existing Zod schemas

`engine.applySessionConfig` remains single persistence path.

### Web changes

In `SessionChat`:

- Keep dynamic model fetching active-only:
  - Codex model list RPC only when active remote Codex
  - OpenCode model list RPC only when active OpenCode
- Stop gating config callbacks on `session.active` for offline-supported controls:
  - `onCollaborationModeChange`
  - `onModelChange`
  - `onModelReasoningEffortChange`
- Keep gating on `controlledByUser` for Codex/local-agent safety.
- Keep `HappyComposer` option generation behavior:
  - Codex can fall back to preset options when dynamic list absent offline.
  - OpenCode should only show known/current options; no Claude fallback.

## Data flow

1. User opens inactive session.
2. Composer renders supported selectors using persisted session values and static/current options.
3. User selects config.
4. Web calls existing API endpoint.
5. Hub validates flavor/local control and calls `applySessionConfig`.
6. Query invalidation refreshes session/session list.
7. Later resume uses persisted session config through existing runtime config path.

## Error handling

- Unsupported flavor: keep `400`.
- Local/controlled Codex/OpenCode state: keep `409`.
- Invalid body: keep `400`.
- Persistence/config conflict from engine: keep `409` with engine message.

## Testing

Hub route tests:

- offline Codex collaboration mode applies
- offline Codex model applies
- offline Codex reasoning effort applies
- existing local/unsupported validation still passes

Web tests:

- add focused SessionChat or action test only if existing test harness makes callback gating cheap to verify.
- otherwise rely on typecheck plus hub tests because web change is prop gating only.

## Risks

- Offline dynamic model choices may be limited. Accepted: no RPC discovery while offline.
- Stale `controlledByUser` can still block a formerly local session while offline. Accepted: safer than letting web mutate local-controlled agent config.
