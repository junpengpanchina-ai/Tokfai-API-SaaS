# P778.15 — Operator smoke vs customer docs (internal)

> Internal engineering note. Not for customer UI.

## Customer path

API Key → one-line curl → `request_id` → Dashboard Usage/Credits.  
Documented in `/dashboard/docs` and API Keys success card only.

## Operator smoke scripts (P787 — offline default)

| Script | Default | Live (`LIVE=1`) |
|--------|---------|-----------------|
| `scripts/p787-acceptance-runner.mjs` | P786 offline + grep | `p787-live-smoke.mjs` |
| `scripts/p786-offline-customer-acceptance.mjs` | Mock gateway | — |
| `scripts/p787-live-smoke.mjs` | Exits unless `LIVE=1` | One shot per endpoint |
| `scripts/p788-production-recovery-gate.mjs` | `/health` + `/v1/status` only | `LIVE=1` adds models/chat/responses once |
| `scripts/p776-customer-production-smoke.mjs` | Mock error probes | Full production suite |
| `scripts/p778-13-one-line-curl-regression.mjs` | Mock shell probes | Live key + acceptance headers |
| `scripts/p785-1-responses-smoke.mjs` | Mock | Production responses |
| `scripts/p778-14-real-key-e2e-acceptance.mjs` | — | JWT E2E (live only) |
| `scripts/p780-production-customer-live-walkthrough.mjs` | — | Live only |
| `scripts/p778-docs-customer-visible-grep.mjs` | Static scan | — |

See `docs/p787-live-smoke-traffic-hygiene.md` for headers and hygiene rules.
See `docs/p788-production-recovery-gate.md` for `/v1/status` and recovery sequencing before live smoke.

Artifacts: `p776-smoke-results/`, `p778-live-smoke-results/`, `p787-live-smoke-results/`, `p788-recovery-gate-results/`, `p786-offline-results/` (gitignored).

See `docs/p788-production-recovery-gate.md` for `/v1/status` and recovery sequencing.

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
