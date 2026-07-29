# P981 — Hermes-like Developer Agent Commercial Replication Report

> 目标：针对 Cursor / Codex / Agent 型开发者客户，沉淀可复制、可沉淀、可交付的商业模型。  
> 约束：不改核心 Chat/Billing；不承诺全模型 tools；不宣传强于官方原生；保留 P971–P980。

## Result: **PASS**

Marker: `TOKFAI_P981_HERMES_COMMERCIAL_REPLICATION_PASS`

---

## 1. 交付物列表

| Artifact | Status |
|---|---|
| `docs/hermes-developer-agent-customer-profile.zh.md` | Created — 画像 / 动机 / 路径 / 异议 / 价值 |
| `docs/cursor-codex-commercial-sop.zh.md` | Created — Cursor·Codex、只读/改码、request_id 模板 |
| `docs/developer-agent-model-routing.zh.md` | Created — A–E 分层 + 话术与风险 |
| `docs/hermes-objection-handling.zh.md` | Created — 六大异议应答 |
| `docs/developer-agent-delivery-checklist.zh.md` | Created — 销售/接入/售后/技术/复盘 |
| `scripts/p981-hermes-commercial-replication-smoke.mjs` | Created |
| Admin「开发者接入 / Cursor 场景」提示卡 | Created（文案级，非大改 UI） |
| `docs/commercial-delivery-pack.zh.md` | Updated — 索引挂上 P981 |

---

## 2. 验收对照

| 要求 | 结论 |
|---|---|
| 普通 Chat / Coding / Tools 边界说清 | **PASS**（routing A–E） |
| Cursor 接入与只读/改码流程 | **PASS**（cursor-codex SOP） |
| request_id 排障 + 失败不扣费证明 | **PASS**（SOP + smoke） |
| 销售/客户/售后可复制 | **PASS**（checklist + 异议手册） |
| 不改核心计费 | **PASS**（仅 docs + admin 文案） |
| typecheck / build / p981 smoke | **PASS** |

---

## 3. Smoke

```bash
node scripts/p981-hermes-commercial-replication-smoke.mjs
```

```text
PASS  doc_exists:(5 Hermes docs)
PASS  pack_keywords
PASS  routing_layers_a_to_e
PASS  objection_topics
PASS  delivery_checklists
PASS  no_native_superiority_promise
PASS  admin_developer_cursor_tip
PASS  models_capabilities
PASS  chat_success_request_id
PASS  failure_not_billable

TOKFAI_P981_HERMES_COMMERCIAL_REPLICATION_PASS
```

---

## 4. 商业复制判断

**可复制：是。**

下一 Hermes 型客户可按固定包交付：画像对齐 → Cursor Base URL 接入 → A/B 模型选型 → 只读再改码 → tools 边界声明 → request_id 对账。复制的是流程与话术，不是单次演示。

---

## 5. 风险边界

- Tool Call **暂不承诺**；未白名单强制 tools → 明确错误且不计费  
- 不承诺延迟/质量超过官方原生  
- Agent 自动改多文件需客户自限范围 + git diff  
- 「今日新用户」≠ 精确「完成 Cursor 首调」计数  

脏账相关：`bad_billing` / `charged_missing_url` / `provider_success_unpaid` 等不在本片修改范围内；本 smoke 不写生产账本。LIVE 运维仍按既有日志门禁巡检。

---

## 6. 下一步建议

1. 销售用 checklist 打一单真实 Hermes 客户，回收异议话术  
2. 若客户刚需 tools：走白名单验证后再更新 routing D→可承诺附件  
3. 可选：把 P981 文档链到公开 Docs 侧栏（仍属文案，非核心链路）  

---

## 7. 验收结论

**P981 Hermes Commercial Replication Acceptance：通过。**

开发者工程项目场景具备可复制交付包；普通 Chat 轻量验证通过；失败请求 not_billable；未污染核心生产计费链路。
