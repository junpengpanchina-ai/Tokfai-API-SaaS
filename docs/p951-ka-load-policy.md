# P951 — Tokfai KA load policy / 429 diagnosis

> **性质：** `/v1/chat/completions` 429 来源定位 + KA 负载策略说明（诊断层 / 策略层）。  
> **硬限制：** 不改 Nano Banana 主链路、不改 billing、不改 Nginx、不改 GPT/Gemini 文本模型路由。  
> **脚本：** [`scripts/p951-ka-load-policy-smoke.mjs`](../scripts/p951-ka-load-policy-smoke.mjs)

---

## 0. 决策摘要

| 事实 | 说明 |
|------|------|
| 50 并发 → 5 成功 / 45 × `too_many_concurrent_requests` | 命中 **单 key 并发 = 5** |
| 100 并发 → 仍约 5 成功 | 同上；并发闸与 RPM 闸独立 |
| 200 / 500 突发 → 大量 `too_many_requests` | 命中 **单 key RPM = 60 / 60s**（同窗口叠加后更易打满） |
| PM2 online、CPU/内存未打满 | **应用层限流**，不是进程崩溃或机器资源耗尽 |

P951 **不放开默认限流**；只固化诊断日志与 KA 策略文档，避免把「压测失败」误判成「服务不可用」。

---

## 1. 当前 429 代码来源（A）

入口中间件：`apps/dmit-api/src/middleware/chatGateway.ts`（挂在 chat / responses / gemini）。

| HTTP | `error.code` | 触发点 | 工厂 |
|------|--------------|--------|------|
| 429 | `too_many_requests` | IP RPM / tenant RPM / **key RPM** 任一超限 | `ApiError.tooManyRequests()`（`errors.ts`） |
| 429 | `too_many_concurrent_requests` | **单 key 并发** 超限 | `ApiError.tooManyConcurrentRequests()` |
| 503 | `gateway_overloaded` | **全局上游并发** 超限（非 429） | `ApiError.gatewayOverloaded()`（`executeChatCompletion.ts`） |

实现模块：

- RPM：`apps/dmit-api/src/gateway/rateLimit.ts`
- 并发：`apps/dmit-api/src/gateway/concurrency.ts`
- 拒绝日志：`apps/dmit-api/src/routes/chatGatewayLogs.ts` → `rate_limit_rejected`

判定顺序（先匹配先生效）：

1. body size → 413（非 429）
2. **IP RPM** → `too_many_requests`（`reason=ip_rpm`）
3. **tenant RPM** → `too_many_requests`（`reason=tenant_rpm`）
4. **key RPM** → `too_many_requests`（`reason=key_rpm`）
5. **key concurrency** → `too_many_concurrent_requests`（`reason=key_concurrency`）
6. （进入 handler 后）**global upstream concurrency** → 503 `gateway_overloaded`

---

## 2. 当前默认限额（B）

来自 `apps/dmit-api/src/env.ts` 默认值（可被环境变量覆盖；**P951 未改这些默认**）：

| 维度 | Env | 默认 | 超限行为 |
|------|-----|------|----------|
| **单 key RPM** | `TOKFAI_RATE_LIMIT_RPM` | **60** / 60s | 429 `too_many_requests` |
| **单 IP RPM** | `TOKFAI_RATE_LIMIT_IP_RPM` | **120** / 60s | 429 `too_many_requests` |
| **单 tenant RPM** | `TOKFAI_RATE_LIMIT_TENANT_RPM` | **600** / 60s | 429 `too_many_requests` |
| **单 key 并发** | `TOKFAI_MAX_CONCURRENCY_PER_KEY` | **5** | 429 `too_many_concurrent_requests` |
| **单 route 独立限额** | — | **无** | `/v1/chat/completions` 与 responses/gemini **共享**上述 key/IP/tenant 闸；无单独 route RPM |
| **全局上游并发** | `TOKFAI_GLOBAL_UPSTREAM_CONCURRENCY` | **50** | 503 `gateway_overloaded`（不是 429） |
| 窗口 | `TOKFAI_RATE_LIMIT_WINDOW_MS` | 60_000 | 滑动/分桶窗口 |

窗口与 Redis：有 Redis 时跨 PM2 实例共享计数；无 Redis 时为进程内内存。

---

## 3. 安全日志 `rate_limit_rejected`（C）

每次网关 429（`too_many_requests` / `too_many_concurrent_requests`）额外打一条结构化 warn：

| 字段 | 含义 |
|------|------|
| `route` | 请求路径（如 `/v1/chat/completions`） |
| `model` | 已知模型；中间件阶段多为 `unknown` |
| `reason` | `ip_rpm` \| `tenant_rpm` \| `key_rpm` \| `key_concurrency` |
| `limit` | 该闸阈值 |
| `current` | 决策时观测到的当前占用 |
| `key_hash` | `sha256("tokfai:rl:" + limitKey)` 前 16 hex（**非**明文 key） |
| `request_id` | 请求追踪 ID |

