# Team Chat PRD

Date: 2026-06-03

## Summary

Add **Team Chat**: a shared coordination chat where the user and multiple HAPI sessions can discuss work, mention each other, run work in parallel, and post updates back to one place.

MVP principle:

- User is coordinator.
- No AI orchestrator.
- Natural group-chat UX.
- `@session` mentions route to target sessions.
- Target agents decide whether to reply, act, or silently no-op.
- Silent no-op still shows seen/no-action state.

## Goals

- Let multiple sessions coordinate without switching constantly between private chats.
- Let user tag sessions naturally, like a group chat.
- Let sessions tag each other.
- Let agents post structured progress/result/blocker updates back to Team Chat.
- Keep private session chats intact for deep execution.
- Avoid new user-facing jargon.
- Fit existing HAPI visual system: `--app-bg`, `--app-secondary-bg`, `--app-border`, light/dark.

## Non-goals

- No autonomous AI orchestrator in MVP.
- No Slack-style thread sidebar in MVP.
- No nested reply trees.
- No automatic infinite agent-to-agent loops.
- No requirement to classify every message as ask/task/message.
- No modal-only Team Chat; Team Chat is a top-level surface.

## User-facing terminology

Use simple terms:

| Internal term | UI label |
|---|---|
| TeamRoom / room | Team Chat |
| Participant | People & sessions / Sessions in this chat |
| RoutedRequest | Team mention |
| ReportToTeam | Post update / Share progress |
| Context board | Shared context |
| Session lane | Session / Task row |

Avoid “lane”, “routed request”, “orchestrator” in primary UI.

## Core concept

Team Chat is a group chat bound to a project/task.

Contains:

- shared timeline
- participants: user + sessions
- session mentions
- replies
- seen/no-action state
- shared context
- task/status panel

Private session chat remains the working surface for each agent.

## Primary workflow

1. User creates or opens Team Chat.
2. User adds existing sessions or starts new sessions.
3. User writes naturally and mentions sessions:

   ```txt
   @Backend API confirm final TeamMessage fields
   @Team Chat UI use the fields Backend posts
   ```

4. HAPI creates Team mention requests for mentioned sessions.
5. Target session shows Team mention card in its private session chat.
6. Agent decides:
   - reply via Team Chat
   - act in private session
   - post progress/result/blocker
   - mark no-action silently
7. Team Chat shows delivery/seen/replied/no-action state.

## Navigation

Team Chat becomes a top-level mode alongside Agent and Editor.

Desktop topbar:

```txt
Agent | Team Chat | Editor
```

Entry points:

- Mission Control topbar: open Team Chat mode.
- Session header/menu: Add to Team Chat / Open Team Chat.
- Editor header: Team Chat button for current project/path.
- Mobile: bottom/tab switcher:

  ```txt
  Agent | Team Chat | Editor
  ```

Team Chat should not be a modal as the primary experience.

## Team Chat layout

Desktop layout:

- Left: Team chats + sessions in current chat.
- Center: timeline + composer.
- Right: shared context + tasks/status + member colors.

Mobile layout:

- Tabs:
  - Chat
  - Sessions
  - Context

## Visual direction

Fit current HAPI:

- flat, subtle
- small rounded controls
- no heavy glassmorphism
- no strong gradients
- theme via existing CSS variables
- dark mode close to existing HAPI dark:
  - `--app-bg: #1c1c1e`
  - `--app-secondary-bg: #2c2c2e`
  - `--app-border: rgba(255, 255, 255, 0.1)`

## Member colors

Each Team Chat participant has an identity color.

Use color consistently for:

- avatar
- mention chip
- message accent border
- session/task row accent

Identity color is separate from status color.

Example:

| Participant | Identity color |
|---|---|
| User | green/teal |
| Backend API | blue |
| Team Chat UI | purple |
| Tests | amber/orange |

Status colors remain semantic:

| Status | Color |
|---|---|
| running | blue |
| done | green |
| waiting | amber |
| blocked | red |
| idle | gray |

## Mentions

All `@session` mentions create Team mention requests for target sessions.

No manual intent selector in MVP.

