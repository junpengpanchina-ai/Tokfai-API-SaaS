# Testing 04 — Session Isolation (P1233)

```text
ENTERPRISE RED LINE
```

Simulate Customer A/B/C with unique:

```text
token, account, session, previous_response_id, file token, tool result
```

Must prove:

```text
A state ∉ B
A billing ∉ B
A tool result ∉ B
A previous_response_id not resumable by B
A content ∉ B response
```

Harness scenario: `scripts/aviation-sim/session-isolation.mjs`  
Until executed against DMIT: `SESSION_ISOLATION_PASS=NO` (design-ready only).
