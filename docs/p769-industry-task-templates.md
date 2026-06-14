# P769 — Industry task templates MVP

Companion docs:

- [P768 — Batch production acceptance](./p768-batch-production-acceptance.md)
- [P762 — Batch Chat Queue MVP](./p762-batch-chat-queue-mvp.md)

Scope: **template + demo layer only** — no billing core, Stripe, webhook,
`credit_ledger`, `record_usage_and_debit`, or DMIT route changes.

P768 confirmed production batch flow (create → items → worker → credits →
`request_id`). P769 adds **customer-readable task templates** that map industry
inputs to batch chat items.

---

## What this is

| Layer | Location | Role |
| --- | --- | --- |
| Template definitions | `scripts/industry-task-templates.mjs` | `input_schema`, `prompt_builder`, examples |
| Demo CLI | `scripts/industry-task-demo.mjs` | list / show / print-batch / run |
| Batch API (unchanged) | `POST /v1/batches/chat` | Accepts `model` + `items[]` with `messages` |

Templates are **not** a new API endpoint. Customers copy the pattern: fill
structured fields → build prompts → submit a batch → poll → trace via
`request_id`.

---

## Templates (MVP)

| `template_id` | Use case | `recommended_model` | Example items |
| --- | --- | --- | --- |
| `ecommerce_product_copy` | Product titles, bullets, descriptions from SKU facts | `auto-fast` | 3 |
| `customer_service_qa` | CS replies from ticket + product + policy context | `auto-fast` | 3 |
| `medical_case_summary` | Admin clinical summary (not diagnosis) | `auto-pro` | 2 |
| `image_assist_prompt` | Image-gen prompt from creative brief | `auto-pro` | 3 |

Each template exports:

- `template_id`
- `use_case`
- `input_schema` (JSON Schema–style for docs / validation)
- `prompt_builder(input)` → chat user message
- `recommended_model`
- `example_inputs` → converted to `example batch items`

---

## Customer workflow

### 1. Pick a template

```bash
node scripts/industry-task-demo.mjs list
node scripts/industry-task-demo.mjs show ecommerce_product_copy
```

### 2. Copy structure and fill your data

Use `input_schema` fields. Example for ecommerce:

```json
{
  "product_name": "Your SKU name",
  "category": "Your category",
  "key_features": ["feature 1", "feature 2"],
  "tone": "professional",
  "locale": "en"
}
```

Build the user message with the same rules as `prompt_builder` in
`industry-task-templates.mjs`, or import that module in your own Node script.

### 3. Preview the batch JSON

```bash
node scripts/industry-task-demo.mjs print-batch ecommerce_product_copy
```

Output is ready for `POST /v1/batches/chat`:

```json
{
  "model": "auto-fast",
  "items": [
    { "messages": [{ "role": "user", "content": "…" }] }
  ]
}
```

### 4. Create the batch

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

### 7. Trace Usage and Credits

1. **Usage** (`tokfai.com/dashboard/usage`) — search each succeeded
   `request_id`.
2. **Credits** (`tokfai.com/dashboard/credits`) — confirm ledger debits match
   summed `credits_charged` on succeeded items.

Failed and cancelled items should **not** debit (P768 verified).

---

## Live demo (one command)

```bash
TOKFAI_API_KEY=sk-tokfai_<48hex> \
  TOKFAI_API_BASE=https://api.tokfai.com/v1 \
  node scripts/industry-task-demo.mjs run ecommerce_product_copy
```

Runs example inputs → batch → poll → prints `request_id` list for Usage lookup.

Other templates:

```bash
node scripts/industry-task-demo.mjs run customer_service_qa
node scripts/industry-task-demo.mjs run medical_case_summary
node scripts/industry-task-demo.mjs run image_assist_prompt
```

---

## Template details

### `ecommerce_product_copy`

**Input fields:** `product_name`, `category`, `key_features[]`, `tone`,
`locale`

**Output format:** `TITLE`, `BULLETS`, `DESCRIPTION`

**Why `auto-fast`:** High volume, short copy, cost-efficient.

### `customer_service_qa`

**Input fields:** `customer_question`, `product_context`, `policy_notes`,
`locale`

**Output:** Single customer-facing email-style reply.

**Why `auto-fast`:** Many tickets, consistent tone, fast turnaround.

### `medical_case_summary`

**Input fields:** `patient_context`, `chief_complaint`, `symptoms[]`,
`clinician_notes`, `locale`

**Output:** `SUMMARY`, `KEY_FINDINGS`, `SUGGESTED_FOLLOW_UP`, `DATA_GAPS`

**Disclaimer:** Administrative documentation only — not diagnosis or
patient-facing advice. Use `auto-pro` for longer, structured output.

### `image_assist_prompt`

**Input fields:** `subject`, `style`, `mood`, `aspect_ratio`,
`negative_hints`, `locale`

**Output:** `PROMPT` + `NEGATIVE_PROMPT` for Tokfai Image API or external tools.

**Why `auto-pro`:** Richer creative phrasing for image models.

---

## Integrating in your app

Minimal Node pattern (same repo):

```javascript
import {
  getTemplate,
  buildBatchRequest,
} from "./scripts/industry-task-templates.mjs";

const template = getTemplate("ecommerce_product_copy");
const myRows = [
  {
    product_name: "SKU-100",
    category: "Electronics",
    key_features: ["USB-C", "2-year warranty"],
    tone: "minimal",
  },
];

const body = buildBatchRequest(template, myRows);
// fetch POST /v1/batches/chat with body
```

For non-Node clients, copy `print-batch` JSON and replace `items` with your
own `messages` built from the template rules in this doc.

---

## Limits (batch API — unchanged)

- Max **100 items** per batch
- Items processed by background worker (sequential-ish, shared upstream pool)
- Each succeeded item debits credits individually
- No batch idempotency key in MVP

See [P762](./p762-batch-chat-queue-mvp.md) for full API reference.

---

## Out of scope (P769)

- New DMIT routes (`/v1/templates/*`)
- Dashboard UI for templates
- Stripe / billing / webhook changes
- Template versioning or hosted template registry
- Automatic Usage API from API key (dashboard RLS reads only)

---

## Build verification

```bash
cd apps/dmit-api && npm run typecheck && npm run build
cd apps/web && npm run typecheck && npm run build
```

No app code changes expected for P769 (scripts + docs only).
