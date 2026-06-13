# P764.1 — Redis Provider Options

> Companion to [p764-redis-distributed-gateway.md](./p764-redis-distributed-gateway.md) §15 (Production Redis enable runbook).

P764 adds optional Redis for shared gateway state. This doc compares hosting options for **production enable** — not full queue/BullMQ (P765).

---

## 1. What Tokfai needs from Redis (P764 scope)

| Use | Pattern | Notes |
|-----|---------|-------|
| Rate limit counters | `INCR` + TTL | Low latency, many keys |
| Inflight counters | `INCR` / `DECR` | Must be reliable on release |
| Circuit breaker JSON | `GET` / `SET` | Small payloads |
| Batch lock | `SET NX EX` | 15 min TTL default |

**Not required yet:** persistence-heavy job queues, pub/sub at scale, Redis Cluster sharding.

Typical P764 traffic: thousands–low millions of ops/day on a single DMIT instance or small PM2 cluster.

---

## 2. Option comparison

| | **Upstash Redis** | **DMIT self-hosted Redis** | **Cloud managed Redis** |
|---|-------------------|---------------------------|-------------------------|
| **Examples** | Upstash serverless | Redis on same VPS as DMIT | AWS ElastiCache, GCP Memorystore, Azure Cache, DigitalOcean Managed Redis |
| **Setup time** | Minutes | Hours (install, firewall, backups) | Hours–days (VPC, subnets, auth) |
| **Ops burden** | Low | High (you patch, monitor, backup) | Medium (provider manages node) |
| **Latency** | Good (regional edge); TLS by default | Best if co-located with DMIT | Good within same region/VPC |
| **Cost at low volume** | Free tier / pay-per-request friendly | “Free” but uses DMIT CPU/RAM | Often $15–50+/mo minimum |
| **Cost at high volume** | Per-command pricing; watch bills | Fixed VPS cost | Predictable instance pricing |
| **TLS** | Built-in (`rediss://`) | You configure | Usually built-in |
| **Multi-instance DMIT** | Works out of box | Works if Redis reachable | Works in VPC |
| **Failover** | Provider-managed | Manual / none unless Sentinel | Provider HA tiers |

---

## 3. Upstash Redis

**Pros**

- Fastest path to production enable for P764.1
- HTTPS-friendly docs; `rediss://` URL works with node-redis
- No Redis daemon on DMIT box — less attack surface on API server
- Scales to zero-ish cost when idle

**Cons**

- Per-command pricing at very high QPS
- Region must be close to DMIT (e.g. same cloud region as VPS)
- Vendor lock-in for connection URL format (minor)

**When to use:** Default choice for Tokfai **now** — single DMIT + optional PM2 cluster, enabling shared RPM/inflight/breaker/lock.

**Setup sketch**

1. Create database in [Upstash Console](https://console.upstash.com/) (region near `api.tokfai.com` host)
2. Copy **Redis URL** from console → DMIT `.env` only
3. Set `TOKFAI_REDIS_ENABLED=true`, `TOKFAI_REDIS_KEY_PREFIX=tokfai`
4. Follow P764 §15 runbook

---

## 4. DMIT self-hosted Redis

**Pros**

- Lowest latency if Redis runs on localhost (`127.0.0.1:6379`)
- No external dependency bill
- Full control over memory policy and persistence

**Cons**

- You operate backups, updates, and memory limits
- PM2 cluster + single local Redis = single point of failure unless Sentinel
- Redis on same box competes with Node for RAM under load
- Misconfigured `bind` / firewall risks exposure

**When to use:** Cost-sensitive dev/staging, or later when DMIT moves to a dedicated Redis sidecar on the same private network.

**Not recommended** as first production enable unless you already run Redis competently on the DMIT host.

---

## 5. Cloud managed Redis

**Examples:** AWS ElastiCache, GCP Memorystore, Azure Cache for Redis, DigitalOcean Managed Redis, Redis Cloud.

**Pros**

- HA, patching, and monitoring from cloud provider
- Good for large scale and VPC-isolated architectures
- Predictable performance at sustained high QPS

**Cons**

- Overkill for P764.1 enable alone
- VPC peering / private link complexity if DMIT is on a simple VPS outside that cloud
- Higher baseline cost

**When to use:** Tokfai infrastructure already lives in AWS/GCP with DMIT in the same VPC, or when moving to **million-request relay** with dedicated platform team.

---

## 6. Current recommendation

| Phase | Recommendation |
|-------|----------------|
| **P764.1 (now)** | **Upstash Redis** — enable shared gateway state with minimal ops |
| **Growth** | Monitor Upstash command volume + latency; keep DMIT and Redis in same region |
| **High scale** | Dedicated managed Redis (same region/VPC as DMIT) or self-hosted Sentinel pair |

After enable, run:

```bash
TOKFAI_API_KEY=sk-tokfai_... node scripts/test-redis-gateway-state.mjs
TOKFAI_API_KEY=sk-tokfai_... node scripts/test-batch-chat.mjs
TOKFAI_API_KEY=sk-tokfai_... node scripts/test-batch-cancel.mjs
```

Record results in P764 doc §15 “Production smoke results (Redis enabled)”.

---

## 7. Security checklist (all providers)

- Store `TOKFAI_REDIS_URL` only in DMIT server env / secrets manager
- Use TLS (`rediss://`) when provider supports it
- Do not commit URL to git, docs, or smoke output
- Restrict network access (Upstash: IP allowlist if available; cloud: security groups)
- Rotate credentials if URL ever leaked

---

## 8. Related docs

| Doc | Topic |
|-----|-------|
| [p764-redis-distributed-gateway.md](./p764-redis-distributed-gateway.md) | Architecture, fallback, runbook |
| [p763-batch-queue-hardening.md](./p763-batch-queue-hardening.md) | Batch lock consumer (worker) |
