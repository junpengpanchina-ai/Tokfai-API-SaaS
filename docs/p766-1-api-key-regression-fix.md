# P766.1 — API key management and token authentication regression fix

## Symptoms (production smoke)

After P766 provider routing deployed to DMIT:

| Check | Result |
|---|---|
| `scripts/test-provider-routing.mjs` | HTTP 401 `invalid_token` — API key not recognised |
| Manual `POST /v1/chat/completions` | Same 401 |
| Dashboard **Create API key** (`POST /v1/me/api-keys`) | HTTP 500 |
| Dashboard **Revoke** (`POST /v1/me/api-keys/revoke`) | HTTP 404 `api_key_not_found` |
| Dashboard **Copy key** on existing active key | Copied value still 401 on DMIT |

## Root causes

1. **Create 500** — `POST /v1/me/api-keys` called `encryptSecret()` unconditionally. When `TOKFAI_KEY_ENCRYPTION_SECRET` is unset or too short, creation threw before insert. Auth only needs `hash`; encryption is optional for reveal/copy.
2. **Create 500 (duplicate names)** — name-uniqueness pre-check used `.maybeSingle()`. Multiple active rows with the same name caused a Supabase error surfaced as 500 instead of 409.
3. **Revoke 404** — revoke resolved only by UUID `id`. Rows created under older flows or mismatched identifiers could not be found; no `key_id` fallback.
4. **Auth `invalid_token`** — verification only queried `api_keys.hash`. Keys created during the `key_id` lookup era, or legacy `sk-tokfai-xxx.xxx` tokens, could miss hash-only lookup even when the row exists. No safe diagnostic logging.
5. **Missing hash index** — `api_keys.hash` had no partial index for active keys (slow lookups at scale; suggested in P759 docs).

## Fixes

### DMIT (`apps/dmit-api`)

- **`encryptSecretIfConfigured()`** — create stores `encrypted_secret` only when encryption is configured; otherwise `null` (`can_reveal: false`). Hash is always written; auth works immediately.
- **`verifyApiKeyToken()`** — primary hash lookup; fallback `key_id` + hash compare for `sk-tokfai_<48 hex>`; legacy `sk-tokfai-xxx.xxx` support (HMAC of secret segment + `key_id` lookup).
- **Revoke / reveal** — resolve row by UUID `id` or `key_id`; ignore reserved `:id` params `revoke` / `reveal`.
- **Safe logs** (no full secrets):
  - `create_api_key_failed` — `userId`, `code`, `dbErrorMessage` (≤160 chars)
  - `revoke_api_key_failed` — `userId`, masked `keyId`
  - `invalid_token` — masked `tokenPrefix`, lookup path

### Database

- Migration `0029_p766_1_api_keys_hash_index.sql` — `api_keys_hash_active_idx` on `(hash) WHERE revoked_at IS NULL`.

### Scripts

- `scripts/test-api-keys-management.mjs` — API key auth smoke for `GET /v1/models` and `POST /v1/chat/completions` (no full key in logs).

## Production smoke steps

1. **Apply migration** (Supabase SQL editor or `supabase db push`):
   - `supabase/migrations/0029_p766_1_api_keys_hash_index.sql`
2. **Deploy DMIT** with this fix to `api.tokfai.com`.
3. **Dashboard** (`/dashboard/api-keys`):
   - Create a new key (e.g. name `smoke-p766-1`).
   - Copy the one-time full secret (`sk-tokfai_<48 hex>`).
   - Confirm **Revoke** succeeds on a test key.
4. **CLI auth smoke** (use the new key; never commit it):

```bash
export TOKFAI_API_KEY='sk-tokfai_<paste-48-hex>'
node scripts/test-api-keys-management.mjs
node scripts/test-provider-routing.mjs
```

5. **Revoke check** — revoke the smoke key in the dashboard, then:

```bash
node scripts/test-api-keys-management.mjs   # expect 401 invalid_token or key_revoked
```

6. **DMIT logs** — on failure, grep for `create_api_key_failed`, `revoke_api_key_failed`, `invalid_token` (only masked prefixes).

## Acceptance

- [ ] `npm run typecheck` (web + dmit-api)
- [ ] `npm run build` (web + dmit-api)
- [ ] Dashboard create returns 201 + one-time secret
- [ ] New key → `GET /v1/models` 200
- [ ] New key → `POST /v1/chat/completions` `auto-fast` 200 (or standard upstream/billing error)
- [ ] Revoke → same key returns 401
- [ ] `scripts/test-provider-routing.mjs` not blocked by `invalid_token`

## Out of scope

- Stripe / checkout / webhook
- Ledger RPCs (`debit_credits`, P765 idempotency)
- `/v1/chat/completions` routing logic (P766 provider pool unchanged)
