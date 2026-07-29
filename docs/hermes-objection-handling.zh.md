# Hermes 型客户异议处理

> 销售 / 售后统一口径。不贬低官方，不夸大中转。

---

## 1. 「原生 API 效率更好」

**怎么回答：**

「原生直连在部分场景确实可能更低延迟。Tokfai 卖的是 **OpenAI 兼容统一接入、统一账单、能力边界说清楚、失败可对账**。适合要 Cursor/多工具共用 Key、要算力积分账本和 `request_id` 的团队。我们不宣传比官方原生更快或更强。」

**可跟进：**

- 先用 `auto-fast` 测连通，再用 `auto-pro` 评质量  
- 对比维度：配置成本、对账、多模型切换，不只比单次 TTFT  

---

## 2. 「中转 API 不稳定」

**怎么回答：**

「任何上游都可能 busy / 超时。Tokfai 会返回稳定错误码（如 `upstream_model_busy`、`all_upstreams_unavailable`、`model_not_available`），且这类失败 **通常不扣费**。请保留 `request_id`，我们在 Usage 核对。」

**可跟进：**

- 换 `auto-fast` / 其它模型重试  
- 查 Admin / Usage 最近错误  
- 不向客户甩上游域名原文  

---

## 3. 「Cursor 能不能用」

**怎么回答：**

「能。按 OpenAI Compatible 配置 Base URL `https://api.tokfai.com/v1` + `sk-tokfai_…`，模型先填 `auto-fast`。Dashboard Docs 有 Cursor 专章。普通补全/对话是标配交付；Agent tools 另算，默认不承诺。」

SOP：`docs/cursor-codex-commercial-sop.zh.md`

---

## 4. 「为什么工具调用失败」

**怎么回答：**

「Tool calling **不是**所有模型的公开承诺能力。未验证模型强制 tools 会返回 `model_not_tool_capable`（或相关保护码），**不计费**。这是账单与能力保护（P971–P974），不是乱扣费。需要 tools 时走白名单验证后再写进交付范围。」

**可跟进：**

- 先关掉强制 tools，用普通 Chat 完成任务  
- 查 `/v1/models` 的 `capabilities.tools`  

---

## 5. 「失败会不会扣费」

**怎么回答：**

「失败请求默认 **不扣费**（`not_billable` / `credits_charged=0`）。成功才扣算力积分。请到 Usage 用 `request_id` 核对；若失败却扣费，把五件套发给我们优先查账。」

模板：`docs/error-and-request-id-sop.zh.md`

---

## 6. 「能不能商业化复制」

**怎么回答：**

「能。我们有 Hermes 画像、Cursor/Codex SOP、模型分层、异议手册和交付 checklist。下一客户按同一套走：接 Cursor → 选型 → 只读/改码场景 → request_id 排障 → 证明失败不扣费。复制的是 **流程与边界**，不是单次演示运气。」

清单：`docs/developer-agent-delivery-checklist.zh.md`

---

## 7. 禁止话术（再次强调）

- ❌ fully compatible  
- ❌ 全模型 tool calling  
- ❌ 比官方原生更强 / 更快（作为承诺）  
- ❌ 隐瞒失败计费风险  
