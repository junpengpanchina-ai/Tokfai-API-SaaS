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
- API-key auth for `sk-tokfai-...` tokens
- `/v1/chat/completions`, `/v1/models`, `/v1/embeddings`
- Calls to GRSAI
- Writes to `credit_ledger`, `usage_logs`, `profiles`, or `api_keys`
- Any code path that needs `SUPABASE_SERVICE_ROLE_KEY`, `GRSAI_API_KEY`,
  `TOKEN_PEPPER`, `STRIPE_SECRET_KEY`, or `STRIPE_WEBHOOK_SECRET`

### 3. `apps/dmit-api` — core backend + API gateway (`api.tokfai.com`)
Owns:
- OpenAI-compatible API (`/v1/models`, `/v1/chat/completions`, etc.)
- API-key issuance / revocation (`/v1/keys`)
- Stripe Checkout / Portal endpoints (`/v1/billing/*`)
- Stripe Webhook (`/v1/webhooks/stripe`)
- Calls GRSAI
- Debits credits, writes `credit_ledger`, writes `usage_logs`
- Holds: `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `GRSAI_API_KEY`,
  `TOKEN_PEPPER`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`

---

## Frontend → DMIT auth pattern

| Endpoint family | Auth header | Verified by |
|---|---|---|
| `/v1/keys`, `/v1/billing/checkout` | `Authorization: Bearer <supabase_access_token>` | DMIT verifies with `SUPABASE_JWT_SECRET` (HS256) |
| `/v1/chat/completions`, `/v1/models` | `Authorization: Bearer sk-tokfai-...` | DMIT looks up `key_id`, compares HMAC-SHA256 of secret using `TOKEN_PEPPER` |
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
| `GRSAI_API_KEY` / `GRSAI_API_BASE` | ❌ never | ✅ |
| `STRIPE_SECRET_KEY` | ❌ never | ✅ |
| `STRIPE_WEBHOOK_SECRET` | ❌ never | ✅ |

If you ever add a `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`,
`GRSAI_API_KEY`, or `TOKEN_PEPPER` reference to `apps/web`: **stop**. That
logic belongs in `apps/dmit-api`.

---

## Decision rule when unsure where code goes

> "Does this code path need a secret the frontend isn't allowed to hold,
> or does it need to write to a sensitive table?"
>
> - **Yes** → `apps/dmit-api`. Frontend calls it via fetch, doesn't implement it.
> - **No** → `apps/web` can do it (typically Supabase Auth or RLS-scoped reads).
