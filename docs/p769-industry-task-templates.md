# P769 — Industry API integration templates (API examples)

Companion docs:

- [P768 — Batch production acceptance](./p768-batch-production-acceptance.md)
- [P762 — Batch Chat Queue MVP](./p762-batch-chat-queue-mvp.md)

Scope: **integration examples + demo only** — no billing core, Stripe, webhook,
`credit_ledger`, `record_usage_and_debit`, or DMIT route changes.

---

## Product positioning

**Tokfai is an API gateway / model relay / API Key provider** — not an agency,
managed operations vendor, or done-for-you service.

These files are **industry API integration examples**. They show how a customer
can call Tokfai with **their own API Key**, **their own systems**, and **their
own business workflows**:

1. Map domain fields → chat `messages`
2. `POST /v1/batches/chat` with their `sk-tokfai_…` key
3. Poll batch and item status
4. Trace each succeeded call via `request_id` in Usage / Credits

Tokfai does **not** run the customer's storefront, ticket queue, or clinic ops.
Templates are copy-paste starting points for **self-serve API integration**.

For KA/CKA accounts (e.g. hospitals), the same pattern can be extended into
**scenario-specific integration solutions** — still API-first, customer-owned
infrastructure, not Tokfai-operated services.

---

## Commercial layers (Tokfai product stack)

| Layer | What the customer gets | P769 fits here |
| --- | --- | --- |
| **L1 — API Key gateway** | `sk-tokfai_…`, OpenAI-compatible `/v1/chat/completions`, credits metering | Foundation — all examples use API Key auth |
| **L2 — Integration docs & Playground** | Docs, API Keys UI, Chat/Image Playground, `request_id` visibility | Customers test single calls before batch |
| **L3 — Industry API examples** | `scripts/industry-task-templates.mjs` + this doc — batch JSON per vertical | **P769 / P769.1** |
| **L4 — KA/CKA scenario landing** | Hospital, ecommerce, CS playbook pages; scenario docs + sample code | Upgrade L3 templates per account vertical |
| **L5 — Enterprise workflow integration** | Customer ERP/CRM/HIS wires Tokfai into internal pipelines | Customer engineering + Tokfai API; not Tokfai ops |

P769 ships at **L3**. Sales and solutions can reference L4/L5 without implying
Tokfai operates the customer's business.

---

## What this is (technical)

| Layer | Location | Role |
| --- | --- | --- |
| Integration templates | `scripts/industry-task-templates.mjs` | `input_schema`, `prompt_builder`, `batch_example` inputs |
| Demo CLI | `scripts/industry-task-demo.mjs` | list / show / print-batch / run against live API |
| Batch API (unchanged) | `POST /v1/batches/chat` | Accepts `model` + `items[]` with `messages` |

Templates are **not** a new API endpoint. They are reference code: structured
fields → prompts → batch body → poll → `request_id` / `credits_charged`.

---

## Integration examples (MVP)

| `template_id` | API example summary | `recommended_model` | `batch_example` items |
| --- | --- | --- | --- |
| `ecommerce_product_copy` | Call batch API to generate listing copy from SKU JSON | `auto-fast` | 3 |
| `customer_service_qa` | Call batch API to draft replies from ticket + context JSON | `auto-fast` | 3 |
| `medical_case_summary` | Call batch API for admin note structuring (not diagnosis) | `auto-pro` | 2 |
| `image_assist_prompt` | Call batch API to build image-gen prompts from brief JSON | `auto-pro` | 3 |

Each template exports:

- `template_id`
- `integration_kind` — `batch_example`
- `use_case` — how the **customer** calls Tokfai API
- `input_schema` — fields your system should send
- `prompt_builder(input)` → chat user message
- `recommended_model`
- `example_inputs` → sample rows for `print-batch` / `run`

---

## Customer API integration workflow

You bring: API Key, HTTP client, and your business data. Tokfai provides the
gateway and metering.

### 1. Pick an integration example

```bash
node scripts/industry-task-demo.mjs list
node scripts/industry-task-demo.mjs show ecommerce_product_copy
```

### 2. Map your system data to `input_schema`

Example payload your app might already have:

```json
{
  "product_name": "Your SKU name",
  "category": "Your category",
  "key_features": ["feature 1", "feature 2"],
  "tone": "professional",
  "locale": "en"
}
```

Build `messages` using the same rules as `prompt_builder` in
`industry-task-templates.mjs`, or import that module in Node.

### 3. Preview the Tokfai batch request body

```bash
node scripts/industry-task-demo.mjs print-batch ecommerce_product_copy
```

Ready for `POST /v1/batches/chat`:

```json
{
  "model": "auto-fast",
  "items": [
    { "messages": [{ "role": "user", "content": "…" }] }
  ]
}
```

