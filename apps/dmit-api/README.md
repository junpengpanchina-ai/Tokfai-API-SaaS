# DMIT — Tokfai backend (`api.tokfai.com`)

> Hono + Node 20 + TypeScript. Holds every server-only secret. Frontend
> (`apps/web`) calls this over HTTPS — never imports from it.

## Routes (D2 status)

| Route | Auth | Status |
|---|---|---|
| `GET /v1/health` | none | ✅ implemented |
| `GET /v1/keys` | Supabase JWT | ✅ implemented (legacy alias) |
| `POST /v1/keys` | Supabase JWT | ✅ implemented (legacy alias) |
| `POST /v1/keys/:id/reveal` | Supabase JWT | ✅ implemented |
| `POST /v1/keys/:id/revoke` | Supabase JWT | ✅ implemented |
| `DELETE /v1/keys/:id` | Supabase JWT | ✅ implemented |
| `GET /v1/me/api-keys` | Supabase JWT | ✅ implemented (dashboard) |
| `POST /v1/me/api-keys` | Supabase JWT | ✅ implemented (dashboard) |
| `POST /v1/me/api-keys/reveal` | Supabase JWT | ✅ implemented |
| `POST /v1/me/api-keys/revoke` | Supabase JWT | ✅ implemented |
| `DELETE /v1/me/api-keys/:id` | Supabase JWT | ✅ implemented |
| `POST /v1/billing/checkout` | Supabase JWT | ⏳ 501 stub (D4) |
| `POST /v1/webhooks/stripe` | `Stripe-Signature` | ⏳ 501 stub (D4) |
| `GET /v1/models` | `sk-tokfai_...` | ⏳ 501 stub (D5) |
| `POST /v1/chat/completions` | `sk-tokfai_...` | ⏳ 501 stub (D5) |

## Local dev

```bash
cp .env.example .env
# fill in the values

npm install
npm run dev    # tsx watch on PORT (default 8787)
```

Smoke test:

```bash
curl -i http://localhost:8787/v1/health
# 200 { "ok": true, "service": "dmit", "version": "..." }
```

## Admin dashboard smoke test

Run **each command in its own shell** (or on its own line without chaining).
If you pipe `curl` to `jq` in the same line as `git status`, `pm2 logs`, or
other tools, jq will try to parse their stdout and fail — that is a shell
usage issue, not mixed content in the API response. DMIT endpoints return a
single JSON body (`Content-Type: application/json`) via Hono `c.json`.

Replace `BASE` and `TOKEN` (Supabase access token for an active admin account).

```bash
# 1) Public health (no auth)
curl -sS "http://localhost:8787/v1/health" | jq .

# 2) Public billing plans (no auth)
curl -sS "http://localhost:8787/v1/billing/plans" | jq .

# 3) Admin dashboard summary (Bearer JWT required)
curl -sS "http://localhost:8787/admin/dashboard-summary" \
  -H "Authorization: Bearer TOKEN" | jq .
```

Expected shape for (3): `{ "data": { ...metrics }, "warnings": [] }`.

## User API Keys smoke test

Dashboard uses `/v1/me/api-keys`. Replace `BASE` and `TOKEN` (Supabase access
token for a signed-in user — not an admin-only token, not `sk-tokfai_...`).

Run **each command on its own line** (same jq piping note as above).

```bash
export BASE="http://localhost:8787"
export TOKEN="<supabase_access_token>"

# 1) List keys (metadata only — no secret)
curl -sS "$BASE/v1/me/api-keys" \
  -H "Authorization: Bearer $TOKEN" | jq .

# 2) Create key (secret returned once)
CREATE=$(curl -sS -X POST "$BASE/v1/me/api-keys" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"smoke-test"}')
echo "$CREATE" | jq .
export SK=$(echo "$CREATE" | jq -r '.secret')
export KEY_ID=$(echo "$CREATE" | jq -r '.api_key.id')

# 3) Reveal (owner copy)
curl -sS -X POST "$BASE/v1/me/api-keys/reveal" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"id\":\"$KEY_ID\"}" | jq .

# 4) Revoke (soft delete; response includes revoked_at)
curl -sS -X POST "$BASE/v1/me/api-keys/revoke" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"id\":\"$KEY_ID\"}" | jq .

# 5) Revoked key rejected on chat (401 key_revoked)
curl -sS -o /dev/null -w "HTTP %{http_code}\n" -X POST "$BASE/v1/chat/completions" \
  -H "Authorization: Bearer $SK" \
  -H "Content-Type: application/json" \
  -d '{"model":"gemini-3.1-pro","messages":[{"role":"user","content":"ping"}]}'
```

Supabase read-only acceptance SQL: `supabase/scripts/p735_api_keys_verify.sql`.

## Build

```bash
npm run build   # tsc -> dist/
npm start       # node dist/index.js
```

## Container

```bash
docker build -t tokfai-dmit-api .
docker run --rm -p 8787:8787 --env-file .env tokfai-dmit-api
```

Suitable hosts: Fly.io, Railway, Render, Cloud Run, Heroku, EC2/ECS, etc.
Any Node-capable container platform works.

## Project layout

```
src/
├── index.ts                # entry: serve(app, { port })
├── app.ts                  # Hono composition + route mounts
├── env.ts                  # zod-validated env loader
├── logger.ts               # tiny structured logger
├── errors.ts               # ApiError + error envelope
├── supabase.ts             # service_role client (singleton)
├── stripe.ts               # Stripe SDK (singleton)
├── types.ts                # shared row types
├── auth/
│   ├── hash.ts             # HMAC-SHA256 + constant-time compare
│   ├── jwt.ts              # Supabase JWT verification (HS256, jose)
│   └── apiKey.ts           # sk-tokfai parse / lookup / verify
├── middleware/
│   ├── cors.ts
│   ├── requestId.ts
│   ├── error.ts            # catches throw -> error envelope
│   ├── supabaseJwt.ts      # requires valid Supabase Bearer
│   └── apiKey.ts           # requires valid sk-tokfai Bearer
├── upstream/
│   ├── grsai.ts            # OpenAI-compatible passthrough client
│   └── pricing.ts          # model -> per-token cost table
└── routes/
    ├── health.ts
    ├── keys.ts             # /v1/keys
    ├── billing.ts          # /v1/billing/*
    ├── webhooks.ts         # /v1/webhooks/stripe
    ├── chat.ts             # /v1/chat/completions
    └── models.ts           # /v1/models
```

## Boundary reminders

- This app holds: `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`,
  `TOKEN_PEPPER`, `TOKFAI_KEY_ENCRYPTION_SECRET`, `GRSAI_API_KEY`,
  `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. None of these may appear in
  `apps/web`.
- Writes to `usage_logs`, `credit_ledger`, `profiles.credits_*` happen here
  only, via the `debit_credits` and `credit_purchase` RPCs (atomic).
- The raw `sk-tokfai_...` secret is stored only as AES-256-GCM ciphertext for
  owner reveal/copy. Authentication uses only its HMAC hash.
- Legacy `sk-tokfai-xxx.xxx` keys are deprecated and must be regenerated.
- See `.cursor/rules/dmit-server.mdc` and root `AGENTS.md`.
