# P958 — Adversarial high-load acceptance（杠精测试员模式）

> **性质：** 高强度混合业务验收归档 — 证明系统在高压下不雪崩，**不**要求每请求 100% 成功。  
> **硬限制：** 本报告对应 runner 不改 Chat 主链路、不改 P954 隔离语义、不抬 Image 默认并发。  
> **跑测窗口：** 2026-07-27T16:35:11Z → 16:43:21Z（公网）  
> **基线 commit：** `3f13efa13de6092a965f11b38d27ff11c980d331`  
> **产物：** `tmp/p958-adversarial-load-result.json` · `/tmp/tokfai-p958-adversarial.out`  
> **Runner：** `scripts/p958-adversarial-load-acceptance.mjs`  
> **Marker：** `TOKFAI_P958_ADVERSARIAL_LOAD_PASS`

---

## 0. 总览结论

| 主题 | 结论 | 状态 |
|------|------|------|
| Baseline health | `/v1/health` + `/v1/models` = 200；Chat 冒烟 OK | **PASS** |
| Chat stress 50@C10 | ok=6，**429=44**，**500=0**（限流保护，非崩溃） | **PASS** |
| Image async 12@C2 | completed=12；bad_billing=0；missing_url=0 | **PASS** |
| Mixed stress | Chat 全 429；Image 6/6 completed；bad_billing=0 | **PASS** |
| Negative route isolation | P954 稳定错码 + `not_billable` | **PASS** |
| Spike C20 / 15s | **674×429**，**500=0** | **PASS** |
| Recovery | health=200；Image submit=202；Chat 受 RPM/日额度限流 | **PASS** |
| PM2 / memory / dirty logs | 主进程 PID 未变；禁词 grep 干净 | **PASS** |

**可接受：** `429`、`timeout_pending`、`image_task_timeout`、软 Abort。  
**不可接受（本轮均未出现）：** 500 雪崩、PM2 异常重启、`bad_billing`、`missing_url_success`、`Cannot set headers`、`empty body` / `api_error_500` / `charged timeout` / `message|code=undefined`。

**产品口径（冻结）：**

1. 高压目标是「不崩 + 不坏扣费 + 隔离仍稳」，不是「永远 200」。  
2. Chat 撞并发/RPM 返回 429 是保护，不是故障。  
3. Image 异步在 C2 下可完成；失败/超时不得误扣；completed 必须有 url。  
4. 尖峰过后服务必须仍能 health + 接 Image；Chat 可短暂继续 429 直至窗口/额度恢复。

---

## 1. 环境与形状

| 项 | 值 |
|----|-----|
| Base | `https://api.tokfai.com` |
| Chat model | `gemini-2.5-flash` |
| Image model | `nano-banana` |
| Chat stress | `N=50` @ `C=10` |
| Image async | `N=12` @ `C=2` |
| Mixed | Chat 20 + Image 6（并行） |
| Spike | concurrency=`20`，duration=`15s` |
| Key | gate key（masked `sk-tokfai_0d…c63a`） |

生产进程（压测前后 PID 不变，见 §9）：

| 角色 | PID | 命令 |
|------|-----|------|
| Sidecar `:8790` | `445464` | `node --env-file=.env dist/index.js` |
| Main `:8788` | `454639` | `node /opt/tokfai-api-saas/apps/dmit-api/dist/index.js` |

---

## 2. Baseline health

| 检查 | 结果 |
|------|------|
| `GET /v1/health` | **200** |
| `GET /v1/models` | **200** |
| Chat 冒烟 | **200** / ok；latency ≈ 24.7s；`request_id=3-dab8aedf-…` |

**判定：** **PASS**

---

## 3. Chat stress（50 @ C10）

| 指标 | 值 |
|------|-----|
| total / concurrency | 50 / 10 |
| ok | **6**（12.0%） |
| HTTP | `200 × 6`，`429 × 44` |
| **n500** | **0** |
| latency min / p50 / p95 / max | 404 / 524 / 17 269 / 86 593 ms |
| 429 样例 code | `too_many_concurrent_requests` |

**判定：** **PASS** — 有界池外的并发被限流挡住；**无 500 雪崩**。低 ok_rate 符合「杠精」口径（证明保护生效，而非证明吞吐无限）。

---

## 4. Image async stress（12 @ C2）

| 指标 | 值 |
|------|-----|
| total_done | 12 |
| completed | **12** |
| failed / timeout / timeout_pending | **0 / 0 / 0** |
| billable_success | **12** |
| **bad_billing_failures** | **0** |
| **missing_url_success** | **0** |
| submit HTTP | `202 × 12` |
| latency min / p50 / p95 / max | 9 720 / 18 638 / 80 333 / 80 333 ms |

**判定：** **PASS** — 异步图片未拖垮服务；扣费完整性 OK。

---

## 5. Mixed stress（Chat + Image 并行）

