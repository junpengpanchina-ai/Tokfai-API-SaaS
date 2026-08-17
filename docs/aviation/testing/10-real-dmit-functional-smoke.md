# 10 — Real DMIT Functional Smoke (PREPARE ONLY)

```text
P1230-R1.5 L2
REAL_DMIT_TEST_EXECUTED=NO
PRODUCTION_LOAD_TEST_EXECUTED=NO
Cursor must NOT run these against production.
```

## Goal

Very small request volume proving:

```text
Mac → HTTPS api.tokfai.com → real DMIT → real provider
```

Not a load test. Not P1231.

## Gate from L1

Enter only when local Full HTTP gates are YES:

```text
FULL_HTTP_TEXT_PASS
FULL_HTTP_TOOL_ROUNDTRIP_PASS
FULL_HTTP_RESUME_PASS
FULL_HTTP_SESSION_ISOLATION_PASS
FULL_HTTP_SSE_PASS
```

As of R1.5 preparation on this Mac workspace:

```text
LOCAL_FULL_HTTP_BLOCKED_BY_ENV=YES
→ REAL_DMIT_MANUAL_VERIFICATION_READY=NO until L1 unblocked + PASS
```

See § Local Full HTTP discovery below. Mac runbook still prepared in
[11-mac-real-dmit-verification.md](./11-mac-real-dmit-verification.md).
DMIT observation in
[12-dmit-real-http-observation.md](./12-dmit-real-http-observation.md).

## Local Full HTTP discovery (read-only)

| Field | Value |
| ----- | ----- |
| `DMIT_HTTP_ENTRYPOINT` | `apps/dmit-api/src/index.ts` → `@hono/node-server` `serve` + `buildApp()` |
| `DMIT_LOCAL_PORT` | default **8787** (`env.ts` / `.env.example`); production PM2 **8788** |
| `DMIT_START_COMMAND` | local: `cd apps/dmit-api && npm run start` (`node --env-file=.env dist/index.js`) or `npm run dev` (`tsx watch src/index.ts`) |
| Prod process | PM2 name `tokfai-api` via `ecosystem.config.cjs` — do not restart in this round |

```text
LOCAL_HTTP_ENV_REQUIREMENTS:
  SUPABASE_URL                    (required URL)
  SUPABASE_SERVICE_ROLE_KEY       (recommended; admin writes)
  SUPABASE_JWT_SECRET             (≥20)
  TOKEN_PEPPER                    (≥32; API key HMAC)
  TOKFAI_KEY_ENCRYPTION_SECRET    (optional but typical)
  GRSAI_API_BASE / GRSAI_API_KEY  (upstream; can point at mock host if reachable)
  STRIPE_WEBHOOK_SECRET           (required at boot)
  apps/dmit-api/.env              (MISSING on this Mac workspace — HAS_ENV=no)

Also required for Full HTTP Responses path (not bootstrap-only):
  Real sk-tokfai_ key whose HMAC exists in api_keys (TOKEN_PEPPER must match)
  Live Supabase reachable for auth + billing + optional durable state
  Mock or real provider at GRSAI_* (mock preferred for L1)
```

```text
LOCAL_FULL_HTTP_BLOCKED_BY_ENV=YES

Reason:
  1. No apps/dmit-api/.env in workspace (read-only round; do not invent production secrets).
  2. Boot Zod schema refuses half-config; even synthetic Zod-pass env cannot satisfy
     verifyApiKeyToken without real Supabase api_keys rows + matching TOKEN_PEPPER.
  3. Bypassing auth / billing / state for tests is forbidden this round.
  4. Prior P1230-R1 PASS used PROTOCOL_GATEWAY_WITH_REAL_DIST_LIBS only — not Full HTTP.
```

Honesty bound (unchanged until L1 env available):

```text
FULL_HTTP_DMIT=NO_ENV
LOCAL_DMIT_MODE=PROTOCOL_GATEWAY_WITH_REAL_DIST_LIBS  (prior round)
```

## Smoke inventory (human, after L1 PASS + authorization)

| # | Check | Max requests | Pass marker |
| - | ----- | ------------ | ----------- |
| 1 | `TOKFAI_API_KEY` present (no echo) | 0 | env present |
| 2 | `GET /v1/models` | 1 | 200 JSON |
| 3 | Minimal `POST /v1/responses` text | 1 | 200 + requestId |
| 4 | Codex Read→Write canary | 1 session (tool+resume) | `diff input.txt output.txt` empty |
| 5 | Billing delta (test account) | same 1–2 billable events | attributable, no duplicate |
| 6 | DMIT log correlation | 0 extra | Round1 tool + Round2 final |

Forbidden: 25/50/100/250/500 concurrency (P1231 only).

## Prepare commands (do not auto-run production)

See Mac doc § Steps 1–8. Base URL:

```bash
export TOKFAI_BASE_URL="${TOKFAI_BASE_URL:-https://api.tokfai.com}"
```

## After human paste-back

Update (do not prefill YES):

```text
FULL_HTTP_DMIT_PASS
REAL_CODEX_TOOL_FLOW_PASS
REAL_BILLING_SMOKE_PASS
REAL_STATE_PASS
REAL_HTTP_TOOL_ROUNDTRIP_PASS
```
