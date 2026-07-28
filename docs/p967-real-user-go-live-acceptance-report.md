# P967 真实用户出厂验收报告

> 日期：2026-07-28  
> 环境：`https://api.tokfai.com/v1` + `https://www.tokfai.com`  
> 约束：未重跑大压测；未改 Chat / Image / Billing / Provider / Rate Limit 核心逻辑；未改库结构  
> 基线 HEAD：`87cf23881f469bfe9f914289f46402ac7ff2f5cc`  
> API Key：仅用服务端 gate key 做真调；报告中只写前缀 `sk-tokfai_0d…`，**不输出明文**

---

## 执行摘要

真实客户主路径（Chat / Image / 能力隔离 / 计费语义 / 公开文档）已跑通。  
管理端钱袋子与最近图片任务展示在本仓库补齐（待部署）。  
运维侧：`deploy` 用户 `pm2` 列表为空，生产主进程在 `127.0.0.1:8788`（root node），sidecar `8790` 由 deploy 持有；API health 正常。

---

## 1. 用户端路径验收

| 检查项 | 结果 | 证据 |
|---|---|---|
| 首页说清 Tokfai 是什么 | **PASS** | `tokfai.com`：「KA AI aggregation platform」；Chat + Image + reserved video |
| 去哪里拿 API Key | **PASS** | 五步：Sign in → credits → Create API key；Dashboard 首跑卡（P963） |
| 去哪里看模型 | **PASS** | 首页链到 `/dashboard/models`；Models 页 Chat/Image 分组 + `image` tag |
| 去哪里看充值/余额 | **PASS** | Pricing / Credits；首页 Top up |
| 去哪里看文档 | **PASS** | `/docs`、Dashboard Docs、Quickstart |
| 登录页 | **PASS** | Email + Password + Google；链到注册 |
| API Key 页创建/查看/复制 | **PASS**（代码/文案） | 创建表单、一次性 secret、Copy；安全提示「不要暴露」 |
| API Key 空状态 | **PASS** | `emptyTitle` + Create first / Recharge |
| 模型能力标注 | **PASS** | `nano-banana` / `gpt-image-2` / `gpt-image-2-vip`：`supportsImageGeneration` + image group |
| 余额/积分规则/订单 | **PASS**（代码） | Credits 页余额、计费规则、充值订单空态 |

说明：本轮未用真实账号做 Dashboard 登录点击（无客户会话）；公开页 + 代码审查 + 首跑文案覆盖 3 分钟理解路径。

---

## 2. API 调用验收（生产真调）

| 步骤 | 结果 |
|---|---|
| Chat `gemini-2.5-flash` | **PASS** — HTTP **200**，内容 `P967_OK`，`credits_charged=0.570597`，有 `request_id` |
| Image `nano-banana` 提交 | **PASS** — HTTP **202**，`status=queued`，初始 `not_billable` / credits `0` |
| Image 轮询 | **PASS** — 终态 `completed`，`has_url=true`，host `file3.aitohumanize.com` |
| 隔离：`nano-banana` → Chat | **PASS** — HTTP 400，`code=image_model_not_for_chat`，未扣费 |
| 隔离：`gemini-2.5-flash` → Images | **PASS** — HTTP 400，`code=model_not_image_capable`，`billing_status=not_billable`，credits `0` |

### 图片计费验收

| 终态 | 期望 | 实际 |
|---|---|---|
| `completed` + `data.url` | billable | **`billing_status=billable`，`credits_charged=1400`** ✅ |
| `timeout_pending` | 不立即扣费 | 本轮未命中（任务完成）— 语义由既有 P957/P961 保障 |
| `failed` | not_billable | 本轮未命中 — 隔离错路由已验证 not_billable |

Chat 侧消耗：响应带 `credits_charged` 与 token usage，满足「用户侧有消耗记录」字段级验收（Usage 页需登录核对，本轮未登录）。

---

## 3. 管理端消耗验收

| 指标 | 代码侧 | 生产 UI 实点 |
|---|---|---|
| 总用户数 / API Key 数 | 已有 | 需 admin 登录（本轮未登录） |
| 余额 / 充值 / 消耗 | 已有 + P963 总余额 | 同上 |
| Chat / Image 消耗拆分 | P963 已加 | 待部署后可见 |
| 钱袋子 5 项 | P963 已加 | 待部署后可见 |
| `image_task_timeout` / `too_many_requests` | **本轮补上** | 待部署 |
| 最近图片任务 | **本轮补上** `recent_image_tasks` | 待部署 |

