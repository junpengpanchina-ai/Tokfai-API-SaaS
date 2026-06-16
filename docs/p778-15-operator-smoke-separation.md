# P778.15 — Operator smoke vs customer docs (internal)

> Internal engineering note. Not for customer UI.

## Operator smoke scripts

| Script | Purpose | Auth |
|--------|---------|------|
| `scripts/p776-customer-production-smoke.mjs` | API error probes + optional full auth suite | `TOKFAI_API_KEY` |
| `scripts/p778-13-one-line-curl-regression.mjs` | One-line curl shell quoting + optional live | `TOKFAI_API_KEY` |
| `scripts/p778-14-real-key-e2e-acceptance.mjs` | Create/revoke key + Usage/Credits API reconcile | `TOKFAI_SUPABASE_JWT` |
| `scripts/p778-docs-customer-visible-grep.mjs` | Scan `apps/web` customer-visible strings | — |

All scripts write artifacts under `p776-smoke-results/` or `p778-live-smoke-results/` (gitignored).

## Customer docs must not mention

- `TOKFAI_SUPABASE_JWT`
- `node scripts/...`
- Operator smoke / production acceptance artifacts
- DMIT as an internal product name (use “Tokfai API” in handbook)

## Customer handbook must only say

- Base URL `https://api.tokfai.com/v1`
- API Key `sk-tokfai_xxx` (placeholder until created)
- `Authorization: Bearer sk-tokfai_xxx`
- Model `auto-fast`
- Copy one-line curl / SDK / Cursor / Cherry config
- `request_id` → Dashboard → Usage / Credits
