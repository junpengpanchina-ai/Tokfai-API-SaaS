# 40 — Evidence Row Schema (P1272-R0)

```text
P1272-R0 / DOC-40
EVIDENCE_ROW CANONICAL SCHEMA
HARD: source_file + page_or_line + original_text discipline
NO_SOURCE = NO_CLAIM
```

交付标准：[39-composite-delivery-standard.md](./39-composite-delivery-standard.md)  
早期格式：[34-pdf-to-evidence-chain.md](./34-pdf-to-evidence-chain.md)（兼容；本 schema 为航飞交付 canonical）

---

## 1. 字段定义

| 字段 | 必填 | 类型 | 说明 |
| ---- | ---- | ---- | ---- |
| `source_file` | **是** | string | 文件名或授权相对路径；无文件则整行无效 |
| `source_type` | **是** | enum | `PDF` \| `DOCX` \| `XLSX` \| `CODE` \| `SOP` \| `INTERVIEW` \| `REJECTION` |
| `page_or_line` | **是*** | string | `p.12` / `§3.2` / `Sheet1!C4` / `L45` / `path:line`；见 §2 |
| `original_text` | **是*** | string | 原文短引：条号、栏位名、函数名、退回句片段；**禁止改写后冒充原文** |
| `extracted_term` | 条件 | string | 从原文抽出的术语/符号/函数名（与 original_text 一致或可指回） |
| `aviation_meaning` | 条件 | string | 在航飞语境下的含义（SUMMARY）；须标是否依赖 FILE |
| `approval_risk` | 条件 | enum | `H` \| `M` \| `L` \| `—`（材料风险，非飞行安全） |
| `related_code_or_parameter` | 可选 | string | 关联代码路径+函数或参数名；无则 `NOT_IN_FILE` |
| `remediation_action` | 可选 | string | 补件/核对动作（ADVICE） |
| `confidence` | **是** | enum | `FILE` \| `SUMMARY` \| `INFER` |
| `cannot_infer_flag` | **是** | boolean | `true` = 缺硬约束，不得支撑客户结论 |

\* 硬约束见 §2。`cannot_infer_flag=true` 时 `page_or_line`/`original_text` 可填 `UNKNOWN`，但该 row **不得**进入 [41](./41-customer-deliverable-template.md) 一页结论。

---

## 2. 硬约束：`original_text` 与 `page_or_line`

```text
RULE-1: 无 source_file → 禁止创建 EVIDENCE_ROW
RULE-2: confidence=FILE 时，page_or_line 与 original_text 均必填且非 UNKNOWN
RULE-3: original_text 只能是：
         - 法规/手册条号或栏位原名
         - 退回意见短引（≤30 字或一条完整栏位名）
         - 代码函数名/信号名（非整段源码）
         - Excel 单元格地址 + 单元格显示值（短）
RULE-4: 禁止用 aviation_meaning 替代 original_text
RULE-5: 禁止无 page_or_line 的“文件中提到”类表述
RULE-6: INTERVIEW 类型不能单独 confidence=FILE；须指向待打开文件
```

**page_or_line 示例**

| source_type | 合法 | 非法 |
| ----------- | ---- | ---- |
| PDF | `p.14` `第26条` | `手册里` |
| XLSX | `申请!B12` | `表格后面` |
| CODE | `ControlLaw/txg_control_task.c:L42` | `飞控里某函数` |
| REJECTION | `意见页1段2` | `他们说材料不全`（无定位） |

---

## 3. 完整行模板

```text
EVIDENCE_ROW
row_id:
source_file:
source_type:
page_or_line:
original_text:
extracted_term:
aviation_meaning:
approval_risk: H | M | L | —
related_code_or_parameter:
remediation_action:
confidence: FILE | SUMMARY | INFER
cannot_infer_flag: false | true
```

---

## 4. 字段协作规则

| confidence | approval_risk | 客户报告可用 |
| ------------ | ------------- | ------------ |
| FILE | 任意 | 是 |
| SUMMARY | M/L | 是（标注摘要） |
| INFER | 仅 L 或 — | 仅附录，不进一页结论 |
| any + cannot_infer=true | — | **否** |

`related_code_or_parameter` 填 synthetic 教学链时须注 `(synthetic形态)`，不得写 OEM 型号事实。

---

## 5. 与 REMEDIATION_TASK 映射

一条 REMEDIATION_TASK 应链接 ≥1 条 EVIDENCE_ROW：

```text
REMEDIATION_TASK.remediation_action ← EVIDENCE_ROW.remediation_action
REMEDIATION_TASK.rejection_quote     ← EVIDENCE_ROW.original_text (若 source_type=REJECTION)
```

---

## 6. 反模式

| 反模式 | 处理 |
| ------ | ---- |
| 只有 aviation_meaning | 删除或 cannot_infer=true |
| original_text 是模型改写条例 | 改回条号+页或删 |
| 函数名未 Read | cannot_infer=true |
| 整页 PDF 粘贴 | 违反出站纪律；只留短引 |

```text
CANONICAL_RULE=original_text AND page_or_line ARE HARD FOR FILE ROWS
```
