# P766.4 — Provider health + auto routing production acceptance

Companion docs:

- [P766.3 — API key production recovery](./p766-3-api-key-production-recovery.md)
- [P760 — Smart model routing](./p760-smart-model-routing.md)
- [P766 — Multi-upstream model pool](./p766-multi-upstream-model-pool.md)

Scope: **acceptance only** — no ledger, API Keys, or Supabase RLS changes.

---

## Prerequisites

| Item | Status |
| --- | --- |
| P766.3 API Key create/list/auth | Done (`eb9af1c`) |
| Active `sk-tokfai_…` key with credits > 0 | Required |
| DMIT deployed with isolated `supabaseAdmin()` client | `9f34de3` |
| Migration `0030_p766_2_api_keys_compat_rls.sql` applied | Required for key management |

Mask keys in tickets and logs: `sk-tokfai_6b7f1e7a… (len=…)` — **never** paste full secrets.

---

## Production acceptance commands

### 1. Quick routing smoke (single model)

```bash
TOKFAI_API_KEY=sk-tokfai_<48hex> \
  TOKFAI_API_BASE=https://api.tokfai.com/v1 \
  MODEL=auto-fast \
  node scripts/test-provider-routing.mjs
```

### 2. P766.4 health probe (six models + acceptance gate)

```bash
TOKFAI_API_KEY=sk-tokfai_<48hex> \
  TOKFAI_API_BASE=https://api.tokfai.com/v1 \
  P766_4_ACCEPTANCE=1 \
  node scripts/probe-model-health.mjs
```

Models probed: `auto-fast`, `auto-pro`, `auto-cheap`, `gpt-5.4`, `gpt-5.5`,
`gemini-3-flash`.

Custom subset:

```bash
MODELS=auto-fast,gpt-5.4 REQUESTS_PER_MODEL=5 \
  TOKFAI_API_KEY=sk-tokfai_<48hex> node scripts/probe-model-health.mjs
```

### 3. API key management regression (after probe)

```bash
TOKFAI_SUPABASE_JWT=<access_token> node scripts/test-api-keys-management.mjs
```

### 4. Production log grep (no new key/auth errors)

```bash
pm2 logs dmit-api --lines 200 --nostream | \
  grep -E 'create_api_key_failed|row-level security|invalid_token' || echo "no matches"
```

---

## Probe output (what to record)

`scripts/probe-model-health.mjs` prints per model:

| Field | Meaning |
| --- | --- |
| `success_rate` | Share of HTTP 200 completions |
| HTTP status distribution | e.g. `200:3`, `503:1` |
| `error_code` | Top failed `error.code` (e.g. `upstream_model_busy`) |
| `resolved_model` | Upstream model on success (e.g. `gemini-3-flash`) |
| `p50` / `p95` | Latency ms (all attempts, success + fail) |
| `request_id` samples | Up to 5 ids for Usage / ledger cross-check |

JSON artifact: `model-health-results/latest.json` (API key field is masked).

---

## Pass criteria

### Global

| Check | Pass |
| --- | --- |
| Script exits 0 with `P766_4_ACCEPTANCE=1` | Required |
| No `failed_credits_nonzero` on any model | Failed responses must not charge |
| `GET /v1/models` | HTTP 200, catalog visible (e.g. 25 models) |
| No new `create_api_key_failed` / RLS / `invalid_token` in DMIT logs | Grep clean |

### Per model (3 requests each in acceptance mode)

| Model | Minimum success rate | Notes |
| --- | --- | --- |
| `auto-fast` | ≥ 80% | Primary customer default |
| `auto-pro` | ≥ 80% | May resolve to gemini if GPT busy |
| `auto-cheap` | ≥ 80% | Batch / low-cost path |
| `gpt-5.4` | No hard gate | Busy → `upstream_model_busy` acceptable; document rate |
| `gpt-5.5` | No hard gate | Same as gpt-5.4 |
| `gemini-3-flash` | No hard gate | Stable real model baseline |

**Production baseline (P766.3 smoke):**

- `auto-fast` → `resolved_model=gemini-3-flash`, HTTP 200
- `request_id=req_dmdxHyZrwA3fnmrF`
- `GET /v1/models` → 25 models

Explicit real models (`gpt-5.4`, `gpt-5.5`) do **not** auto-fallback to another
model id — failures are expected under load and are not acceptance blockers unless
success rate is 0% sustained.

---

## Failure “no charge” verification

Tokfai bills **successful** chat completions only. Failed upstream / gateway
errors should not debit credits.

### Dashboard (recommended)

1. Open **Dashboard → Usage**.
2. Find a **failed** row from the probe (match `request_id` from probe output).
3. Confirm `status` ≠ succeeded and **credits_charged** is empty / zero.
4. Confirm a **success** row from the same run shows `credits_charged > 0`.

### API (JWT)

```bash
# Replace JWT and request_id from probe output
curl -s "https://api.tokfai.com/v1/me/usage?limit=20" \
  -H "Authorization: Bearer <supabase_access_token>" | jq '.data[] | {request_id, model, status, credits_charged}'
```

### Pass rule

- Every **failed** probe `request_id`: `credits_charged` null or 0.
- Every **success** probe `request_id`: `credits_charged > 0` (unless free-tier edge case).

See also [P759 load test billing notes](./p759-load-test-and-capacity-gate.md):
failures insert `usage_logs` with `billable=false`, no `debit_credits` RPC.

---

## Customer messaging — `auto-*` aliases

Use this wording in docs, Playground hints, and support:

| Alias | Tell customers |
| --- | --- |
| **`auto-fast`** | **Recommended default** for integrations and Playground. Tokfai picks the first available fast model; response `model` shows what actually served the request. |
| **`auto-pro`** | Use when quality matters more than cost. May route through GPT-class models first, then fall back to Gemini if busy. |
| **`auto-cheap`** | Use for batch / high-volume jobs where cost matters. Not for latency-sensitive chat. |

**Do not promise** a fixed upstream vendor or model name when customers pass
`auto-*`. Point them to the response `model` field (and optional `tokfai.resolved_model`).

**When customers insist on one model** (e.g. `gpt-5.4`): use the explicit id;
no silent model fallback. If busy, they get `upstream_model_busy` — suggest
`auto-fast` or `auto-pro` for resilient routing.

Routing chains: [P760 smart routing](./p760-smart-model-routing.md#1-model-aliases).

---

## Acceptance record template

```text
Date:
Operator:
TOKFAI_API_KEY: sk-tokfai_… (masked)
P766_4_ACCEPTANCE probe: PASS / FAIL
  auto-fast:     rate=  resolved=  p50=  p95=  req_id=
  auto-pro:      rate=  resolved=  p50=  p95=  req_id=
  auto-cheap:    rate=  resolved=  p50=  p95=  req_id=
  gpt-5.4:       rate=  err=      p50=  p95=  req_id=
  gpt-5.5:       rate=  err=      p50=  p95=  req_id=
  gemini-3-flash: rate= resolved= p50=  p95=  req_id=
Failed credits on errors: 0 / N models
Log grep (key/auth): clean / issues
Sign-off:
```

---

## Related scripts

| Script | Role |
| --- | --- |
| `scripts/probe-model-health.mjs` | Multi-model health + P766.4 gate |
| `scripts/test-provider-routing.mjs` | Single-model routing smoke |
| `scripts/test-api-keys-management.mjs` | JWT list/create/revoke regression |
