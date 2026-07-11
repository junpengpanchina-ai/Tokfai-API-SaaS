# Tokfai API runtime (PM2 + Nginx)

Production contract for `api.tokfai.com`:

| Item | Value |
|---|---|
| Process manager | **PM2 only** — never bare `node dist/index.js` |
| PM2 app name | `tokfai-api` |
| Bind | `127.0.0.1:8788` |
| Public proxy | Nginx → `http://127.0.0.1:8788` |
| Code path | `/opt/tokfai-api-saas/apps/dmit-api` (typical) |

Do **not** listen on `8787` in production. Port `8787` was the historical default and
has collided with rogue bare-node processes (`EADDRINUSE`), preventing PM2 from
taking over.

## Why PORT=8788

1. A naked `node` process held `127.0.0.1:8787`.
2. PM2 `tokfai-api` could not bind → restart loop / unstable proxy.
3. Production moved to **8788** so Nginx and PM2 have a clean, dedicated port.

## Deploy / restart

```bash
cd /opt/tokfai-api-saas
git pull
cd apps/dmit-api
npm ci
npm run build

# Prefer this helper — kills rogue listeners, migrates legacy dmit-api name,
# starts/reloads tokfai-api on 8788, runs local smoke checks.
bash ../../deploy/runtime/ensure-pm2-only.sh

# Or manually:
# pm2 start ecosystem.config.cjs   # first time
# pm2 reload tokfai-api --update-env
pm2 save
```

`ecosystem.config.cjs` sets `HOST=127.0.0.1` and `PORT=8788` (overrides a stale
`PORT=8787` in `.env` because Node `--env-file` does not overwrite pre-set vars).

## Nginx

See `nginx-api.tokfai.com.conf.example`. After changing upstream port:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## Public smoke (after Nginx points at 8788)

```bash
curl -sS https://api.tokfai.com/health
curl -sS https://api.tokfai.com/v1/models | head
curl -sS https://api.tokfai.com/v1/billing/plans | head
```

Expect HTTP 200 for all three.

## Checkout 500 triage

`POST /v1/billing/checkout` logs structured JSON (no secrets / no Stripe keys):

| Field | Meaning |
|---|---|
| `msg` | `billing_checkout_failed` / `billing_stripe_customer_invalid` / `billing_checkout_session_created` |
| `requestId` | Correlate with `X-Request-Id` |
| `userId` | Supabase user id |
| `planId` | Recharge plan id |
| `orderId` | `credit_orders.id` when created |
| `stripeErrorCode` / `stripeErrorType` | Stripe SDK error fields |
| `message` | Stripe/public error message |

```bash
pm2 logs tokfai-api --lines 200 | rg 'billing_checkout|stripe_customer'
```

If `profiles.stripe_customer_id` is missing, deleted, or from the wrong Stripe
mode (test vs live), DMIT recreates the customer, updates `profiles.stripe_customer_id`,
and retries session creation once.

## Anti-patterns (do not do)

- `node dist/index.js` or `./run-prod.sh` on the production host (use PM2)
- Leaving a second process on 8787/8788
- Exposing 8788 on the public interface
- Pointing Nginx at 8787 after the PORT migration

## Legacy rename

Older docs/scripts used PM2 name `dmit-api`. Canonical name is now `tokfai-api`.
`ensure-pm2-only.sh` deletes the legacy process when present.
