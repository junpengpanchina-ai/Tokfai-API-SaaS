# P766 — Multi-Upstream Model Pool

> Goal: Tokfai is an **aggregated API platform**. Customers see only Tokfai model IDs and API keys — never upstream provider names, keys, or raw vendor endpoints.

**Product principle:** Redis (P764) holds temporary gateway state. **Supabase `usage_logs` + `credit_ledger`** remain the billing source of truth (P765). Provider pools improve **availability and latency** — they do not change ledger rules.

---

## 1. Why multi-upstream?

Single upstream (GRSAI) works for most models, but **GPT-class models** (`gpt-5.4`, `gpt-5.5`) and **`auto-pro`** can stall when one vendor is overloaded. P766 adds a **config-driven provider pool** so DMIT can fail over across OpenAI-compatible backends without exposing vendors to clients.

| Concern | P766 approach |
|---------|----------------|
| Customer sees | Tokfai model id (`gpt-5.4`, `auto-pro`, …) |
| Customer never sees | Provider id, upstream host, vendor API keys |
| Billing | Still on **resolved Tokfai model** (unchanged) |
| Ledger | Still Supabase-only (unchanged) |

---

## 2. Provider definitions

**File:** `apps/dmit-api/src/upstream/providers.ts`

| Provider id | Default | Env |
|-------------|---------|-----|
| `grsai-primary` | enabled | `GRSAI_BASE_URL`, `GRSAI_API_KEY`, `GRSAI_CHAT_COMPLETIONS_PATH` |
| `openai-compatible-secondary` | disabled | See below |

### Secondary provider env

| Variable | Default | Notes |
|----------|---------|-------|
| `TOKFAI_UPSTREAM_SECONDARY_ENABLED` | `false` | Must be `true` **and** base URL + key set |
| `TOKFAI_UPSTREAM_SECONDARY_BASE_URL` | — | Host only; do not append `/v1` |
| `TOKFAI_UPSTREAM_SECONDARY_API_KEY` | — | Server-only; never log or return |
| `TOKFAI_UPSTREAM_SECONDARY_CHAT_PATH` | `/v1/chat/completions` | OpenAI-compatible path |

### Per-model provider order

| Variable | Default when unset |
|----------|-------------------|
| `TOKFAI_MODEL_PROVIDER_ORDER_GPT_5_4` | `grsai-primary,openai-compatible-secondary` |
| `TOKFAI_MODEL_PROVIDER_ORDER_GPT_5_5` | `grsai-primary,openai-compatible-secondary` |
| Gemini / other models | `grsai-primary` only |

Disabled providers are skipped even if listed in order.

---

## 3. Fallback strategy

Two dimensions:

1. **Model fallback** (aliases only) — `auto-fast`, `auto-pro`, `auto-cheap` chains unchanged.
2. **Provider fallback** — for each resolved model attempt, try providers in configured order.

```
for attemptModel in modelChain(requestedModel):
  for provider in resolveProviderAttempts(attemptModel):
    try OpenAI-compatible POST
    on success → bill + return (external model unchanged)
    on eligible error → next provider
  on eligible error + alias → next model in chain
```

### Eligible for provider / model fallback

| Error code | Fallback? |
|------------|-----------|
| `upstream_model_busy` | Yes |
| `model_not_available` | Yes |
| `upstream_timeout` | Yes |
| `upstream_rate_limited` | Yes |
| `upstream_error` (5xx) | Yes |
| `upstream_auth_error` | **No** — fix credentials; do not rotate to next provider |
| `insufficient_credits` | No |

### Real model requests (`gpt-5.4`, `gemini-3-flash`, …)

- Provider fallback **yes** (when multiple providers configured).
- Model fallback **no** — external requested model id unchanged.
- All providers fail → last standard error (e.g. `upstream_model_busy`).

### Aliases (`auto-pro`, …)

- **Model chain first**, then **provider pool per model**.
- Example `auto-pro`: try `gpt-5.5` on provider A → B, then `gpt-5.4` on A → B, etc.

