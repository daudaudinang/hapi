# Manual Testing Plan for Auto-Resume Feature

## Overview
This document provides manual test scenarios for the AUTO_RESUME_INACTIVE_SESSIONS feature.

## Prerequisites
- Access to HAPI web application
- Ability to create sessions and let them timeout
- Understanding of session states (active, inactive, archived)

## Test Setup

### 1. Create Test Session
1. Navigate to HAPI web application
2. Create a new session (name it "Auto-Resume Test")
3. Wait for session to become active
4. Send a simple message to activate the session
5. Close the browser tab/window or wait for session to timeout (30 seconds)

### 2. Verify Session State
1. Check that session is now marked as inactive
2. Verify session appears in "Inactive Sessions" section if available
3. No active WebSocket connection to the session

## Test Scenarios

### Scenario 1: Happy Path - Auto-Resume Success
**Objective**: Verify auto-resume works when sending message to inactive session

**Steps**:
1. Create and timeout a session (as per setup)
2. Send a message to the inactive session
3. Observe that:
   - Session immediately resumes (shows "Resuming..." status)
   - After successful resume (target: < 15s), session becomes active
   - Original queued message is processed
   - Agent responds to the message

**Expected Results**:
- Session status changes from "inactive" to "resuming" to "active"
- Message is delivered to agent
- Agent responds normally
- No error messages or warnings
- Session remains active after resume

**Acceptance Criteria**:
- ✅ Resume completes within 15 seconds
- ✅ Original message is processed
- ✅ Agent responds to message
- ✅ Session becomes active
- ✅ No data loss

### Scenario 2: Resume Failure - No Machine Available
**Objective**: Verify graceful handling when no machine is available

**Steps**:
1. Create and timeout a session
2. Stop or disconnect all machines from the system
3. Send a message to the inactive session
4. Observe the behavior

**Expected Results**:
- Session attempt starts but fails after timeout
- Session shows "resume failed" status
- Session is archived after max attempts (3 tries)
- User sees appropriate error message
- Message is marked as failed in the queue

**Acceptance Criteria**:
- ✅ Resume fails within 15 seconds
- ✅ Error message displayed to user
- ✅ Session is archived after 3 attempts
- ✅ Failed message is recorded in database

### Scenario 3: Resume Failure - Invalid Token
**Objective**: Verify handling of invalid resume tokens

**Steps**:
1. Create and timeout a session
2. Corrupt or invalidate the session token in the database
3. Send a message to the inactive session
4. Observe behavior

**Expected Results**:
- Resume attempt fails
- Session is archived
- User sees appropriate error message
- Message is marked as failed

**Acceptance Criteria**:
- ✅ Resume fails promptly
- ✅ Session is archived
- ✅ Error message displayed
- ✅ Data integrity maintained

### Scenario 4: Queue Overflow
**Objective**: Verify queue overflow handling

**Steps**:
1. Create and timeout a session
2. Send 100 messages to the inactive session (verify queue depth)
3. Send 1 additional message (should trigger overflow)
4. Observe behavior

**Expected Results**:
- First 100 messages are queued successfully
- 101st message triggers queue overflow
- Session is automatically archived
- User sees overflow error message
- All messages are cleaned up

**Acceptance Criteria**:
- ✅ Queue depth limit enforced (100 messages)
- ✅ Session archived on overflow
- ✅ User notified of overflow
- ✅ Queue cleanup occurs

### Scenario 5: Concurrent Messages
**Objective**: Verify handling of multiple concurrent messages

**Steps**:
1. Create and timeout a session
2. Send 5 messages simultaneously to the inactive session
3. Observe resume behavior and message processing

**Expected Results**:
- All 5 messages are queued
- Resume process triggers once
- Messages are processed in order
- No duplicate processing

**Acceptance Criteria**:
- ✅ All messages queued successfully
- ✅ Single resume process initiated
- ✅ Messages processed in chronological order
- ✅ No duplicates or lost messages

### Scenario 6: Browser Close & Reopen
**Objective**: Verify session state persists across browser restarts

**Steps**:
1. Create and timeout a session
2. Send a message to inactive session
3. Close browser completely
4. Reopen browser and navigate to HAPI
5. Check session state and message delivery

**Expected Results**:
- Message should remain queued during browser close
- Session state persists
- Resume triggers automatically when browser reconnects
- Message is delivered after resume

**Acceptance Criteria**:
- ✅ Message queued during disconnect
- ✅ Session state preserved
- ✅ Resume triggers on reconnection
- ✅ Message delivered successfully

### Scenario 7: Active Session No Change
**Objective**: Verify active sessions are not affected

**Steps**:
1. Create an active session
2. Send a message to the active session
3. Verify normal message delivery
4. No auto-resume behavior should occur

**Expected Results**:
- Message delivered immediately
- No resume process initiated
- Session remains active
- No queueing behavior

**Acceptance Criteria**:
- ✅ Message delivered immediately
- ✅ No resume process
- ✅ Session remains active
- ✅ Normal behavior maintained

### Scenario 8: Server Restart
**Objective**: Verify resilience to server restarts

**Steps**:
1. Create and timeout a session
2. Queue several messages
3. Restart the server
4. Verify message persistence and resume capability

**Expected Results**:
- Messages persist through restart
- Session state preserved
- Resume capability maintained
- No data corruption

**Acceptance Criteria**:
- ✅ Messages persist after restart
- ✅ Session state intact
- ✅ Resume functionality works
- ✅ No data loss

## Performance Tests

### Test 1: Resume Latency
**Objective**: Measure resume time under normal conditions

**Steps**:
1. Create and timeout 10 different sessions
2. Send messages to trigger resume
3. Measure time from message send to session active

