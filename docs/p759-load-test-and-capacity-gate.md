# P759 — Load test & capacity gate (single-customer ~100k calls)

> Goal: prove Tokfai’s **gateway layer** stays stable under heavy single-customer traffic — not that upstream GRSAI never throttles.

Default integration model: **gemini-3-flash** (Phase 1). gpt-5.4 / gpt-5.5 remain high-quality options, not first-call defaults.

---

## 1. Why we do not run 100k calls on production casually

| Risk | Reason |
|------|--------|
| Upstream quota | GRSAI may return 400/503 under load independent of Tokfai |
| Credits burn | 100k chat calls consume real prepaid balance |
| Shared infra | One soak test can affect other customers on the same DMIT/GRSAI path |
| Support noise | Hard to distinguish Tokfai bugs vs upstream busy vs client retry storms |

**Instead:** staged load tests with a dedicated key, low concurrency, and Go/No-Go gates before any large batch.

---

## 2. Current 100k-call risk assessment (Tokfai layer)

| Area | Current behavior | 100k-call risk | Mitigation (now / suggested) |
|------|------------------|----------------|------------------------------|
| **API key auth** | Every chat request: HMAC hash → Supabase `api_keys` lookup by `hash`; `last_used_at` update (async). **No in-memory cache.** | **High DB read QPS** at 100k calls; hash column has no dedicated index in migrations (lookup may seq-scan at scale). | **Suggest:** `CREATE INDEX api_keys_hash_active_idx ON api_keys (hash) WHERE revoked_at IS NULL;` · optional short TTL cache (key id + user id only, never store raw secret). |
| **Credits debit** | Success path uses RPC `record_usage_and_debit`: `profiles` row `FOR UPDATE`, ledger insert, usage_log insert in one transaction. | Row lock on `profiles` serializes debits per user — **correct but throughput-limited**. | Accept for MVP; monitor lock wait; consider queue for very large batch jobs later. |
| **Failed billing** | Failures call `usage_logs.insert` with `billable=false`, `credits_charged=null` — **no debit RPC**. | Low double-charge risk on failures. | Keep; verify in Usage UI after load test. |
| **Duplicate retry** | Each HTTP request gets new `request_id` unless client sends `X-Request-Id`. Retries = **new billable call** if upstream succeeded but client timed out. | **Medium** — client retry storms can double-charge. | Document idempotency limits; suggest client retry only on 503/429 with backoff; **future:** idempotent debit keyed by client request id. |
| **usage_logs writes** | One insert per request (success via RPC, failure via direct insert). `request_id` **UNIQUE**. | Insert-heavy; index `(user_id, created_at desc)` helps dashboard reads; writes still ~100k rows. | **Suggest:** archive policy for old logs; watch Supabase connection pool & disk. |
| **Upstream GRSAI** | Chat `fetch` has **no AbortSignal timeout** (images have `IMAGE_REQUEST_TIMEOUT_MS`). Errors mapped to `upstream_model_busy` (503), `model_not_available` (400), etc. | Upstream 400/503 under concurrency; hung connections if GRSAI stalls. | **Suggest:** chat upstream timeout 60–120s; cap concurrent upstream per process. |
| **Node / PM2** | Default `ecosystem.config.cjs`: **single** `dmit-api` process, autorestart. | Event-loop blocking, memory growth, single-core ceiling. | **Suggest:** `instances: 2` + sticky-less stateless design; monitor RSS & event loop lag. |
| **Nginx** | Not managed in repo. Typical risks: `proxy_read_timeout`, `worker_connections`, body size. | Long chat latency → 504 at edge; connection exhaustion. | **Suggest:** `proxy_read_timeout 120s`; `client_max_body_size 1m`; rate limit zone per IP/key at edge (future). |
| **Rate limiting** | **None** in DMIT today for `/v1/chat/completions`. | Single customer can hammer API and DB. | See §5 minimal rate-limit proposal. |
| **request_id** | `req_*` per request; echoed as `X-Request-Id`; stored in `usage_logs.request_id` (unique). | **Good** for support & reconciliation. | Pass through in client logs; do not reuse same id for retries if you want separate audit rows. |
| **Raw upstream leak** | Public errors use stable `error.code` + friendly message; upstream body truncated in server logs only. | Low leak risk if mapping deployed. | Keep Playground/Docs on classified codes only. |

**Honest summary:** Tokfai can **handle batch API usage**, but **100k calls in a short window** without rate limits, without DB index on `api_keys.hash`, and on a **single PM2 instance** is **not yet fully gated**. Staged load test + Go/No-Go required.

---

## 3. Load test script

**Path:** [`scripts/load-test-chat.mjs`](../scripts/load-test-chat.mjs)

### Environment

| Variable | Default |
|----------|---------|
| `TOKFAI_API_BASE` | `https://api.tokfai.com/v1` |
| `TOKFAI_API_KEY` | *(required)* |
| `TOKFAI_MODEL` | `gemini-3-flash` |
| `TOTAL_REQUESTS` | `100` |
| `CONCURRENCY` | `5` |

### Run examples

```bash
# Minimal smoke (low credits)
TOKFAI_API_KEY=sk-tokfai_xxx TOTAL_REQUESTS=10 CONCURRENCY=2 \
  node scripts/load-test-chat.mjs

# Stage B
TOKFAI_API_KEY=sk-tokfai_xxx TOTAL_REQUESTS=1000 CONCURRENCY=5 \
  node scripts/load-test-chat.mjs
```

