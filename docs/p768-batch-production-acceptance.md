# P768 — Batch API production acceptance

Companion docs:

- [P762 — Batch Chat Queue MVP](./p762-batch-chat-queue-mvp.md)
- [P763 — Batch queue hardening](./p763-batch-queue-hardening.md)
- [P755 — Production smoke checklist](./p755-production-smoke-test-checklist.md)

Scope: **acceptance only** — no billing core, Stripe, webhook, `credit_ledger`, or
`record_usage_and_debit` changes. Single `/v1/chat/completions` must remain healthy.

---

## Goal

Move Batch API from “endpoints exist” to “can carry customer bulk workloads” by
verifying the full chain:

`create batch` → `items` → `worker` → `status` → `usage` → `credits` →
`failed items not charged` → `request_id` traceable per succeeded item.

---

## Code map (read-only reference)

| Area | Path |
| --- | --- |
| Routes | `apps/dmit-api/src/routes/batch.ts` |
| Worker | `apps/dmit-api/src/batch/worker.ts`, `finalize.ts`, `lock.ts` |
| Migrations | `supabase/migrations/0026_p762_batch_chat_queue.sql`, `0027_p763_batch_queue_hardening.sql` |
| Dev smoke | `scripts/test-batch-chat.mjs`, `scripts/test-batch-cancel.mjs` |
| Stuck repair | `scripts/repair-stuck-batches.mjs` |
| **P768 acceptance** | `scripts/batch-production-acceptance.mjs` |

### API surface (API key auth)

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/v1/batches/chat` | 202 Accepted, up to 100 items |
| `GET` | `/v1/batches/{id}` | Batch summary + counters |
| `GET` | `/v1/batches/{id}/items` | Per-item `status`, `request_id`, `credits_charged`, `error_code` |
| `POST` | `/v1/batches/{id}/cancel` | Cancel in-flight batch |

---

## Prerequisites

| Item | Required |
| --- | --- |
| Active `sk-tokfai_…` key with credits > 0 | Yes |
| DMIT deployed with batch worker enabled | Yes |
| Migrations 0026 + 0027 applied | Yes |

Mask keys in tickets: `sk-tokfai_6b7f1e7a… (len=…)` — never paste full secrets.

---

## Production acceptance command

```bash
TOKFAI_API_KEY=sk-tokfai_<48hex> \
  TOKFAI_API_BASE=https://api.tokfai.com/v1 \
  TOKFAI_MODEL=auto-fast \
  node scripts/batch-production-acceptance.mjs
```

Optional:

```bash
BATCH_ITEM_COUNT=5          # default 5
FAIL_PROBE=1                # default on — cancel 1-item batch, verify 0 credits
FAIL_PROBE=0                # skip cancel probe
POLL_TIMEOUT_MS=300000      # default 5 min
```

### Artifact

Structured JSON: **`batch-test-results/latest.json`** (gitignored locally).

Safe to attach to customer or internal acceptance tickets. API key field is masked.

---

## What the script checks

### 1. Chat API regression (unchanged path)

- `GET /v1/models` → HTTP 200
- `POST /v1/chat/completions` (`auto-fast`, non-stream) → HTTP 200 + `request_id`

### 2. Main batch (5 items)

- `POST /v1/batches/chat` → HTTP **202**
- Poll until terminal batch status
- `GET /v1/batches/{id}/items` → all items terminal
- At least **one succeeded** item (or explicit error classification in JSON)
- Each **succeeded** item: non-empty `request_id`, `credits_charged > 0`
- Each **non-succeeded** item: `credits_charged === 0`
- Batch `credits_charged` equals sum of succeeded item credits

### 3. Fail probe (default on)

- Create 1-item batch → `POST /cancel` immediately
- Poll until cancelled
- Batch and items show **0 credits** (non-success path does not debit)

Worker code sets `credits_charged: 0` on `failed`, `cancelled`, and terminal skip
paths (`apps/dmit-api/src/batch/worker.ts`).

---

## Usage / Credits manual follow-up

The acceptance script uses API-key auth only (no dashboard JWT). After a green run:

1. Open **Dashboard → Usage** and search each succeeded item `request_id` from
   `latest.json`.
2. Open **Dashboard → Credits** and confirm debits align with succeeded item
   `credits_charged` totals (failed / cancelled items should not appear as usage).

---

## Acceptance checklist

| # | Check | Pass criteria |
| --- | --- | --- |
| 1 | Single Chat API | `chat_smoke.chat_completions.status === 200` |
| 2 | Batch create | `batch.create.accepted === true` (HTTP 202) |
| 3 | Batch completion | Terminal status within poll timeout |
| 4 | Item success | `at_least_one_success === true` |
| 5 | `request_id` | `succeeded_have_request_id === true` |
| 6 | Success charges | `succeeded_have_credits === true` |
| 7 | Failure no charge | `failed_zero_credits === true` |
| 8 | Batch accounting | `batch_credits_match === true` |
| 9 | Cancel probe | `fail_probe.ok === true` (when `FAIL_PROBE=1`) |
| 10 | Artifact | `batch-test-results/latest.json` with `pass: true` |

---

## Related scripts

| Script | Purpose |
| --- | --- |
| `scripts/batch-production-acceptance.mjs` | P768 full acceptance + JSON artifact |
| `scripts/test-batch-chat.mjs` | Quick console-only batch smoke |
| `scripts/test-batch-cancel.mjs` | Cancel flow regression |
| `scripts/production-ux-smoke.mjs` | Chat/models UX smoke (P767.4) |

---

## Build verification (no API code changes expected)

```bash
cd apps/dmit-api && npm run typecheck && npm run build
cd apps/web && npm run typecheck && npm run build
```

---

## Out of scope (P768)

- Stripe Checkout / Portal / webhook
- `credit_ledger` RPC or debit logic changes
- New batch features (idempotency, priority queues, etc.)
- Chat completions execution changes
