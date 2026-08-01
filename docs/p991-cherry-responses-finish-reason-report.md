# P991 — Cherry Studio `/v1/responses` SSE finish reason compatibility

## Problem

Cherry Studio (AI SDK OpenAI Responses provider) reports:

```text
AI_FinishReasonError: Response ended with finish reason "other"
```

when using `POST /v1/responses` with `stream:true`, even though `/v1/chat/completions`
SSE already ends with `finish_reason:"stop"`.

## Root cause (wire shape)

For Responses SSE, AI SDK keeps `finishReason` at the default `"other"` until a
terminal `response.completed` / `response.incomplete` event supplies a clear stop
signal. A completed event that lacks an explicit stop-compatible finish reason
(or only nests it inconsistently) is treated as `"other"`.

`/v1/chat/completions` already has its own outbound finish_reason normalize path.
This ticket does **not** change that path.

## Fix (scoped)

Last-mile SSE sanitizer only on the `/v1/responses` early-SSE rest writer:

- File: `apps/dmit-api/src/lib/respondEarlySse.ts`
- Function: `sanitizeResponsesCompletedForCherry(sseText)`
- Applied in: `writeResponsesRest` (sole early-SSE rest exit for `/v1/responses`)

Behavior:

1. Parse SSE blocks only (does not mutate the business response object).
2. Touch only blocks with `event: response.completed` or `data.type === "response.completed"`.
3. When `payload.response.status === "completed"`:
   - set missing `response.incomplete_details` to `null`
   - set `response.finish_reason = "stop"`
   - set top-level `finish_reason = "stop"`
4. Leave `response.failed` / `response.incomplete` / errored terminals untouched.
5. Do not add `finish_reason` to mid-stream delta / item.added events.

## Non-goals / safety

| Area | Touched? |
|---|---|
| Billing / usage / credits / Stripe / pricing | No |
| Model catalog / aliases / provider routing | No |
| `executeChatCompletion` main path | No |
| `/v1/chat/completions` finish_reason normalize | No |
| package.json / lockfile / env / PM2 | No |

Failures are never rewritten into successful `stop` completions.

## Verification

### Offline smoke

```bash
cd apps/dmit-api && npm run typecheck && npm run build
node scripts/p988-finish-reason-normalize-smoke.mjs
node scripts/p990-chat-completions-sse-finish-reason-smoke.mjs
node scripts/p991-responses-sse-cherry-smoke.mjs
```

Expected marker:

```text
TOKFAI_P991_RESPONSES_SSE_CHERRY_PASS
```

### HGK live (curl, real `sk-tokfai_` token)

| Check | Result |
|---|---|
| `http://127.0.0.1:8788/v1/responses` | **200 OK** |
| `https://api.tokfai.com/v1/responses` | **200 OK** |
| Nginx upstream | `127.0.0.1:8788` (Authorization not stripped) |
| SSE events | `response.created` → item/content/text → `response.completed` → `data: [DONE]` |
| `response.completed` | `status=completed`, `incomplete_details=null`, `finish_reason=stop` |
| top-level `finish_reason` | `stop` |
| Wire no longer emits | `finish_reason="other"` on completed public responses |

### Cherry Studio client (2026-08-01)

| Item | Value |
|---|---|
| Provider | `tokfairespe` (OpenAI Responses) |
| API base | `https://api.tokfai.com/v1` |
| Preview path | `/v1/responses` |
| Connection | OK |
| Models verified | `gpt-5`, `gpt-5.4`, `gpt-5.4-pro`, `gpt-5.5` |
| Client error | **No longer** shows `Response ended with finish reason "other"` |

## Status

**P991 COMPLETE / CLIENT VERIFIED** — server wire + Cherry Studio UI both pass.

## Freeze (do not reopen for this ticket)

- billing / routing / catalog
- finish_reason normalize (`/v1/chat/completions` path)
- `respondEarlySse` / `responsesSse` / `responsesTransform`
- Nginx / PM2
- OpenAI Responses compatibility layer

## Files

- `apps/dmit-api/src/lib/respondEarlySse.ts` (modified; shipped in `17ebb41`)
- `scripts/p991-responses-sse-cherry-smoke.mjs` (added)
- `docs/p991-cherry-responses-finish-reason-report.md` (this report)
