# P963–P966 产品层验收报告

> 日期：2026-07-28  
> 范围：用户体验 / 管理仪表盘 / 文档一致性 / 体验区（Playground）  
> 约束：**未**重跑大压测；**未**修改 Chat / Image / Billing / Provider 路由 / Rate Limit 核心策略  
> 基线 HEAD：`ce8558409ab981a9fa6230977332e090801738e2`（本报告对应工作区未提交变更）

---

## 验收门槛

| 项 | 结果 |
|---|---|
| `apps/dmit-api` `npm run typecheck` | **PASS** |
| `apps/web` `npm run typecheck` | **PASS** |
| `apps/dmit-api` `npm run build` | **PASS** |
| `apps/web` `npm run build` | **PASS** |
| 大压测 | **未重跑**（按任务要求） |
| 核心生产链路改动 | **无**（仅 admin 聚合展示 + 前端文案/文档/选择器） |

---

## 1. 用户体验检查结果（P963）

| 路径 | 结论 |
|---|---|
| 登录 `/login` | 文案清晰；邮箱 + Google；错误提示可读 |
| 注册 `/signup` | 创建账户路径清楚；确认邮件态友好 |
| 退出 | 侧边栏 Sign out 可用 |
| API Keys `/dashboard/api-keys` | 创建/复制/空状态完整；3 分钟 onboarding 卡已有 |
| 模型列表 `/dashboard/models` | Chat / Image 分组与能力说明清楚 |
| 充值 `/pricing` + Credits `/dashboard/credits` | 余额、账本、充值入口明确 |
| 消耗 `/dashboard/usage` | 最近用量可读；空状态有 Playground CTA |

**3 分钟理解度（修补后）：**

| 目标 | 结论 |
|---|---|
| a. 如何获取 API Key | **Yes** — Home 首跑卡 + API Keys 页 |
| b. 如何调用 Chat | **Yes** — Home CTA → Chat Playground |
| c. 如何调用 Image | **Yes** — Home CTA 改为「生成图片」 |
| d. 如何查看余额与消耗 | **Yes** — 账户状态 + Credits / Usage |

---

## 2. 管理仪表盘检查结果（P964）

`GET /admin/dashboard-summary` + `/admin/overview`：

| 指标 | 状态 |
|---|---|
| 总用户数 | 已有 |
| 活跃 API Key | 已有 |
| 总充值 | 已有；总余额（`sum(profiles.credits_balance)`）**本次补上** |
| 今日消耗 / 累计消耗 | 已有 |
| Chat 消耗 / Image 消耗 | **本次补上**（`usage_logs` 按 endpoint/model 聚合） |
| 钱袋子风险 | **本次补上并置顶展示** |

**钱袋子风险卡片（优先展示）：**

- `bad_billing_failures`
- `provider_success_unpaid`
- `charged_missing_url`
- `missing_url_success`
- `stale_timeout_pending`

聚合来源：已有表 `image_generation_tasks.orphan_cost_flags` / `billing_status` / `reconcile_result`，**无新迁移**。

---

## 3. 文档一致性检查结果（P965）

对照真实路由：

| 接口 | 文档 |
|---|---|
| `POST /v1/chat/completions` | 一致 |
| `POST /v1/images/generations` | 一致 |
| `GET /v1/images/generations/{id}` + `GET /v1/api/result` | 一致（本次补强 alias 说明） |
| 模型列表 | 一致（`GET /v1/models` 不含图片专用模型） |
| 错误码 | **本次补齐**隔离码与 timeout_pending |
| 计费说明 | **本次写清** completed+url 才 billable |

文档源：

- `apps/web/lib/docs/public-beta-docs-registry.ts`（在线 docs 真源）
- `docs/tokfai-customer-api-reference.zh.md`

已明确写入：

1. 图片模型不能走 Chat  
2. 文本模型不能走 Images  
3. 错路由 `not_billable`  
4. 任务态：`queued` / `generating` / `saving_result` / `completed` / `failed` / `timeout_pending`  
5. **`completed` + `data.url` 才 billable**  
6. `gpt-image-2` / `gpt-image-2-vip` 列入图片模型表  

---

## 4. 体验区检查结果（P966）

