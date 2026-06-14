# P766.2 — API keys DB compatibility and RLS policies

## Production evidence

- `api_keys` data intact: total=35, active=16, revoked=19
- Missing `can_reveal` column caused list/create fragility
- Create failed with RLS: `new row violates row-level security policy for table "api_keys"`
- Dashboard showed empty state on list 500

## Migration

`supabase/migrations/0030_p766_2_api_keys_compat_rls.sql` (idempotent):

- `can_reveal boolean not null default false`
- Backfill `can_reveal=true` where `encrypted_secret is not null` and active
- RLS policies: `api_keys_select_own`, `api_keys_insert_own`, `api_keys_update_own` (authenticated)
- `api_keys_service_role_all` for DMIT `service_role` writes
- `api_keys_hash_active_idx` on `(hash) where revoked_at is null`

## DMIT

- `lib/apiKeysDb.ts` — list/create/revoke with `can_reveal` column fallback
- Create always writes `hash`, `prefix`, `key_id`; `encrypted_secret` + `can_reveal` only when encryption configured
- Create failure logs: `dbErrorMessage` (≤180 chars) + Postgres `code` in message

## Frontend

- List 500 → error banner, not empty state
- `can_reveal === true` required for Copy button
- Legacy keys: “Full key is not available. Create a new key.”

## Verify

```bash
# DB shape (service role)
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/check-api-keys-db-compat.mjs

# Auth smoke after creating a key in dashboard
TOKFAI_API_KEY=sk-tokfai_... node scripts/test-api-keys-management.mjs
```

Apply migration before or with DMIT deploy.

## Production recovery (P766.3)

Wrong `SUPABASE_SERVICE_ROLE_KEY` on the DMIT host (publishable/anon or short
secret) was the production blocker after P766.2. Ops fix + smoke results:
[docs/p766-3-api-key-production-recovery.md](./p766-3-api-key-production-recovery.md).

## Provider health acceptance (P766.4)

Multi-model probe + pass criteria:
[docs/p766-4-provider-health-production-acceptance.md](./p766-4-provider-health-production-acceptance.md).