| 通道 | 结果 |
|------|------|
| Chat | total=20，ok=0，**429×20**，无 500 |
| Image | completed=**6/6**，timeout_pending=0，**bad_billing=0**，missing_url=0 |
| Image submit | `202 × 6` |
| duration | ≈ 142 s |

**判定：** **PASS** — Chat 限流与 Image 异步隔离：图片仍可完成且无坏扣费；主路径未因混合负载崩溃。

---

## 6. Negative route isolation（P954）

| Case | HTTP | code | billing |
|------|------|------|---------|
| Image 模型 → `/v1/chat/completions` | **400** | `image_model_not_for_chat` | — |
| 文本模型 → `/v1/images/generations` | **400** | `model_not_image_capable` | **`not_billable`** |

**判定：** **PASS** — 高压后负向路由仍稳定；无 500、无旁路进 billing。

---

## 7. Spike test（C20 / 15s）

| 指标 | 值 |
|------|-----|
| concurrency / duration | 20 / 15s |
| total requests | **674** |
| ok | 0 |
| **n429** | **674** |
| **n500** | **0** |
| HTTP | `429 × 674` |

**判定：** **PASS** — 尖峰被限流吸收；**零 5xx**。

---

## 8. Recovery test

### 8.1 尖峰后立即探针（suite 内）

| 检查 | 结果 |
|------|------|
| health | **200** |
| Chat | **429** `too_many_requests`（RPM 窗口未冷） |
| Image submit | **202**（`task_id` 正常签发） |

Suite 判定：**PASS**（服务存活 + Image 可提交 + 无 500；Chat 429 可接受）。

### 8.2 冷却后再探针（+65s，手工）

| 检查 | 结果 |
|------|------|
| health | **200** |
| Chat | **429** `daily_credit_limit_exceeded` |

说明：尖峰 + 压测消耗了 gate key 当日额度；冷却后不再是 RPM，而是**日额度保护**。这不是进程崩溃，也不是 500 雪崩。Image 在 8.1 已证明高压后仍可接单。

**判定：** **PASS（恢复口径）** — 健康面与 Image 入口恢复/保持可用；Chat 受控拒绝。

---

## 9. PM2 / memory / dirty logs

### 9.1 进程稳定性

| 时刻 | `:8790` PID | `:8788` PID |
|------|-------------|-------------|
| PRE（`/tmp/p958-pre-procs.txt`） | **445464** | **454639** |
| POST（压测结束后复查） | **445464** | **454639** |

- 两端口 health 均为 **200**。  
- deploy 用户 `pm2 jlist` 为空表（主 API 由 root 进程托管，非 deploy PM2 app）——以 **PID 不变 + health 200** 作为「未异常重启」证据。  
- **无**压测窗口内 PID 轮换 / 异常重启迹象。

### 9.2 Memory（POST 抽样）

| PID | 角色 | RSS |
|-----|------|------|
| 445464 | sidecar `:8790` | ≈ **64 MB**（`rss_kb≈65472`） |
| 454639 | main `:8788` | ≈ **116 MB**（`rss_kb≈118456`） |

未见失控膨胀到 OOM 级别；主进程仍在服务。

### 9.3 Dirty logs

对以下文件各 `tail -n 800` 后 grep 禁词  
（`empty body` / `api_error_500` / `charged timeout` / `message=undefined` / `code=undefined` / `Cannot set headers after they are sent`）：

| 日志 | 结果 |
|------|------|
| `/tmp/tokfai_sidecar_8790.log` | **clean** |
| `/home/deploy/.pm2/logs/dmit-api-error.log` | **clean** |
| `/home/deploy/.pm2/logs/dmit-api-out.log` | **clean** |
| Suite `dirty_step_payload`（步骤 JSON） | **clean** |

**判定：** **PASS**

---

## 10. 验收矩阵（禁区 vs 本轮）

| 禁区 | 本轮 |
|------|------|
| 500 雪崩 | **0**（chat / spike / mixed） |
| PM2 / 进程异常重启 | **PID 未变** |
| `bad_billing_failures` | **0** |
| `missing_url_success` | **0** |
| `Cannot set headers` / dirty undefined | **未命中** |
| 负向路由回退进 billing | **`not_billable`** |

| 可接受现象 | 本轮 |
|------------|------|
| Chat / spike `429` | 大量出现（符合预期） |
| `timeout_pending` / `image_task_timeout` | 本轮 Image 未触发（全 completed） |
| 恢复期 Chat 仍 429 | RPM → 日额度，均可接受 |

---

## 11. 最终 verdict

**`TOKFAI_P958_ADVERSARIAL_LOAD_PASS`**

在高强度混合业务下，Tokfai 公网 API：

1. Chat 高并发 **不崩**（限流 429，零 500）；  
2. Image 异步 **不拖垮**主服务，且 **无坏扣费**；  
3. 负向路由隔离 **仍稳**；  
4. Spike 后 health / Image 入口可恢复接单；  
5. 生产进程 **无异常重启**，dirty logs **干净**。

未证明「无限吞吐 / 永远 200」——也不需要。杠精目标已达成。
