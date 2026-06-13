# P765 — Usage Ledger Safety & Reconciliation

> Goal: make Tokfai’s backend ledger **adjustable and auditable** — charge only on success, never double-charge on client retry, and support ops reconciliation + manual correction.

**Product principle:** Redis (P764) holds **temporary gateway state**. **Supabase `usage_logs` + `credit_ledger`** are the **source of truth** for billing.

---

## 1. Charge only on success

| Outcome | `usage_logs` | `credit_ledger` debit | `billing_status` |
|---------|--------------|-------------------------|------------------|
| Chat/batch upstream success | `status=succeeded`, `billable=true` | `type=debit`, `reference_id=request_id` | `charged` |
| Upstream/gateway failure | `billable=false` | none | `not_billable` |
| Rate limit / concurrency reject | `status=rate_limited` | none | `not_billable` |
| Batch item timeout / cancel | failed or cancelled item | none | `not_billable` |
| Idempotent replay (same key) | existing row reused | no second debit | `charged` (original) |

Failures **never** call `debit_credits` or insert a debit row.

---

## 2. Redis is not the ledger

| Layer | Role |
|-------|------|
| Redis (P764) | RPM, inflight, circuit breaker, batch lock — ephemeral |
| `usage_logs` | Per-request audit trail |
| `credit_ledger` | Append-only balance movements |
| `profiles.credits_balance` | Updated only via RPCs |

Never “fix” billing by editing Redis. Corrections go through **`credit_ledger` adjustments**.

---

## 3. Trace keys — how they relate

| Key | Scope | Purpose |
|-----|-------|---------|
| `request_id` | One HTTP/worker attempt | `usage_logs.request_id` UNIQUE; debit `reference_id` |
| `Idempotency-Key` header | Client retry scope | Same `api_key_id` + key + **endpoint** → replay cached success |
| Batch item key | `batch_item:{item_uuid}` | Stable across P763 retries for one batch row |
| `debit_ledger_id` | usage → ledger link | `usage_logs.debit_ledger_id` → `credit_ledger.id` |
| Ops adjustment | `ops_grant:*` / `ops_reverse:*` | CLI idempotency via `reference_id` |

### Idempotency (MVP)

**Endpoints covered:**

- `POST /v1/chat/completions` — client `Idempotency-Key` header
- Batch item debit — internal `batch_item:{item_id}` on route `/v1/batches/chat`

**Flow:**

1. Client sends `Idempotency-Key: my-key-12345678` (8–128 chars, `[A-Za-z0-9._:-]`)
2. On success, DMIT stores `response_snapshot` on `usage_logs` with `billing_status=charged`
3. Retry with same key + same API key → returns cached response, **no second debit**

Unique index: `(api_key_id, idempotency_key, endpoint)` where `billing_status='charged'`.

Debit uniqueness: partial unique on `credit_ledger.reference_id` where `type='debit'`.

---

## 4. Schema (migration `0028_p765_usage_ledger_safety.sql`)

New `usage_logs` columns:

| Column | Type | Notes |
|--------|------|-------|
| `idempotency_key` | text | Client or batch-stable key |
| `endpoint` | text | e.g. `/v1/chat/completions`, `/v1/batches/chat` |
| `debit_ledger_id` | uuid FK | Links to debit row when charged |
| `billing_status` | text | `not_billable`, `pending`, `charged`, `failed`, `reversed` |
| `billing_error` | text | Optional ops/debug |
| `response_snapshot` | jsonb | Cached success body for idempotent replay |

New RPCs (service_role only):

- `lookup_usage_idempotency(api_key_id, key, endpoint)`
- `record_usage_and_debit(...)` → returns `{ balance_after, debit_ledger_id, idempotent_replay }`
- `ops_ledger_adjustment(...)` — CLI grant/reverse

---

## 5. Manual adjustment (ops)

Script: `scripts/admin-adjust-credits.mjs`

Requires **only** `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (never print keys).

### Grant credits

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  node scripts/admin-adjust-credits.mjs grant \
    --user-id=<uuid> \
    --amount=10 \
    --note="promo credit"
```

### Reverse (refund) a bad debit

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  node scripts/admin-adjust-credits.mjs reverse \
    --user-id=<uuid> \
    --amount=0.001 \
    --note="refund duplicate debit" \
    --reference-request-id=req_abc123
```

All adjustments write `credit_ledger.type=adjustment` via `ops_ledger_adjustment` — **never** raw `UPDATE profiles.credits_balance`.

Idempotent via `reference_id = ops_{grant|reverse}:{idempotency_key}`.

For audited admin UI adjustments, continue using DMIT `POST /admin/credits/adjust` + `admin_adjust_credits` RPC.

---

## 6. Reconciliation (report only)

Script: `scripts/reconcile-usage-ledger.mjs`

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/reconcile-usage-ledger.mjs
```

Default **dry-run / report only** — does not mutate data.

Checks (lookback default 7 days):

| Check | Anomaly kind |
|-------|----------------|
| `billing_status=charged` but no `credit_ledger` debit for `request_id` | `charged_usage_missing_debit` |
| `not_billable` / `billable=false` but debit exists | `non_billable_usage_has_debit` |
| `chat_batches.credits_charged` ≠ sum of item `credits_charged` | `batch_credits_mismatch` |

Env:

| Variable | Default |
|----------|---------|
| `DRY_RUN` | `true` (report only; set `0` for live label) |
| `LOOKBACK_HOURS` | `168` |
| `LIMIT` | `500` per check |

Exit code `1` when anomalies found.

---

## 7. Scenarios that do not charge

- Gateway 429 (`too_many_requests`, `too_many_concurrent_requests`)
- Upstream 503/504 failures
- Invalid model / bad request
- Insufficient credits (pre-check or at debit)
- Batch cancel before item runs
- Batch item timeout / repair-marked failed
- Idempotent replay of prior success

---

## 8. Deploy

1. Apply migration `0028_p765_usage_ledger_safety.sql` in Supabase SQL Editor
2. Deploy DMIT:

```bash
git pull origin main
cd apps/dmit-api && npm ci && npm run build
pm2 restart dmit-api --update-env && pm2 save
```

3. Smoke:

```bash
TOKFAI_API_KEY=sk-tokfai_... node scripts/test-batch-chat.mjs
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/reconcile-usage-ledger.mjs
```

---

## 9. Implementation map

| File | Role |
|------|------|
| `supabase/migrations/0028_p765_usage_ledger_safety.sql` | Schema + RPCs |
| `apps/dmit-api/src/lib/idempotency.ts` | Header parse + batch keys |
| `apps/dmit-api/src/lib/usageBilling.ts` | Idempotency lookup + debit RPC |
| `apps/dmit-api/src/lib/executeChatCompletion.ts` | Replay + snapshot on success |
| `apps/dmit-api/src/routes/chat.ts` | `Idempotency-Key` header |
| `apps/dmit-api/src/batch/worker.ts` | `batch_item:{id}` key |
| `scripts/admin-adjust-credits.mjs` | Ops grant/reverse |
| `scripts/reconcile-usage-ledger.mjs` | Report-only reconcile |

---

## 10. Roadmap

| Phase | Topic |
|-------|--------|
| **P765** | Idempotency + billing_status + reconcile + ops adjust (this doc) |
| **P766** | Automated reconcile repair proposals |
| Future | Dashboard billing_status UI, image route unified billing |

---

## 11. Production smoke results

_To be filled after migration apply + DMIT deploy._
