# P766.3 — Production API key recovery smoke results

Companion to [P766.2 — API keys DB compatibility and RLS](./p766-2-api-keys-compat-rls.md).
DMIT code change: isolated `supabaseAdmin()` / `supabaseAuth()` clients so JWT
verification does not pollute PostgREST `Authorization` (commit `9f34de3`).

## Root cause

DMIT `SUPABASE_SERVICE_ROLE_KEY` was misconfigured:

- **publishable / anon key** (or a **short secret**) was set instead of the
  Supabase **Secret** (`service_role`) key.
- PostgREST therefore did **not** act as `service_role`; `api_keys` inserts from
  DMIT were subject to RLS and failed with:

  `new row violates row-level security policy for table "api_keys"`

Symptoms in production:

- `POST /v1/me/api-keys` → 500, log `create_api_key_failed`
- Dashboard API Keys list empty or create failed
- Existing keys in DB unchanged but not manageable from the UI

## Fix (production ops)

1. Open **Supabase Dashboard → Project Settings → API Keys**.
2. Copy the **Secret** key (`sb_secret_…` — **not** the publishable / anon key).
3. On the DMIT host, set `SUPABASE_SERVICE_ROLE_KEY` to that value (env file or
   process manager env).
4. Reload the process with updated env:

   ```bash
   pm2 restart dmit-api --update-env
   pm2 save
   ```

5. Confirm startup logs show no `supabase_admin_config_missing` or
   `supabase_admin_config_role_mismatch` warnings.

Do **not** paste the real key into tickets, commits, or this doc — use masked
values only (see Security below).

## Verification (post-fix)

| Check | Result |
| --- | --- |
| Dashboard — create API key | Success |
| Dashboard — list old keys | Restored; historical keys visible again |
| `scripts/test-api-keys-management.mjs` | Passed (list / create / revoke) |
| `GET /v1/models` | HTTP **200**, `models=25` |
| `POST /v1/chat/completions` | HTTP **200** |
| `request_id` | `req_dmdxHyZrwA3fnmrF` |
| `resolved_model` | `gemini-3-flash` |

Example smoke (JWT from dashboard session; never log the full token):

```bash
TOKFAI_SUPABASE_JWT=<access_token> node scripts/test-api-keys-management.mjs
```

Optional API-key auth leg after management tests:

```bash
TOKFAI_API_KEY=sk-tokfai_<48 hex> node scripts/test-api-keys-management.mjs
```

## Security

- **Never commit** real `SUPABASE_SERVICE_ROLE_KEY`, `sb_secret_…`, or
  `sk-tokfai_…` values to the repo.
- Screenshots and runbooks: show **masked** keys only, e.g.
  `sb_secret_abc1…xyz9 (len=…)`, `sk-tokfai_6b7f1e7a… (len=…)`.
- If a secret was exposed in chat or logs, rotate it in Supabase and update DMIT
  env, then `pm2 restart --update-env` again.

## Related

- Migration: `supabase/migrations/0030_p766_2_api_keys_compat_rls.sql`
- DB compat check: `scripts/check-api-keys-db-compat.mjs`
- Management smoke: `scripts/test-api-keys-management.mjs`