### 4. Create batch via Tokfai API

```http
POST https://api.tokfai.com/v1/batches/chat
Authorization: Bearer sk-tokfai_…
Content-Type: application/json

{ "model": "auto-fast", "items": [ … ] }
```

Expect **HTTP 202** with `id`, `status: pending`, `total_items`.

### 5. Poll batch status

```http
GET https://api.tokfai.com/v1/batches/{id}
```

Terminal statuses: `completed`, `partial_failed`, `failed`, `cancelled`.

### 6. List item results

```http
GET https://api.tokfai.com/v1/batches/{id}/items?limit=100&offset=0
```

Per item:

| Field | Meaning |
| --- | --- |
| `status` | `succeeded`, `failed`, `cancelled` |
| `output` | Chat completion response on success |
| `request_id` | Trace ID for Usage / support |
| `credits_charged` | Debited only on `succeeded` (0 on failure) |
| `error_code` | Failure classification |

### 7. Verify Usage and Credits (your dashboard)

1. **Usage** (`tokfai.com/dashboard/usage`) — search each succeeded
   `request_id`.
2. **Credits** (`tokfai.com/dashboard/credits`) — confirm debits match
   summed `credits_charged` on succeeded items.

Failed and cancelled items should **not** debit (P768 verified).

---

## Live API demo (your key, Tokfai gateway)

```bash
TOKFAI_API_KEY=sk-tokfai_<48hex> \
  TOKFAI_API_BASE=https://api.tokfai.com/v1 \
  node scripts/industry-task-demo.mjs run ecommerce_product_copy
```

Submits example `batch_example` items through **your** API Key → Tokfai batch
API → poll → prints `request_id` values for Usage lookup.

```bash
node scripts/industry-task-demo.mjs run customer_service_qa
node scripts/industry-task-demo.mjs run medical_case_summary
node scripts/industry-task-demo.mjs run image_assist_prompt
```

---

## Example details (API integration angle)

### `ecommerce_product_copy`

**Your app sends:** `product_name`, `category`, `key_features[]`, `tone`, `locale`

**Tokfai returns:** chat completion per item (`TITLE`, `BULLETS`, `DESCRIPTION` in text)

**Model:** `auto-fast` — high-volume, short outputs, lower cost per call.

### `customer_service_qa`

**Your app sends:** `customer_question`, `product_context`, `policy_notes`, `locale`

**Tokfai returns:** one reply text per ticket row in your batch.

**Model:** `auto-fast` — many parallel tickets via batch queue.

### `medical_case_summary`

**Your app sends:** `patient_context`, `chief_complaint`, `symptoms[]`,
`clinician_notes`, `locale`

**Tokfai returns:** structured admin summary text — **not** diagnosis or
patient-facing advice. KA hospital accounts may wrap this in L4 scenario docs
and internal compliance review.

**Model:** `auto-pro` — longer structured output.

### `image_assist_prompt`

**Your app sends:** `subject`, `style`, `mood`, `aspect_ratio`, `negative_hints`,
`locale`

**Tokfai returns:** `PROMPT` + `NEGATIVE_PROMPT` text for Tokfai Image API or
other image endpoints.

**Model:** `auto-pro` — richer creative phrasing.

---

## Wire into your backend

Minimal Node pattern (same repo):

```javascript
import {
  getTemplate,
  buildBatchRequest,
} from "./scripts/industry-task-templates.mjs";

const template = getTemplate("ecommerce_product_copy");
const rowsFromYourDb = [
  {
    product_name: "SKU-100",
    category: "Electronics",
    key_features: ["USB-C", "2-year warranty"],
    tone: "minimal",
  },
];

const body = buildBatchRequest(template, rowsFromYourDb);
await fetch("https://api.tokfai.com/v1/batches/chat", {
  method: "POST",
  headers: {
    Authorization: `Bearer process.env.TOKFAI_API_KEY`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
});
```

Non-Node clients: use `print-batch` JSON as the request body template.

---

## Limits (batch API — unchanged)

- Max **100 items** per batch
- Items processed by background worker (shared upstream pool)
- Each succeeded item debits credits individually
- No batch idempotency key in MVP

See [P762](./p762-batch-chat-queue-mvp.md) for full API reference.

---

## Out of scope (P769 / P769.1)

- Tokfai-managed operations or agency deliverables
- New DMIT routes (`/v1/templates/*`)
- Dashboard UI for templates
- Stripe / billing / webhook / debit logic changes
- Template hosting registry or versioning service
- Usage API from API key alone (dashboard RLS reads only)

---

## Build verification

```bash
cd apps/dmit-api && npm run typecheck && npm run build
cd apps/web && npm run typecheck && npm run build
```

Scripts + docs only — no app code changes expected.
