# Research Report: Message Handling & Auto-Resume Architecture

## Current Architecture Analysis

### Message Endpoint Implementation (`/sessions/:id/messages`)

**Route**: `POST /sessions/:id/messages`  
**Guard**: `requireSessionFromParam(c, engine, { requireActive: true })`  
**Key Points**:
- Messages can only be sent to **active sessions**
- Returns 409 error if session is inactive
- Validates message body (text required or attachments)
- Emits Socket.IO event to CLI clients
- Publishes `message-received` event to webapp

### Session Guard Logic (`guards.ts`)

**Key Functions**:
- `requireSessionFromParam()`: Extracts session from route parameters
- `requireSession()`: Core session access validation
- **Critical Logic**: `{ requireActive: true }` blocks message sending to inactive sessions

**Session State Flow**:
```typescript
// Guard check logic
if (options?.requireActive && !access.session.active) {
    return c.json({ error: 'Session is inactive' }, 409)
}
```

### Message Storage & Flow

**MessageService** (`messageService.ts`):
- `sendMessage()`: Stores message in DB → emits Socket.IO → publishes event
- `getMessagesPage()`: Paginated message retrieval
- `getMessagesAfter()`: Real-time message streaming

**Message Storage** (`messages.ts`):
- SQLite storage with sequential numbering
- Supports `localId` for deduplication
- `mergeSessionMessages()` for session merging

### Session Lifecycle Management

**SessionCache** (`sessionCache.ts`):
- `expireInactive()`: Sets sessions inactive after 30 seconds of inactivity
- `handleSessionAlive()`: Marks sessions active on heartbeat
- `handleSessionEnd()`: Explicit session termination

**Inactivity Detection**:
```typescript
// Every 5 seconds
setInterval(() => this.expireInactive(), 5_000)

// 30-second timeout
const sessionTimeoutMs = 30_000
```

### Current Auto-Resume Implementation

**Resume Endpoint** (`/sessions/:id/resume`):
- **Exists**: `POST /sessions/:id/resume` in `sessions.ts`
- **Logic**: Checks session metadata → finds online machine → resumes session
- **Requirements**: Session must have `metadata.path` and resume token

**Key Findings**:
✅ Auto-resume endpoint exists but requires manual trigger  
✅ Session inactivity detection works (30s timeout)  
❌ **GAP**: No automatic resume on message to inactive session  
❌ **GAP**: Message endpoint blocks inactive sessions completely  

## Integration Points for Auto-Resume

### 1. Message Handler Enhancement
**Location**: `sessionHandlers.ts:65-141`  
**Integration Point**: Modify `socket.on('message')` to detect inactive sessions and trigger auto-resume

### 2. Guard Logic Bypass
**Location**: `messages.ts:46`  
**Integration Point**: Modify `requireSessionFromParam` to allow inactive sessions when auto-resume enabled

### 3. Resume Trigger
**Location**: `sessionHandlers.ts:130-140`  
**Integration Point**: After message storage, check session state and call `engine.resumeSession()` if inactive

### 4. Event Flow Modification
**Current**: Message → Store → Emit → Webapp Event  
**Proposed**: Message → Check Session State → Auto-resume if needed → Store → Emit → Webapp Event

## Data Flow Diagram

```
Client Message
    ↓
POST /sessions/:id/messages (Guard Check: requireActive)
    ↓
[BLOCKED] if inactive
    OR
[ALLOWED] if active
    ↓
Message Stored in SQLite
    ↓
Socket.IO Event to CLI Clients
    ↓
Webapp Event Published
```

## Critical Gap: Current Architecture

**Problem**: Messages to inactive sessions are completely blocked at the guard level, preventing any auto-resume trigger.

**Solution Required**:
1. Modify guard to allow inactive sessions when auto-resume enabled
2. Add session state check in message handler
3. Trigger resume process before message processing
4. Handle resume failure gracefully (return error to client)

## Next Steps

1. Implement auto-resume trigger in message handler
2. Modify guard logic to support auto-resume mode
3. Add resume status tracking
4. Implement fallback behavior for resume failures