用法：用 `reason` + `limit`/`current` 区分「并发打满」与「RPM 打满」，避免再靠猜测压测曲线。

---

## 4. Free / Beta / KA 三档建议限制（D）

> 下表为 **产品建议档位**，不是本任务已落地的运行时开关。默认线上仍是 §2 的统一闸。

| 档位 | 建议 key RPM | 建议 key 并发 | 适用 |
|------|--------------|---------------|------|
| **Free** | 30–60 | 2–5 | 试用 / 个人；防刷与成本保护优先 |
| **Beta** | 60–120 | 5–10 | 公开 Beta；与当前默认接近 |
| **KA** | 300–1200+（合同） | 20–50+（合同） | 大客户；按套餐 / 白名单单独抬额 |

配套建议：

- KA 抬额只抬 **该客户的 key / tenant**，不抬全局「人人无限」。
- Image / Nano Banana / 长任务仍走各自重负载闸，不与 chat 文本 RPM 混为一谈。
- 客户端应实现有界并发 + 对 429 的退避重试（见客户文档 retry 章节）。

---

## 5. 为什么不能全局取消限流

1. **公平性**：一个 key 的突发会占满 Node event loop、上游连接与账单路径，拖垮所有租户。  
2. **上游保护**：GRSAI / 模型供应商有自己的 429；网关零限流只会把雪崩推到上游，并放大超时与重试风暴。  
3. **计费与安全**：无限突发放大盗用 key、脚本刷量与误配置循环的损失面。  
4. **可观测失败**：有界 429 比无界 502/超时/进程 OOM **更可诊断、更可重试**。  
5. **成本**：每个 in-flight 请求占用内存、连接与可能的上游计费窗口；取消并发闸等于取消容量规划。

结论：**限流是产品能力，不是临时补丁。** KA 需求用抬额 / 白名单解决，而不是 `RPM=∞`。

---

## 6. 「500 人在线」≠「500 个同毫秒请求」

| 概念 | 含义 | 对网关压力 |
|------|------|------------|
| 500 人在线 | 会话存在、间歇发消息 | 平均 QPS 可能只有几十；多数时间连接空闲 |
| 500 同毫秒请求 | 同一时刻 500 个 HTTP 打到 `/v1/chat/completions` | 立刻撞上 **key 并发 5** 与 **RPM 60** |

经验换算（示意）：

- 500 在线 × 每人每分钟 1 条 ≈ **~8 QPS** → 通常远低于 Beta 默认。  
- 单 key **瞬时并发 50** → 在默认并发 5 下，必然约 45 个 `too_many_concurrent_requests`。  
- 压测工具「concurrency=N」≈「同毫秒 in-flight N」，**不是**「N 个活跃用户」。

容量沟通请用：**可持续 RPM、可持续并发、p95 延迟**，不要用「同时在线人数」直接当并发配额。

---

## 7. KA 大客户：白名单 / 套餐限额怎么走

推荐路径（运营 + 工程，**不改 Nginx、不改 billing 核心**）：

1. **合同档位**：约定 key RPM、key 并发、可选 tenant RPM。  
2. **环境 / 配置抬额**（优先）：为该 tenant 或 key 覆盖  
   `TOKFAI_RATE_LIMIT_RPM` / `TOKFAI_MAX_CONCURRENCY_PER_KEY`  
   （未来可做成 DB 套餐字段；P951 只定政策，不落 schema）。  
3. **多 key 隔离**：同一 KA 按业务线拆 key，避免单 key 自撞并发闸。  
4. **客户端有界池**：服务端抬额后，客户侧仍应设 `max_in_flight`，避免自伤。  
5. **观测**：用 `rate_limit_rejected.reason` 确认抬额是否生效；429 行 `billable=false`。  
6. **禁止事项**：不为单一 KA 关闭全局上游并发或取消全站 RPM；不为 KA 绕过扣费。

升级流程建议：销售确认档位 → 运维改 env / 套餐配置 → 用低并发冒烟验证 `X-RateLimit-*` 与 `rate_limit_rejected` 不再误杀 → 再放量。

---

## 8. 验收与硬限制

| 项 | 要求 |
|----|------|
| typecheck / build | pass |
| P951 smoke | `TOKFAI_P951_KA_LOAD_POLICY_PASS` |
| 禁止改动 | Nano Banana 主链路、billing、Nginx、GPT/Gemini 文本路由 |
| 禁止现象 | `Cannot set headers` / `api_error_500` / `charged timeout`（本任务静态验收；不打真实 500 压测） |

```bash
cd apps/dmit-api && npm run typecheck && npm run build
node scripts/p951-ka-load-policy-smoke.mjs
```
