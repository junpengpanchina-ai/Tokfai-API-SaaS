# Tokfai — Agent Guide

> Read this **before writing any code in this repo.** It defines the three-layer
> architecture and the hard boundaries every agent (Cursor, Codex CLI, any
> other) must respect.

This monorepo contains two deployable apps. Their boundaries are rigid.

```
apps/
├── web/           # Vercel frontend  (tokfai.com)        — anon key only
└── dmit-api/      # Core backend     (api.tokfai.com)    — all secrets live here
supabase/
└── migrations/    # Source of truth for the database
```

---

## Three logical layers

### 1. Supabase — database + identity (managed)
Owns:
- `auth.users` (Supabase Auth)
- `public.profiles`
- `public.credit_ledger`
- `public.usage_logs`
- `public.api_keys` (hashed)
- RPCs: `public.debit_credits`, `public.credit_purchase`

Keys:
- **`apps/web` may only use** `SUPABASE_URL` + `SUPABASE_ANON_KEY`.
- **`apps/dmit-api` holds** `SUPABASE_SERVICE_ROLE_KEY` + `SUPABASE_JWT_SECRET`.
- Sensitive tables have RLS. The frontend reads only the current user's own
  rows via the user's Supabase session. All writes go through DMIT.

### 2. `apps/web` — frontend (`tokfai.com`)
Owns:
- Marketing site (landing / pricing / docs)
- Auth pages (login / signup / reset) → calls Supabase Auth directly
- Authenticated dashboard: API Keys, Playground, Usage, Credits
- Calls the public DMIT API at `api.tokfai.com`
- Reads the user's own `profiles` / `credit_ledger` / `usage_logs` / `api_keys`
  via anon key + user session (RLS-protected)

Does **not** own and must **never** implement:
- Stripe Webhook handler
- API-key auth for `sk-tokfai_...` tokens
- `/v1/chat/completions`, `/v1/models`, `/v1/embeddings`
- Calls to GRSAI
- Writes to `credit_ledger`, `usage_logs`, `profiles`, or `api_keys`
- Any code path that needs `SUPABASE_SERVICE_ROLE_KEY`, `GRSAI_API_KEY`,
  `TOKEN_PEPPER`, `TOKFAI_KEY_ENCRYPTION_SECRET`, `STRIPE_SECRET_KEY`, or
  `STRIPE_WEBHOOK_SECRET`

### 3. `apps/dmit-api` — core backend + API gateway (`api.tokfai.com`)
Owns:
- OpenAI-compatible API (`/v1/models`, `/v1/chat/completions`, etc.)
- API-key issuance / revocation (`/v1/keys`)
- Stripe Checkout / Portal endpoints (`/v1/billing/*`)
- Stripe Webhook (`/v1/webhooks/stripe`)
- Calls GRSAI
- Debits credits, writes `credit_ledger`, writes `usage_logs`
- Holds: `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `GRSAI_API_KEY`,
  `TOKEN_PEPPER`, `TOKFAI_KEY_ENCRYPTION_SECRET`, `STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET`

---

## Frontend → DMIT auth pattern

| Endpoint family | Auth header | Verified by |
|---|---|---|
| `/v1/keys`, `/v1/billing/checkout` | `Authorization: Bearer <supabase_access_token>` | DMIT verifies with `SUPABASE_JWT_SECRET` (HS256) |
| `/v1/chat/completions`, `/v1/models` | `Authorization: Bearer sk-tokfai_...` | DMIT validates the key format and looks up HMAC-SHA256 of the full token using `TOKEN_PEPPER` |
| `/v1/webhooks/stripe` | `Stripe-Signature` header | DMIT verifies with `STRIPE_WEBHOOK_SECRET` |

The frontend never mints its own tokens and never reads service-role secrets.

---

## Environment variables matrix

| Variable | `apps/web` | `apps/dmit-api` |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | — |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | — |
| `NEXT_PUBLIC_DMIT_API_BASE` | ✅ | — |
| `NEXT_PUBLIC_SITE_URL` | ✅ | — |
| `SUPABASE_URL` | — | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | ❌ never | ✅ |
| `SUPABASE_JWT_SECRET` | ❌ never | ✅ |
| `TOKEN_PEPPER` | ❌ never | ✅ |
| `TOKFAI_KEY_ENCRYPTION_SECRET` | ❌ never | ✅ |
| `GRSAI_API_KEY` / `GRSAI_API_BASE` | ❌ never | ✅ |
| `STRIPE_SECRET_KEY` | ❌ never | ✅ |
| `STRIPE_WEBHOOK_SECRET` | ❌ never | ✅ |

If you ever add a `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`,
`GRSAI_API_KEY`, `TOKEN_PEPPER`, or `TOKFAI_KEY_ENCRYPTION_SECRET` reference
to `apps/web`: **stop**. That logic belongs in `apps/dmit-api`.

---

## Decision rule when unsure where code goes

> "Does this code path need a secret the frontend isn't allowed to hold,
> or does it need to write to a sensitive table?"
>
> - **Yes** → `apps/dmit-api`. Frontend calls it via fetch, doesn't implement it.
> - **No** → `apps/web` can do it (typically Supabase Auth or RLS-scoped reads).

---

## Release gate (mandatory)

After any change to `apps/dmit-api/src` or `scripts/`, and before declaring a
commit or deploy complete:

```bash
TOKFAI_API_KEY=sk-tokfai_... node scripts/tokfai-release-gate.mjs
```

Hard limits:

1. Do **not** declare done after only `typecheck` / `build`.
2. Do **not** declare available from `pm2 online` alone.
3. The gate must run typecheck, build, LIVE p932/p933/p941/p942/p946, and
   `public-beta-ready-all`.
4. Only these PASS markers count (all required):
   - `TOKFAI_P932_CHERRY_STUDIO_REAL_BODY_PASS`
   - `TOKFAI_P933_CHERRY_STUDIO_COMPAT_MATRIX_PASS`
   - `TOKFAI_P941_API_ISOLATION_CORE_PASS`
   - `TOKFAI_P942_VISION_ANALYZE_PASS`
   - `TOKFAI_P946_GEMINI_25_FLASH_NONSTREAM_PASS`
   - `TOKFAI_PUBLIC_BETA_READY_ALL_PASS`
5. Missing any PASS → **STOP** (no new feature work).
6. Logs with `undefined` / `empty body` / `api_error_500` / `charged timeout`
   → rollback or fix, then re-run.
7. New work must not break Cherry Studio, billing, alias, timeout, or image
   generation main paths.

Completion report must include: git commit hash, changed files, the five PASS
results, `pm2 status`, and grep of the last ~800 error-log lines.
