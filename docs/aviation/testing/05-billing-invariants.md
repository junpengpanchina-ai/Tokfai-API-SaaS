# Testing 05 — Billing Invariants (P1234)

Scenarios: normal, stream, tool first round, tool resume, client retry, timeout, 429, 500, duplicate result.

Record:

```text
PROVIDER_CALL ↔ USAGE ↔ BILLING ↔ BALANCE
```

Any unexplained double charge / missing charge / cross-user charge = `FAIL_BLOCKER`.

Harness: `scripts/aviation-sim/billing-invariants.mjs`  
Until run on DMIT+mock: `BILLING_INVARIANT_PASS=NO`.