Prompt is fixed to **`Say ok only.`** — no retries on failure. API key is never printed (masked prefix/suffix only).

### Metrics reported

- total / success / failed / success rate  
- HTTP status distribution  
- `error.code` distribution (`upstream_model_busy`, `model_not_available`, `insufficient_credits`, …)  
- p50 / p95 / max latency  
- sum of `credits_charged`  
- requests per second  
- sample `request_id` values  

---

## 4. Recommended test ladder

| Stage | Requests | Concurrency | When |
|-------|----------|-------------|------|
| **A** | 100 | 2 | After every DMIT deploy |
| **B** | 1,000 | 5 | Before onboarding a heavy customer |
| **C** | 10,000 | 10 | Dedicated key, off-peak, budget approved |
| **D** | 100,000 | ≤10 | **Only** dedicated key, low peak, explicit credits budget, on-call |

Run from DMIT or CI runner close to `api.tokfai.com` to reduce client network noise.

---

## 5. Go / No-Go criteria

| Gate | Target |
|------|--------|
| Success rate | ≥ **95%** (excluding deliberate upstream busy on premium models) |
| p95 latency | Acceptable for your SLA (e.g. < 15s for gemini-3-flash smoke prompt) |
| Generic `502` `upstream_error` | **0** or traceable to undeployed mapping / true upstream outage |
| Usage vs Credits | Sample `request_id`s reconcile; failed rows **not** debited |
| Error classification | `upstream_model_busy`, `model_not_available`, `insufficient_credits` counted separately |
| Process health | PM2 stable, no OOM restart loop during Stage B |

---

## 6. Rate limiting — current state & minimal proposal

### Current (dmit-api)

| Control | Chat | Images |
|---------|------|--------|
| Per-key RPM | ❌ | ❌ |
| Per-key concurrency | ❌ | ❌ |
| Request body size limit | ❌ (Hono default) | validated per route |
| Chat upstream timeout | ❌ | ✅ `IMAGE_REQUEST_TIMEOUT_MS` |
| Tokfai-native 429 | ❌ | ❌ |

### Minimal proposal (no schema change)

1. **Per API key:** 60 requests/minute sliding window → `429` `too_many_requests`  
2. **Per API key:** max 5 concurrent in-flight chat requests → `429` `too_many_concurrent`  
3. **Chat upstream:** `AbortSignal.timeout(90_000)`  
4. **Global body limit:** 1 MB JSON on `/v1/chat/completions`  
5. **Error envelope (OpenAI-style):**

```json
{
  "error": {
    "message": "Too many requests for this API key.",
    "code": "too_many_requests",
    "type": "rate_limit_error"
  }
}
```

Implement in DMIT middleware + env toggles — **not in P759 scope** unless explicitly scheduled.

### Suggested customer trial limits (product)

| Limit | Suggestion |
|-------|------------|
| Per key RPM | 60 chat / 10 image (starter) |
| Daily credits cap | Plan-based; warn at 80% |
| Image double-click | UI debounce + idempotent client token (future) |
| Model busy | Switch to **gemini-3-flash** or **gemini-2.5-flash** |

---

## 7. Customer-facing wording (honest, not overselling)

**What we can say**

- Tokfai exposes an **OpenAI-compatible gateway** suitable for **batch and automated** workloads when you use **moderate concurrency** and **exponential backoff** on 503/429.
- **First integration:** use **gemini-3-flash**; run **100–1,000** call smoke tests before large jobs.
- Every response includes a **`request_id`** (and `X-Request-Id`) for Usage / Credits reconciliation.
- **Successful** chat calls debit credits; **failed** calls are generally **not** charged (see Usage for `status=failed`, `credits_charged` empty).
- **gpt-5.4 / gpt-5.5** are high-quality; during upstream load you may see **`upstream_model_busy` (503)** — retry or switch model.

**What we must not claim**

- “100k calls will never slow down or fail.”
- “gpt-5.4 is always available at any concurrency.”
- “Retries are automatically idempotent” (today they are not unless you design client-side dedup).

---

## 8. External verification curls (unchanged baseline)

```bash
curl https://api.tokfai.com/v1/health

curl https://api.tokfai.com/v1/models \
  -H "Authorization: Bearer sk-tokfai_xxx"

curl https://api.tokfai.com/v1/chat/completions \
  -H "Authorization: Bearer sk-tokfai_xxx" \
  -H "Content-Type: application/json" \
  -d '{"model":"gemini-3-flash","messages":[{"role":"user","content":"Hello from Tokfai"}],"stream":false}'
```

---

## 9. Can we promise “100k calls without blocking” today?

| Layer | Ready? |
|-------|--------|
| Billing correctness (success debit / fail no debit) | ✅ Design + RPC |
| request_id traceability | ✅ |
| Friendly error taxonomy | ✅ (after DMIT deploy) |
| Load test tooling | ✅ `scripts/load-test-chat.mjs` |
| Per-key rate limits | ❌ Not implemented |
| api_keys.hash index | ❌ Suggested only |
| Chat upstream timeout | ❌ Suggested only |
| PM2 horizontal scale | ❌ Single instance default |
| Client idempotency | ❌ Document only |

**Verdict:** Suitable for **staged** high volume with **gemini-3-flash** and monitoring — **not** a blanket “100k guaranteed no friction” promise until rate limits, DB index, upstream timeouts, and Stage C/D load runs pass Go/No-Go.
