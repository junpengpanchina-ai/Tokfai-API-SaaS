# P955 — Production acceptance report (P952 / P953 / P954 archive)

> **性质：** 验收归档 only — 汇总 P952 / P953 / P954 生产与压测结论。  
> **硬限制：** 本任务**不改**运行时代码、不改 Nano Banana 主链路、不改 billing、不改 Nginx。  
> **归档日期：** 2026-07-27（UTC）  
> **工作树基线：** `ccfaccf32d20a685ff1ff87465ccb220030bf2c4`（含未提交的 P954 工作区改动时以 gate 当时 HEAD 为准）

---

## 0. 总览结论

| 主题 | 结论 | 状态 |
|------|------|------|
| **Chat 100 / 200 @ C10** | 受控并发下公网 Chat 稳定（100% / 99.5% HTTP 200） | **PASS** |
| **Image C2 / C3** | 低并发（2–3）可生产；扣费保护正确；高并发（10）上游不稳 | **PASS（策略）** |
| **P953 KA LoadTest 白名单** | 仅抬白名单配额；普通 key 仍 429；鉴权/billing/图片未旁路 | **PASS** |
| **P954 路由隔离** | Chat↔Image 稳定错码；Nano Banana 成功才扣费 | **PASS**（sidecar `:8790` 已生效；公网 `:8788` 待 root reload） |
| **Release gate** | P953 / P954 两轮均 `TOKFAI_RELEASE_GATE_PASS` | **PASS** |
| **PM2 / dirty logs** | API 进程 online；禁词 grep 无命中 | **PASS（进程健康）** |

**产品口径（冻结）：**

1. Chat 压测用有界并发（例如 C10），不要把「在线人数」当成同毫秒 in-flight。  
2. Image 默认客户并发 **2–3**；失败/超时 **不扣费**；completed 必须有 url 才扣费。  
3. KA 抬额只走白名单，不全局取消限流。  
4. Image 模型不得进 `/v1/chat/completions`；文本模型不得进 `/v1/images/generations`。

---

## 1. Chat 100 / 200 @ C10（公网）

**脚本 / 产物（生产机）：**

- Runner: `/tmp/tokfai-chat-load.mjs`（`--users` + `--concurrency`）  
- Results:  
  - `/tmp/chat-100-c10-real-20260726-154746.jsonl`  
  - `/tmp/chat-200-c10-real-20260726-155247.jsonl`  
- Endpoint: `https://api.tokfai.com/v1`  
- Model: `gemini-2.5-flash`  
- Shape: `users=N`, `perUser=1`, `concurrency=10`（记为 **C10**）

### 1.1 Chat 100 @ C10

| 指标 | 值 |
|------|-----|
| total | 100 |
| concurrency | 10 |
| ok / fail | **100 / 0** |
| okRate | **100%** |
| HTTP | `200 × 100` |
| errors | （无） |
| durationMs | 98 097 |
| rps | 1.02 |
| latency p50 / p95 / max | 7 080 / 25 598 / 42 494 ms |

**判定：** **PASS** — 有界 C10 下全成功，未见网关 429 / 5xx。

### 1.2 Chat 200 @ C10

| 指标 | 值 |
|------|-----|
| total | 200 |
| concurrency | 10 |
| ok / fail | **199 / 1** |
| okRate | **99.5%** |
| HTTP | `200 × 199` |
| errors | `AbortError × 1`（客户端超时/中止，非 `too_many_*`） |
| durationMs | 455 284 |
| rps | 0.44 |
| latency p50 / p95 / max | 7 133 / 84 406 / 180 002 ms |

**判定：** **PASS（可接受）** — 近全量成功；单次 Abort 属客户端超时尾部，不是应用层限流崩溃。  
**对照（P951）：** 无 KA 白名单时，瞬时并发 50/100 会撞 **key concurrency=5** → 大量 `too_many_concurrent_requests`；C10 有界池避开该陷阱。

### 1.3 旁证（同日）

| 档位 | okRate | 备注 |
|------|--------|------|
| Chat 50 @ C5 | 100%（50/50） | 基线冒烟 |

---

## 2. Image C2 / C3（公网 Nano Banana）

**脚本：** `scripts/p952-image-concurrency-load.mjs`  
**模型：** `nano-banana`  
**形状：** `COUNT=20` + `CONCURRENCY=2|3`（记为 **Image C2 / C3**）  
**产物（生产机 `/tmp`）：**

