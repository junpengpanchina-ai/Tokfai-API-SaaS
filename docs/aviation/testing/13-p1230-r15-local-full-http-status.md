# P1230-R1.5 Local Full HTTP — status

```text
READ_ONLY_APPLICATION_CODE=TRUE
LOCAL_FULL_HTTP_BLOCKED_BY_ENV=YES
APPLICATION_CODE_CHANGE_REQUIRED=NO
REAL_DMIT_TEST_EXECUTED=NO
git_HEAD=5f25c399d08bcb419d77f9061663f835627922b1
```

## Entrypoint

```text
DMIT_HTTP_ENTRYPOINT=apps/dmit-api/src/index.ts
DMIT_LOCAL_PORT=8787
DMIT_START_COMMAND=cd apps/dmit-api && npm run start   # or: npm run dev
PROD_PM2_NAME=tokfai-api
PROD_PORT=8788
```

## Why L1 did not run

1. `apps/dmit-api/.env` absent (`HAS_ENV=no`).
2. Boot requires real Supabase + TOKEN_PEPPER + GRSAI_API_KEY + STRIPE_WEBHOOK_SECRET (see `.env.example`).
3. `/v1/responses` requires `verifyApiKeyToken` → live `api_keys` HMAC lookup — synthetic Zod-only env cannot close Full HTTP auth.
4. Auth/billing/state bypass forbidden this round.

Prior honesty bound still applies: `PROTOCOL_GATEWAY_WITH_REAL_DIST_LIBS` (P1230-R1), not Full HTTP.

## Local gate results

```text
LOCAL_FULL_HTTP_TEXT_PASS=NO
LOCAL_FULL_HTTP_TOOL_ROUNDTRIP_PASS=NO
LOCAL_FULL_HTTP_RESUME_PASS=NO
LOCAL_FULL_HTTP_MAX_RESUME_ROUNDS=0
LOCAL_FULL_HTTP_SESSION_ISOLATION_PASS=NO
LOCAL_FULL_HTTP_MAX_SESSIONS=0
LOCAL_FULL_HTTP_SSE_PASS=NO
LOCAL_CLIENT_ABORT_PASS=NO
```

## Unblock path (ops — not code)

Provide a **synthetic/dev** `apps/dmit-api/.env` (not production) with:

- Reachable Supabase project (or dedicated staging) + matching pepper
- Test `sk-tokfai_` whose hash is in that DB
- `GRSAI_API_BASE` → local mock OpenAI-compatible chat
- `STRIPE_WEBHOOK_SECRET` dummy acceptable to Zod

Then re-run L1 without touching `apps/dmit-api/src/**`.

If product insists on Full HTTP without any Supabase: that needs an authorized application-code test harness path — out of scope until requested; would set `APPLICATION_CODE_CHANGE_REQUIRED=YES`.
