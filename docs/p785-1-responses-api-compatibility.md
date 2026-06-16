# P785.1 — Responses API compatibility

## Problem

Some OpenAI-compatible clients (Cursor, Cherry Studio, newer SDKs) call
`POST /v1/responses` instead of `POST /v1/chat/completions`. Tokfai previously
returned:

```json
{
  "error": {
    "code": "route_not_found",
    "message": "No route for POST /v1/responses."
  }
}
```

## Solution

`POST /v1/responses` is now registered on DMIT (`api.tokfai.com`). It:

1. Accepts OpenAI Responses-style `input` (string, message array, or content parts).
2. Converts `input` → chat `messages` internally.
3. Reuses `executeChatCompletion` for API-key auth, balance checks, smart routing,
   provider fallback, usage logging, and credit debiting.
4. Returns OpenAI Responses-style JSON with Tokfai billing fields.

No billing, Stripe, Supabase schema, or `record_usage_and_debit` changes.

## Auth

Same as chat completions:

- `Authorization: Bearer sk-tokfai_<48 hex>` (customer API key)
- `Authorization: Bearer <supabase_access_token>` (Playground / dashboard JWT)

| Case | HTTP | `error.code` |
|------|------|----------------|
| No token | 401 | `missing_token` |
| Invalid token / key | 401 | `invalid_token` |

## Request

`POST https://api.tokfai.com/v1/responses`

### Supported `input` shapes

**String**

```json
{
  "model": "auto-fast",
  "input": "Say ok only."
}
```

**Message array**

```json
{
  "model": "auto-fast",
  "input": [
    {
      "role": "user",
      "content": "Say ok only."
    }
  ]
}
```

**Content parts**

```json
{
  "model": "auto-fast",
  "input": [
    {
      "role": "user",
      "content": [
        {
          "type": "input_text",
          "text": "Say ok only."
        }
      ]
    }
  ]
}
```

### Streaming

`stream: false` is supported. `stream: true` returns HTTP 400 with
`error.code: stream_not_supported` (same as chat completions).

Optional chat fields (`temperature`, `max_tokens`) are forwarded when present.

## Response (success)

```json
{
  "id": "resp_req_xxx",
  "object": "response",
  "created_at": 1234567890,
  "status": "completed",
  "model": "gemini-3-flash",
  "output": [
    {
      "type": "message",
      "role": "assistant",
      "content": [
        {
          "type": "output_text",
          "text": "ok"
        }
      ]
    }
  ],
  "output_text": "ok",
  "usage": {
    "input_tokens": 0,
    "output_tokens": 0,
    "total_tokens": 0
  },
  "request_id": "req_xxx",
  "credits_charged": 0.000001,
  "tokfai": {
    "request_id": "req_xxx",
    "credits_charged": 0.000001,
    "requested_model": "auto-fast",
    "resolved_model": "gemini-3-flash"
  }
}
```

## Billing rules

- Credits are debited only on successful upstream completion (same as chat).
- Failed requests do not debit credits.
- `usage_logs.endpoint` is `/v1/responses` for this route.

## Smoke tests

```bash
node scripts/p785-1-responses-smoke.mjs
TOKFAI_API_KEY=sk-tokfai_... node scripts/p785-1-responses-smoke.mjs
```

Manual curls (production):

```bash
# 1. Missing token → 401 missing_token
curl -sS -w "\nHTTP:%{http_code}\n" https://api.tokfai.com/v1/responses \
  -H "Content-Type: application/json" \
  -d '{"model":"auto-fast","input":"Say ok only."}'

# 2. Invalid token → 401 invalid_token (not 404)
curl -sS -w "\nHTTP:%{http_code}\n" https://api.tokfai.com/v1/responses \
  -H "Authorization: Bearer sk-tokfai_xxx" \
  -H "Content-Type: application/json" \
  -d '{"model":"auto-fast","input":"Say ok only."}'

# 3–5. Real key (string / array / content parts) → HTTP 200
```

## Implementation files

| File | Role |
|------|------|
| `apps/dmit-api/src/routes/responses.ts` | Route handler |
| `apps/dmit-api/src/lib/responsesTransform.ts` | Input/output conversion |
| `apps/dmit-api/src/lib/executeChatCompletion.ts` | Shared executor (`route: "/v1/responses"`) |
| `apps/dmit-api/src/app.ts` | Route registration |
