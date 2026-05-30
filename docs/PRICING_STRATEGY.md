# Tokfai P7 市场定价与报价体系 V1

> **文档性质：** 商业决策稿，供产品、运营与商务对齐使用。  
> **适用范围：** MVP P6 封板之后、P7 定价体系落地之前。  
> **版本：** V1 · 2026-05-30  
> **约束：** 本文档不涉及代码、数据库或页面上线；实施时另开工程任务。

---

## 0. 决策摘要

Tokfai 的定位是 **面向开发者与 AI 应用团队的 GRSAI 上游零售层**：用 OpenAI 兼容 API、Dashboard 与 Stripe 充值，把上游能力包装成「可自助购买、可审计、可报价」的标准化产品。

P7 定价体系的核心原则：

1. **消费单位与 GRSAI 对齐** — 用户看到的 credits 扣费，应与上游积分消耗同量级、同口径，避免「充值 1 万、扣费 0.0007」的认知断裂。
2. **套餐卖的是「充值效率 + 服务溢价」** — 零售价高于上游批发价，靠体验、稳定性、文档与合规支付覆盖成本并留出毛利。
3. **模型价跟上游走、套餐价跟市场走** — 模型扣费随 GRSAI 调价而调整；充值档位由 Tokfai 自主定义，通过 Admin + Stripe Price 配置，不在 Tokfai 内直接改 Stripe 金额。
4. **先标准化、后差异化** — P7 先把三档套餐 + 统一扣费 + 毛利测算跑通；团队账户、代理商、订阅制留到 P8+。

---

## 1. 当前上游 GRSAI 充值套餐参考

> 以下整理自 GRSAI 公开模型价目与第三方资料，**以 GRSAI 控制台实时数据为准**，Tokfai 商务应每季度复核一次。

### 1.1 上游计费基础

| 项目 | 参考值 | 说明 |
|------|--------|------|
| 基础兑换率 | **¥1 = 10,000 积分** | GRSAI 积分制基准 |
| 新用户赠送 | **5,000 积分** | 约 ¥0.5 等值试用额度 |
| 失败请求 | **不扣费** | 与 Tokfai「成功扣费、失败不扣」一致 |
| 价目呈现 | 同一模型给出 **¥区间** | 区间反映不同充值档位的有效单价，档位越高、有效成本越低 |

**有效单价示意（以 nano-banana 1,400 积分/次为例）：**

| 充值档位（示意） | 单次参考成本 | 等效 ¥/千积分 |
|------------------|--------------|---------------|
| 基础档（区间上限） | ¥0.14 / 次 | ¥0.10 |
| 优惠档（区间下限） | ¥0.07 / 次 | ¥0.05 |

> 结论：上游真实 COGS 不是固定 ¥0.10/千积分，而是 **¥0.05 ~ ¥0.10/千积分** 的带宽，取决于 Tokfai 在上游的实际充值规模与议价能力。

### 1.2 上游模型消耗参考（与 Tokfai 目录对齐）

**Chat（按百万 tokens 计，GRSAI 参考区间）：**

| 模型 | Input（¥/M） | Output（¥/M） |
|------|--------------|---------------|
| gemini-2.5-flash | 0.3 ~ 0.6 | 2 ~ 4 |
| gemini-3-flash | 0.4 ~ 0.8 | 3 ~ 6 |
| gemini-3.1-pro / gemini-3-pro | 1.5 ~ 3 | 7 ~ 14 |
| gpt-5.4 | 0.7 ~ 1.4 | 6 ~ 12 |
| gpt-5.5 | 2.2 ~ 4.4 | 13.5 ~ 27 |

**Image（按次计，GRSAI 积分/次 = Tokfai 建议扣费 credits/次）：**

| 模型 | 积分/次 | 参考人民币/次 |
|------|---------|---------------|
| nano-banana-fast | 440 | ¥0.022 ~ ¥0.044 |
| gpt-image-2 | 600 | ¥0.03 ~ ¥0.06 |
| nano-banana | 1,400 | ¥0.07 ~ ¥0.14 |
| nano-banana-2 | 1,200 | ¥0.06 ~ ¥0.12 |
| nano-banana-pro | 1,800 | ¥0.09 ~ ¥0.18 |
| nano-banana-pro-vip | 10,000 | ¥0.5 ~ ¥1 |
| nano-banana-pro-4k-vip | 16,000 | ¥0.8 ~ ¥1.6 |

