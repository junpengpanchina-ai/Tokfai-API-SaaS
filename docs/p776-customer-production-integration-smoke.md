# P776 — Customer production integration smoke

Customer-path verification of Tokfai API integration against production
(`https://api.tokfai.com`). Tokfai = API gateway / model relay / API Key provider —
not managed operations.

**Run automated suite:**

```bash
node scripts/p776-customer-production-smoke.mjs
TOKFAI_API_KEY=sk-tokfai_... node scripts/p776-customer-production-smoke.mjs
```

Results JSON (local, gitignored): `p776-smoke-results/latest.json`

**Recorded:** 2026-06-15 (automated error probes + public models; full auth suite requires `TOKFAI_API_KEY`).

---

## Results table

| Step | Source page / section | Command or action | Expected | Actual | Pass/Fail | request_id | credits_charged | Notes |
|------|----------------------|-------------------|----------|--------|-----------|------------|-----------------|-------|
| API Key create | Dashboard → API Keys | Create test key; copy secret once | Full secret shown only at creation | Manual — run in Dashboard | Manual | — | — | Automated runner cannot create keys without login |
| API Key usage | `/dashboard/docs` → API Key | curl with Bearer | HTTP 200 on chat | Requires `TOKFAI_API_KEY` | Blocked\* | — | — | Re-run script with key |
| Models (public) | `/dashboard/docs` → Chat API | `GET /v1/models` (no auth) | HTTP 200, model list | HTTP 200, **model_count=25** | **Pass** | — | — | Public catalog by design (`GET /v1/models` no auth) |
| Models (Bearer) | Handbook quick start | `GET /v1/models` + Bearer | HTTP 200 | Requires `TOKFAI_API_KEY` | Blocked\* | — | — | Same catalog when key set |
| Chat auto-fast | `/dashboard/docs` → Chat API | `POST /chat/completions` model=auto-fast, "Say ok only." | HTTP 200, request_id, resolved_model | Requires `TOKFAI_API_KEY` | Blocked\* | — | — | Docs curl matches script |
| Usage reconcile | Dashboard → Usage | Search `request_id` | tokens/credits match response | Manual after chat | Manual | — | — | Use chat `request_id` from script output |
| Credits reconcile | Dashboard → Credits | Ledger vs succeeded calls | Debit only on success | Manual after chat | Manual | — | — | Failed probes should not debit |
| Batch create | `/dashboard/docs` → Batch API | `POST /batches/chat` 3 items | HTTP 202, batch id | Requires `TOKFAI_API_KEY` | Blocked\* | — | — | `BATCH_ITEM_COUNT=3` in script |
| Batch poll | Batch API section | `GET /batches/{id}` until completed | All items succeeded + request_ids | Requires `TOKFAI_API_KEY` | Blocked\* | — | — | Sum credits = succeeded items |
| Error missing_token | Error codes chapter | Chat POST without Authorization | 401 `missing_token` | 401 `missing_token` | **Pass** | `req_Gmvy8y60TvhU-8XG` | — | Error responses include request_id |
| Error invalid_token | Error codes chapter | Chat POST bad Bearer | 401 `invalid_token` | 401 `invalid_token` | **Pass** | `req_GoIlSE3V7hljutod` | — | |
| Error bad model | Error codes chapter | Chat POST invalid model id | 4xx + error.code | Requires valid key | Blocked\* | — | — | Invalid key returns `invalid_token` first |
| Docs copy blocks | `/dashboard/docs` | Copy each code/config block | Clipboard text matches UI | Code review P775 | **Pass** | — | — | CopyFieldsTable + CodeBlock + CopyConfigAction |
| Docs customer language | `/dashboard/docs` | Read all sections | No P770–P776, repo, artifact, etc. | grep clean (P776) | **Pass** | — | — | API gateway positioning retained |

\*Blocked in this run: `TOKFAI_API_KEY` not set in CI/agent environment. Operator re-run:

```bash
TOKFAI_API_KEY=sk-tokfai_... BATCH_ITEM_COUNT=3 node scripts/p776-customer-production-smoke.mjs
```

Then complete Usage/Credits manual rows with printed `request_id` and `credits_charged`.

---

## Error probe samples (production)

| Probe | HTTP | error.code | request_id |
|-------|------|------------|------------|
| Chat, no Authorization | 401 | `missing_token` | `req_Gmvy8y60TvhU-8XG` |
| Chat, invalid Bearer | 401 | `invalid_token` | `req_GoIlSE3V7hljutod` |

---

## Docs grep (customer-visible)

```bash
grep -R "P770\|P771\|P772\|P773\|P774\|P775\|P776\|docs/p\|artifact\|internal runbook\|production acceptance\|checklist\|repo\|commit" \
  apps/web/components apps/web/lib
```

No matches in customer handbook paths (excluding dev comments and "public repos" security tip).

---

## Scope

- **Added:** `scripts/p776-customer-production-smoke.mjs`, this doc, `.gitignore` entry for `p776-smoke-results/`
- **Not changed:** billing, Stripe, webhook, credit ledger logic, DMIT core routes, Chat/Image/Batch API behavior

## Operator checklist (manual)

1. Dashboard → API Keys → create `p776-smoke-*` key → copy secret immediately.
2. Export key and run full script; record chat `request_id`, `resolved_model`, `credits_charged`.
3. Usage → search `request_id` → confirm model, tokens, credits.
4. Credits → confirm ledger debit matches Usage.
5. Batch section → confirm 3 item `request_ids` and batch `credits_charged` sum.
