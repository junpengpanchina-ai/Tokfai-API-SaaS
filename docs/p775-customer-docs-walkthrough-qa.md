# P775 — Customer docs manual walkthrough QA

Manual QA of `/dashboard/docs` from a customer integration perspective.
Tokfai = API gateway / model relay / API Key provider — not managed operations.

## Chapter walkthrough

| # | Section ID | Nav scroll | Chapter guide | Copy actions | Jump links | Status |
|---|------------|------------|---------------|--------------|------------|--------|
| 1 | `product-positioning` | ✅ `#product-positioning` | ✅ 4 fields | — | — | Pass |
| 2 | `production-demo-flow` | ✅ | ✅ | — | API Keys, Playground, Batch `#batch-api`, Usage, Credits | Pass |
| 3 | `quick-start` | ✅ | ✅ | Base URL, model, Auth header | — | Pass |
| 4 | `api-key` | ✅ | ✅ | Auth header, key format | API Keys | Pass |
| 5 | `chat-api` | ✅ | ✅ | chat curl, models curl | Playground, Models | Pass |
| 6 | `image-api` | ✅ | ✅ | image curl | Image Playground | Pass |
| 7 | `batch-api` | ✅ | ✅ | batch create, batch poll | — | Pass |
| 8 | `usage-credits` | ✅ | ✅ | — | Usage, Credits | Pass |
| 9 | `error-codes` | ✅ | ✅ | error table (reference) | — | Pass |
| 10 | `openai-sdk` | ✅ | ✅ | Copy config, Copy curl; config/JS/Python blocks | — | Pass |
| 11 | `cursor-integration` | ✅ | ✅ | Copy config; field table + config block | — | Pass |
| 12 | `cherry-studio` | ✅ | ✅ | Copy config; field table + config block | — | Pass |
| 13 | `industry-examples` | ✅ | ✅ | — (pattern cards) | — | Pass |

## Copy button inventory

| Target | Location | Mechanism | Status |
|--------|----------|-----------|--------|
| Base URL | Quick start | `CopyFieldsTable` | Pass |
| Authorization header | Quick start, API Key | `CopyFieldsTable` | Pass |
| curl chat | Chat API | `CodeBlock` | Pass |
| curl models | Chat API | `CodeBlock` | Pass |
| curl image | Image API | `CodeBlock` | Pass |
| batch create | Batch API | `CodeBlock` | Pass |
| batch poll | Batch API | `CodeBlock` | Pass |
| OpenAI SDK config | OpenAI SDK | `CopyConfigAction` + `CodeBlock` | Pass |
| Cursor config | Cursor | `CopyConfigAction` + fields + `CodeBlock` | Pass |
| Cherry config | Cherry Studio | `CopyConfigAction` + fields + `CodeBlock` | Pass |

## Jump link inventory

| Label | Target | Status |
|-------|--------|--------|
| Create API key / API Keys | `/dashboard/api-keys` | Pass |
| Chat Playground | `/dashboard/playground` | Pass |
| Image Playground | `/dashboard/image-playground` | Pass |
| Usage | `/dashboard/usage` | Pass |
| Credits | `/dashboard/credits` | Pass |
| Batch API section | `#batch-api` (same-page hash) | Pass |
| Models & pricing | `/dashboard/models` | Pass |

## Industry API examples (P775)

| Industry | Use cases documented | Not managed ops | Medical boundary |
|----------|----------------------|-----------------|------------------|
| Hospital | AI CS, case summaries, image assist prompts | ✅ | ✅ no diagnosis |
| Automotive | Manual Q&A, ticket classification, damage photo description | ✅ | — |
| E-commerce | Product copy, batch titles, CS Q&A | ✅ | — |
| AI support | Classification, FAQ, summaries | ✅ | — |

## Customer-visible cleanup (P775)

| Term | Action |
|------|--------|
| P770–P775 | Not in customer UI |
| `internal runbook` | Removed from error chapter (stable error.code) |
| `committed to git` | API Keys tip → "leaked or exposed" |
| `New user checklist` | Dashboard overview → "Getting started" |
| `repo` / `commit` | Only non-customer dev comments or "public repos" security tip |

## Fixes in P775

- Industry cards: three scenario bullets per vertical + expanded API patterns
- `industryScenariosLabel` + `CUSTOMER_DOC_INDUSTRY_SCENARIO_KEYS`
- Staged `errorsChapterPurpose` runbook wording fix
- Walkthrough record (this file)

## Verify

```bash
cd apps/web && npm run typecheck && npm run build
grep -R "P770\|P771\|P772\|P773\|P774\|P775\|docs/p\|artifact\|internal runbook\|production acceptance\|checklist\|repo\|commit" apps/web/components apps/web/lib || true
```

No DMIT / billing / Stripe / webhook / API core logic changes.