- C3: `/tmp/p952-image-c3-20260726-103335.jsonl`（与最新一致）  
- C2: `/tmp/p952-image-c2-20260726-112145.jsonl`（最新成功档）

### 2.1 Image C3（concurrency=3）

| 指标 | 值 |
|------|-----|
| total_done | 20 |
| completed | 17 |
| failed | 1 |
| timeout | 2 |
| billable_success | **17** |
| bad_billing_failures | **0** |
| missing_url_success | **0** |
| error_codes | `image_task_timeout=2`, `upstream_image_error=1` |
| latency p50 / p95 / max | 17 381 / 123 685 / 126 377 ms |

**判定：** **PASS** — 低并发可完成多数任务；**扣费完整性 OK**（失败/超时未误扣）。

### 2.2 Image C2（concurrency=2，最新成功档）

| 指标 | 值 |
|------|-----|
| total_done | 20 |
| completed | 18 |
| failed | 0 |
| timeout | 2 |
| billable_success | **18** |
| bad_billing_failures | **0** |
| missing_url_success | **0** |
| error_codes | `image_task_timeout=2` |
| latency p50 / p95 / max | 14 614 / 123 868 / 125 428 ms |

**判定：** **PASS** — C2 略优于 C3（completed 18 vs 17）；仍有偶发 poll timeout（上游慢任务）。

### 2.3 对比与政策（P952）

| 档位 | 观察 | 产品建议 |
|------|------|----------|
| **C2 / C3** | 多数 completed + url + billable；`bad_billing_failures=0` | **默认生产并发 2–3** |
| **C10（历史事实）** | `count=20 concurrency=10` 公网：上游 `upstream_image_error` 增多 | **禁止默认 10**；仅诊断用 |
| 扣费 | completed+url → billable；failed/timeout → not_billable | **保持**；P952 未改 billing |

政策文档：[`docs/p952-image-concurrency-policy.md`](./p952-image-concurrency-policy.md)  
Smoke：`TOKFAI_P952_IMAGE_CONCURRENCY_POLICY_PASS`

> 注：同日较早一档 C2（`…104046`）出现 `insufficient_credits=16`，属余额耗尽而非并发策略失败；归档以余额充足后的 C2/C3 成功档为准。

---

## 3. P953 — KA LoadTest whitelist

**文档：** [`docs/p953-ka-loadtest-whitelist.md`](./p953-ka-loadtest-whitelist.md)  
**Smoke：** `TOKFAI_P953_KA_LOADTEST_WHITELIST_PASS`  
**Gate：** `/tmp/tokfai-release-gate-p953.out` → `TOKFAI_RELEASE_GATE_PASS`

| 验收项 | 结果 |
|--------|------|
| 普通 key 仍受 RPM / 并发闸 | PASS（仍会 `too_many_requests` / `too_many_concurrent_requests`） |
| KA key 抬额后不被普通 concurrency=5 全量拦住 | PASS（smoke：500 users / perUser=1 仿真） |
| 不跳过鉴权 / 成功扣费 | PASS（策略硬限制 + smoke） |
| 不改 Image / Nano Banana 主链路 | PASS（图片路由不挂 KA chat 闸） |
| 日志 `rate_limit_policy=normal\|ka_load_test` + `key_hash` | PASS |
| typecheck / build / release gate | PASS |

**抬额表（仅白名单）：** key 并发 600 · key RPM 1200 · tenant RPM 3000 · IP RPM 6000；全局上游并发 50 **不**放开。

---

## 4. P954 — Image provider routing isolation

**Smoke：** `TOKFAI_P954_IMAGE_PROVIDER_ROUTING_ISOLATION_PASS`  
**Gate：** `/tmp/tokfai-p954-release-gate2.out` → `TOKFAI_RELEASE_GATE_PASS`

| 场景 | 期望 | 实测 |
|------|------|------|
| `POST /v1/chat/completions` + `nano-banana` | `image_model_not_for_chat`，not_billable | PASS（mock + sidecar `:8790`） |
| `POST /v1/images/generations` + `gemini-2.5-flash` | `model_not_image_capable`，not_billable | PASS |
| `POST /v1/images/generations` + `nano-banana` | 返回 `task_id` | PASS |
| poll completed | 有 `url`；成功才扣 credits | PASS（例：`billable` / 1400） |
| GPT Image | coming soon / unavailable | PASS（硬拒绝 `image_model_not_available`） |
| 前端分组 | Chat / Vision / Image Generation | PASS |

