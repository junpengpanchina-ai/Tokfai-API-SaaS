# P763 — Batch Queue Hardening

> Goal: move the P762 batch chat queue from MVP to a production-reliable worker — no forever-`running` batches, with timeout, retry, cancel, and repair.

P762 shipped submit + poll + in-process worker. P763 adds guardrails without changing `/v1/chat/completions` or Stripe/billing checkout flows.

---

## 1. P762 MVP limits (what P763 fixes)

| Limit | P762 behavior | P763 fix |
|-------|---------------|----------|
| Stuck `running` | PM2 restart leaves batch/items orphaned | Resume `running` batches with pending items; repair script for stale rows |
| No item deadline | Upstream hang could block pool slot indefinitely | `TOKFAI_BATCH_ITEM_TIMEOUT_MS` (default 3 min) |
| No batch deadline | Large batches could run forever | `TOKFAI_BATCH_MAX_RUNTIME_MS` (default 15 min) |
| No retry | Transient `gateway_overloaded` / timeout → immediate fail | One retry for eligible error codes |
| No cancel | Client must wait for all items | `POST /v1/batches/:id/cancel` |
| No ops repair | Manual SQL to fix stuck rows | `scripts/repair-stuck-batches.mjs` |

---

## 2. New environment variables (DMIT)

| Variable | Default | Purpose |
|----------|---------|---------|
| `TOKFAI_BATCH_ITEM_TIMEOUT_MS` | `180000` | Max wall time per item attempt (includes upstream) |
| `TOKFAI_BATCH_MAX_RUNTIME_MS` | `900000` | Max wall time for entire batch from `started_at` |
| `TOKFAI_BATCH_ITEM_MAX_RETRIES` | `1` | Extra attempts after the first try (1 = up to 2 total attempts) |

Existing P762 vars unchanged: `TOKFAI_BATCH_MAX_ITEMS`, `TOKFAI_BATCH_ITEM_CONCURRENCY`.

---

## 3. Timeout behavior

### Item timeout

When an item attempt exceeds `TOKFAI_BATCH_ITEM_TIMEOUT_MS`:

- Item → `failed`
- `error_code`: `batch_item_timeout`
- `credits_charged`: `0`

### Batch timeout

When batch age exceeds `TOKFAI_BATCH_MAX_RUNTIME_MS` (from `started_at`):

- Remaining `pending` items → `failed`, `error_code`: `cancelled_by_timeout`
- Stale `running` / `cancel_requested` items → `failed`, `error_code`: `batch_item_timeout`
- Batch finalized to terminal status (`completed` / `failed` / `partial_failed` / `cancelled`)

---

## 4. Retry behavior

Retried **only** for these upstream/gateway codes:

- `upstream_timeout`
- `upstream_model_busy`
- `gateway_overloaded`

Rules:

- Max attempts = `1 + TOKFAI_BATCH_ITEM_MAX_RETRIES` (default 2 total)
- Each attempt increments `attempt_count` on the item row
- Retries are logged as `batch_item_retry` (includes `attempt`, `errorCode`)
- **Failures never debit credits** — billing happens only on successful `executeChatCompletion`
- A retry uses a fresh `request_id` per attempt

Non-retryable failures (e.g. `invalid_request_error`, `insufficient_credits`, model not found) fail immediately.

---

## 5. Cancel batch

```http
POST /v1/batches/{id}/cancel
Authorization: Bearer sk-tokfai_...
```

| Rule | Behavior |
|------|----------|
| Auth | API key owner only (same as GET) |
| Allowed batch status | `pending`, `running` |
| Already terminal | `400 batch_not_cancellable` |
| Succeeded items | Preserved |
| Pending items | `cancelled`, `error_code`: `batch_cancelled` |
| Running items | `cancel_requested` — in-flight upstream call may still finish |
| Pending batch | Finalized immediately → `cancelled` |
| Running batch with prior successes | Final `partial_failed` after in-flight items settle |
| Running batch, no successes | Final `cancelled` |

After cancel, the worker does **not** start new pending items.

---

## 6. GET `/v1/batches/:id/items` (enhanced)

Each item now includes (backward compatible):

| Field | Notes |
|-------|-------|
| `attempt_count` | Total attempts (1 = no retry used) |
| `started_at` | First attempt start |
| `completed_at` | Terminal timestamp |
| `error_code` / `error_message` | Present on failed/cancelled items |

New item statuses: `cancelled`, `cancel_requested`.

---

## 7. Billing — what is not charged

| Scenario | Charged? |
|----------|----------|
| Item succeeded | Yes (per-item via `record_usage_and_debit`) |
| Item failed (any error) | No |
| Item retry (failed then retry) | No until success |
| Item timeout | No |
| Batch timeout / repair | No |
| Cancelled pending item | No |
| Cancelled in-flight item that later fails | No |

