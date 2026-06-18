# P787 — Live smoke traffic hygiene & customer-safe acceptance

> **Internal operator record.** Customer handbook and Dashboard never reference these scripts.

## Problem

Repeated live curls against `api.tokfai.com` during DMIT instability create noisy production logs (401/404 probes look like scanning). Customer acceptance must stay on **one-line curl** only; engineering smoke must be **offline by default**.

## Customer path (handbook + Dashboard)

1. Create API Key on Dashboard
2. Copy **one-line Chat curl** from the success card or Docs Quick Start
3. Paste in any terminal (zsh/bash or PowerShell `curl.exe`) — no repo, no `cd`, no install
4. HTTP 200 → copy `request_id`, `credits_charged`, `tokfai.resolved_model`
5. Dashboard → Usage / Credits → search `request_id`

Customers **never** run `node scripts/*`, never use `TOKFAI_SUPABASE_JWT`, never hit internal operator docs.

## Operator path (default offline)

| Command | Mode | Hits production? |
|---------|------|------------------|
| `node scripts/p787-acceptance-runner.mjs` | Offline default | No — runs P786 mock + grep |
| `node scripts/p786-offline-customer-acceptance.mjs` | Offline mock | No |
| `node scripts/p778-docs-customer-visible-grep.mjs` | Static scan | No |

## Live smoke (explicit opt-in only)

Set `LIVE=1` or pass `--live`. Each endpoint **once** — no loops, no load test.

```bash
LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p787-live-smoke.mjs
LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p776-customer-production-smoke.mjs
LIVE=1 node scripts/p778-13-one-line-curl-regression.mjs
LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p785-1-responses-smoke.mjs
```

### Live request headers (all `acceptanceFetch` / live curls)

```
X-Tokfai-Acceptance: manual
X-Tokfai-Test-Run: p787
User-Agent: Tokfai-Acceptance/1.0
```

Override run id: `TOKFAI_ACCEPTANCE_RUN=p787`

## Shared libraries

| File | Role |
|------|------|
| `scripts/lib/acceptance-config.mjs` | `LIVE=1` / `--live`, mock vs production base URL |
| `scripts/lib/acceptance-http.mjs` | Headers + `acceptanceFetch()` |
| `scripts/lib/ensure-mock-gateway.mjs` | Start/connect P786 mock on `127.0.0.1:8787` |

## Scripts gated on LIVE

- `p776-customer-production-smoke.mjs` — offline: error probes on mock; live: full suite
- `p778-13-one-line-curl-regression.mjs` — offline: shell probes on mock; live: real key + headers
- `p785-1-responses-smoke.mjs` — offline: mock; live: production
- `p778-14-real-key-e2e-acceptance.mjs` — **live only** (JWT + API)
- `p780-production-customer-live-walkthrough.mjs` — **live only**
- `production-ux-smoke.mjs` — **live only**

## Verification

```bash
cd apps/web && npm run typecheck && npm run build
node scripts/p778-docs-customer-visible-grep.mjs
node scripts/p786-offline-customer-acceptance.mjs
```

## Billing / backend

No changes to billing, Stripe, Supabase schema, `record_usage_and_debit`, or DMIT business logic.