**部署备注（归档时点）：**

| 端口 | 进程 | P954 新错码 |
|------|------|-------------|
| `:8790` sidecar | `node dist/index.js`（deploy） | **已生效**（`image_model_not_for_chat`） |
| `:8788` 公网反代 | root 持有旧进程 | **待 reload**（当时仍可能返回旧 `model_not_available`） |

健康检查：`8788:200` · `8790:200`。

---

## 5. PM2 / dirty runtime logs

| 项 | 结果 |
|----|------|
| API 监听 | `127.0.0.1:8788` 与 `127.0.0.1:8790` **LISTEN**；`/v1/health` → **200** |
| deploy 用户 `pm2 status` | 列表为空（历史：进程由 root / nohup 托管，**不以 pm2 list  alone 判定可用**） |
| Gate 内 pm2 error-log grep | **无** `api_error_500` / `charged timeout` / `message=undefined` / `code=undefined` / `empty body` / `Cannot set headers` |
| Sidecar log（`/tmp/tokfai_sidecar_8790.log` 末 ~800 行） | 同上禁词 **无命中** |

**判定：** 服务可用且无 dirty runtime 禁词；运维上建议后续将 `:8788` 统一回 PM2/`tokfai-api` 命名并完成 P954 root reload。

---

## 6. Release gate 汇总

| 轮次 | 产物 | 结果 |
|------|------|------|
| P953 | `/tmp/tokfai-release-gate-p953.out` | `TOKFAI_RELEASE_GATE_PASS` |
| P954 | `/tmp/tokfai-p954-release-gate2.out` | `TOKFAI_RELEASE_GATE_PASS` |

硬 PASS markers（两轮均齐）：

- `TOKFAI_P932_CHERRY_STUDIO_REAL_BODY_PASS`
- `TOKFAI_P933_CHERRY_STUDIO_COMPAT_MATRIX_PASS`
- `TOKFAI_P941_API_ISOLATION_CORE_PASS`
- `TOKFAI_P942_VISION_ANALYZE_PASS`
- `TOKFAI_P946_GEMINI_25_FLASH_NONSTREAM_PASS`
- `TOKFAI_P948_NANO_BANANA_IMAGE_CAPABILITY_PASS`
- `TOKFAI_PUBLIC_BETA_READY_ALL_PASS`

附加：`TOKFAI_P952_IMAGE_CONCURRENCY_POLICY_PASS` · `TOKFAI_P953_KA_LOADTEST_WHITELIST_PASS` · `TOKFAI_P954_IMAGE_PROVIDER_ROUTING_ISOLATION_PASS`

---

## 7. 残留 / 跟进（非本任务改码）

1. **公网 `:8788` root 进程 reload** — 使 P954 新错码对 `api.tokfai.com` 生效。  
2. **PM2 托管对齐** — 避免「pm2 list 空但端口 online」的运维歧义。  
3. **Image 偶发 `image_task_timeout`** — 属上游慢任务；继续坚持 C2/C3，不默认抬到 C10。  
4. **Chat 200 @ C10 单次 Abort** — 可按需拉长 client timeout 或观察 p99；非限流故障。

---

## 8. 参考索引

| 文档 / 脚本 | 用途 |
|-------------|------|
| [`docs/p951-ka-load-policy.md`](./p951-ka-load-policy.md) | 429 诊断与「在线 ≠ 同毫秒」 |
| [`docs/p952-image-concurrency-policy.md`](./p952-image-concurrency-policy.md) | Image 2–3 策略与 summary 规范 |
| [`docs/p953-ka-loadtest-whitelist.md`](./p953-ka-loadtest-whitelist.md) | KA 压测白名单 |
| `scripts/p952-image-concurrency-load.mjs` | Image C2/C3 压测 |
| `scripts/p952-image-concurrency-policy-smoke.mjs` | P952 静态门禁 |
| `scripts/p953-ka-loadtest-whitelist-smoke.mjs` | P953 门禁 |
| `scripts/p954-image-provider-routing-isolation-smoke.mjs` | P954 隔离门禁 |
| `scripts/tokfai-release-gate.mjs` | 发布总闸 |

---

**P955 归档结论：** Chat C10（100/200）与 Image C2/C3 生产压测可接受；P953/P954 策略与门禁通过；无 dirty log 禁词。本文件仅为验收归档，不引入运行时变更。