### 1.3 对 Tokfai 的启示

- Tokfai 不应长期以「USD 微单位」对用户扣费，而应以 **与 GRSAI 同量级的整数 credits** 作为对外口径。
- 上游充值应 **批量、少次、大档位**，把有效 COGS 压到区间下限附近。
- 模型价变动时，Tokfai 只需调整 `model_pricing` / 目录展示，**不必改 Stripe 套餐**。

---

## 2. Tokfai credits 与人民币关系建议

### 2.1 定义

| 概念 | 建议定义 |
|------|----------|
| **1 Tokfai credit** | = **1 GRSAI 积分**（消费口径 1:1 对齐） |
| **零售锚点** | Starter：**¥29 = 10,000 credits**（已上线，P6 基准） |
| **零售单价（Starter）** | ¥29 ÷ 10,000 = **¥0.0029 / credit** |
| **上游 COGS（基准）** | ¥1 ÷ 10,000 = **¥0.0001 / credit**（无优惠档） |
| **上游 COGS（目标）** | **¥0.00005 ~ ¥0.00008 / credit**（批量充值后） |

### 2.2 对用户的话术

- 对用户：**「credits 是 Tokfai 统一计费单位，Successful calls debit credits，失败不扣。」**
- 对内部：**「credits 是预付费额度；Retail ¥/credit 与 Upstream ¥/credit 的差，是充值毛利；模型扣费需覆盖上游消耗。」**

### 2.3 P7 必须完成的对齐（决策项，非本文实施）

当前 P6 存在 **充值 credits（万级）与部分 Chat 扣费（小数级）量级不一致** 的风险。P7 定价落地前，应统一为：

> **用户充值所得 credits = 模型扣费所用 credits = 对外报价 credits**

对齐后，Starter ¥29 / 10,000 credits 约等于：

- **~7 次** nano-banana 标准生图（1,400 credits/次）
- **~16 次** nano-banana-fast（440 credits/次）
- Chat 用量取决于模型与 tokens，以 gemini-3.1-pro 量级估算，约 **数十万 tokens 级** 对话量（非百万级无限量）

---

## 3. Starter / Pro / Business 三档套餐建议

### 3.1 定位

| 档位 | 目标用户 | 产品意图 |
|------|----------|----------|
| **Starter** | 个人开发者、试用、Demo | 低门槛验证 API；可完成「注册 → 充值 → 调通 → 看 Usage」闭环 |
| **Pro** | 独立开发者、小产品、Side project | 主力档位；单价优于 Starter，鼓励从小产品走向稳定调用 |
| **Business** | 小团队、工作室、轻量 SaaS | 更高充值效率；为后续团队功能（共享余额、多 Key）预留价格锚点 |

### 3.2 P7 建议套餐（在 P6 seed 基础上微调）

| plan_id | 售价 | 到账 credits | bonus | 等效 ¥/千 credits | 较 Starter 优惠 | 建议状态 |
|---------|------|--------------|-------|-------------------|-------------------|----------|
| **starter** | ¥29 | 10,000 | 0 | ¥2.90 | — | **已上线，维持** |
| **pro** | ¥99 | 50,000 | +5,000（合计 55,000） | ¥1.80 | ~38% | P7 启用 |
| **business** | ¥299 | 200,000 | +30,000（合计 230,000） | ¥1.30 | ~55% | P7 启用 |

**设计逻辑：**

- **Starter** 不追求毛利最大化，追求 **转化与首单**；¥29 心理价位低，适合 Stripe 首次支付验证。
- **Pro** 是 **默认推荐档**（Pricing 页高亮）；bonus 5,000 制造「升档划算」感，但不破坏整数 credits 展示。
- **Business** 面向 **月消耗 ¥200+** 用户；bonus 30,000 体现规模折扣，仍为固定套餐而非议价合同。

### 3.3 与 P6 差异说明

