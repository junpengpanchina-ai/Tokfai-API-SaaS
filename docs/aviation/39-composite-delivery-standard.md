# 39 — Aviation Composite Delivery Standard (P1272-R0)

```text
P1272-R0 / DOC-39
KNOWLEDGE → CUSTOMER DELIVERY STANDARD
NOT RAG-ONLY
NO_APPROVAL_GUARANTEE=YES
SOURCE_STAYS_LOCAL=YES
TOKFAI_EXECUTES_LOCAL_TOOLS=NO
```

证据行：[40-evidence-row-schema.md](./40-evidence-row-schema.md) · 客户模板：[41-customer-deliverable-template.md](./41-customer-deliverable-template.md)  
复合地图：[33-pdf-precision-composite-map.md](./33-pdf-precision-composite-map.md) · 驳回链：[37-rejection-to-evidence-remediation-chain.md](./37-rejection-to-evidence-remediation-chain.md)

---

## 1. 标准定义

Tokfai 航飞**复合交付** = 在客户本机打开授权文件，产出**可审计的对象集合**（证据行、风险、补件任务、客户报告），把 PDF/Word/Excel/代码/审批意见/访谈对齐到同一套指针与整改清单。

不是：聊天式政策解读、全库向量问答、代报 UOM、保证审批通过。

---

## 2. 输入文件类型

| 类型 | 介质 | 抽取要点 | 敏感处理 |
| ---- | ---- | -------- | -------- |
| 政策法规 | PDF | 条号、页码、应当/不得 | 本机；出站只留条号+页 |
| UOM/操作手册 | PDF/Word | 字段名、步骤号 | 本机 |
| 审批材料 | Word/PDF/Excel | 栏位原名、填报值 | 本机 |
| 审批意见 | PDF/邮件导出/截图 | 退回短引 | 脱敏后仍本机为主 |
| 飞控/航电代码 | `.c/.h` 等 | 路径、函数、信号名 | **不出站正文** |
| 试验/日志 | PDF/Excel | 科目、版本、时间 | 摘要+指针 |
| 客户访谈 | 纪要（内部） | 须回指文件验证 | 访谈 alone 不算 FILE |

可选输入见 [35-aviation-file-intake-checklist.md](./35-aviation-file-intake-checklist.md)。无书面授权目录 → 不打开客户树。

---

## 3. 输出对象

| 对象 | 说明 | 主要 schema |
| ---- | ---- | ----------- |
| **EVIDENCE_ROW** | 单条文件证据 | [40](./40-evidence-row-schema.md) |
| **APPROVAL_RISK** | 材料/准入风险项（非飞行安全评级） | `risk_id`, `gate`, `level H/M/L`, `linked_rows[]` |
| **REJECTION_REASON** | 驳回分型 | [36](./36-approval-rejection-diagnosis-map.md) R-类 + 短引 |
| **REMEDIATION_TASK** | 可执行补件 | [37](./37-rejection-to-evidence-remediation-chain.md) REMEDIATION_ROW |
| **CUSTOMER_DELIVERABLE** | 客户可读报告 | [41](./41-customer-deliverable-template.md) |

对象之间：

```text
REJECTION_REASON → EVIDENCE_ROW (定位)
EVIDENCE_ROW → APPROVAL_RISK (缺口)
APPROVAL_RISK → REMEDIATION_TASK (动作)
* → CUSTOMER_DELIVERABLE (汇总，无源码正文)
```

---

## 4. 证据优先原则

```text
无 source_file     → 不得下 FILE 级判断
无 page_or_line    → 不得下 R0 级结论（见 doc 40）
无 extracted_term / 函数名 → 不得写技术映射
访谈/常识         → 只能触发“打开某文件核对”，不能单独成结论
cannot_infer_flag=YES → 该行不得进入客户一页结论
```

与 [34-pdf-to-evidence-chain.md](./34-pdf-to-evidence-chain.md) 一致：`NO_SOURCE = NO_CLAIM`。

---

## 5. 本地处理边界

| 允许 | 禁止 |
| ---- | ---- |
| 客户电脑 Codex CLI Read/Search | 要求整包上传 Tokfai 服务器 |
| 纪要：文件名、页码、栏位、函数名、短引 | 纪要：完整源码、保单全文、密钥 |
| Tokfai：模型路由、计费、安全日志 | Tokfai：执行本地 Shell、托管资料室 |
| 交付 PDF/Word **由客户侧生成**（指针表） | 对外承诺“我们已审阅全部机密附件” |

出站材料默认：**指针化 CUSTOMER_DELIVERABLE**，不是文件镜像。

---

## 6. 交付分级 L1–L5

| 级 | 名称 | 输入 | 输出 | 典型周期 | 试点参照 |
| -- | ---- | ---- | ---- | -------- | -------- |
| **L1** | 快速判断 | 退回一句 + 口头访谈 | R-类 + 3 条 ADVICE | 1 会话 | 免费演示后 |
| **L2** | 文件证据链 | 授权 1–4 文件 | EVIDENCE_ROW 表 | 1–2 周 | B 工程链路 |
| **L3** | 审批整改 | 申请+意见+手册 | REJECTION_REASON + REMEDIATION_TASK | 2–4 周 | B/C |
| **L4** | 客户报告 | L2+L3 完整 | CUSTOMER_DELIVERABLE 全套 | 4–6 周 | C 团队协同 |
| **L5** | 复盘沉淀 | 申报结果（客户反馈） |  anonymized 方法摘要入内部库 | 项目后 | 不含客户正文 |

升级规则：缺 L2 证据不得出 L4 技术链章节。缺退回原文不得出 L3 驳回分层。

---

## 7. 质量门禁（交付前自检）

- [ ] 每条 EVIDENCE_ROW 含 `source_file` + `page_or_line`（或 `cannot_infer_flag=YES` 且未进一页结论）  
- [ ] CUSTOMER_DELIVERABLE 含免责声明（不保证审批通过）  
- [ ] 无 API key、无源码正文、无 canary  
- [ ] 飞控链若引用 synthetic，已标注教学/形态验证  
- [ ] APPROVAL_RISK 与 Gate 可追溯到 [05](./05-regulatory-gate-model.md) 或标 INTERPRETATION  

---

## 8. 禁止承诺

```text
保证审批通过 / 保证空域 / 代报 UOM / 代适航签字
把材料完整性等同于局方批准
把 L1 口头判断包装成 L4 正式报告
```

**可承诺：** 提高材料**完整性、一致性、可追溯性**（在客户提供文件范围内）。

```text
TOKFAI_DELIVERABLE_CLASS=MATERIAL_INTEGRITY_AND_TRACEABILITY
APPROVAL_OUTCOME_GUARANTEE=NO
```
