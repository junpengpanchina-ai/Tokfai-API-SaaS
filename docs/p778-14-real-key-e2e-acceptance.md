# P778.14 — Operator E2E smoke (internal only)

> **Internal operator automation — not customer documentation.**  
> Customers validate with API Key + one-line curl + Dashboard Usage/Credits only.  
> See [P778.15 customer live smoke](./p778-15-customer-live-smoke.md).

---

## What this script automates

`scripts/p778-14-real-key-e2e-acceptance.mjs` uses **operator credentials** (`TOKFAI_SUPABASE_JWT`) to:

- Create / revoke keys via DMIT management API
- Run UI-identical one-line curls via shell
- Reconcile via `GET /me/usage/summary` and `GET /me/credits/ledger`

Customers do **not** have JWT and should **not** run this script.

---

## Operator run (repo maintainers only)

```bash
TOKFAI_SUPABASE_JWT=<dashboard_access_token> node scripts/p778-14-real-key-e2e-acceptance.mjs
```

Writes `p778-live-smoke-results/e2e-latest.json` (gitignored).

---

## Session key UX fixes (customer-facing, shipped in P778.14)

1. Dismiss success card does **not** clear Docs session key.
2. Revoke clears session when key id matches.
3. Usage query supports optional `request_id` filter in Dashboard UI.

---

## Unchanged backend scope

billing, Stripe, Supabase schema, DMIT route logic, `record_usage_and_debit`, Chat/Image/Batch APIs.