| 项 | P6 现状 | P7 建议 |
|----|---------|---------|
| Pro credits | 50,000（无 bonus） | 55,000（含 bonus 5,000） |
| Business credits | 200,000（无 bonus） | 230,000（含 bonus 30,000） |
| enabled | Pro / Business 为 false | P7 验收后由 Admin 填 Stripe Price 并启用 |

> **重要：** 金额变更不在 Tokfai 代码内改数字，而是 **Admin 更新 `recharge_plans` + Stripe 新建 Price + 回填 `stripe_price_id`**（P6 已约定）。

---

## 4. Chat 模型扣费策略

### 4.1 计费原则

| 原则 | 说明 |
|------|------|
| 计费维度 | **Input tokens + Output tokens**，分开计价 |
| 计费单位 | credits / 1,000 tokens（与上游 token 口径一致） |
| 扣费时机 | **仅成功请求**（`status = succeeded`） |
| 失败/拒答 | 不扣 credits（与上游「失败不扣」一致） |
| 最小扣费 | 成功请求 **≥ 1 credit**（避免零成本刷量） |
| 余额预检 | P7 前维持「余额 > 0」；P7 后可升级为「预估不足则 402」 |

### 4.2 默认定价策略（P7 V1）

**公式：**

```
credits = ceil(
  (prompt_tokens / 1000) × input_credits_per_1k
  + (completion_tokens / 1000) × output_credits_per_1k
)
```

**`input/output_credits_per_1k` 取值：**

- **默认：与 GRSAI 积分消耗等价**（由 Admin `model_pricing` 维护）
- **Markup：默认 1.0**（P7 不额外加价；零售毛利主要来自充值套餐，而非单次加价）
- **调价机制：** 上游变动 → Admin 更新 `model_pricing` → 前台目录同步展示

**P7 重点模型建议扣率（credits / 1K tokens，取 GRSAI 区间中值便于运营）：**

| 模型 | Input / 1K | Output / 1K |
|------|------------|-------------|
| gemini-2.5-flash | 0.045 | 0.30 |
| gemini-3-flash | 0.06 | 0.45 |
| gemini-3.1-pro | 0.225 | 1.05 |
| gpt-5.4 | 0.105 | 0.90 |
| gpt-5.5 | 0.33 | 2.03 |

> 上表为 **建议初始值**，上线前需与 GRSAI 控制台逐项核对；对外展示可继续用「¥/M tokens 参考价」。

### 4.3 暂不纳入 P7 的 Chat 规则

- 缓存 token 折扣（Cache read/write）
- 工具调用附加费
- 长上下文阶梯价
- 流式 vs 非流式差价

---

## 5. Image 模型扣费策略

### 5.1 计费原则

| 原则 | 说明 |
|------|------|
| 计费维度 | **按成功生成次数**（per generation） |
| 扣费时机 | 上游返回成功且 Tokfai 交付结果后 |
| 失败 | 不扣费 |
| 单位 | 固定 credits/次，与 GRSAI 积分/次 **1:1** |

### 5.2 P7 建议扣费表

| 模型 | credits/次 | 说明 |
|------|------------|------|
| nano-banana-fast | 440 | 低延迟入门 |
| gpt-image-2 | 600 | 通用生图 |
| nano-banana-2 | 1,200 | 新一代默认 |
| nano-banana | 1,400 | 标准档 |
| nano-banana-pro / pro-vt | 1,800 | 高质量 |
| nano-banana-2-cl | 1,600 | 变体 |
| nano-banana-2-4k-cl | 3,000 | 4K |
| nano-banana-pro-cl | 6,000 | 高端 CL |
| nano-banana-pro-vip | 10,000 | VIP |
| nano-banana-pro-4k-vip | 16,000 | 4K VIP |
| gpt-image-2-vip | 1,300 | Coming soon，先定价不开放 |

### 5.3 批量/变体（P7 决策：暂不单独计价）

- GRSAI 部分模型支持 `variants > 1`、额外图 +50 积分等规则。
- **P7 策略：** 若上游返回单次聚合消耗，Tokfai **按上游总消耗扣一次**；不在 P7 拆规则教育用户。
- **P8 再议：** Playground 明示「每张额外 +N credits」。

---

## 6. 毛利测算方式

### 6.1 核心公式

**单次充值毛利（套餐层）：**

