# P764 — Redis-backed Distributed Gateway and Batch Queue

> Goal: move Tokfai from single-process in-memory gateway/batch state to Redis-backed shared state — the foundation for PM2 cluster, multi-instance DMIT, and high-volume relay (millions of requests).

P763 hardened the batch worker (timeout, retry, cancel, repair). P764 adds **optional Redis** for cross-process coordination without breaking current production behavior.

---

## 1. Why P764 matters

| Single-process (P761–P763) | Redis-backed (P764+) |
|----------------------------|----------------------|
| RPM / concurrency per PM2 worker | Shared limits across all workers |
| Circuit breaker local to one process | All instances skip unhealthy models together |
| Batch worker dedupe via in-memory `Set` | Batch lock prevents duplicate processing across instances |
| PM2 cluster = N × limits | Cluster behaves like one logical gateway |

This is the **foundation layer** for million-request relay — not the full queue yet (see P765/P766).

---

## 2. What Redis solves in P764

| State | Redis key pattern | Fallback |
|-------|-------------------|----------|
| Per-key RPM | `tokfai:rate:{apiKeyId}:{window}` | In-memory fixed window |
| Global upstream inflight | `tokfai:inflight:global` | In-memory counter |
| Per-key inflight | `tokfai:inflight:key:{apiKeyId}` | In-memory counter |
| Model circuit breaker | `tokfai:circuit:{model}` | In-memory map |
| Batch processing lock | `tokfai:batch:lock:{batchId}` | In-memory `activeBatches` only |

**Not Redis-ized yet (future):**

- BullMQ / persistent job queue (P765)
- Cross-instance batch resume leases / heartbeats (P766)
- Usage log batch writes / archive

---

## 3. Default: Redis disabled

**Production is unchanged by default.**

| Variable | Default | Meaning |
|----------|---------|---------|
| `TOKFAI_REDIS_ENABLED` | `false` | No Redis connection attempted |
| `TOKFAI_REDIS_URL` | unset | Required only when enabled |
| `TOKFAI_REDIS_KEY_PREFIX` | `tokfai` | Key namespace prefix |
| `TOKFAI_BATCH_LOCK_TTL_MS` | `900000` | Batch lock TTL (15 min) |

When disabled, DMIT logs `redis_disabled` at startup and uses the same in-memory logic as P761–P763.

---

## 4. Enabling Redis

On the DMIT host (or shared env):

```bash
TOKFAI_REDIS_ENABLED=true
TOKFAI_REDIS_URL=redis://:password@127.0.0.1:6379/0
TOKFAI_REDIS_KEY_PREFIX=tokfai
```

Deploy:

```bash
git pull origin main
cd apps/dmit-api
npm ci
npm run build
pm2 restart dmit-api --update-env
pm2 save
```

Verify:

```bash
curl -s https://api.tokfai.com/v1/health | jq .redis
# { "enabled": true, "connected": true }
```

Redis URL is **never** exposed in `/v1/health`.

---

## 5. Fallback strategy

Redis failures must not take down chat or batch APIs.

| Scenario | Behavior |
|----------|----------|
| `TOKFAI_REDIS_ENABLED=false` | In-memory only; startup log `redis_disabled` |
| Enabled but `TOKFAI_REDIS_URL` missing | Warn once; in-memory fallback |
| Connect error at boot | Warn `redis_connect_failed`; in-memory fallback |
| Runtime Redis error (INCR, GET, etc.) | Warn per operation; in-memory fallback for that call |
| Batch lock unavailable | Treat as lock acquired (single-process behavior) |

`/v1/chat/completions` and P762/P763 batch APIs keep working on fallback.

---

## 6. Rate limit (Redis)

When Redis is active:

- Fixed-window counter per `apiKeyId` (or `user:{id}` for JWT)
- Key: `{prefix}:rate:{limitKey}:{windowBucket}`
- Shared across all DMIT workers
- Same HTTP response as P761:
  - **429** `too_many_requests`
  - Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

---

## 7. Inflight counters (Redis)

| Counter | Key | Limit env |
|---------|-----|-----------|
| Global upstream | `{prefix}:inflight:global` | `TOKFAI_GLOBAL_UPSTREAM_CONCURRENCY` |
| Per-key handler | `{prefix}:inflight:key:{apiKeyId}` | `TOKFAI_MAX_CONCURRENCY_PER_KEY` |

- Acquire: atomic `INCR`, rollback if over limit
- Release: `DECR` in `finally` (including errors)
- Batch items still use global upstream via `executeChatCompletion`; per-key middleware limits apply only to sync chat route

---

## 8. Circuit breaker (Redis)

Shared JSON state at `{prefix}:circuit:{model}`:

```json
{ "failures": 3, "openUntil": 1718280000000 }
```

- Open models skipped in `auto-*` fallback chains on **all** workers
- Cooldown: 60s (same as P761)
- Success deletes the key

---

## 9. Batch processing lock

