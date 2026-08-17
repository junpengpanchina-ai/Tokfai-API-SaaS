# Testing 02 — Load Model

```text
Architecture (mandatory first stage):
Load Generator → DMIT → Mock Upstream
```

## Workloads

| ID | Description |
| -- | ----------- |
| W1_TEXT | Short non-stream completion |
| W2_STREAM | SSE stream |
| W3_TOOL_CALL | Single tool_calls round |
| W4_TOOL_RESUME | previous_response_id + tool result |
| W5_MULTI_TOOL | Parallel/multi tool_calls |
| W6_AVIATION_AGENT | Large context + multi resume + gap-matrix style tools |

## Ladder

```text
1 → 5 → 10 → 25 → 50 → 100 → 250 → 500
(750/1000 only after prior gate)
```

Stop if: error rate > threshold, memory runaway, event-loop lag, DB exhaustion, billing inconsistency, state corruption, cross-session contamination.

Thresholds: use repo existing SLO / baseline — **do not invent**. Until measured: `UNKNOWN`.

## Metrics

RPS, Concurrent, Active Agent Sessions, p50/p95/p99, CPU/RAM/RSS/Heap, Event Loop Lag, Open/SSE connections, DB pool, Supabase latency, Upstream requests/retries, Tool state, Resume success, Billing/Usage/Errors.

Harness: `scripts/aviation-sim/load-harness.mjs` (local mock only by default).