```
充值毛利 = 用户支付金额 − 该笔 credits 对应的上游采购成本 − 支付手续费
```

**其中：**

```
上游采购成本 = 到账 credits × 上游有效单价（¥/credit）
支付手续费 ≈ 用户支付金额 × 2.9% + ¥0.30（Stripe 国内卡参考，以实际为准）
```

**单次调用毛利（消耗层）：**

```
调用毛利 = 本次向用户扣除的 credits × 零售有效单价（¥/credit）
         − 本次上游实际消耗 credits × 上游有效单价（¥/credit）
```

当 **零售 markup = 1.0（模型不加价）** 时，消耗层毛利≈0，**主要毛利来自充值套餐溢价**。

### 6.2 有效单价怎么取

| 场景 | 零售有效单价 | 上游有效单价 |
|------|--------------|--------------|
| 保守测算 | 按 **Starter**（¥0.0029/credit） | 按 **¥0.0001/credit**（无优惠） |
| 目标测算 | 按 **用户结构加权**（Starter 40% / Pro 40% / Business 20%） | 按 **¥0.00007/credit**（批量充值后） |
| 压力测试 | 全员按 **Business**（¥0.0013/credit） | 按 **¥0.0001/credit**（无议价） |

### 6.3 示例测算

**示例 A — Starter 用户购买后全部用完**

| 项 | 数值 |
|----|------|
| 用户支付 | ¥29.00 |
| 到账 credits | 10,000 |
| 上游成本（@¥0.00007） | ¥0.70 |
| Stripe 手续费（约） | ¥1.14 |
| **充值毛利** | **≈ ¥27.16（~94%）** |

**示例 B — 用户用 Pro 档购买，调用 nano-banana 50 次**

| 项 | 数值 |
|----|------|
| 用户支付 | ¥99.00 |
| 消耗 credits | 50 × 1,400 = 70,000（不足，需第二单 — 此例仅看单次调用单位经济） |
| 单次调用零售收入（@Pro ¥0.0018/credit） | 1,400 × 0.0018 = ¥2.52 |
| 单次上游成本（@¥0.00007） | 1,400 × 0.00007 = ¥0.098 |
| **单次调用贡献** | **≈ ¥2.42**（在 credits 已预付费前提下，体现为预收款的释放） |

### 6.4 运营需监控的指标

| 指标 | 用途 |
|------|------|
| **Blended ARPU** | 每用户平均充值金额 |
| **Credits 消耗率** | 已售 credits 中已消耗比例；过低说明留存或产品深度不足 |
| **模型 mix** | Image vs Chat 占比；Image 单次客单价高但上游成本也高 |
| **Upstream/Retail 比** | 上游有效单价 ÷ 零售有效单价；< 5% 时需警惕 Business 档过度促销 |
| **402 触发率** | 余额不足拦截次数；反推套餐粒度是否合适 |

---

## 7. 个人用户报价

### 7.1 适用对象

- 个人开发者、学生、AI 爱好者
- 单次项目、PoC、学习用途

### 7.2 报价结构

| 项目 | 政策 |
|------|------|
| 充值 | 仅 **固定套餐**（Starter / Pro / Business），不支持自定义金额 |
| 推荐档 | **Pro ¥99**（Dashboard / Pricing 默认引导） |
| 试用 | 注册 **不自动送 credits**（P7）；可考虑 P8 送 500~1,000 credits（≈ 上游 ¥0.05~0.10 成本） |
| 模型价 | 公开价目表，**无个人议价** |
| 发票 | P7 不做；P8 评估 Stripe 发票或国内发票需求 |

### 7.3 对外报价话术（示例）

> 「Tokfai 采用预付费 credits。成功调用才扣费，失败不扣。Chat 按 tokens 计费，Image 按次计费。  
> 推荐 Pro 套餐 ¥99，到账 55,000 credits，适合持续开发与小产品接入。」

---

## 8. 团队用户报价

### 8.1 适用对象

- 2–20 人技术团队、工作室、轻量 AI SaaS

### 8.2 P7 报价（无独立团队 SKU）

P7 **不新建团队套餐表**，用 **Business 档 + 人工商务** 覆盖：