| 项 | 结论 |
|---|---|
| Chat 真实调用（含 `gemini-2.5-flash`） | 可用（用户 API Key → DMIT） |
| Image 真实调用（`nano-banana` / `gpt-image-2` / `gpt-image-2-vip`） | 可用 |
| Chat 下拉不含图片模型 | **是**（静态 curated list） |
| Image 下拉不含纯文本模型 | **是** |
| 能力提示文案 | **本次补上** Chat/Image only hints |
| 错误可读性 | **本次映射**隔离码 / timeout / 429 |

错误映射覆盖：

- `image_model_not_for_chat`
- `model_not_image_capable`
- `image_task_timeout` / `timeout_pending`
- `too_many_requests`（429）

---

## 5. 发现的问题列表

1. Dashboard Home 未展示 3 分钟首跑 checklist（仅 API Keys 页有）  
2. Home Image CTA 文案偏「识别」而非「生成」  
3. Docs 锚点混用 `#quick-start` / `#quickstart`（registry slug 为 `quickstart`）  
4. Admin overview 缺总余额、Chat/Image 消耗拆分、钱袋子风险  
5. 客户文档缺隔离错误码、任务状态表、completed+url 计费硬规则  
6. `gpt-image-2` / `gpt-image-2-vip` 在文档中偏弱  
7. Playground 对隔离/超时错误码走 generic unknown  
8. Usage 页 i18n 有高级筛选文案但 UI 未实现（范围外）  
9. 无 forgot-password UI（范围外）  
10. `docs/tokfai-integration-docs.zh.md` 可能落后于 registry（范围外，建议后续同步）  

---

## 6. 已修复的问题列表

1. Home 接入 `DashboardFirstRunOnboardingCard`（3 分钟路径）  
2. Home / 文案：Image CTA →「生成图片 / Generate images」；副标题对齐 Key→Chat/Image→Usage  
3. 统一 docs 锚点为 `#quickstart`  
4. Admin summary + overview：总余额、Chat/Image 消耗、钱袋子风险置顶  
5. Docs registry + ZH API 参考：隔离、状态表、billable 规则、gpt-image 模型、错误码  
6. Playground 错误分类 + 中英用户可读文案  
7. Chat/Image 选择器能力提示  

**变更文件（本任务）：**

- `apps/dmit-api/src/routes/adminDashboardSummary.ts`
- `apps/web/components/admin/admin-overview-panel.tsx`
- `apps/web/components/admin/admin-stat-card.tsx`
- `apps/web/lib/admin/client.ts`
- `apps/web/components/dashboard-overview-content.tsx`
- `apps/web/components/dashboard-first-run-onboarding.tsx`
- `apps/web/app/dashboard/api-keys/api-keys-client.tsx`
- `apps/web/components/customer-integration-guide.tsx`
- `apps/web/lib/customer-starter-templates.ts`
- `apps/web/lib/docs/public-beta-docs-registry.ts`
- `apps/web/lib/dashboard-safe/playground-errors.ts`
- `apps/web/app/dashboard/playground/playground-client.tsx`
- `apps/web/app/dashboard/playground/playground-labels.ts`
- `apps/web/app/dashboard/image-playground/image-playground-toolbench-client.tsx`
- `apps/web/app/dashboard/image-playground/image-playground-labels.ts`
- `apps/web/lib/i18n/messages.ts`
- `apps/web/lib/dashboard-safe/labels.generated.ts`
- `docs/tokfai-customer-api-reference.zh.md`
- `docs/p963-p966-product-acceptance-report.md`（本报告）

---

## 7. 未修复但建议后续处理的问题

1. Usage 页日期/模型/状态筛选 UI（i18n 已有，未接线）  
2. Forgot-password / 重置密码入口  
3. Sign-out 后立即离开 dashboard 的导航体验  
4. Models 卡片增加「在 Playground 试用」直达 CTA  
5. `tokfai-integration-docs.zh.md` 与 registry 自动同步或标为 generated  
6. Admin 钱袋子风险：可点击下钻到异常 `image_generation_tasks` 列表  
7. `missing_url_success` 当前主要依赖 `reconcile_result='missing_url'`；历史未打标行可能低估（可后续用 result_data 扫描增强，仍无需新表）  

---

## 8. 最终结论

产品层目标已补齐：用户端 3 分钟路径可读、管理端钱袋子风险可见、文档与真实接口一致、Playground 能力隔离与错误文案可读。  
未触碰已验收的 Chat / Image / Billing / Provider / Rate Limit 核心逻辑；typecheck / build 均 PASS。

```
TOKFAI_P963_P966_PRODUCT_ACCEPTANCE_PASS
```
