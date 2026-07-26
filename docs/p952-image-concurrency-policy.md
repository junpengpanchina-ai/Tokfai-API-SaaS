# P952 — Image concurrency production policy

> **性质：** 图片并发生产策略 + 压测 summary 规范（策略层 / 观测层）。  
> **硬限制：** 不改 Nano Banana 主链路、不改 Chat / GPT / Gemini、不改 billing 成功扣费逻辑、不改 Nginx。  
> **脚本：**  
> - [`scripts/p952-image-concurrency-load.mjs`](../scripts/p952-image-concurrency-load.mjs)  
> - [`scripts/p952-image-concurrency-policy-smoke.mjs`](../scripts/p952-image-concurrency-policy-smoke.mjs)  
> - helpers: [`scripts/lib/image-concurrency-load.mjs`](../scripts/lib/image-concurrency-load.mjs)

---

## 0. 决策摘要

| 事实 | 说明 |
|------|------|
| `count=20 concurrency=10` 已打公网 | 上游图片高并发稳定性不足（多见 `upstream_image_error`） |
| completed + URL + credits>0 | `billingStatus=billable` — 成功扣费路径正确 |
| failed `upstream_image_error` | `credits=0` / `not_billable` — **扣费保护正确** |
| 结论 | 问题在**上游图片并发稳定性**，不是 billing 误扣 |

P952 **不抬 Chat 500 并发逻辑到图片**；默认客户侧图片并发建议 **2–3**。

---

## 1. 默认图片并发建议：2–3

| 场景 | 建议 in-flight | 说明 |
|------|----------------|------|
| **默认 / Free / Beta** | **2–3** | 与容量规划小流量档一致；降低 `upstream_image_error` |
| 谨慎压测 | ≤5 | 可观测失败率；不要默认 10 |
| 禁止默认 | 10 / 50 / 500 | 图片任务慢（常 8–30s+），同毫秒高并发会打穿上游 |

压测脚本默认：

```bash
# 推荐（与政策一致）
LIVE=1 TOKFAI_API_KEY=sk-tokfai_... COUNT=20 CONCURRENCY=3 \
  node scripts/p952-image-concurrency-load.mjs

# 高并发仅用于诊断（预期失败率上升）
LIVE=1 ... CONCURRENCY=10 node scripts/p952-image-concurrency-load.mjs
```

---

## 2. KA 图片并发：单独白名单

KA（大客户）图片并发 **不得** 直接复用 Chat KA 抬额：

| 机制 | 建议 |
|------|------|
| 合同档位 | 单独约定 Image max in-flight（例如 5 / 8 / 15） |
| 白名单 | 按 tenant / key 登记图片并发上限，与 Chat RPM/并发解耦 |
| 多 key | 业务线拆 key，避免单 key 自撞 |
| 观测 | 用 P952 summary 的 `failed` / `error_codes` / `bad_billing_failures` 验收 |

抬额原则：

1. 先证明低并发（2–3）稳定，再阶梯上调。  
2. 只抬该 KA 的图片并发，不放开全站。  
3. **禁止** 为图片关闭扣费保护或「失败也扣费」。

---

## 3. 为什么图片不能和 Chat 共用「500 并发」逻辑

| 维度 | Chat 文本 | Image 生成 |
|------|-----------|------------|
| 典型耗时 | 2–8s（短生成可更低） | 常 8–30s+，偶发更长 |
| 资源形态 | 短连接 / token 流 | 长占用上游生成槽 + 轮询 |
| 失败模式 | 429 闸（RPM/并发）可预测 | 上游 `upstream_image_error` 随并发陡升 |
| 「500」含义 | 常被误解为「500 在线」；Chat 也有 per-key 并发闸（见 P951） | 若真开 500 同毫秒图片，会拖垮上游与队列 |
| 产品建议 | Chat 可高于 Image | Image **必须更低** |

要点：

- **500 人在线 ≠ 500 个同毫秒 Image POST。**  
- Chat 的压测档位（50/100/300…）**不能**原样套到 `/v1/images/generations`。  
- 图片应走 **低并发 + 队列/退避**；大批量用业务侧排队，而不是同步打满。

---

## 4. 扣费规则（与实现一致，P952 不改 billing）

| 结果 | 扣费？ | billing |
|------|--------|---------|
| **failed**（如 `upstream_image_error`） | **不扣费** | `not_billable`，`credits=0` |
| **timeout** / `retryable_timeout` | **不扣费** | `not_billable` |
| **completed 且有 url** | **扣费** | `billable`，`credits>0` |
| completed 但无 url | **不得当作成功扣费** | 计为 `missing_url_success` 异常信号 |

压测 summary 用以下计数守门：

- `billable_success` — completed + url + credits>0 + billable  
- `bad_billing_failures` — failed/timeout 却 credits>0 或 billable（**必须为 0**）  
- `missing_url_success` — completed 却无 url  

---

## 5. 压测 summary 规范（A）

每次图片并发压测结束必须输出：

| 字段 | 含义 |
|------|------|
| `total_done` | 已结束任务数 |
| `completed` | 状态 completed/succeeded |
| `failed` | 状态 failed |
| `timeout` | retryable_timeout / client poll timeout 等 |
| `billable_success` | 有 url 且扣费成功 |
| `bad_billing_failures` | 失败/超时却扣费（完整性告警） |
| `missing_url_success` | completed 但缺 url |
| `error_codes` | 错误码分布 |
| `latency` | `min` / `p50` / `p90` / `p95` / `max`（ms） |

实现：`summarizeImageConcurrencyLoad()` in `scripts/lib/image-concurrency-load.mjs`。

---

## 6. 验收与硬限制

| 项 | 要求 |
|----|------|
| typecheck / build | pass（本任务不改 dmit-api 运行时亦可） |
| P952 smoke | `TOKFAI_P952_IMAGE_CONCURRENCY_POLICY_PASS` |
| 禁止改动 | Nano Banana 主链路、Chat/GPT/Gemini、billing 成功扣费、Nginx |
| 禁止现象 | `Cannot set headers` / `api_error_500` / `charged timeout` |

```bash
cd apps/dmit-api && npm run typecheck && npm run build
node scripts/p952-image-concurrency-policy-smoke.mjs
# optional synthetic load summary:
SELF_TEST=1 node scripts/p952-image-concurrency-load.mjs
```