---

## 4. Security

| Allowed in logs | Forbidden |
|-----------------|-----------|
| `providerId` (internal id) | Provider API keys |
| `requestedModel`, `attemptModel` | Full prompt / messages |
| `latencyMs`, HTTP status, error code | Full upstream raw response body |

**Client response `tokfai` block** — no `upstream_provider` field. Provider id is internal-only (DMIT logs).

---

## 5. Transport layer

**File:** `apps/dmit-api/src/upstream/grsai.ts`

- `providerFetch(provider, path, …)` — generic OpenAI-compatible caller.
- `Authorization: Bearer <provider.apiKey>`.
- Reuses existing error mapping (`upstream_model_busy`, `model_not_available`, …).
- `grsaiFetch()` kept as thin wrapper over `grsai-primary` for compatibility.

---

## 6. Enable secondary provider

1. Provision a second OpenAI-compatible endpoint.
2. Set DMIT env on server:

```bash
TOKFAI_UPSTREAM_SECONDARY_ENABLED=true
TOKFAI_UPSTREAM_SECONDARY_BASE_URL=https://your-secondary-host.example
TOKFAI_UPSTREAM_SECONDARY_API_KEY=sk-...
TOKFAI_UPSTREAM_SECONDARY_CHAT_PATH=/v1/chat/completions
TOKFAI_MODEL_PROVIDER_ORDER_GPT_5_4=grsai-primary,openai-compatible-secondary
TOKFAI_MODEL_PROVIDER_ORDER_GPT_5_5=grsai-primary,openai-compatible-secondary
```

3. Redeploy DMIT:

```bash
git pull origin main
cd apps/dmit-api && npm ci && npm run build
pm2 restart dmit-api --update-env && pm2 save
```

4. Smoke:

```bash
TOKFAI_API_KEY=sk-tokfai_... node scripts/test-provider-routing.mjs
MODEL=gpt-5.4 node scripts/test-provider-routing.mjs
```

With secondary disabled, script prints `skipped secondary` and chat still works via `grsai-primary`.

---

## 7. Model health probe

**Script:** `scripts/probe-model-health.mjs`

- Unchanged client-facing behavior — probes by Tokfai model id.
- Provider attempt summary **not** in API response; per-provider SLO tracking deferred to **P766.1**.
- Use probe to validate model-level success rates after enabling secondary:

```bash
TOKFAI_API_KEY=sk-tokfai_... MODELS=gpt-5.4,gpt-5.5 node scripts/probe-model-health.mjs
```

---

## 8. Deploy checklist

1. Deploy DMIT (no Supabase migration required for P766 MVP).
2. Confirm secondary env **unset or disabled** in production until second vendor is ready.
3. Run existing smokes unchanged:

```bash
TOKFAI_API_KEY=sk-tokfai_... node scripts/test-batch-chat.mjs
TOKFAI_API_KEY=sk-tokfai_... node scripts/test-provider-routing.mjs
```

4. Optional: enable secondary in staging first; compare `gpt-5.4` latency via health probe.

---

## 9. Implementation map

| File | Role |
|------|------|
| `apps/dmit-api/src/upstream/providers.ts` | Provider registry + per-model order |
| `apps/dmit-api/src/upstream/grsai.ts` | `providerFetch`, error mapping |
| `apps/dmit-api/src/lib/executeChatCompletion.ts` | Model × provider attempt loop |
| `apps/dmit-api/src/env.ts` | Secondary + order env vars |
| `scripts/test-provider-routing.mjs` | Config + chat smoke |
| `scripts/probe-model-health.mjs` | Model-level health (provider-level → P766.1) |

---

## 10. Roadmap

| Phase | Topic |
|-------|--------|
| **P766** | Config provider pool + fallback (this doc) |
| **P766.1** | Provider-level health probe + circuit breaker keys |
| Future | DB-backed provider admin, weighted routing, per-provider concurrency caps |

---

## 11. Production smoke results

_To be filled after deploy._
