# P770 — Production demo flow (customer API integration)

Companion:

- Dashboard handbook: `/dashboard/docs` → **Production demo flow**
- [P768 — Batch production acceptance](./p768-batch-production-acceptance.md)
- [P769 — Industry API integration templates](./p769-industry-task-templates.md)

Scope: **customer onboarding docs + dashboard UX** — no billing core, Stripe,
webhook, `credit_ledger`, or `record_usage_and_debit` changes.

---

## Positioning

Tokfai is an **API gateway / model relay / API Key provider**.

This flow helps customers **self-serve**:

1. Create and store an API Key
2. Prove chat API works (`/v1/chat/completions`)
3. Optionally prove batch API (`/v1/batches/chat`)
4. Reconcile Usage and Credits via `request_id`

Tokfai does **not** operate the customer's business. This is an integration
checklist, not a managed service deliverable.

---

## Production demo flow (dashboard path)

| Step | Where | Pass criteria |
| --- | --- | --- |
| 1 | **API Keys** | Create key; copy full `sk-tokfai_…` once |
| 2 | **Chat Playground** or curl | `auto-fast`, HTTP 200, `request_id` present |
| 3 | **Docs → Batch API** or `scripts/batch-production-acceptance.mjs` | Batch 202; items terminal; succeeded items have `request_id` |
| 4 | **Usage** | Search `request_id`; tokens + `credits_charged` visible |
| 5 | **Credits** | Ledger debits match succeeded calls; failures not charged |

### Copy-paste starting points (after key creation)

On API Keys success card:

- curl chat test
- OpenAI SDK config
- Cursor / Cherry Studio config
- Batch create curl

Full handbook: **Dashboard → Docs** (`CustomerIntegrationGuide`).

---

## CLI acceptance (optional)

```bash
# Chat + batch regression
TOKFAI_API_KEY=sk-tokfai_... node scripts/production-ux-smoke.mjs

TOKFAI_API_KEY=sk-tokfai_... node scripts/batch-production-acceptance.mjs
```

Artifacts: `batch-test-results/latest.json` (gitignored locally).

---

## Industry API examples (L3)

After the core flow passes, customers can try vertical **integration examples**
(not Tokfai-operated workflows):

```bash
node scripts/industry-task-demo.mjs list
TOKFAI_API_KEY=sk-tokfai_... node scripts/industry-task-demo.mjs run ecommerce_product_copy
```

See [P769 industry templates](./p769-industry-task-templates.md).

---

## Commercial stack reference

| Layer | Customer action |
| --- | --- |
| L1 API Key gateway | Create key, call `api.tokfai.com` |
| L2 Docs & Playground | This handbook + Playground smoke |
| L3 Industry API examples | `industry-task-templates.mjs` |
| L4 KA/CKA scenario landing | Account-specific integration docs |
| L5 Enterprise workflow | Customer ERP/HIS wires Tokfai API |

---

## Out of scope

- Stripe / webhook / debit logic changes
- Tokfai-managed operations or agency deliverables
- New DMIT routes for onboarding automation
