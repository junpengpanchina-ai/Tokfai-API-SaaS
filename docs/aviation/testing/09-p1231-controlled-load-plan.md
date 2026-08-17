# 09 — P1231 DMIT Controlled Load Plan (NOT EXECUTED)

```text
PRODUCTION_LOAD_TEST_READY=YES (after P1230-R1 gates)
PRODUCTION_LOAD_TEST_EXECUTED=NO
```

| Field | Value |
| ----- | ----- |
| Target host | Dedicated/dev DMIT only after human auth — **not** production until approved |
| Mode | Load Generator → DMIT → Mock Upstream (default) |
| Mock or real provider | Mock first; real GRSAI only with explicit cost cap |
| Concurrency ladder | 1 → 5 → 10 → 25 → 50 → 100 → 250 → 500 |
| Duration | per level ≤ 60s until baseline known |
| Estimated requests | ladder × 2 req/session (tool+resume) — compute before run |
| Estimated upstream cost | **$0** on mock; real provider UNKNOWN until quote |
| CPU stop gate | use repo baseline / UNKNOWN until measured — do not invent |
| RAM stop gate | UNKNOWN until measured |
| Error-rate stop gate | stop escalate if network/5xx rate exceeds prior level baseline |
| Event-loop stop gate | monitor if instrumentation present |
| DB stop gate | pool exhaustion / debit errors |
| Rollback/stop | Ctrl-C harness; `pm2 stop` only if ops runbook says so |

Requires: `ALLOW_PRODUCTION_LOAD=1` + human approval. Harness already refuses prod hosts otherwise.
