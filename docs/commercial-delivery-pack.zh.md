# Tokfai 商业交付包（Commercial Delivery Pack）

> 给销售、实施、售后、客户成功的**总索引**。  
> 不新增产品能力；把已验收的 P978/P979 沉淀成可复制交付物。

---

## 1. 一句话定位（对外）

Tokfai 是 **OpenAI-compatible API 网关**（`api.tokfai.com`）：

- 统一 API Key（`sk-tokfai_…`）
- 统一账单（算力积分 credits）
- 兼容常见 Chat / Stream / 图片接口

**禁止话术：**

- ❌ 「所有模型 fully compatible」
- ❌ 「保证全量 tool calling / function calling」
- ❌ 「别名模型 = 独立上游厂商」

**正确话术：**

- ✅ OpenAI 兼容协议接入，10 分钟可跑通 curl / Cursor
- ✅ 成功扣费、失败通常不扣费；用 `request_id` 对账
- ✅ Tools 仅白名单验证模型可承诺（`VERIFIED_TOOLS_CAPABLE_MODEL_IDS`）

---

## 2. 交付包清单（本包文件）

| 文件 | 给谁用 | 用途 |
|---|---|---|
| `docs/commercial-delivery-pack.zh.md` | 全员 | 本索引 |
| `docs/customer-first-run-sop.zh.md` | 客户 / 实施 | 10 分钟首次接入 |
| `docs/sales-and-support-playbook.zh.md` | 销售 / 售后 | 话术与边界 |
| `docs/model-capability-commercial-matrix.zh.md` | 销售 / 实施 | 模型分类与承诺边界 |
| `docs/error-and-request-id-sop.zh.md` | 售后 / 客户 | 错误码与反馈模板 |

配套（P978/P979）：

- `docs/customer-onboarding-playbook.zh.md`
- `docs/model-commercial-matrix.zh.md`
- `docs/error-code-guide.zh.md`
- Dashboard：`/dashboard/integration-workbench`（首次接入页）
- Docs：`/dashboard/docs#quickstart` · `#cursor` · `#billing`

---

## 3. 标准交付流程（销售 → 客户）

1. 发本交付包索引 + `customer-first-run-sop.zh.md`
2. 协助注册 → 创建 API Key → 跑通 curl（`auto-fast`）
3. 可选：Cursor 配置（同 Base URL）
4. 演示 Usage：成功扣费 / 失败不扣费 / `request_id`
5. 明确 tools **不默认承诺**；有需求走白名单验证后再写进合同
6. 售后只收「完整反馈五件套」（见 error SOP）

---

## 4. 财务边界（必须统一口径）

| 情况 | 计费 |
|---|---|
| Chat/Stream **成功** | 扣算力积分（可计费） |
| 校验失败 / 模型不可用 / tools 未验证强制失败 / 上游不可用等 | **不扣费**（`not_billable`，`credits_charged=0`） |
| 图片任务 | 仅成功出图后扣费；失败/超时不扣 |

对账入口：Dashboard → **Usage** / **Credits**，用 `request_id`。

---

## 5. 管理后台一眼看（运营）

Admin Overview：

- **今日接入概览**：今日新用户、今日成功/失败、今日扣费、最近错误数
- **最近错误**表：失败原因 / `request_id`
- **推荐模型**：`auto-fast` · `auto-pro` · `auto-cheap`
- **首次接入入口**：指向客户 Dashboard 首次接入页说明（文案）

---

## 6. 验收标记

- P978 Commercial Replication：`TOKFAI_P978_COMMERCIAL_REPLICATION_PASS`
- P979 First-Run：`TOKFAI_P979_EXTERNAL_CUSTOMER_FIRST_RUN_PASS`
- P980 Delivery Pack：`TOKFAI_P980_COMMERCIAL_DELIVERY_PACK_PASS`
