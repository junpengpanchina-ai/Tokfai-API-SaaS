# P953 — KA LoadTest key / tenant 压测白名单

> **性质：** 生产压测专用网关抬额白名单（运行时配置层）。  
> **硬限制：** 不改 chat/image 主链路业务逻辑；不关闭普通用户限流；不跳过鉴权；不跳过 billing 扣费；不影响 Nano Banana 图片主链路。  
> **脚本：** [`scripts/p953-ka-loadtest-whitelist-smoke.mjs`](../scripts/p953-ka-loadtest-whitelist-smoke.mjs)

---

## 0. 决策摘要

| 项 | 说明 |
|----|------|
| 普通 key | 仍受默认 RPM / 并发闸 → `too_many_requests` / `too_many_concurrent_requests` |
| KA load test key/tenant | 仅抬该身份的网关配额；鉴权与成功扣费不变 |
| 全局默认 | **不改**（key RPM=60、IP=120、tenant=600、key 并发=5、global upstream=50） |
| Image / Nano Banana | **不改**（图片路由不挂 `chatGatewayMiddleware`） |

---

## 1. 配置

| Env | 含义 | 默认 |
|-----|------|------|
| `KA_LOAD_TEST_KEYS` | CSV：`api_keys.id`（UUID）和/或 `api_keys.key_id`（12-hex） | 空 |
| `KA_LOAD_TEST_TENANTS` | CSV：`tenants.id`（UUID） | 空 |
| `KA_LOAD_TEST_KEY_RPM` | 白名单单 key RPM | **1200** |
| `KA_LOAD_TEST_KEY_CONCURRENCY` | 白名单单 key 并发 | **600** |
| `KA_LOAD_TEST_TENANT_RPM` | 白名单 tenant RPM | **3000** |
| `KA_LOAD_TEST_IP_RPM` | 白名单请求的 IP RPM（同机压测避免先撞普通 IP 闸） | **6000** |

**禁止**把明文 `sk-tokfai_...` 写进 `KA_LOAD_TEST_KEYS`。

空白名单 ⇒ 行为与 P951 默认完全一致。

示例（PM2 热更新 env，勿把整站默认抬高）：

```bash
# 仅示例 — 使用真实 api_keys.id / tenant id
KA_LOAD_TEST_KEYS=<api_keys.id>
# 可选：KA_LOAD_TEST_TENANTS=<tenant_uuid>
pm2 reload dmit-api --update-env
```

---

## 2. 命中后抬额

命中 key **或** tenant 任一白名单后，`rate_limit_policy=ka_load_test`：

| 闸 | 普通默认 | KA load test |
|----|----------|--------------|
| 单 key 并发 | 5 | **600** |
| 单 key RPM | 60 | **1200** |
| tenant RPM | 600 | **3000** |
| IP RPM（该请求） | 120 | **6000** |
| daily / monthly credit period cap | 生效 | **仅 listed key 跳过** period cap（tenant-only 命中不跳） |

仍强制：

1. API key / JWT 鉴权  
2. 余额预检 `assertHasCredits`  
3. 成功路径 `record_usage_and_debit`  
4. 全局上游并发（默认 50 → 503 `gateway_overloaded`，**不**因 KA 放开）

---

## 3. 日志

`rate_limit_rejected` 增加字段：

| 字段 | 值 |
|------|-----|
| `rate_limit_policy` | `normal` \| `ka_load_test` |
| `key_hash` | `sha256("tokfai:rl:" + limitKey)` 前 16 hex（**永不**打明文 key） |

---

## 4. 验收口径

| 场景 | 期望 |
|------|------|
| 普通 key 突发 | 仍会 429（RPM / 并发） |
| KA load test key，`500 users / perUser=1` | 不应被**普通**限流全量拦住（仍可能撞全局上游 503） |
| 压测过程 | 服务不因本改动崩溃重启；无 `Cannot set headers` / `api_error_500` / uncaught / heap OOM |
| billing | 成功仍扣费；429 网关拒绝仍 `billable=false` |

```bash
cd apps/dmit-api && npm run typecheck && npm run build
node scripts/p953-ka-loadtest-whitelist-smoke.mjs
TOKFAI_API_KEY=sk-tokfai_... node scripts/tokfai-release-gate.mjs
```

---

## 5. 与 P951 / P952 关系

- **P951**：429 诊断与「为何不能全局取消限流」策略文档。  
- **P952**：图片并发策略（与本白名单解耦）。  
- **P953**：落地 Chat 网关 KA load-test 运行时白名单。
