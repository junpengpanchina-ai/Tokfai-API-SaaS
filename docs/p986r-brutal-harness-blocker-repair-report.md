# P986R — Brutal Harness Blocker Repair Report

> Fixes only: upstream allowlist harden + P986 canary/spend/stats. No new commercial features.

## Result: **REPAIR PASS**

Marker: `TOKFAI_P986R_BRUTAL_HARNESS_REPAIR_PASS`

## Target BLOCKERs

1. `extra_unknown_fields` — unknown/sensitive fields must not leak (canary).
2. `concurrency_storm_summary` — trustworthy wave stats + hard MAX_CREDITS_SPEND.

## Fixes shipped

- `sanitizeUpstreamChatBody` / `UPSTREAM_CHAT_BODY_ALLOWLIST` + forbidden key patterns; dropped key *names* audited, never values.
- `buildUpstreamChatBody` uses allowlist; execute path builds from `upstreamBodySource`.
- P986 `extra_unknown_fields` uses `TOKFAI_P986_CANARY_SECRET_<random>` only in unknown top-level fields.
- Concurrency: `acquireSpendSlot` / `SAFETY_MAX_INFLIGHT` / `LIVE_SAFE_MODE`; wave accounting `success+fail+timeout+aborted=total`.
- `spend > MAX_CREDITS_SPEND * 1.2` → BLOCKER `spend_guard_failed`.

## Verification (this run)

| Check | Verdict | Reason |
|---|---|---|
| extra_unknown_fields | PASS | canary=TOKFAI_P986_CANARY_SECRET_9c… stripped |
| concurrency_storm_summary | PASS | chat={"wave_name":"chat","total":8,"success":8,"fail":0,"timeout":0,"aborted":0,"accounted":8,"charged_total":0.000008,"not_billable_total":0,"latency":{"count" |
| spend_total | 0.00007899999999999987 / max 10 | within 1.2x |

## BLOCKERs remaining

- (none)

## Notes

- Do **not** advertise fully compatible / Cursor Compatible.
- Prefer `LIVE_SAFE_MODE=1` for live re-checks.
