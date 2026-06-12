# P762 — Batch Chat Queue MVP

> Goal: let customers submit many chat prompts in one API call and poll for results — without hammering synchronous `/v1/chat/completions` at high concurrency.

P761 added gateway guards (RPM, per-key concurrency, global upstream cap). P762 adds a **batch queue** so large jobs are accepted once and processed in the background.

---

## 1. Problem this solves

| Before (sync chat only) | After (batch queue) |
|-------------------------|---------------------|
| N prompts = N HTTP connections | 1 submit + poll |
| Hits per-key concurrency (default 5) quickly | Submit is a single auth'd request |
| Clients must implement retry/backoff | Worker handles items sequentially (concurrency 2) |
| Hard to track bulk job progress | Batch + item status, credits, `request_id` per item |

**This is not unlimited concurrency.** Items still share the gateway global upstream pool (default 50) and each successful item debits credits individually.

---

## 2. API (DMIT)

All batch endpoints require **`Authorization: Bearer sk-tokfai_...`**.

### Create batch

```http
POST /v1/batches/chat
Content-Type: application/json

{
  "model": "auto-fast",
  "items": [
    { "messages": [{ "role": "user", "content": "Say ok only." }] },
    { "messages": [{ "role": "user", "content": "Say hello only." }] }
  ]
}
```

**Limits (MVP):**

- Max **100 items** per batch (`TOKFAI_BATCH_MAX_ITEMS`)
- No idempotency key yet — duplicate submits create separate batches
- Returns **202 Accepted** immediately:

```json
{
  "id": "batch_a1b2c3…",
  "object": "batch",
  "status": "pending",
  "total_items": 2,
  "succeeded_items": 0,
  "failed_items": 0,
  "credits_charged": 0
}
```

### Get batch summary

```http
GET /v1/batches/{id}
```

`{id}` accepts `batch_<32hex>` or a standard UUID.

### List batch items

```http
GET /v1/batches/{id}/items?limit=50&offset=0
```

Each item includes `status`, `output` (on success), `error_code`, `request_id`, and `credits_charged`.

---

## 3. Batch lifecycle

| Batch status | Meaning |
|--------------|---------|
| `pending` | Created; worker not started yet |
| `running` | Worker processing items |
| `completed` | All items succeeded |
| `partial_failed` | Mix of succeeded + failed |
| `failed` | All items failed |
| `cancelled` | Reserved (not exposed in MVP) |

| Item status | Billing |
|-------------|---------|
| `succeeded` | ✅ debited via `record_usage_and_debit` |
| `failed` | ❌ non-billable usage log only (when applicable) |

Final batch `credits_charged` = sum of successful item charges.

---

## 4. Worker (in-process MVP)

- Runs inside the DMIT Node process after batch creation (`enqueueBatchProcessing`)
- **Per-batch item concurrency:** 2 (`TOKFAI_BATCH_ITEM_CONCURRENCY`)
- Each item calls shared `executeChatCompletion()` — same smart routing / fallback / billing as sync chat
- **Does not** consume per-key HTTP concurrency slots (batch submit is one request)
- **Does** respect global upstream concurrency (`tryAcquireGlobalUpstream`)
- On `gateway_overloaded`: item marked `failed` (no auto-retry in MVP)

**Caveat:** PM2 restart while a batch is `running` leaves items stuck — resume/replay is P764+ scope.

---

## 5. Security

- Batch rows owned by `user_id` from the API key
- GET endpoints return **404** for other users' batches (no enumeration)
- Full API keys never logged; only `api_key_id` / `request_id`
- No idempotency key in MVP — document duplicate-submit risk for clients

---

## 6. Environment variables

```bash
TOKFAI_BATCH_MAX_ITEMS=100
TOKFAI_BATCH_ITEM_CONCURRENCY=2
```

Existing gateway vars still apply to item execution (`TOKFAI_GLOBAL_UPSTREAM_CONCURRENCY`, timeouts, etc.).

---

## 7. Database

Migration: `supabase/migrations/0026_p762_batch_chat_queue.sql`

- `chat_batches` — job header + aggregate stats
- `chat_batch_items` — one row per prompt; `input` / `output` jsonb

RLS enabled, **no** anon/authenticated policies — DMIT uses service_role.

---

## 8. Smoke test

```bash
TOKFAI_API_KEY=sk-tokfai_... node scripts/test-batch-chat.mjs
```

Optional:

```bash
TOKFAI_API_BASE=http://localhost:8787/v1
POLL_INTERVAL_MS=3000
POLL_TIMEOUT_MS=300000
```

Expected:

1. POST creates batch with 5 items → `status: pending`
2. Poll until `completed` / `partial_failed` / `failed`
3. GET items → each row has `request_id`; successes have `output` + `credits_charged > 0`

---

## 9. Roadmap (out of scope)

| Phase | Topic |
|-------|--------|
| **P763** | PM2 multi-instance worker design |
| **P764** | Redis-backed queue + cross-instance rate limits |
| **P765** | Usage log batch writes / archive |
| Future | Idempotency keys, cancel batch, webhook on complete, dashboard UI |

---

## 10. Implementation map

| File | Role |
|------|------|
| `supabase/migrations/0026_p762_batch_chat_queue.sql` | Tables |
| `apps/dmit-api/src/routes/batch.ts` | HTTP API |
| `apps/dmit-api/src/batch/worker.ts` | In-process worker |
| `apps/dmit-api/src/lib/executeChatCompletion.ts` | Shared chat + billing core |
| `scripts/test-batch-chat.mjs` | Smoke script |

Sync `/v1/chat/completions` is unchanged for existing clients.
