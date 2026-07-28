# P962 — Production mixed acceptance report（归档 only）

> **性质：** 验收归档 only — 汇总已跑完的公网 mixed 压测产物，**不重跑压测**。  
> **硬限制：** 本任务**不改** Chat 主链路、不改图片主链路、不改 billing 逻辑；只生成本报告。  
> **跑测窗口（产物时间戳）：** 2026-07-28 ≈ 13:01:24 → 13:03:37（服务器本地时区）  
> **归档日期：** 2026-07-28  
> **产物主机：** `deploy@154.12.189.107` `/tmp/`  
> **本地工作树参考 commit：** `ce8558409ab981a9fa6230977332e090801738e2`

**Verdict：`P962_PRODUCTION_MIXED_ACCEPTANCE_PASS`**

---

## 0. 总览结论

| 主题 | 结论 | 状态 |
|------|------|------|
| **Chat mixed 500 @ C20** | total=500；**OK=382**；**429=118**；**500=0** | **PASS** |
| **Image money-bag 20 @ C2** | completed=20；billable_success=20；bad_billing=0；missing_url=0 | **PASS** |
| **Negative route isolation** | `image_model_not_for_chat` / `model_not_image_capable` + `not_billable` | **PASS** |
| **Runtime / PM2** | PID `475768` 全程 `online`；`restart_time` 未变；监控窗口无 dirty 文本 | **PASS** |

**可接受：** Chat `429`（限流保护）、Image 低并发完成并正确扣费。  
**不可接受（本轮均未出现）：** Chat/网关 **HTTP 500**、Image `bad_billing_failures`、`missing_url_success`、PM2 掉线/异常重启、监控日志中的 dirty billing/runtime 禁词。

**产品口径（冻结）：**

1. Mixed 高压目标是「不崩 + 不坏扣费 + 隔离仍稳」，不是 Chat 永远 200。  
2. Chat 撞并发/RPM 返回 429 是保护，不是故障；本轮 **0 × 500**。  
3. Image @ C2（money-bag）须全部 completed 且有 url 才 billable；失败不得误扣。  
4. P954 负向隔离：image→chat / text→images 稳定错码，且 `not_billable`。

---

## 1. 源产物（只读归档，未重跑）

| 产物 | 路径（生产机 `/tmp`） |
|------|----------------------|
| Chat load | `/tmp/mixed-real-chat-500-c20-20260728-130124.json` |
| Image money-bag | `/tmp/mixed-real-image-20-c2-20260728-130124.json` |
| Negative isolation | `/tmp/mixed-real-negative-20260728-130124.json` |
| PM2 / mem monitor | `/tmp/mixed-real-monitor-20260728-130124.log` |

| 项 | 值 |
|----|-----|
| Chat base | `https://api.tokfai.com/v1` |
| Chat model | `gemini-2.5-flash` |
| Chat shape | `users=500`，`perUser=1`，`concurrency=20`（**C20**），`timeoutMs=240000` |
| Image base | `https://api.tokfai.com` |
| Image model | `nano-banana` |
| Image shape | `count=20`，`concurrency=2`（**C2**），`poll_ms=180000`，mode=`LIVE` |
| Image runner | `scripts/p952-image-concurrency-load.mjs` |

---

## 2. Chat mixed result（500 @ C20）

源：`mixed-real-chat-500-c20-20260728-130124.json`（`type=chat_load_result`）

| 指标 | 值 |
|------|-----|
| total | **500** |
| concurrency | **20** |
| **ok** | **382**（okRate **76.4%**） |
| fail | 118 |
| HTTP | `200 × 382`，`429 × 118` |
| **HTTP 500** | **0**（`httpCodes` 无 500） |
| errors | `too_many_requests × 118` |
| durationMs | 139 992 |
| rps | 3.57 |
| latency min / p50 / p90 / p95 / p99 / max | 453 / 4 335 / 9 054 / 12 019 / 25 077 / 33 098 ms |