P764 does **not** replace the in-process batch worker with BullMQ. It adds a **distributed lock** so only one worker processes a batch:

- Lock key: `{prefix}:batch:lock:{batchId}`
- TTL: `TOKFAI_BATCH_LOCK_TTL_MS` (default 15 min)
- Acquire on enqueue; release in `finally` after `processBatch`
- If lock held → log `batch_lock_skip` and skip

Repair script (`scripts/repair-stuck-batches.mjs`):

- When `TOKFAI_REDIS_URL` + `TOKFAI_REDIS_ENABLED=true`, skips batches with an active lock
- Without Redis, repair runs as before (documented risk of worker conflict)

---

## 10. Health endpoint

`GET /v1/health` includes:

```json
{
  "ok": true,
  "service": "dmit",
  "version": "0.1.0",
  "now": "2026-06-13T…",
  "redis": {
    "enabled": false,
    "connected": false
  }
}
```

---

## 11. Test scripts

### Redis / gateway state

```bash
TOKFAI_API_KEY=sk-tokfai_... node scripts/test-redis-gateway-state.mjs
```

- Reads `/v1/health` → `redis.enabled` / `redis.connected`
- Sends concurrent chat requests; verifies `X-RateLimit-*` headers
- When Redis disabled, prints fallback notice and still passes

### Existing batch smokes (unchanged)

```bash
TOKFAI_API_KEY=sk-tokfai_... node scripts/test-batch-chat.mjs
TOKFAI_API_KEY=sk-tokfai_... node scripts/test-batch-cancel.mjs
```

Must pass with Redis disabled (default production config).

---

## 12. Implementation map

| File | Role |
|------|------|
| `apps/dmit-api/src/redis/client.ts` | Connect, health, key prefix |
| `apps/dmit-api/src/gateway/rateLimit.ts` | Redis + memory RPM |
| `apps/dmit-api/src/gateway/concurrency.ts` | Redis + memory inflight |
| `apps/dmit-api/src/upstream/modelCircuitBreaker.ts` | Redis + memory breaker |
| `apps/dmit-api/src/batch/lock.ts` | Batch distributed lock |
| `apps/dmit-api/src/batch/worker.ts` | Lock acquire/release |
| `apps/dmit-api/src/routes/health.ts` | `redis` status field |
| `scripts/repair-stuck-batches.mjs` | Optional lock-aware repair |
| `scripts/test-redis-gateway-state.mjs` | Health + rate limit probe |

---

## 13. Roadmap

| Phase | Topic |
|-------|--------|
| **P764** | Redis shared gateway state + batch lock (this doc) |
| **P765** | Persistent batch job queue (BullMQ / Redis streams) |
| **P766** | Worker leases, heartbeats, multi-instance batch resume |
| Future | Redis-backed idempotency, probe-model-health integration |

---

## 14. Production smoke results

**Status:** ✅ P764 passed on production DMIT — Redis disabled fallback mode (2026-06-13)

**Deploy:**

```bash
git pull origin main
npm ci
npm run build
pm2 restart dmit-api --update-env
pm2 save
```

**Environment:**

| Setting | Value |
|---------|-------|
| API base | `https://api.tokfai.com/v1` |
| Redis mode | Disabled fallback |
| `TOKFAI_REDIS_ENABLED` | `false` / unset |
| `TOKFAI_REDIS_URL` | unset |

#### A. Health

| Metric | Result |
|--------|--------|
| `GET /v1/health` | HTTP 200 |
| `redis.enabled` | `false` |
| `redis.connected` | `false` |
| Service | ok |

#### B. Redis gateway state script

| Setting | Value |
|---------|-------|
| Script | `scripts/test-redis-gateway-state.mjs` |

| Metric | Result |
|--------|--------|
| Fallback mode | Redis disabled fallback detected |
| Concurrent chat requests | 3 — all HTTP 200 |
| Rate limit headers | present on all responses |
| `X-RateLimit-Limit` | `60` |
| `X-RateLimit-Remaining` | `58` / `57` / `59` |
| Script outcome | Redis gateway state smoke test passed |

#### C. Batch chat regression

| Setting | Value |
|---------|-------|
| Script | `scripts/test-batch-chat.mjs` |

| Metric | Result |
|--------|--------|
| Script outcome | Smoke test passed |

Regression against P763 batch chat path; no Redis-related regression observed.

#### D. Batch cancel regression

| Setting | Value |
|---------|-------|
| Script | `scripts/test-batch-cancel.mjs` |

| Metric | Result |
|--------|--------|
| Script outcome | Cancel test passed |

Regression against P763 cancel path; pending items not processed after cancel.

**Conclusion:**

P764 production validation passed in **Redis disabled fallback** mode. Behavior remains compatible with P763 — chat, batch, and cancel main paths unchanged. Configure `TOKFAI_REDIS_ENABLED=true` + `TOKFAI_REDIS_URL` in a follow-up deploy to verify cross-instance shared state.