User should not choose:

- Message
- Ask
- Assign task

Agent decides from natural language.

Examples:

```txt
@Backend API schema này ổn không?
@UI implement màn Team Chat giúp
@Tests để sau nhé
```

All are delivered to target session. Target agent decides response/action/no-action.

## Team mention request

When a session is mentioned, HAPI creates a Team mention request:

```ts
type TeamMentionRequest = {
    id: string
    teamChatId: string
    sourceMessageId: string
    sourceSessionId?: string
    sourceUserId?: string
    targetSessionId: string
    status: 'pending' | 'seen' | 'responded' | 'no_action' | 'superseded' | 'failed'
    createdAt: number
    seenAt?: number
    resolvedAt?: number
}
```

Request envelope delivered to target session:

```txt
Team Chat mention received

From: <user/session>
Team Chat: <name>
Message: <original message>
Reply context: <optional replied-to excerpt>
Shared context: <compact goal/decisions/open questions>

Instruction:
You were mentioned in a Team Chat.
Decide whether this needs a response, action, or no action.
If useful, post back using ReportToTeam.
If no response is needed, mark no-action silently.
Do not post “ok” or “noted” unless useful.
Do not start large/destructive changes unless the message clearly asks for it.
```

## Session-side UX for mentions

Mentioned sessions do not receive raw user-message spam.

They receive a **Team mention card** in the private session chat.

Card content:

- Team Chat name
- source author
- original message
- reply context if any
- status
- actions

Example:

```txt
Team mention · Cross-session Chat

From: UI session
"@Backend API confirm final TeamMessage fields?"

[Reply to Team] [Post update] [No action needed] [View original]
```

If agent processes it automatically, card updates status.

If no response needed:

```txt
Seen · No action needed
```

No Team Chat reply is posted by default.

## Team Chat-side mention state

Original Team Chat message shows per-target state.

Examples:

```txt
👁 Backend API seen · no reply yet
👁 Backend API seen · no action
↩ Backend API replied
⚠ Backend API failed to receive
```

If multiple targets:

```txt
Seen by Backend API, Team Chat UI · Tests pending
```

The eye icon communicates silent seen/no-action without adding noisy messages.

## Multiple simultaneous mentions

If a session is tagged by multiple sessions/users at once:

- requests queue in target session
- UI shows compact “Team mentions queue”
- HAPI may coalesce mentions received in a short window into one agent turn
- session is not interrupted while thinking

Queue example in session chat:

```txt
Team mentions queue (2)

1. UI asks final schema
2. Tests asks route to verify
```

Invocation policy:

- if target session idle + remote-controlled: HAPI may invoke one batched mention-processing turn
- if target session thinking: queue until current turn completes
- if target session local/user-controlled: show inbox/card only; no auto-run

MVP sort order:

1. older first
2. user mentions highlighted

## Replies

MVP supports inline replies.

Rules:

- reply depth = 1
- no thread sidebar
- clicking reply preview scrolls to original message
- reply target highlighted briefly after scroll

Message model:

```ts
type TeamMessage = {
    id: string
    teamChatId: string
    authorType: 'user' | 'session' | 'system'
    authorId: string
    text: string
    replyToMessageId?: string
    replyPreview?: {
        authorName: string
        excerpt: string
    }
    createdAt: number
}
```

Reply rendering:

```txt
Backend API replied
↳ UI: confirm final TeamMessage fields?

Confirmed: include authorColor, replyToMessageId, replyPreview, seenBy.
```

## ReportToTeam / Post update

Internal tool name:

```txt
ReportToTeam
```

UI label:

```txt
Post update
Share progress
Post result
```

Agents use it to post structured updates back to Team Chat.

Use cases:

- reply
- progress
- done
- blocked
- question
- handoff

Example payload:

```ts
type ReportToTeamInput = {
    teamChatId: string
    type: 'reply' | 'progress' | 'done' | 'blocked' | 'question' | 'handoff'
    summary: string
    details?: string
    replyToMessageId?: string
    replyToRequestId?: string
    mentions?: string[]
    files?: string[]
}
```

