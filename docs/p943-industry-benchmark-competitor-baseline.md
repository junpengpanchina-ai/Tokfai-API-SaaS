# P943 — Industry benchmark / competitor baseline framework

> **性质：** 对标文档 + 可复用测试框架（判定层 / 观测层）。  
> **硬限制：** 不改生产调用链路、不计费、不改模型 alias、不改 Cherry 兼容、不改图片生成、不改 release gate。  
> **现状：** **不**真实抓取同行 API；同行数据仅用可替换 fixture / 手工 baseline。  
> **脚本：** [`scripts/p943-industry-benchmark-framework.mjs`](../scripts/p943-industry-benchmark-framework.mjs)  
> **共享库：** [`scripts/lib/industry-benchmark.mjs`](../scripts/lib/industry-benchmark.mjs)

---

## 0. 决策摘要

Tokfai 对标同行，比的是 **可交付质量与风险可控**，不是盲目低价。

| 原则 | 说明 |
|------|------|
| 质量优先 | 核心指标目标：**比同行精 5%～15%**（覆盖、成功率、p95、客户端兼容、计费安全） |
| 不比拼底价 | 价格跟上游与毛利走；用体验 / 稳定 / 可审计扣费换溢价，而不是亏本引流 |
| Fixture first | 先建立 schema、CSV、指标聚合与对比脚本；同行 live 抓取另开任务且需合规评审 |
| 隔离生产 | 框架只读公开 OpenAI 兼容面（可选 LIVE Tokfai）；从不改 `apps/dmit-api` 主路径 |

---

## 1. 五个核心指标

| # | 指标 | 定义（可计算） | Tokfai 目标 vs 同行 baseline |
|---|------|----------------|------------------------------|
| 1 | **model coverage** | 行业核心模型清单中，目录 / probe 可用占比 | **+5%～15%** 相对覆盖（更多稳定模型可点通，或同清单更高可用率） |
| 2 | **success rate** | `status∈[200,299]` 且无计费异常 的 probe 占比 | **+5%～15%** 相对成功率（同路由 / 同 stream 口径） |
| 3 | **p95 latency** | 成功 probe 的 `latencyMs` 的 p95 | **−5%～15%** 相对延迟（更快；不通过把全局 timeout 拉到 700s「假绿」） |
| 4 | **client compatibility** | 已固化第三方客户端矩阵（Cherry / Chatbox / OpenWebUI / Dify / coding clients 等）契约覆盖分 | **+5%～15%** 相对兼容分（以离线矩阵 + 既有 p9xx smoke 为证，不改 Cherry 实现） |
| 5 | **billing safety / refund abuse risk** | 失败 / timeout 路径 `creditsCharged>0` 占比、以及「charged timeout」类风险信号 | **−5%～15%** 相对风险（更低误扣 / 更低可被滥用的退款面；timeout 不扣费） |

### 1.1 「精 5%～15%」怎么读

- **正向指标**（coverage / success / client compat）：Tokfai ≥ baseline × **1.05～1.15**
- **负向指标**（p95 latency / billing risk）：Tokfai ≤ baseline × **0.85～0.95**
- 框架输出 `deltaPct` 与 `targetBand`（`meet` / `below` / `above`）；**本阶段不把未达目标当成 release gate 失败**

### 1.2 明确不做什么

- 不把「全网最低价」写成 KPI
- 不把全局上游 timeout 改成 700s 来刷 p95 / success
- 不在本框架内 live 调用 OpenAI / Anthropic / 其他同行 host
- 不修改 release gate 判定或 PASS 标记集合

---

## 2. Probe CSV schema（行级）

每一行一次 probe（Tokfai live/mock 或 competitor fixture），列固定为：

| Column | Type | Notes |
|--------|------|-------|
| `model` | string | 请求模型 id（或 fixture 中的对标模型） |
| `route` | string | 如 `POST /v1/chat/completions`、`POST /v1/responses`、`GET /v1/models` |
| `stream` | `true` / `false` / empty | 无 stream 语义时留空 |
| `status` | int | HTTP status；客户端 abort 记 `0` |
| `latencyMs` | int | 端到端耗时（ms） |
| `creditsCharged` | number or empty | 仅成功扣费路径有值；失败应为 empty / 0 |
| `errorCode` | string or empty | Tokfai `error.code` 或 fixture 对标码 |
| `requestId` | string or empty | `request_id` / `x-request-id` |

CSV 头必须与上表一致（camelCase）。额外元数据（`vendor=tokfai|competitor_baseline`）写在**文件名或 sidecar summary**，不污染行 schema。

---

## 3. 指标聚合口径

