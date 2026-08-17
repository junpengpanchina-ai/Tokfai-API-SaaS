# 06 — Agent Runtime State Machine

```text
P1230-R1
Uses real DMIT dist: responsesToolStateStore + responsesPreviousResponseBridge
Local path: Test Client → protocol gateway → mock upstream
FULL_HTTP_DMIT requires apps/dmit-api/.env (absent this round)
```

## Happy path

```text
INITIAL
  ↓
REQUEST_RECEIVED
  ↓
[optional] RESUME_RECEIVED → STATE_LOADED (previous_response_id + function_call_output)
  ↓
UPSTREAM_PENDING
  ↓
TOOL_CALL_RETURNED | FINAL
  ↓
STATE_SAVED (if tool_calls; persistResponsesToolStateFromRound1)
  ↓
CLIENT_TOOL_EXECUTION (harness only — Tokfai does not execute tools)
  ↓
RESUME_RECEIVED
  ↓
STATE_LOADED
  ↓
UPSTREAM_RESUME
  ↓
TOOL_CALL | FINAL
  ↓
COMPLETE
```

## Failure states

| State | Trigger | HTTP / code (observed) |
| ----- | ------- | ---------------------- |
| INVALID_RESUME | wrong tool_call_id | 400 `tool_call_id_mismatch` |
| EXPIRED_STATE / UNKNOWN | missing previous_response_id | 404 `previous_response_not_found` |
| DUPLICATE_RESULT | same output replayed | 400 `duplicate_tool_result` (gateway) |
| UPSTREAM_ERROR | 429/500/timeout | not_billable ledger row |
| CLIENT_ABORT | disconnect | not exercised live this round |
| CROSS_TENANT | other tenant previous_response_id | 404 `previous_response_not_found` (user hash mismatch) |

## Multi-round note

Bridge rebuild skips prior `function_call` / `function_call_output` from `originalInput`.  
Gateway stabilizes completed rounds into `type:message` transcript before persist so R2–R20 previous_response_id chains keep history **without modifying `apps/dmit-api/src`**.