本轮对 admin 的「真实检查」结论：**聚合字段在仓库已齐；生产 admin 需部署后复核。**

---

## 4. 文档可跑性验收

线上 `https://www.tokfai.com/docs`（浏览器 DOM 抽检）：

| 项 | 结果 |
|---|---|
| Chat curl / `/v1/chat/completions` | **PASS** |
| Image curl / `/v1/images/generations` | **PASS** |
| poll / task_id | **PASS** |
| `gpt-image-2` + `nano-banana` | **PASS** |
| `image_model_not_for_chat` / `model_not_image_capable` | **PASS** |
| `timeout_pending` | **PASS** |
| `completed` + `data[].url` 才 billable | **PASS** |
| 错误请求 not_billable | **PASS** |

仓库文档：`public-beta-docs-registry.ts`、`docs/tokfai-customer-api-reference.zh.md` 与上线内容一致方向。

---

## 5. 最终运行检查

| 项 | 结果 |
|---|---|
| `apps/dmit-api` typecheck | **PASS** |
| `apps/web` typecheck | **PASS** |
| `apps/dmit-api` build | **PASS** |
| `apps/web` build | **PASS** |
| `pm2 status`（deploy） | **空列表**（见问题） |
| API health | **PASS** `{"ok":true,"service":"dmit"}` |
| Dirty strings（nginx `tokfai-api.error.log` 末 5000 行） | **COUNT=0** |
| Dirty strings（sidecar `/tmp/tokfai_sidecar_8790.log`） | **无匹配** |

生产监听：

- `127.0.0.1:8788` — 主 API（root `node …/dist/index.js`，nginx upstream）
- `127.0.0.1:8790` — deploy sidecar

`pm2 logs tokfai-api` 不可用（进程未在 deploy 的 pm2 下）；改用 nginx error log + sidecar log 做 dirty 扫描。

近期 access 状态码抽样（末 2000）：大量 `200`，另有 `429`/`404`/`202`/`400`/`503`（限流与探测类，非 dirty crash）。

---

## 6. 发现问题

1. **`deploy` 用户 `pm2` 为空**：主 API 由 root 直接跑在 8788，不在 `pm2 list` 中 → 运维重启/日志习惯与文档不一致。  
2. **Admin 钱袋子 / 最近图片任务**：本仓库已有，**生产尚未确认已部署**。  
3. Chat 隔离错误响应有时缺 `tokfai.billing_status` 字段（本轮 `image_model_not_for_chat`）；**未扣费**，code 正确。  
4. 本轮未登录客户 Dashboard / Admin 做端到端点击（无会话凭据）。  
5. nginx 历史曾有 upstream timeout（Jul 27）warn/error — 非本轮 dirty 集合命中，记作观察项。

---

## 7. 已修复问题（本轮轻量）

1. Admin summary 增加：`image_task_timeout`、`too_many_requests` 计数  
2. Admin overview 增加：最近图片任务表（status / billing / error_code / request_id）  
3. 配套 i18n 文案  

（P963–P966 已完成的 UX/文档/钱袋子基础仍有效，本轮在其上补齐 admin 异常项展示。）

---

## 8. 未修复但不阻塞上线的问题

1. 将生产主进程重新纳入 `pm2`（或 systemd）统一托管与日志  
2. 部署 admin 聚合增强到生产后做一次登录复核  
3. Chat 隔离错误信封统一带上 `billing_status: not_billable`（展示一致性，非计费 bug）  
4. Usage 高级筛选 UI 仍未接线（P963 遗留）  
5. Forgot-password 入口缺失  

---

## 9. 最终结论

客户主链路（拿 Key → Chat/Image 真调 → 成功扣费 / 错路由不扣费 → 文档可复制）已通过生产验证。  
管理端展示与进程托管仍有运维收尾项，**不阻塞客户出厂调用**，但需跟进部署与 pm2/systemd。

```
TOKFAI_P967_REAL_USER_GO_LIVE_ACCEPTANCE_PARTIAL_PASS
```

### 变更文件（本轮）

- `apps/dmit-api/src/routes/adminDashboardSummary.ts`
- `apps/web/components/admin/admin-overview-panel.tsx`
- `apps/web/lib/admin/client.ts`
- `apps/web/lib/i18n/messages.ts`
- `docs/p967-real-user-go-live-acceptance-report.md`
