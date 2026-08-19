# 41 — Customer Deliverable Template (P1272-R0)

```text
P1272-R0 / DOC-41
CUSTOMER-READABLE DELIVERABLE
NO_SOURCE BODIES / NO KEYS / NO CANARY
NO_APPROVAL_GUARANTEE=YES
PROMISE=MATERIAL_INTEGRITY_AND_CONSISTENCY_ONLY
```

标准：[39-composite-delivery-standard.md](./39-composite-delivery-standard.md) · 证据行：[40-evidence-row-schema.md](./40-evidence-row-schema.md)

复制本模板填空交付。**禁止**粘贴源码全文、保单全文、密钥。

---

## 封面

```text
Tokfai 航飞复合交付报告
项目：
日期：
交付级别：L1 | L2 | L3 | L4
授权文件清单：（文件名 only）
编制：Tokfai + 客户对接人
```

---

## 0. 免责声明（必填，客户可见）

```text
本报告为材料风险诊断与补件建议，基于客户授权范围内已打开的文件指针。
Tokfai 不代替主管机关作出批准决定，不保证飞行活动/空域/适航审批通过。
本报告旨在提高材料完整性、一致性与可追溯性，不构成法律意见或适航符合性声明。
源码与敏感附件保留在客户本机，本报告不含完整正文。
```

---

## 1. 一页版结论

| 项 | 内容 |
| -- | ---- |
| 当前卡点 | 申请退回 / 首次申报 / 联试前对表 / 其他 |
| 驳回分型摘要 | R-DOC n · R-AIR n · …（若无退回写「无退回原文」） |
| 材料风险最高项 | 1–3 条（须链 row_id，无 cannot_infer） |
| 建议优先动作 | 3 条以内（ADVICE） |
| 明确不能结论 | 列出未打开/NOT_IN_FILE 项 |
| 下步交付级别建议 | L2/L3/L4 |

**一页原则：** 每条 bullet 括号标注 `[row_id]` 或 `[ADVICE-未证实]`。

---

## 2. 驳回原因分层

| R-类 | 退回短引 original_text | 关联 Gate | 材料风险 | row_id |
| ---- | ---------------------- | --------- | -------- | ------ |
| R-EMG | （原文词句） | G9 | H/M/L | |
| R-AIR | | G8 | | |
| … | | | | |

无退回原文时整节写：`未提供退回意见，以下为问诊清单，非驳回认定。`

---

## 3. 材料缺口表

| 申请/手册栏位 | 应有证据类型 | 证据状态 FILE/PARTIAL/NONE | source_file + page_or_line | 缺口说明 |
| ------------- | ------------ | -------------------------- | -------------------------- | -------- |
| | | | | |

---

## 4. 技术证据链

仅含 `confidence=FILE` 且 `cannot_infer_flag=false` 的行。

| row_id | source_file | page_or_line | extracted_term | related_code_or_parameter | aviation_meaning（短） |
| ------ | ----------- | ------------ | -------------- | ------------------------- | ---------------------- |
| | | | | | |

控制律形态（若本场包含代码，且为 Read 证明）：

```text
入口函数 → … → 分配 → 执行器写出
（路径+函数名 only；教学树须标注 synthetic）
```

---

## 5. 飞控 / 航线 / 载荷 / 通信 / 应急预案检查表

勾选 **已指针** / **NOT_IN_FILE** / **未在本次范围** — 不勾选“已符合局方”。

| 域 | 检查项 | 状态 | 证据 row_id 或说明 |
| -- | ------ | ---- | ------------------ |
| 飞控 | 姿态入口可指路径+函数 | | |
| 飞控 | 控制分配可指路径+函数 | | |
| 航线/空域 | 任务/空域/高度/时间边界在申请书一致 | | |
| 载荷 | 载荷与任务描述一致 | | |
| 通信 | 动态数据/识别字段有 ICD 或手册指针 | | |
| 应急 | 手册/计划/SOP 应急节有页码 | | |

---

## 6. 下一轮申报整改清单

| 序号 | REMEDIATION_TASK 摘要 | 责任人 | 完成标准（复核方式） | 目标栏位/附件 |
| ---- | ----------------------- | ------ | -------------------- | ------------- |
| 1 | | 运行/飞控/适航/商务 | 打开 p.X 与栏位 Y 一致 | |
| 2 | | | | |

**完成标准** 写客户侧可验证动作，不写“局方必批”。

---

## 7. 附录（可选）

- EVIDENCE_ROW 全表（可 CSV，仍无源码正文）  
- APPROVAL_RISK 明细  
- 未纳入结论的 INFER 行（标注原因）  

---

## 8. 我们承诺 / 不承诺

| 承诺 | 不承诺 |
| ---- | ------ |
| 在授权范围内给出可追溯指针 | 审批通过 |
| 指出材料不一致与缺口 | 空域可用 |
| 区分 FILE / 推断 / 未打开 | 代报 UOM |
| 提高完整性、一致性（尽力） | 飞行安全结论 |
| 方法可复现（固定范围+工具记录） | 源码出站保存 |

```text
CUSTOMER_FACING_PROMISE=MATERIAL_INTEGRITY_AND_CONSISTENCY
APPROVAL_PASS_PROMISE=NO
```