从行级 CSV 聚合：

```
modelCoverage   = |distinct models with ≥1 success| / |required model set|
successRate     = count(status 2xx) / count(rows)          # 可按 route×stream 切片
p95LatencyMs    = percentile_95(latencyMs | status 2xx)
clientCompatScore = fixture or matrix score in [0,1]       # 本阶段用固化矩阵分，不重跑 Cherry
billingRiskRate = count(status∉2xx AND creditsCharged>0) / max(1, count(status∉2xx))
                + timeout_charge_hits（若 error 路径出现 charged timeout 信号）
```

对比输出字段（summary JSON / CSV）：

| Field | Meaning |
|-------|---------|
| `metric` | 五指标之一 |
| `tokfai` | Tokfai 观测值 |
| `competitorBaseline` | Fixture 同行基线 |
| `deltaPct` | `(tokfai - baseline) / baseline * 100`（latency/risk 解读时注意方向） |
| `betterWhen` | `higher` 或 `lower` |
| `targetBand` | `meet` / `below` / `above`（相对 5%～15% 目标带） |

---

## 4. Competitor baseline（fixture only）

路径：[`scripts/fixtures/p943-competitor-baseline.csv`](../scripts/fixtures/p943-competitor-baseline.csv)

| 规则 | |
|------|--|
| 来源 | **手工 / 合成**行业中位示意，标注 `SYNTHETIC` |
| Live 抓取 | **禁止**（本任务范围外） |
| 替换方式 | 用同 schema CSV 覆盖 fixture，或设 `COMPETITOR_BASELINE_CSV=...` |
| Host 泄露 | Fixture 与日志不得出现同行真实 upstream host / key |

Baseline **metrics sidecar**（脚本内常量，可被 env 覆盖）：代表「同行典型」聚合值，供未跑满 probe 时的对比。

---

## 5. 怎么跑

```bash
# 离线 / 自检（默认）：mock Tokfai + fixture competitor → 写 CSV + 对比
node scripts/p943-industry-benchmark-framework.mjs

# 显式自检
SELF_TEST=1 node scripts/p943-industry-benchmark-framework.mjs

# 可选：只采 Tokfai 自身 probe 行（仍不抓同行）
LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p943-industry-benchmark-framework.mjs
```

### 输出（默认写入 `tmp/`）

| File | Content |
|------|---------|
| `tmp/p943-tokfai-benchmark.csv` | Tokfai probe 行（schema） |
| `tmp/p943-competitor-baseline.csv` | 本次使用的 fixture 副本 |
| `tmp/p943-metrics-summary.csv` | 五指标对比 |
| stdout | `TOKFAI_P943_INDUSTRY_BENCHMARK_FRAMEWORK_PASS` |

### 环境变量

| Env | Default | Meaning |
|-----|---------|---------|
| `SELF_TEST` | unset | `1` → 纯 fixture，不启 mock |
| `LIVE` | unset | `1` → 对 Tokfai 公网/指定 base probe（需 key） |
| `TOKFAI_API_KEY` | — | LIVE 必填 |
| `TOKFAI_API_BASE` | `https://api.tokfai.com` | LIVE base（无 `/v1` 亦可） |
| `MODELS` | 核心稳定集 | 逗号分隔 |
| `CSV_DIR` | `tmp` | 输出目录 |
| `COMPETITOR_BASELINE_CSV` | fixtures 默认路径 | 替换同行行级 CSV |
| `CHAT_TIMEOUT_MS` | `120000` | **仅客户端 abort**；不改服务器 timeout |

---

## 6. 与既有 suite 的关系

| Suite | 关系 |
|-------|------|
| p932 / p933 Cherry | **只引用兼容结论作 client compat 分**；本框架不改 Cherry 请求体 / 路由 |
| p941 isolation | 可作 Tokfai success/latency 采样参考；本框架不改 P941 / release gate |
| p901 billing | billing safety 口径对齐「失败不扣费」；本框架不改扣费实现 |
| release gate | **不纳入**；P943 PASS 不替代五门禁标记 |

---

## 7. 后续（另开任务）

1. 合规批准后的 competitor live collector（独立脚本、独立 key、独立 rate limit）
2. 按 `route×stream×model` 切片的周报
3. Dashboard 只读展示（仍禁止把 service-role / 上游 key 放进 `apps/web`）

---

## 8. Acceptance

运行默认或 `SELF_TEST=1` 后必须出现：

```text
TOKFAI_P943_INDUSTRY_BENCHMARK_FRAMEWORK_PASS
```

并写出符合 §2 schema 的 Tokfai + competitor CSV，以及五指标 summary。
