# 08 — CURRENT_BILLING_MODEL (source-derived)

```text
FACT from apps/dmit-api source + scripts/p901-billing-atomic-smoke.mjs
Not a new commercial policy.
```

| Situation | Source behavior | Synthetic ledger mirror |
| --------- | --------------- | ----------------------- |
| Successful upstream with usage | `recordSuccessfulUsageAndDebit` / billable finalize | `billable=true`, charge=1 unit |
| Stream client path | Upstream forced non-stream; debit after usage known | Same as success when mock returns usage |
| Tool round 1 success | Billable provider call | charge |
| Tool resume success | Separate provider call → separate explainable charge | charge (not “must be once”) |
| Idempotency-Key | `lookup_usage_idempotency` prevents double debit | N/A without Supabase |
| 400 / invalid resume | invalid request logging; no successful debit | `billable=false` |
| 429 | not_billable | `billable=false` reason upstream_429 |
| 5xx | not_billable | `billable=false` |
| timeout / disconnect | not_billable | `billable=false` |
| Client billing fields | stripped (`stripClientBillingOverrides`) | ignored |
| Tenant | from API key / auth, never client body | Bearer → tenant map |

## BI interpretation

> Every provider usage that succeeded must map to an explainable billing event; failures must not silently charge; tenants must not share charges.
