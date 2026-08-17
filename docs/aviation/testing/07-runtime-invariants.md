# 07 — Runtime Invariants

Verified in P1230-R1 against protocol gateway + real DMIT dist state/bridge.

| ID | Invariant | Status |
| -- | --------- | ------ |
| INV-001 | Session state belongs to exactly one tenant (userIdHash) | PASS |
| INV-002 | previous_response_id cannot cross tenant boundary | PASS (404) |
| INV-003 | tool_call_id cannot be consumed by another tenant / wrong id | PASS (400) |
| INV-004 | same tool result cannot silently execute twice | PASS (400 duplicate) |
| INV-005 | provider usage must have explainable billing attribution | PASS (synthetic ledger mirrors source model) |
| INV-006 | billing must never cross tenant boundary | PASS (per-tenant sums) |
| INV-007 | resume must preserve deterministic state ordering | PASS (R1–R20) |
| INV-008 | final completion must close the expected session path | PASS |

## Honesty bounds

- State/isolation/resume: **real** `apps/dmit-api/dist` modules.
- Billing debit RPC / Supabase: **not** live (no `.env`); ledger mirrors `CURRENT_BILLING_MODEL` from source (see `08-current-billing-model.md`).
- Full Express DMIT HTTP auth/gateway: **not** started this round.
