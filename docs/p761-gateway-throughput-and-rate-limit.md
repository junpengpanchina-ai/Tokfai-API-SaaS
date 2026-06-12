# P761 — Gateway throughput, rate limits & concurrency guards

> Goal: protect Tokfai (the **gateway layer**) when a single customer runs batch chat calls — without changing billing/checkout/webhooks or Supabase schema.

P760 added smart routing (`auto-*`). P761 adds **process-local guards** so one key cannot exhaust Node, upstream, or credits accounting under burst load.

---

## 1. What P761 guarantees (today)

| Guard | Default | On exceed |
|-------|---------|-----------|
| **Per API key RPM** | 60 req / 60s window | HTTP **429** `too_many_requests` |
| **Per API key concurrency** | 5 simultaneous chat handlers | HTTP **429** `too_many_concurrent_requests` |
| **Global upstream chat concurrency** | 50 in-flight GRSAI fetches | HTTP **503** `gateway_overloaded` |
| **Per-upstream attempt timeout** | 90s (`TOKFAI_UPSTREAM_TIMEOUT_MS`) | HTTP **504** `upstream_timeout` |
| **Total request budget** | 120s (`TOKFAI_TOTAL_REQUEST_TIMEOUT_MS`) | HTTP **504** `upstream_timeout` or alias exhaustion |
| **Request body size** | 1 MB | HTTP **413** `request_body_too_large` |

All guards are **in-memory per DMIT process** (PM2 instance). Headers on success and most errors:

- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset` (Unix seconds)

Rate-limit keys use **`api_key_id`** (or `user:{uuid}` for Supabase JWT Playground calls). Full secrets are never logged.

---

## 2. What P761 does **not** guarantee

- **Not** “10w calls with zero 429/503 ever” — upstream GRSAI and shared infra can still throttle.
- **Not** cross-instance shared limits — two PM2 workers each have their own counters until Redis (P764).
- **Not** fair queuing — over-limit requests **fail fast** (no wait queue; P762).
- **Not** Nginx edge rate limits — see suggestions below.
- **Not** idempotent retries — duplicate client retries still create separate `request_id` rows unless client reuses `X-Request-Id` (billing semantics unchanged).

We do **not** promise unlimited throughput on a single key. We promise **predictable failure modes** instead of silent generic 502s and runaway resource use.

---

## 3. Environment variables (DMIT)

```bash
TOKFAI_RATE_LIMIT_RPM=60
TOKFAI_RATE_LIMIT_WINDOW_MS=60000
TOKFAI_MAX_CONCURRENCY_PER_KEY=5
TOKFAI_GLOBAL_UPSTREAM_CONCURRENCY=50
TOKFAI_UPSTREAM_TIMEOUT_MS=90000
TOKFAI_TOTAL_REQUEST_TIMEOUT_MS=120000
TOKFAI_CHAT_BODY_MAX_BYTES=1048576
```

Legacy `GRSAI_CHAT_TIMEOUT_MS` remains parsed; **`TOKFAI_UPSTREAM_TIMEOUT_MS` is preferred** in `grsaiFetch`.

---

## 4. Usage / credits safety (verified, unchanged core)

| Outcome | Debit credits? | `usage_logs` row? |
|---------|----------------|-------------------|
| 200 success | ✅ via `record_usage_and_debit` | ✅ `billable=true` |
| 429 gateway (`too_many_*`) | ❌ | ✅ `billable=false`, `status=rate_limited` |
| 503 `gateway_overloaded` | ❌ | ✅ `billable=false` |
| 504 `upstream_timeout` | ❌ | ✅ `billable=false` |
| 503 `upstream_model_busy` / alias exhausted | ❌ | ✅ `billable=false` |
| 400 `model_not_available` | ❌ | ✅ `billable=false` |
| 402 `insufficient_credits` | ❌ | ⚠️ no row today (precheck throw) |
| 413 body too large | ❌ | ✅ `billable=false` |

Every handled chat path uses the middleware **`X-Request-Id`** → `usage_logs.request_id` (unique).

**Suggested future migration** (not executed): add `usage_logs.requested_model` / `resolved_model` (see P760 doc).

---

## 5. Recommended load-test ladder

Use [`scripts/load-test-chat.mjs`](../scripts/load-test-chat.mjs). Results written to `load-test-results/latest.json`.

| Stage | Requests | Concurrency | Model | Notes |
|-------|----------|-------------|-------|-------|
| Smoke | 20 | 2 | `auto-fast` | After every deploy |
| A | 100 | 5 | `auto-fast` | Default script settings |
| B | 1,000 | 10 | `auto-fast` | Watch 429 / `gateway_overloaded` |
| C | 5,000 | 20 | `auto-fast` | Dedicated key, off-peak |
| D | 10,000 | 30 | `auto-fast` | Budget + on-call |
| E | 100,000 | ≤30 | `auto-fast` | **Low peak only**, dedicated key, explicit credits budget, monitoring |

Optional: `STOP_ON_ERROR_RATE=0.2` aborts when failures exceed 20%.

**Model choice:**

- Smoke / soak: **`auto-fast`**
- Quality: **`auto-pro`**
- Bulk low-cost: **`auto-cheap`**
- Explicit upstream only when customer requires a fixed model ID

---

## 6. Customer guidance (honest wording)

1. **Do not unbounded-concurrency a single key** — respect 429; backoff and lower parallelism.
2. **Batch large jobs** — e.g. 1k chunks with pauses instead of 10k parallel opens.
3. **Use `auto-fast`** for stable routing when upstream models rotate under load.
4. **On failure, save `request_id`** — support reconciles via Usage / server logs.
5. **`429 too_many_requests`** → lower RPM or spread keys/workloads.
6. **`429 too_many_concurrent_requests`** → reduce in-flight HTTP connections.
7. **`503 gateway_overloaded`** → Tokfai gateway saturated; retry with backoff (not upstream model busy).
8. **`503 upstream_model_busy`** → try `auto-fast` / `auto-pro` or retry later.
9. **`504 upstream_timeout`** → shorten prompts or switch model; total alias budget is capped at 120s.

---

## 7. Nginx suggestions (not applied in repo)

```nginx
# Example only — tune on the DMIT host
client_max_body_size 1m;
proxy_read_timeout 130s;
proxy_connect_timeout 10s;