Example Team Chat render:

```txt
Backend API posted update

Done: implemented POST /api/team-chats/:id/messages

Files:
- hub/src/web/routes/teamChats.ts
- shared/src/schemas.ts

Next: @Tests verify route behavior
```

## Shared context

Right panel: Shared context.

Contains:

- Goal
- Decisions
- Open questions
- Relevant files

Purpose:

- target agents receive compact context
- avoid replaying entire Team Chat transcript
- keep coordination understandable

MVP: user-editable text sections or pinned generated summaries.

## Tasks/status panel

Right panel: Tasks.

Shows:

- task title
- owner session
- status
- last update
- linked Team message / mention request

UI labels:

```txt
Tasks
Sessions in this chat
```

Do not call them “lanes” in primary UI.

## Guardrails

Prevent loops/noise:

- max routed mention hop depth
- no more than one auto mention-processing turn per session at a time
- batch mentions within short window
- no auto-run while session is thinking
- no auto-run for local/user-controlled session
- no “ok/noted” reports unless useful
- destructive/large actions require clear request or clarification

Suggested defaults:

```txt
maxMentionHopDepth = 3
mentionBatchWindowMs = 3000
maxAutoProcessingTurnsPerSession = 1
```

## Data model sketch

```ts
type TeamChat = {
    id: string
    name: string
    namespace: string
    projectPath?: string
    createdAt: number
    updatedAt: number
}

type TeamParticipant = {
    id: string
    teamChatId: string
    type: 'user' | 'session'
    userId?: string
    sessionId?: string
    displayName: string
    color: string
    joinedAt: number
}

type TeamMessage = {
    id: string
    teamChatId: string
    authorParticipantId: string
    text: string
    replyToMessageId?: string
    replyPreview?: {
        authorName: string
        excerpt: string
    }
    mentions: Array<{
        participantId: string
        sessionId: string
    }>
    createdAt: number
}

type TeamMentionRequest = {
    id: string
    teamChatId: string
    sourceMessageId: string
    targetSessionId: string
    status: 'pending' | 'seen' | 'responded' | 'no_action' | 'superseded' | 'failed'
    createdAt: number
    seenAt?: number
    resolvedAt?: number
}
```

## API sketch

Routes:

```txt
GET    /api/team-chats
POST   /api/team-chats
GET    /api/team-chats/:id
PATCH  /api/team-chats/:id
DELETE /api/team-chats/:id

GET    /api/team-chats/:id/messages
POST   /api/team-chats/:id/messages

GET    /api/team-chats/:id/participants
POST   /api/team-chats/:id/participants
DELETE /api/team-chats/:id/participants/:participantId

GET    /api/sessions/:id/team-mentions
PATCH  /api/sessions/:id/team-mentions/:requestId
```

SSE events:

```txt
team-chat-updated
team-message-created
team-mention-updated
```

## Tooling sketch

Session-side tools:

```txt
ReportToTeam
MarkTeamMentionNoAction
```

`ReportToTeam` posts reply/progress/result/blocker.

`MarkTeamMentionNoAction` updates request state without posting a message.

## Acceptance criteria

MVP is successful when:

- user can create Team Chat
- user can add sessions
- user can post Team messages
- `@session` mention creates request in target session
- target session shows Team mention card
- Team Chat message shows pending/seen/replied/no-action state
- agent can post update via ReportToTeam
- inline reply works
- clicking reply preview scrolls to original message
- multiple mentions queue in target session
- member colors render consistently
- light/dark mode match HAPI style

## MVP defaults

- Auto-processing: idle remote sessions may process a mention batch after `mentionBatchWindowMs`; thinking/local/user-controlled sessions only queue.
- Shared context: manually editable sections in MVP; auto-summary can update suggestions but must not overwrite user-pinned decisions.
- Team Chat creation: default project-scoped when launched from a session/editor/project; allow free-form Team Chat from Team Chat home.
- Guardrail defaults:
  - `maxMentionHopDepth = 3`
  - `mentionBatchWindowMs = 3000`
  - `maxAutoProcessingTurnsPerSession = 1`
