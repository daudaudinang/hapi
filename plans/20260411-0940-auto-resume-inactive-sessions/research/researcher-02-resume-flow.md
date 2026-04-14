# Resume Flow and Session Management Research

## Resume Implementation Flow

### Session Resume Logic (syncEngine.ts:344-434)

The resumeSession method follows a strict sequence:

1. **Access Control** - Verify session access and namespace ownership
2. **Active Check** - Skip if already active
3. **Metadata Validation** - Require `path` field in metadata
4. **Flavor Detection** - Support: codex, gemini, opencode, cursor, claude
5. **Resume Token Extraction** - Use appropriate session ID based on flavor
6. **Machine Matching** - Prioritize exact machineId, then host matching
7. **RPC Spawn** - Call `spawnSession` with resume token
8. **Activation Wait** - `waitForSessionActive` (15s timeout)
9. **Session Merge** - Handle new session ID from spawn result

### Session Metadata Structure

Required fields for resumable sessions:
- `path`: Directory path (mandatory)
- `flavor`: Agent type (codex|gemini|opencode|cursor|claude)
- Flavor-specific session IDs:
  - `codexSessionId` (codex)
  - `geminiSessionId` (gemini)  
  - `opencodeSessionId` (opencode)
  - `cursorSessionId` (cursor)
  - `claudeSessionId` (claude)
- Optional machine affinity:
  - `machineId`: Specific machine preference
  - `host`: Host machine preference

### RPC Gateway Session Spawning

```typescript
spawnSession(machineId, directory, flavor, model, undefined, undefined, undefined, undefined, resumeToken, effort)
```

- 30-second RPC timeout
- Supports resume via `resumeSessionId` parameter
- Returns session ID or error with detailed messages
- Handles directory creation approval requests

### Machine Matching Logic

1. **Exact Match**: `metadata.machineId` → online machine ID match
2. **Host Match**: `metadata.host` → machine.metadata.host match  
3. **Fallback**: None (resumes fail if no match)

Machine cache tracks:
- Active status with 45-second timeout (`expireInactive`)
- Host, platform, CLI version metadata
- Activity timestamps (`activeAt`)

### Session Timeout Handling

**Session Timeout**: 30 seconds (sessionCache.ts:251)
**Machine Timeout**: 45 seconds (machineCache.ts:158)
**Alive Time Clamp**: Maximum 10 minutes past current time (aliveTime.ts:5)

## Session Lifecycle Management

### SessionCache Key Features
- Real-time session state synchronization  
- Metadata versioning with optimistic locking
- Todo state backfill from message history
- Event publishing for state changes
- Session merge capabilities

### Runner Session Tracking (cli/src/runner/run.ts)
- PID-based session tracking
- Webhook-based session registration  
- Worktree session support
- Automatic stale process cleanup
- Self-restart on CLI version mismatch

## Current Auto-Resume Capabilities

**Existing Features:**
- Manual resume via POST `/sessions/:id/resume`
- Session state persistence in SQLite
- Machine affinity tracking
- Automatic session timeout detection

**Missing Features:**
- No automatic background resume
- No batch resume operations  
- No configurable resume policies
- No resume attempt limits

## Failure Modes & Dependencies

### Resume Failure Points
1. **No Machine Online** (503) - No available machines in namespace
2. **Session Access Denied** (403) - Wrong namespace or permissions
3. **Resume Unavailable** - Missing path or session token
4. **Spawn Failed** - RPC timeout or machine process error
5. **Activation Timeout** - Session spawned but didn't become active
6. **Merge Failed** - Session ID conflict during merge

### Critical Dependencies
- **RPC Gateway**: Socket.io connection to machines
- **Machine Cache**: Live machine status and metadata
- **Session Store**: Persistent session state  
- **Network Connectivity**: Hub-machine communication
- **Filesystem**: Session directory accessibility

## Timing Considerations

| Operation | Timeout | Consequence |
|-----------|---------|-------------|
| Session Spawn RPC | 30s | Resume failure |
| Session Activation | 15s | Partial resume |
| Machine Heartbeat | 45s | Machine marked inactive |
| Session Heartbeat | 30s | Session marked inactive |
| RPC Call | 30s | Operation timeout |
| Alive Time Clamp | 10m | Stale time rejected |

## Sequence Diagram

```
Client → Hub: POST /sessions/:id/resume
Hub → SessionCache: resolveSessionAccess()
SessionCache → Store: getSession()
Hub → SessionCache: refreshSession()
SessionCache → Store: getSession()
Hub → MachineCache: getOnlineMachinesByNamespace()
MachineCache → Store: getMachines()
Hub → RPCGateway: spawnSession()
RPCGateway → Machine: socket.io rpc-request  
Machine → CLI: spawn-happy-session
CLI → Machine: process spawn
CLI → Hub: webhook (session registration)
Hub → SessionCache: handleSessionAlive()
Hub → SessionCache: waitForSessionActive()
Hub → Client: resume result
```

## Unresolved Questions

1. Should auto-resume attempt limit configurable?
2. Should resume happen immediately on timeout detection or scheduled?
3. How to handle partial session states during resume?
4. Should resume attempts be logged/tracked for debugging?
5. What are the performance implications of batch resume?