**Acceptance Criteria**:
- ✅ Average resume time < 10 seconds
- ✅ 95th percentile < 15 seconds
- ✅ No individual resume > 20 seconds

### Test 2: Queue Throughput
**Objective**: Measure queue performance under load

**Steps**:
1. Create and timeout 5 sessions
2. Send 10 messages to each session simultaneously
3. Measure processing time and queue depth

**Acceptance Criteria**:
- ✅ All messages queued successfully
- ✅ Queue depth tracking accurate
- ✅ No message loss under load

### Test 3: Memory Usage
**Objective**: Verify memory usage is reasonable

**Steps**:
1. Create and timeout 10 sessions
2. Queue 50 messages per session
3. Monitor memory usage during resume operations

**Acceptance Criteria**:
- ✅ Memory increase < 100MB for 500 messages
- ✅ No memory leaks detected
- ✅ Garbage collection works properly

## Error Scenarios

### Error 1: Network Interruption
**Objective**: Verify handling of network interruptions during resume

**Steps**:
1. Create and timeout a session
2. Send message to trigger resume
3. Disconnect network during resume process
4. Reconnect network

**Expected Results**:
- Resume process handles interruption gracefully
- Session remains in resuming state
- Resume continues after network reconnect
- Final successful resume

### Error 2: Database Connection Loss
**Objective**: Verify handling of database failures

**Steps**:
1. Create and timeout a session
2. Temporarily disable database connection
3. Send message to trigger resume
4. Re-enable database connection

**Expected Results**:
- Resume attempt fails gracefully
- Error is logged appropriately
- Database connection restored
- Subsequent resume attempts work

### Error 3: Authentication Token Expiry
**Objective**: Verify handling of authentication issues

**Steps**:
1. Create and timeout a session
2. Expire authentication token
3. Send message to trigger resume
4. Re-authenticate

**Expected Results**:
- Resume attempt fails due to auth
- User prompted to re-authenticate
- Session state preserved
- Resume works after re-auth

## Edge Cases

### Edge Case 1: Session Already Being Resumed
**Objective**: Verify concurrent resume prevention

**Steps**:
1. Create and timeout a session
2. Send multiple messages rapidly
3. Verify only one resume process occurs

**Expected Results**:
- Deduplication prevents multiple resumes
- Messages still processed
- Resume occurs once efficiently

### Edge Case 2: Large Message Payload
**Objective**: Verify large message handling

**Steps**:
1. Create and timeout a session
2. Send message with large payload (near 10KB limit)
3. Verify message is queued correctly

**Expected Results**:
- Large message accepted and queued
- Resume process normal
- Message delivered successfully

### Edge Case 3: Empty Messages
**Objective**: Verify empty message handling

**Steps**:
1. Create and timeout a session
2. Send empty message or whitespace-only message
3. Verify behavior

**Expected Results**:
- Empty message handled gracefully
- Resume process continues
- No errors or crashes

## Success Criteria

### Functional Criteria
- ✅ All happy path scenarios work correctly
- ✅ All failure scenarios handled gracefully
- ✅ All edge cases handled appropriately
- ✅ User experience is smooth and informative
- ✅ Data integrity maintained in all scenarios

### Performance Criteria
- ✅ Resume latency < 15s (95th percentile)
- ✅ Message queue depth limit enforced (100)
- ✅ Memory usage reasonable (< 100MB per 1000 messages)
- ✅ No performance degradation under load

### Reliability Criteria
- ✅ No data loss in any scenario
- ✅ No crashes or hangs
- ✅ Graceful recovery from errors
- ✅ Session state consistency maintained
- ✅ Proper cleanup on errors

### User Experience Criteria
- ✅ Clear status messages during resume
- ✅ Appropriate error messages when failures occur
- ✅ No confusing or misleading information
- ✅ Smooth transitions between states
- ✅ Responsive interface during resume operations

## Test Results Template

### Test Session
- **Session ID**: [session-id]
- **Test Scenario**: [scenario-name]
- **Start Time**: [timestamp]
- **End Time**: [timestamp]

### Results
- **Status**: [Pass/Fail]
- **Resume Time**: [time]ms
- **Messages Processed**: [count]
- **Errors**: [list errors]
- **Observations**: [notes]

### Screenshots (if applicable)
- [Attach screenshots of key moments]

## Reporting Issues

### Issue Template
**Issue Description**: [Brief description of problem]
**Steps to Reproduce**: [1, 2, 3...]
**Expected Result**: [What should happen]
**Actual Result**: [What actually happened]
**Environment**: [Browser, OS, HAPI version]
**Severity**: [Critical/High/Medium/Low]
**Frequency**: [Always/Sometimes/Rarely]

### Common Issues to Watch For
1. **Resume Timeout**: Sessions taking longer than 15s to resume
2. **Message Loss**: Messages disappearing from queue
3. **State Inconsistency**: Session state becoming corrupted
4. **Memory Issues**: Memory usage growing unbounded
5. **Race Conditions**: Multiple concurrent operations causing conflicts
6. **Error Recovery**: Poor handling of transient failures
7. **UI Responsiveness**: Interface becoming unresponsive during resume

## Completion Checklist

- [ ] All test scenarios executed
- [ ] All acceptance criteria met
- [ ] Performance criteria verified
- [ ] Error scenarios tested
- [ ] Edge cases covered
- [ ] Documentation updated
- [ ] Issues logged and tracked
- [ ] Team sign-off on results

## Notes

- Test in both development and staging environments
- Test with different browsers if applicable
- Consider testing with different network conditions
- Document any anomalous behavior
- Include performance metrics in reports