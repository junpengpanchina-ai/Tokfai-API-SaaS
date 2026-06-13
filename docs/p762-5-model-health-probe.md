# P762.5 — Model Health Probe MVP

> Goal: measure **real gateway health per model** with data — not gut feel — before routing hospital, enterprise, and robotics workloads through Tokfai.

P760–P762 added smart routing, gateway guards, and batch queue. Those features assume upstream models are *mostly* healthy. This phase adds a repeatable probe so we can see when **gpt-5.4 / gpt-5.5** (and others) are slow, busy, or flaky.

---

## 1. Why a large API relay must probe model health

Tokfai is building toward a **large API relay** for institutions that cannot depend on a single upstream staying green 24/7:

| Without probes | With probes |
|----------------|-------------|
| “It worked once” ≠ production-ready | Success rate + p95 tracked over time |
| Batch jobs stall on unhealthy models | Batch queue + health data → smarter routing (future) |
| Support tickets after customer impact | `request_id` samples for pre-incident triage |
| Premium model slowness is invisible | `upstream_model_busy` / timeout counts per model |

A relay that serves hospitals, factories, and robotics pipelines **must** know which models are stable *right now*, not just whether a manual curl succeeded.

---

## 2. gpt-5.4 / gpt-5.5 — success rate and p95, not “can call once”

Premium OpenAI-class models on GRSAI have shown:

- **Latency spikes** (p95 well above smoke-test expectations)
- **`upstream_model_busy` (503)** under load
- **Timeouts** when upstream is saturated

A single successful call proves nothing. Promotion criteria:

| Signal | Why it matters |
|--------|----------------|
| **success_rate ≥ 95%** | Occasional upstream busy is OK; sustained failure is not |
| **p95 < 60s** | Clients and batch workers need bounded wait |
| **generic 502 (`upstream_error`) = 0** | Unmapped failures hide infra bugs |
| **`upstream_busy` / timeout counts** | Quantifies hot-model risk for explicit `model=gpt-5.4` |
| **`request_id` on every success** | Audit trail for billing and support |

Run the probe after deploys, upstream incidents, and before onboarding heavy customers.

---

## 3. auto-fast vs auto-pro

| Model | Role | What to watch |
|-------|------|----------------|
| **`auto-fast`** | Default stable entry; smart routing with fallback | High success rate; note `resolved_model_distribution` (which upstream actually served) |
| **`auto-pro`** | Quality entry; longer fallback chain | Success rate + fallback spread — quality path may retry more |
| **Explicit IDs** (`gpt-5.4`, `gemini-3-pro`, …) | No silent fallback | Failures are *real* for that upstream; use for capacity planning |

**auto-fast** is the recommended integration default. **auto-pro** is for quality workloads but requires monitoring fallback behavior.

---

## 4. Single upstream ≠ guaranteed stability

Today Tokfai routes through a **single upstream pool** (GRSAI). No amount of gateway tuning guarantees every mainstream model stays hot-stable.

**P766 (future): multi-upstream model pool** — route the same logical model across providers, degrade gracefully, and auto-deprioritize unhealthy backends. P762.5 data feeds that design.

---

## 5. Script

**Path:** [`scripts/probe-model-health.mjs`](../scripts/probe-model-health.mjs)

### Environment

| Variable | Default |
|----------|---------|
| `TOKFAI_API_KEY` | *(required)* `sk-tokfai_...` |
| `TOKFAI_API_BASE` | `https://api.tokfai.com/v1` |
| `MODELS` | `auto-fast,auto-pro,gemini-3-flash,gemini-2.5-flash,gemini-3-pro,gemini-3.1-pro,gpt-5.4,gpt-5.5` |
| `REQUESTS_PER_MODEL` | `5` |
| `CONCURRENCY` | `1` |
| `PROMPT` | `Say ok only.` |
| `TIMEOUT_MS` | `120000` |
| `STOP_ON_ERROR_RATE` | `1` (no early stop) |

Each request: `POST /v1/chat/completions` with `{ model, messages, stream: false }`.

Reads `response.tokfai.requested_model`, `resolved_model`, `request_id`. On error, records `error.code` / `type` / truncated message (120 chars). API key is **never** printed in full — masked prefix/suffix + length only.

### Run

```bash
# Full default model set (production)
TOKFAI_API_KEY=sk-tokfai_... node scripts/probe-model-health.mjs

# Focus on premium models
TOKFAI_API_KEY=sk-tokfai_... \
  MODELS=gpt-5.4,gpt-5.5 \
  REQUESTS_PER_MODEL=10 \
  node scripts/probe-model-health.mjs

# Local DMIT
TOKFAI_API_BASE=http://localhost:8787/v1 \
  TOKFAI_API_KEY=sk-tokfai_... \
  MODELS=auto-fast \
  node scripts/probe-model-health.mjs
```

### Output

1. **Console** — summary table + per-model detail (status, latency, busy/timeout counts, resolved-model distribution, `request_id` samples)
2. **`model-health-results/latest.json`** — full structured report (gitignored; safe to archive in CI artifacts)

### Per-model metrics

- `planned` / `completed` / `success` / `failed` / `success_rate`
- `http_status_distribution`
- `error_code_distribution`
- `latencyMs.p50` / `p95` / `max`
- `resolved_model_distribution` (successes only)
- `credits_sum`
- `request_id_samples`
- `timeout_count` / `upstream_busy_count` / `model_not_available_count`

---

## 6. When a model is safe to promote

Use this checklist on probe results (default 5 requests/model is a **smoke**; use 20–50 for pre-production gates):

| Gate | Target |
|------|--------|
| Success rate | **≥ 95%** |
| Generic 502 / unmapped `upstream_error` | **0** |
| p95 latency | **< 60s** (adjust per SLA) |
| `upstream_busy` + timeouts | Acceptable for explicit premium models; **near-zero** for `auto-fast` |
| `request_id` | **100%** on successful responses |

If `auto-fast` fails gates → investigate gateway/upstream before any customer rollout. If only `gpt-5.4`/`gpt-5.5` fail → document busy-model behavior; steer integrators to `auto-fast` / `auto-pro`.

---

## 7. Related docs

| Doc | Topic |
|-----|--------|
| [P760 smart routing](./p760-smart-model-routing.md) | Fallback chains |
| [P761 gateway throughput](./p761-gateway-throughput-and-rate-limit.md) | Rate limits & error codes |
| [P762 batch queue](./p762-batch-chat-queue-mvp.md) | Bulk jobs — combine with health probe |
| [P759 load test](./p759-load-test-and-capacity-gate.md) | Single-model soak |

---

## 8. Implementation map

| File | Role |
|------|------|
| `scripts/probe-model-health.mjs` | Multi-model health probe |
| `model-health-results/latest.json` | Latest run output (local, gitignored) |
| `docs/p762-5-model-health-probe.md` | This document |

No DMIT code changes required for MVP — probe uses the public chat API only.