| 项目 | P7 政策 |
|------|---------|
| 标准方案 | **Business ¥299 / 230,000 credits** |
| 更大需求 | 商务邮件议价：**¥999 = 800,000 credits**、**¥2,999 = 2,600,000 credits**（示意，非自助） |
| 交付 | Admin **手动调账** 或 多次 Business 购买（P7 不做法定合并支付） |
| 团队功能 | 共享余额、子账户、Key 配额 — **P8 产品化**，P7 仅报价预留 |

### 8.3 团队折扣边界

- 相对 Business 档，人工合同额外优惠 **不超过 15%**（避免冲击自助 Business）
- 需满足：**预估月消耗 ≥ ¥1,000** 或 **承诺预购 ≥ ¥3,000**

---

## 9. API 二道商 / 代理商报价

### 9.1 适用对象

- 将 Tokfai API 转售给下游开发者的小平台、集成商、垂直 SaaS

### 9.2 P7 政策：意向收集，不自助开通

| 项目 | 政策 |
|------|------|
| 准入 | 人工审核；需说明下游场景与预估月量 |
| 批发基准 | 在 **Business 有效单价** 基础上再降 **15% ~ 25%** |
| 量级阶梯（示意） | 月消耗 ¥3k–¥10k：85 折；¥10k–¥50k：80 折；¥50k+：75 折（相对 Business ¥/credit） |
| 结算 | P7：**预付费充值**，不支持后付 |
| 白标 / 专属域名 | 不做 |
| SLA | 与零售相同；不签单独 SLA |

### 9.3 代理商管理（P7 最小化）

- 独立 `api_key` 池 + Usage 导出即可
- **不**做代理商后台、分润自动结算、下级账户体系

### 9.4 风险红线

- 禁止代理商对外宣称「官方 Gemini/OpenAI 直连」
- 禁止低于 Tokfai 公开价 **7 折** 零售（避免价格战反噬品牌）

---

## 10. 暂不做的定价策略

以下能力 **明确不在 P7 范围**，避免与当前「套餐 + credits + 按量扣费」主链冲突：

| 策略 | 原因 |
|------|------|
| **月付订阅 / 会员** | 与预付费 credits 双轨会增加财务与产品复杂度 |
| **按量后付 / 信用额度** | 坏账风险；MVP 阶段不具备风控能力 |
| **多币种（USD 自助）** | P6 仅 CNY + Stripe；外汇与合规另开项目 |
| **Tokfai 内编辑 Stripe 金额** | 已约定：改价 = Stripe 新建 Price + Admin 回填 |
| **动态实时调价 /  surge pricing** | 开发者 API 需要价格稳定可预期 |
| **Chat 精确余额预扣** | 技术复杂度高于 P7 收益 |
| **Video（Veo 等）扣费** | 模型未开放；定价比价不成熟 |
| **Enterprise 合同、PO 采购** | 销售流程未建立 |
| **Credits 过期 / 滚动清零** | 影响信任；国内监管与用户预期均敏感 |
| **邀请返佣 / 分销自动分润** | 代理商体系 P8 再产品化 |
| **免费层自动续杯** | 仅可 Admin 手动赠送，不做自动化 |

---

## 11. 后台后续需要补的字段

> 以下为 **产品/数据字段建议**，供 P7 实施排期；不是本文档交付物。

### 11.1 `recharge_plans`（套餐层）

| 字段 | 类型（建议） | 用途 |
|------|--------------|------|
| `description` | text | 套餐说明（Dashboard / Pricing 展示） |
| `features` | jsonb | 卖点列表（如「适合 x 次 nano-banana」） |
| `target_segment` | enum | `individual` / `team` / `reseller` |
| `recommended` | boolean | 是否默认推荐（Pro=true） |
| `min_purchase_interval_hours` | int | 防刷：同一用户最短复购间隔 |
| `effective_from` / `effective_to` | timestamptz | 限时活动窗口 |
| `internal_note` | text | 运营备注，不对用户展示 |
| `bonus_credits` | numeric | **已有**；P7 启用 Pro/Business bonus |

### 11.2 `model_pricing`（模型层）

