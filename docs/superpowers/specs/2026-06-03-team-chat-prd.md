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
- Make daily dev use frictionless: quick create, clear jump links, context preview, attention-first status.

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

1. User quickly creates or opens Team Chat from Mission Control, a session, or Editor.
2. User adds existing sessions or starts new sessions.
3. User optionally assigns lightweight roles to sessions: Backend, Frontend, Tests, Reviewer, Docs, General.
4. User writes naturally and mentions sessions:

   ```txt
   @Backend API confirm final TeamMessage fields
   @Team Chat UI use the fields Backend posts
   ```

5. Composer shows an included-context preview before sending routed mentions.
6. HAPI creates Team mention requests for mentioned sessions.
7. Target session shows Team mention card in its private session chat.
8. Agent decides:
   - reply via Team Chat
   - act in private session
   - post progress/result/blocker
   - mark no-action silently
9. Team Chat shows delivered/seen/processing/replied/no-action state.
10. User watches Needs attention, Running, Done, and Blocked panels instead of scanning every timeline message.

## Navigation

Team Chat becomes a top-level mode alongside Agent and Editor.

Desktop topbar:

```txt
Agent | Team Chat | Editor
```

Entry points:

- Mission Control topbar: open Team Chat mode.
- Mission Control selection: create Team Chat from selected sessions.
- Session header/menu: Add to Team Chat / Open Team Chat.
- Session header/menu: Start Team Chat with this session.
- Editor header: Team Chat button for current project/path.
- Editor header/menu: Start Team Chat for current project/path.
- Mobile: bottom/tab switcher:

  ```txt
  Agent | Team Chat | Editor
  ```

Team Chat should not be a modal as the primary experience.

## Team Chat layout

Desktop layout:

- Left: Team chats + sessions in current chat.
- Center: timeline + composer.
- Right: Needs attention + shared context + tasks/status + member colors.

Mobile layout:

- Tabs:
  - Chat
  - Sessions
  - Context

Right panel prioritization:

1. Needs attention: blockers, questions, failed deliveries, mentions requiring user input.
2. Running: active sessions/tasks.
3. Done: recent completed reports.
4. Idle: available sessions.

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

## Included context preview

Because mentions are routed into private session chats, the user must be able to see what context will be sent.

When a Team Chat message contains `@session`, the composer shows a collapsed preview:

```txt
Included context
- Original Team Chat message
- Reply chain: 1 message
- Shared goal
- Decisions
- Recent relevant updates
```

Actions:

```txt
[Edit context] [Attach file/diff] [Use default]
```

Default context packet:

- original Team Chat message
- reply preview if replying
- shared context: goal + decisions + open questions
- recent relevant Team Chat updates, bounded
- manually attached files/diffs, if any

Do not dump the entire Team Chat transcript by default.

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
    status: 'pending' | 'delivered' | 'seen' | 'processing' | 'responded' | 'no_action' | 'superseded' | 'failed'
    createdAt: number
    deliveredAt?: number
    seenAt?: number
    processingStartedAt?: number
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
Attached context: <optional files/diffs/user-selected context>

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

Compact queue behavior:

- show one compact bar by default:

  ```txt
  3 team mentions pending
  [Review]
  ```

- expand only when clicked
- do not fill the private session timeline with many full cards
- include jump links: Open Team Chat, View original message, Reply to Team

## Team Chat-side mention state

Original Team Chat message shows per-target state.

Examples:

```txt
Backend API delivered
Backend API seen · no reply yet
Backend API processing
Backend API seen · no action
Backend API replied
Backend API failed to receive
```

If multiple targets:

```txt
Seen by Backend API, Team Chat UI · Tests pending
```

The eye icon communicates silent seen/no-action without adding noisy messages. `Seen` means the request was viewed or supplied to the agent context; `processing` means an agent turn is actively handling it.

## Multiple simultaneous mentions

If a session is tagged by multiple sessions/users at once:

- requests queue in target session
- UI shows compact “Team mentions queue”
- HAPI may coalesce mentions received in a short window into one agent turn
- session is not interrupted while thinking

Queue example in session chat:

```txt
2 team mentions pending
[Review]
```

Expanded view:

```txt
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

Report templates:

| Type | UI title | Required content |
|---|---|---|
| `reply` | Replied | answer summary |
| `progress` | Progress update | what changed + next step |
| `done` | Done | result + changed files if available |
| `blocked` | Blocked | blocker + who/what is needed |
| `question` | Needs input | question + recommended options if available |
| `handoff` | Handoff | target session + context summary |

Timeline cards should be scannable:

- green for done
- red for blocked
- amber for question/needs input
- neutral/blue for progress
- always include source session and related task/request

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

Needs attention appears above ordinary tasks.

Items included:

- blocked reports
- questions from agents
- failed mention delivery
- mentions waiting for user decision
- tasks idle because dependency is missing

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
    role?: 'backend' | 'frontend' | 'tests' | 'reviewer' | 'docs' | 'general'
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
    status: 'pending' | 'delivered' | 'seen' | 'processing' | 'responded' | 'no_action' | 'superseded' | 'failed'
    createdAt: number
    deliveredAt?: number
    seenAt?: number
    processingStartedAt?: number
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
- user can quick-create Team Chat from selected sessions, current session, or current project
- user can add sessions
- user can assign lightweight roles to sessions
- user can post Team messages
- `@session` mention creates request in target session
- composer shows included-context preview for routed mentions
- target session shows Team mention card
- session chat shows compact pending mention queue when multiple mentions arrive
- Team Chat message shows pending/delivered/seen/processing/replied/no-action state
- agent can post update via ReportToTeam
- ReportToTeam renders structured templates for reply/progress/done/blocked/question/handoff
- inline reply works
- clicking reply preview scrolls to original message
- multiple mentions queue in target session
- right panel shows Needs attention above ordinary tasks
- jump links exist between Team Chat messages, target session cards, reports, and original messages
- member colors render consistently
- light/dark mode match HAPI style

## MVP defaults

- Auto-processing: idle remote sessions may process a mention batch after `mentionBatchWindowMs`; thinking/local/user-controlled sessions only queue.
- Shared context: manually editable sections in MVP; auto-summary can update suggestions but must not overwrite user-pinned decisions.
- Team Chat creation: default project-scoped when launched from a session/editor/project; allow free-form Team Chat from Team Chat home.
- Quick create: selected sessions inherit project path; if multiple paths are selected, ask user to choose target project before creating.
- Roles: optional; default role is `general`; user can change role/color from participant menu.
- Included context preview: collapsed by default; always visible when a message has a `@session` mention.
- Mention state: set `processing` when a target agent turn begins handling one or more Team mentions.
- Needs attention: sort by blocked/question/failed first, then newest.
- Guardrail defaults:
  - `maxMentionHopDepth = 3`
  - `mentionBatchWindowMs = 3000`
  - `maxAutoProcessingTurnsPerSession = 1`
