# Tokfai web (`tokfai.com`)

Next.js frontend for the Tokfai dashboard and marketing site. Deployed on **Vercel**.

This repo is a monorepo:

| Path | Deploy target |
|------|----------------|
| `apps/web` | Vercel |
| `apps/dmit-api` | DMIT (`api.tokfai.com`) |
| `supabase/migrations` | Supabase (database) |

## Vercel project settings

Vercel must build from this directory, not the monorepo root (the root has no Next.js `package.json`).

| Setting | Value |
|---------|--------|
| **Root Directory** | `apps/web` |
| **Framework Preset** | Next.js |
| **Build Command** | `npm run build` (or leave default) |
| **Output Directory** | default (`.next`) |

No `vercel.json` is required for this layout.

## Environment variables (Vercel only)

Configure **only** `NEXT_PUBLIC_*` variables in the Vercel project:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_DMIT_API_BASE`
- `NEXT_PUBLIC_SITE_URL`

Do **not** add server-only secrets to Vercel (`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `TOKEN_PEPPER`, private channel API keys, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, etc.). Those belong in `apps/dmit-api` on DMIT.

See `.env.local.example` for local development values.