# Future: limit_req_zone per IP or custom header
```

---

## 8. Roadmap (out of scope for P761)

| Phase | Topic |
|-------|--------|
| **P762** | Request queue / fair scheduling instead of fail-fast concurrency |
| **P763** | PM2 multi-instance + sticky-less design review |
| **P764** | Redis-backed shared rate limits & circuit breaker |
| **P765** | Usage log batch writes / archive policy |

---

## 9. Implementation map

| File | Role |
|------|------|
| `apps/dmit-api/src/gateway/rateLimit.ts` | Per-key fixed window RPM |
| `apps/dmit-api/src/gateway/concurrency.ts` | Per-key + global upstream pools |
| `apps/dmit-api/src/middleware/chatGateway.ts` | Auth-after guards on `/v1/chat/completions` |
| `apps/dmit-api/src/middleware/error.ts` | Preserves guard HTTP statuses + `request_id` on 429/503/504 |
| `apps/dmit-api/src/routes/chatGatewayLogs.ts` | Non-billable gateway usage rows |
| `apps/dmit-api/src/routes/chat.ts` | Body limit, total timeout, global acquire per fallback attempt |

---

## 10. Deploy checklist

```bash
cd /opt/tokfai-api-saas/apps/dmit-api
git pull && npm ci && npm run build
pm2 restart dmit-api --update-env
```

Verify env vars above. Run smoke:

```bash
TOKFAI_API_KEY=sk-tokfai_... TOTAL_REQUESTS=20 CONCURRENCY=2 node scripts/load-test-chat.mjs
```

To **test 429 locally on server**, temporarily set `TOKFAI_RATE_LIMIT_RPM=5` or `TOKFAI_MAX_CONCURRENCY_PER_KEY=1`, restart PM2, rerun load test, then restore defaults.

---

## 11. P761.1 — Gateway guard error status preservation

**Problem:** Low-RPM load tests saw HTTP **502** / `http_502` instead of **429** `too_many_requests` / `too_many_concurrent_requests`.

**Fix:**

| Code | HTTP | `request_id` in body |
|------|------|----------------------|
| `too_many_requests` | 429 | ✅ |
| `too_many_concurrent_requests` | 429 | ✅ |
| `gateway_overloaded` | 503 | ✅ |
| `request_body_too_large` | 413 | — |
| `upstream_timeout` | 504 | ✅ |

- `chatGateway` middleware **returns** guard errors directly (no throw → onError indirection).
- `middleware/error.ts` preserves `status` / `statusCode` / `code` on structured errors; never remaps guards to generic 502.
- 429 gateway rejections remain **non-billable** (`usage_logs.billable=false`).
- `scripts/load-test-chat.mjs` infers gateway codes from HTTP status when the body is empty.

**Acceptance:**

| Case | Command | Expected |
|------|---------|----------|
| A Normal | `TOTAL_REQUESTS=20 CONCURRENCY=2` | 20× HTTP 200, `http_502=0` |
| B Low RPM | `TOKFAI_RATE_LIMIT_RPM=5` + `CONCURRENCY=5` | HTTP 429, codes `too_many_*`, not 502 |
| C Restore | `unset TOKFAI_RATE_LIMIT_RPM` + `CONCURRENCY=1` | Success |

### Production verification / DMIT smoke results

**Status:** ✅ P761.1 passed on production DMIT (2026-06-13)

#### A — Normal load (default guards)

**Env:**

```bash
TOKFAI_RATE_LIMIT_RPM=60
TOKFAI_MAX_CONCURRENCY_PER_KEY=5
TOKFAI_GLOBAL_UPSTREAM_CONCURRENCY=50
TOKFAI_UPSTREAM_TIMEOUT_MS=90000
TOKFAI_TOTAL_REQUEST_TIMEOUT_MS=120000
```

**Command:** `TOTAL_REQUESTS=20 CONCURRENCY=2 TOKFAI_MODEL=auto-fast`

| Metric | Result |
|--------|--------|
| completed / success / failed | 20 / 20 / 0 |
| success_rate | 100.00% |
| HTTP 200 / 429 / 502 | 20 / 0 / 0 |
| error_code_distribution | (none) |
| credits_sum | 0.002741 |
| request_id samples | ✅ present |
| wall_time_ms | 202661 |
| latency p50 / p95 / max | 4170ms / 94282ms / 98414ms |

#### B — Low RPM rate-limit (P761.1 fix target)

**Env:** `TOKFAI_RATE_LIMIT_RPM=5` (other defaults unchanged)

**Command:** `TOTAL_REQUESTS=20 CONCURRENCY=5 TOKFAI_MODEL=auto-fast`

| Metric | Result |
|--------|--------|
| success / failed | 5 / 15 |
| success_rate | 25.00% |
| HTTP 200 / 429 / 502 | 5 / 15 / 0 |
| error_code_distribution | `too_many_requests`: 15 |
| credits_sum | 0.000577 (429 rows non-billable) |
| request_id samples | ✅ present |

#### C — Restore production defaults

**Env:**

```bash
TOKFAI_RATE_LIMIT_RPM=60
TOKFAI_RATE_LIMIT_WINDOW_MS=60000
TOKFAI_MAX_CONCURRENCY_PER_KEY=5
TOKFAI_GLOBAL_UPSTREAM_CONCURRENCY=50
TOKFAI_UPSTREAM_TIMEOUT_MS=90000
TOKFAI_TOTAL_REQUEST_TIMEOUT_MS=120000
```

**Command:** `TOTAL_REQUESTS=20 CONCURRENCY=2 TOKFAI_MODEL=auto-fast`

| Metric | Result |
|--------|--------|
| completed / success / failed | 20 / 20 / 0 |
| HTTP 200 / 429 / 502 | 20 / 0 / 0 |
| credits_sum | 0.002741 |
| request_id samples | ✅ present |

**Conclusion:** P761.1 fix verified. Low-RPM guard rejections return standard **HTTP 429** + `too_many_requests` (not generic 502). 429 responses are **non-billable**; every response carries a traceable `request_id`.