| 字段 | 类型（建议） | 用途 |
|------|--------------|------|
| `upstream_credits_per_1k_in` | numeric | 上游 input 成本（内部 COGS 核算） |
| `upstream_credits_per_1k_out` | numeric | 上游 output 成本 |
| `upstream_credits_per_request` | numeric | Image 上游成本 |
| `retail_credits_per_1k_in/out` | numeric | 对用户扣费（可与 upstream 相同） |
| `price_synced_at` | timestamptz | 与 GRSAI 末次对齐时间 |
| `price_source` | text | 如 `grsai_manual` / `grsai_api`（远期） |
| `min_charge_credits` | numeric | 单次最小扣费（Chat/Image） |

### 11.3 全局配置（新表或 Admin KV）

| 配置项 | 用途 |
|--------|------|
| `upstream_effective_cny_per_credit` | 毛利测算默认上游单价 |
| `default_markup_multiplier` | 新模型默认 markup |
| `reseller_discount_tiers` | 代理商折扣阶梯 JSON |
| `pricing_disclaimer_version` | 价目免责声明版本号 |

### 11.4 审计与合规

| 项 | 用途 |
|----|------|
| `admin_audit_logs` 扩展 action | 如 `model_pricing.sync`、`pricing.global_update` |
| 改价通知标记 | 模型价变更后是否需邮件通知活跃用户（P8） |

---

## 12. P7 验收标准

P7 定价体系 **视为完成** 需同时满足：

### 12.1 口径统一

- [ ] 用户充值 credits、Usage 扣费 credits、Pricing 页展示 credits **同一量级、同一单位**
- [ ] Chat / Image 至少各 **1 个模型** 完成端到端扣费验证，且与本文档建议表一致（误差 ≤ 1 credit）
- [ ] Pricing / Models / Credits 页参考价与 `model_pricing` **同源或明确标注「参考价」**

### 12.2 套餐

- [ ] Starter 维持可购；Pro / Business 在 Admin 配置 Stripe Price 后可启用
- [ ] Pro bonus 5,000、Business bonus 30,000 在 `recharge_plans` 可配置且 Checkout 入账正确
- [ ] 用户 **无法** 通过 API 篡改 amount / credits（P6 防篡改仍有效）

### 12.3 扣费策略

- [ ] Chat：按 input/output tokens 扣费；失败不扣
- [ ] Image：按次扣费；失败不扣
- [ ] `usage_logs.credits_charged` 与 `credit_ledger` Debit 一致

### 12.4 商业文档

- [ ] 本文档经产品 / 运营 / 技术负责人 **签字或 PR 合并** 为 V1 基线
- [ ] 毛利测算表（§6）在 spreadsheet 可复制，输入当月 Stripe 实收与上游充值凭证可出 **Blended 毛利率**

### 12.5 对外

- [ ] Pricing 页三档描述与 Dashboard Credits 页 **一致**
- [ ] 代理商 / 团队询价有 **统一邮件模板**（可附本文档 §8、§9）

### 12.6 明确不验收项

- 团队子账户、代理商自助 portal、订阅制、多币种 — 均 **不** 纳入 P7 验收

---

## 附录 A — P6 → P7 对照

| 维度 | P6 现状 | P7 目标 |
|------|---------|---------|
| 套餐 | Starter 可购；Pro/Business Coming soon | 三档均可购（Stripe Price 就绪后） |
| credits 口径 | 充值万级 vs 部分扣费小数级 | 统一为 GRSAI 对齐整数口径 |
| 模型价 | 前台目录与 DMIT 部分 fallback 并存 | Admin `model_pricing` 为单一真相源 |
| 毛利 | 未 formalize | §6 公式 + 月度复盘 |
| 团队/代理 | 无 | 报价规则有；产品化 P8 |

## 附录 B — 相关文档

| 文档 | 内容 |
|------|------|
| [`docs/MVP_ACCEPTANCE.md`](./MVP_ACCEPTANCE.md) | P6 功能与套餐 seed |
| [`docs/credit-topup-production-check.md`](./credit-topup-production-check.md) | Stripe 充值验收 |
| [`AGENTS.md`](../AGENTS.md) | 架构边界（改价走 DMIT + Admin） |

---

**文档维护：** 上游 GRSAI 调价、Stripe 费率变更或竞品重大动作时，更新 §1、§3、§6，并 bump 版本号。
