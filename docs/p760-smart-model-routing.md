# P760 — Smart model routing, fallback & stability

> Goal: Tokfai is a **gateway**, not a model vendor. When one upstream model is busy, customers using `auto-*` aliases should still get a 200 from another model in the chain — not a generic “Tokfai is down” 502.

Scope: chat `/v1/chat/completions` only. No billing/checkout/webhook changes. **No Supabase schema change in this phase.**

---

## 1. Model aliases

Customers may pass either a **real model ID** or a **smart alias**:

| Alias | Purpose | Fallback order |
|-------|---------|----------------|
| `auto-fast` | Default — fast & stable | gemini-3-flash → gemini-2.5-flash → gemini-3-pro |
| `auto-pro` | High quality | gpt-5.5 → gpt-5.4 → gemini-3.1-pro → gemini-3-pro |
| `auto-cheap` | Low-cost batch | gemini-2.5-flash → gemini-3-flash |

**Response:** OpenAI `model` field is the **resolved** upstream model (e.g. `gemini-3-flash`), not the alias.

**Extension (optional):** `tokfai.requested_model`, `tokfai.resolved_model`, `tokfai.fallback_attempts` on success JSON.

Implementation: [`apps/dmit-api/src/upstream/modelAliases.ts`](../apps/dmit-api/src/upstream/modelAliases.ts)

---

## 2. Fallback rules (`/v1/chat/completions`)

| Upstream outcome | `auto-*` alias | Real model ID |
|------------------|----------------|---------------|
| `upstream_model_busy` / load too high / 503 / busy 400 | Try next in chain | Return `upstream_model_busy` (503) — **no fallback** |
| `model_not_available` | Try next in chain | Return `model_not_available` (400) |
| `upstream_timeout` | Try next in chain | Return `upstream_timeout` (504) |
| `upstream_rate_limited` / upstream 5xx | Try next in chain | Return mapped error |
| `upstream_auth_error` | **No fallback** — 502 (config issue) | Same |
| All attempts exhausted | **503** `all_upstreams_unavailable` — “当前可用模型繁忙，请稍后重试。” | N/A |

Each fallback attempt logs **`chat_model_fallback_attempt`** (safe — no API key, no full prompt):

- `request_id`, `requested_model`, `attempt_model`, `attempt_index`
- `upstream_status`, `upstream_code`, `latency_ms`

Success path logs `requestedModel` / `resolvedModel` on `chat_completion_success`.

---

## 3. Process-local circuit breaker

File: [`apps/dmit-api/src/upstream/modelCircuitBreaker.ts`](../apps/dmit-api/src/upstream/modelCircuitBreaker.ts)

- **Threshold:** N = 3 consecutive failures (`upstream_model_busy`, `model_not_available`, `upstream_timeout`, `upstream_error`, `upstream_rate_limited`)
- **Cooldown:** 60 seconds — model skipped in `auto-*` attempt lists
- **Scope:** In-memory per DMIT process only
- **PM2 multi-instance:** Each instance has its own breaker state. For shared skip lists across instances, add Redis later (document only — not implemented).

---

## 4. Upstream timeout

Env: `GRSAI_CHAT_TIMEOUT_MS` (default **90000** ms)

Chat upstream `fetch` uses `AbortSignal.timeout`. On timeout → `upstream_timeout`; aliases may fallback; real models return `upstream_timeout` directly.

---

## 5. Usage logs — no schema change (migration suggestion)

Today `usage_logs.model` stores the **resolved** model used for billing.

**Suggested future migration** (not executed in P760):

```sql
ALTER TABLE public.usage_logs
  ADD COLUMN IF NOT EXISTS requested_model text,
  ADD COLUMN IF NOT EXISTS resolved_model text;

COMMENT ON COLUMN public.usage_logs.requested_model IS
  'Client-facing model field (may be auto-* alias).';
COMMENT ON COLUMN public.usage_logs.resolved_model IS
  'Upstream model actually billed (same as model today when set).';
```

Until then, alias routing is traceable via:

- Server logs (`requestedModel`, `resolvedModel`, fallback attempt logs)
- Response `tokfai.*` fields
- Temporary: `safety_reason` on usage row may hold requested alias for support (internal)

---

## 6. Frontend & docs

| Surface | Change |
|---------|--------|
| Docs / Quickstart | Default model → `auto-fast`; smart routing section |
| Playground | Default `auto-fast`; show resolved model on success |
| Models page | Alias / Smart routing card |
| Load test | Default `TOKFAI_MODEL=auto-fast` |

---

## 7. Load test guidance

| Scenario | Model |
|----------|-------|
| Stage A/B smoke (100 / 1000) | `auto-fast` |
| Quality soak | `auto-pro` |
| Bulk low-cost | `auto-cheap` |
| Customer explicitly wants one upstream | Real ID (no silent fallback) |

```bash
TOKFAI_API_KEY=sk-tokfai_xxx TOTAL_REQUESTS=10 CONCURRENCY=2 \
  node scripts/load-test-chat.mjs
```

---

## 8. Acceptance checklist

| Test | Expected |
|------|----------|
| `model=auto-fast` | 200; `model` = resolved upstream |
| `model=auto-pro` | 200 even if gpt-5.5/5.4 busy (fallback to gemini) |
| `model=gpt-5.4` when busy | 503 `upstream_model_busy`, no fallback |
| `model=gpt-4o-mini` | 400 `model_not_available` |
| Load test 10× `auto-fast` | ~100% success, no generic 502 |

---

## 9. Deploy

After push to `main`, on DMIT server:

```bash
cd /opt/tokfai-api-saas/apps/dmit-api
git pull && npm ci && npm run build
pm2 restart dmit-api --update-env
```

Verify `GRSAI_CHAT_TIMEOUT_MS=90000` in production env if not already set.
