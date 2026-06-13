# P758 — Chat upstream 502 investigation (DMIT → GRSAI)

## Symptom

External integration acceptance: Tokfai API key auth works, `/v1/models` returns 200, but `/v1/chat/completions` returns:

```json
{"error":{"message":"Upstream provider failed.","code":"upstream_error","type":"upstream_error"}}
```

HTTP 502 — for both `gpt-5.4` and `gpt-4o-mini`.

## Important distinction

| Endpoint | Source | Proves |
|----------|--------|--------|
| `GET /v1/models` | Supabase catalog (`public.models`) | Model IDs are configured in Tokfai |
| `POST /v1/chat/completions` | GRSAI (or provider pool) | Upstream LLM actually works |

Models 200 **does not** prove GRSAI chat works.

## Investigation on DMIT server

### A. Masked env + URL resolution

```bash
cd /path/to/Tokfai-API-SaaS
node scripts/inspect-dmit-upstream-env.mjs
RUN_PM2_INSPECT=1 node scripts/inspect-dmit-upstream-env.mjs
```

Check:

- `GRSAI_API_BASE` / `GRSAI_BASE_URL` — host only, **no** trailing `/v1`
- `GRSAI_CHAT_COMPLETIONS_PATH` — default `/v1/chat/completions`
- Resolved `full_url` must **not** contain `/v1/v1/`
- `GRSAI_API_KEY` length and mask (not empty, not stale)
- PM2 uses `node_args: --env-file=.env` (see `ecosystem.config.cjs`)

After deploy, `GET /v1/health` also returns masked upstream config:

```bash
curl -sS https://api.tokfai.com/v1/health | jq .upstream
```

### B. Direct GRSAI curl from DMIT (not local laptop)

```bash
node scripts/probe-grsai-upstream.mjs
```

Reads `apps/dmit-api/.env` on the server. Tests:

1. `GET {base}/v1/models`
2. `POST {base}/v1/chat/completions` for each model

| Direct GRSAI | Tokfai API | Likely cause |
|--------------|------------|--------------|
| Fail | Fail | Wrong `GRSAI_API_KEY` / base URL / model on server |
| OK | Fail | DMIT forwarding bug (headers/body/url) |
| Fail (apikey) | `upstream_auth_error` | Key invalid — if Tokfai shows generic `upstream_error`, check DMIT logs |

Reference (unauthenticated, from public internet):

- `POST https://grsaiapi.com/v1/chat/completions` without key → `apikey is empty` (400)
- With fake key → `apikey error` (400) → maps to `upstream_auth_error` in DMIT

Generic `upstream_error` (502) usually means upstream returned **unrecognized 4xx/5xx** or a **proxy HTML** body.

### C. Code review checklist (DMIT)

| Check | Location | Status |
|-------|----------|--------|
| User `sk-tokfai` key **not** forwarded upstream | `grsai.ts` `providerFetch` | Uses `Bearer ${provider.apiKey}` (GRSAI key) |
| No `/v1/v1` doubling | `env.ts` `normalizeGrsaiBaseUrl` | Strips trailing `/v1` from base |
| OpenAI-compatible body | `upstreamChatBody.ts` | Only `model`, `messages`, `stream`, optional `temperature`/`max_tokens` |
| Safe upstream logs | `grsai.ts` | `upstreamHost`, `upstreamPath`, `upstreamStatus`, `upstreamErrorMessage` (≤200), `providerId`, `requestId` |

**Logging bug fixed:** `providerId` was previously stripped by logger allowlist — now included.

### D. Tokfai API re-test

```bash
TOKFAI_API_KEY=sk-tokfai_... node scripts/probe-tokfai-chat-chain.mjs
```

### E. DMIT logs after failed chat

```bash
pm2 logs dmit-api --lines 100 | rg 'upstream_provider_failed|chat_completion_failed'
```

Look for: `upstreamHost`, `upstreamPath`, `upstreamStatus`, `upstreamErrorMessage`, `providerId`, `requestId`.

## Changes in this pass

- `apps/dmit-api/src/lib/upstreamChatBody.ts` — whitelist upstream payload
- `apps/dmit-api/src/upstream/grsai.ts` — broader auth/proxy detection; richer failure logs
- `apps/dmit-api/src/logger.ts` — allow `providerId`, `providerIndex`, `dbErrorCode`
- `apps/dmit-api/src/routes/health.ts` — masked upstream summary in `/v1/health`
- `scripts/inspect-dmit-upstream-env.mjs`
- `scripts/probe-grsai-upstream.mjs`
- `scripts/probe-tokfai-chat-chain.mjs`

## Next step if still 502 after deploy

1. Run `probe-grsai-upstream.mjs` on DMIT — paste masked output
2. Run `probe-tokfai-chat-chain.mjs` — note `request_id`
3. Grep DMIT logs for that `request_id` and `upstream_provider_failed`
4. Compare `upstreamHost`/`upstreamStatus`/`upstreamErrorMessage` with direct curl

Do **not** guess — use the evidence above to decide: fix env vs fix forwarding.
