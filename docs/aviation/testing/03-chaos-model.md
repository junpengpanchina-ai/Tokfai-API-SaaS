# Testing 03 — Chaos Model (P1232)

Mock provider intentional faults:

| ID | Fault |
| -- | ----- |
| C1 | SLOW_20S |
| C2 | HTTP_429 |
| C3 | HTTP_500 |
| C4 | STREAM_ABORT |
| C5 | MALFORMED_TOOL_CALL |
| C6 | TOOL_RESUME_TIMEOUT |
| C7 | UNKNOWN_PREVIOUS_RESPONSE_ID |
| C8 | DUPLICATE_TOOL_RESULT |
| C9 | CLIENT_DISCONNECT |
| C10 | UPSTREAM_DISCONNECT |

Check after each: memory leak, socket leak, infinite retry, duplicate billing, duplicate state, orphan state, wrong response mapping.

Implemented as deterministic scenarios in `scripts/aviation-sim/mock-upstream.mjs`.