---

## 8. PM2 restart

P763 worker changes:

- Can resume batches in `running` with remaining `pending` items
- In-flight items lost on restart stay `running` / `cancel_requested` until:
  - **Repair script** marks them failed (recommended cron/ops), or
  - Manual investigation

Recommended ops flow after deploy/restart:

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/repair-stuck-batches.mjs
```

Use `DRY_RUN=1` first to preview.

---

## 9. Repair script

`scripts/repair-stuck-batches.mjs`

- Finds `pending` / `running` batches older than `STUCK_BATCH_MS` (default 900000)
- Marks timed-out non-terminal items failed (no debit)
- Re-aggregates batch status and counts
- Never prints API keys or secrets

Env:

| Variable | Default |
|----------|---------|
| `SUPABASE_URL` | required |
| `SUPABASE_SERVICE_ROLE_KEY` | required |
| `STUCK_BATCH_MS` | `900000` |
| `STUCK_ITEM_MS` | `180000` |
| `DRY_RUN` | `false` |

---

## 10. Migration

`0027_p763_batch_queue_hardening.sql`:

- `chat_batch_items.attempt_count int not null default 0`
- Item status check extended: `cancelled`, `cancel_requested`

---

## 11. Test scripts

### Smoke (5 items)

```bash
TOKFAI_API_KEY=sk-tokfai_... node scripts/test-batch-chat.mjs
```

Prints batch duration, per-item `attempt_count`, failed/cancelled counts.

### Cancel

```bash
TOKFAI_API_KEY=sk-tokfai_... node scripts/test-batch-cancel.mjs
```

Creates a 10-item batch, cancels immediately, verifies pending items are not processed.

Both scripts exit with a friendly error when `TOKFAI_API_KEY` is missing.

### Production smoke results

**Status:** ✅ P763 passed on production DMIT (2026-06-13)

**Deploy:**

```bash
git pull origin main
npm ci
npm run build
pm2 restart dmit-api --update-env
pm2 save
```

**Environment:**

| Setting | Value |
|---------|-------|
| API base | `https://api.tokfai.com/v1` |
| Model | `auto-fast` |
| Migration | `supabase/migrations/0027_p763_batch_queue_hardening.sql` — applied via Supabase SQL Editor |

#### 1. Batch chat smoke

| Setting | Value |
|---------|-------|
| Script | `scripts/test-batch-chat.mjs` |
| Items | 5 |

| Metric | Result |
|--------|--------|
| Final batch status | `completed` |
| succeeded_items / failed_items | 5 / 0 |
| credits_charged | 0.001147 |
| batch_duration | 20.7s |
| poll_duration | 24.3s |
| Items returned | 5 / 5 |
| Item status | all `succeeded` |
| request_id present | 5 / 5 |
| max_attempts | 1 |
| Script outcome | Smoke test passed |

#### 2. Batch cancel smoke

| Setting | Value |
|---------|-------|
| Script | `scripts/test-batch-cancel.mjs` |
| Items | 10 |

| Metric | Result |
|--------|--------|
| Created batch status | `pending` |
| Cancel immediately | ✅ succeeded |
| Final batch status | `cancelled` |
| succeeded_items / failed_items | 0 / 0 |
| Cancelled items | 10 |
| Pending items | 0 |
| Cancelled item attempt_count | 0 (each) |
| Cancelled item error_code | `batch_cancelled` (each) |
| Script outcome | Cancel test passed |

**Conclusion:**

P763 production validation passed. Batch queue now supports timeout / retry / cancel / repair foundations. Normal batches reach `completed`; cancel stops pending items from executing; unexecuted items are not charged.

**Note:** `npm audit` currently reports 2 moderate + 2 high vulnerabilities — not a blocker for this release; track separately in a dependency security task.

---

## 12. API summary (unchanged + new)

| Method | Path | Change |
|--------|------|--------|
| `POST` | `/v1/batches/chat` | Unchanged (202) |
| `GET` | `/v1/batches/:id` | Unchanged |
| `GET` | `/v1/batches/:id/items` | +`attempt_count`, timestamps/errors already present |
| `POST` | `/v1/batches/:id/cancel` | **New (P763)** |

---

## 13. Roadmap — P764 Redis / persistent worker

P763 keeps the in-process worker (same as P762) but makes it safe to operate.

P764 planned scope:

- Redis (or DB) job queue instead of in-memory `activeBatches`
- Cross-instance dedupe and resume
- Heartbeat / lease on batch rows
- Optional integration with `scripts/probe-model-health.mjs` to deprioritize unhealthy models before dispatch

Until P764, run repair on a schedule if you deploy frequently or run multiple DMIT instances (only one should process a given batch today).
