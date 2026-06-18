# P788 — Production recovery gate & deployed-version visibility

> **Internal operator record.** Customers use Dashboard one-line curl only.

## When DMIT / api.tokfai.com is unstable

1. **Do not** loop live curls or run billable smoke without `LIVE=1`.
2. Run offline acceptance: `node scripts/p786-offline-customer-acceptance.mjs`
3. Run customer-visible grep: `node scripts/p778-docs-customer-visible-grep.mjs`

## When checking if production recovered

### Step 1 — Status only (no billable endpoints)

```bash
node scripts/p788-production-recovery-gate.mjs
```

Hits:

- `GET https://api.tokfai.com/health`
- `GET https://api.tokfai.com/v1/status`

No API Key required. No chat / responses / credits debited.

### Step 2 — Read `/v1/status`

Confirm:

| Field | Meaning |
|-------|---------|
| `ok: true` | Process is up |
| `git_commit` | Deployed commit (set `COMMIT_SHA` in DMIT env) |
| `supported_endpoints` | Routes this build advertises |
| `POST /v1/responses` in list | Responses route is in this deployment |

If `git_commit` is `null`, set `COMMIT_SHA` on the DMIT host and redeploy.

### Step 3 — Live billable probes (explicit opt-in, once each)

```bash
LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p788-production-recovery-gate.mjs
```

Order (single request per step):

1. `GET /health`
2. `GET /v1/status`
3. `GET /v1/models`
4. `POST /v1/chat/completions` (one-line body, `Say ok only.`)
5. `POST /v1/responses` (one-line body)

All requests include:

```
X-Tokfai-Acceptance: manual
X-Tokfai-Test-Run: p788
User-Agent: Tokfai-Acceptance/1.0
```

Output: HTTP status, `error.code`, `request_id`, `resolved_model`, `credits_charged` (API key masked).

Results: `p788-recovery-gate-results/latest.json` (gitignored).

## Interpreting failures

| Signal | Likely cause |
|--------|----------------|
| `/v1/status` unreachable | DMIT down, LB, or network |
| `POST /v1/responses` → 404 `route_not_found` | Production not deployed with P785.1 yet |
| 401 `missing_token` | Authorization header missing — re-copy one-line curl (shell line break) |
| 401 `invalid_token` | Wrong or revoked API Key |
| Chat/responses 200 + `request_id` | Ready for Cursor / Cherry Studio client tests |

## Customer path (handbook only)

API Keys → copy one-line curl → paste in terminal → `request_id` → Usage / Credits.

Customers never run `node scripts/*`, never use JWT, never read this doc.

## API: GET /v1/status

Public, no auth. Does not expose Supabase URL, upstream keys, or internal paths.

```json
{
  "ok": true,
  "service": "dmit-api",
  "environment": "production",
  "version": "0.1.0",
  "git_commit": "5372bb4",
  "uptime_seconds": 3600,
  "timestamp": "2026-06-18T12:00:00.000Z",
  "supported_endpoints": [
    "GET /v1/models",
    "POST /v1/chat/completions",
    "POST /v1/responses",
    "POST /v1/images/generations",
    "POST /v1/batches/chat"
  ]
}
```

## Scope

No billing, Stripe, Supabase schema, or `record_usage_and_debit` changes.
