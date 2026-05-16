# DMIT — Tokfai backend (`api.tokfai.com`)

> Hono + Node 20 + TypeScript. Holds every server-only secret. Frontend
> (`apps/web`) calls this over HTTPS — never imports from it.

## Routes (D2 status)

| Route | Auth | Status |
|---|---|---|
| `GET /v1/health` | none | ✅ implemented |
| `GET /v1/keys` | Supabase JWT | ⏳ 501 stub (D3) |
| `POST /v1/keys` | Supabase JWT | ⏳ 501 stub (D3) |
| `DELETE /v1/keys/:id` | Supabase JWT | ⏳ 501 stub (D3) |
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
  `TOKEN_PEPPER`, `GRSAI_API_KEY`, `STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET`. None of these may appear in `apps/web`.
- Writes to `usage_logs`, `credit_ledger`, `profiles.credits_*` happen here
  only, via the `debit_credits` and `credit_purchase` RPCs (atomic).
- The raw `sk-tokfai_...` secret is never stored. Only its HMAC.
- See `.cursor/rules/dmit-server.mdc` and root `AGENTS.md`.