**判定：** **PASS** — 有界 C20 下大量成功；撞限流一律 **429**，**零 500**。

> 要求口径核对：**500 total / 382 OK / 118 429 / 0 500** — 与产物一致。

---

## 3. Image money-bag result（20 @ C2）

源：`mixed-real-image-20-c2-20260728-130124.json`（P952 LIVE summary 文本产物）

| 指标 | 值 |
|------|-----|
| total_done | **20** |
| **completed** | **20** |
| failed / timeout / timeout_pending | **0 / 0 / 0** |
| **billable_success** | **20** |
| **bad_billing_failures** | **0** |
| **missing_url_success** | **0** |
| error_codes | （none） |
| latency min / p50 / p90 / p95 / max | 9 098 / 11 949 / 14 717 / 17 565 / 26 032 ms |

旁证写出路径（跑测机）：

- `/opt/tokfai-api-saas/tmp/p952-image-concurrency-result.json`
- `/opt/tokfai-api-saas/tmp/p952-image-concurrency-summary.json`

**判定：** **PASS** — money-bag 20 张全部 completed + billable；无坏扣费、无 missing_url 假成功。

> 要求口径核对：**20 completed / 20 billable_success / bad_billing_failures=0 / missing_url_success=0** — 与产物一致。

---

## 4. Negative route isolation（P954）

源：`mixed-real-negative-20260728-130124.json`

### 4.1 Image model → `/v1/chat/completions`

| 项 | 值 |
|----|-----|
| code | **`image_model_not_for_chat`** |
| type | `invalid_request_error` |
| message | Image models cannot be used on `/v1/chat/completions`… |
| request_id | `d96144d3885c2db9df43eec714cf26b9` |

### 4.2 Text model → `/v1/images/generations`

| 项 | 值 |
|----|-----|
| code | **`model_not_image_capable`** |
| type | `invalid_request_error` |
| **tokfai.billing_status** | **`not_billable`** |
| **tokfai.credits_charged** | **0** |
| request_id（error） | `4bf88fd34f3ec7f5bf6148686f619128` |

**判定：** **PASS** — 双向隔离错码稳定；错误路径 **不扣费**。

---

## 5. Runtime evidence（PM2 / memory monitor）

源：`mixed-real-monitor-20260728-130124.log`（monitor 1…14，约 13:01:24 → 13:03:37）

| 项 | 观察 |
|----|------|
| PM2 status | 全程 **`online`** |
| PID | **`475768`**（14 个采样点不变） |
| restart_time | **`136`**（全程不变 → 窗口内无异常重启） |
| memory（进程） | ≈ 87 MB → 峰值 ≈ 117 MB → 回落到 ≈ 101 MB |
| host Mem available | ≈ 519 MB → ≈ 446 MB（压力下下降，未 OOM 迹象） |
| dirty billing/runtime 文本 | **本 monitor 日志中未出现** `api_error_500` / `charged timeout` / `empty body` / `message=undefined` / `code=undefined` / `Cannot set headers` |

**判定：** **PASS** — 混合压测窗口内主进程保持 online、PID/restart 稳定；监控产物无 dirty 禁词。

---

## 6. Verdict

| Gate | 结果 |
|------|------|
| Chat mixed（500 / 382 OK / 118 429 / 0 500） | **PASS** |
| Image money-bag（20 / 20 billable / bad=0 / missing_url=0） | **PASS** |
| Negative isolation（P954 + not_billable） | **PASS** |
| Runtime（PM2 online / 无 dirty） | **PASS** |

### `P962_PRODUCTION_MIXED_ACCEPTANCE_PASS`

本轮证明：公网 mixed 场景下 Chat 可被限流但不雪崩，Image C2 money-bag 扣费完整，P954 隔离仍稳，运行时进程健康。  
**未**在本任务中重跑任何压测，也**未**修改 Chat / Image / billing 代码。
