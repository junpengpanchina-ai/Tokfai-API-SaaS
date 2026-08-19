# 37 — Rejection to Evidence Remediation Chain (P1271-R0)

```text
P1271-R0 / DOC-37
REJECTION → EVIDENCE → GAP → RISK → REMEDIATE → OWNER → VERIFY
NO_APPROVAL_PROMISE=YES
NO_SOURCE = NO_CLAIM
```

分型地图：[36-approval-rejection-diagnosis-map.md](./36-approval-rejection-diagnosis-map.md)  
证据行格式：[34-pdf-to-evidence-chain.md](./34-pdf-to-evidence-chain.md)

---

## 1. EVIDENCE_REMEDIATION_ROW 标准格式

每条补件动作一行。纪要**不贴**源码/保单全文。

```text
REMEDIATION_ROW
id:                    # R-37-001
rejection_quote:       # 退回意见短引（原文词句）
rejection_class:       # R-DOC | R-AIR | …（doc 36）
evidence_found:        # 已定位证据 FILE | PARTIAL | NONE
file:                  # 文件名
medium: PDF | DOCX | XLSX | CODE | SOP
locator:               # p. / 节 / 单元格 / 路径
term_or_field:         # 术语或栏位原名
missing:               # 缺失字段或章节（原文名）
risk: H | M | L         # 材料风险（非飞行安全评级）
remediation_action:    # 补件动作（可执行）
owner:                 # 运行 / 飞控 / 适航 / 商务 / 甲方
verify_method:         # 如何复核（打开哪页、谁签字、是否再提）
claim_class: ADVICE    # 固定为建议，非局方决定
```

**风险 H/M/L（材料层）**

| 级 | 含义 |
| -- | ---- |
| H | 退回明确点名且证据 NONE |
| M | 有部分材料但栏位/边界对不上 |
| L | 格式类，内容可能已有 |

复核方式示例：`适航代表打开手册 p.X 与申请 C12 对照` — **不是** `局方必过`。

---

## 2. 链路总图

```text
驳回原因 (rejection_quote)
  → 证据定位 (file + locator + FILE/PARTIAL/NONE)
  → 缺失字段 (missing)
  → 风险等级 (H/M/L)
  → 补件动作 (remediation_action)
  → 责任人 (owner)
  → 复核方式 (verify_method)
```

多行共享同一 `rejection_quote` 时，用 `id` 后缀 `-a/-b`。

---

## 3. 示例 A：缺少应急处置说明（R-EMG）

**客户退回示意：** “未提供应急处置程序，不符合申请要求。”

| id | rejection_class | evidence_found | file / locator | missing | risk | remediation_action | owner |
| -- | --------------- | -------------- | -------------- | ------- | ---- | ------------------ | ----- |
| R-37-A1 | R-EMG | NONE | 申请书 `应急程序` 栏空 | 栏位无内容 | H | 在任务计划或运行手册中定位应急章，把**节名+页码**填回申请栏（不编造程序） | 运行 |
| R-37-A2 | R-EMG | PARTIAL | `运行手册.pdf` 节“应急处置” p.?（客户打开后填页） | 未与申请关联 | M | 做对照表：手册步骤号 ↔ 申请附件清单 | 运行+合规 |
| R-37-A3 | R-EMG | NONE | UOM 操作指引（若客户有） | 平台是否要求单独上传 | M | Search 字段名“应急”；找不到标 NOT_IN_FILE | 合规 |
| R-37-A4 | R-EMG | NONE | 飞控 `…/txg_control_task.c` 等 | **姿态链≠应急** | L | 明确：控制链不能当应急证据；需手册/SOP | 飞控（澄清） |

**禁止：** 模型口述“我们有返航程序”而无手册页。  
**verify_method：** 合规打开手册应急节，申请栏附件名与页码一致后再提交（客户自行操作 UOM）。

---

## 4. 示例 B：飞行范围描述过宽（R-AIR + R-MSN）

**退回示意：** “飞行区域描述不清晰，任务范围过大。”

拆成四边界（各一行 REMEDIATION_ROW）：

| 边界 | missing 典型 | remediation_action |
| ---- | ------------ | ------------------ |
| **任务边界** | 任务类型、载荷、视距/超视距混写 | 从任务计划摘**原文**任务句；删营销句 |
| **空域边界** | 只有市名无 polygon/半径/高度 | 补 KML/文字范围+真高上限；对照手册空域段 |
| **时间边界** | 无起止日期/时段 | 补单次或重复规则；与合同验收日对齐 |
| **人员边界** | 操控员/观察员未列 | 补执照号栏或“见附件”+附件指针 |

| id | term_or_field | risk | owner |
| -- | ------------- | ---- | ----- |
| R-37-B1 | 任务性质栏 | H | 运行 |
| R-37-B2 | 空域范围栏 | H | 运行+甲方 |
| R-37-B3 | 飞行时段栏 | M | 调度 |
| R-37-B4 | 操控员信息栏 | M | 机务/教务 |

**verify_method：** 四人交叉：运行填表、飞控确认任务不涉及未声明模式、合规核对空域表述与手册一致。

---

## 5. 示例 C：飞控能力证明不足（R-EQP）

**退回示意：** “无法核实航空器具备所声明的控制与监视能力。”

**正确映射（不编造能力）：**

| id | evidence_found | file / locator | claim |
| -- | -------------- | -------------- | ----- |
| R-37-C1 | FILE（若授权） | 申请 `能力清单` 单元格 | 客户**声称**具备项列表 |
| R-37-C2 | FILE/PARTIAL | `设备说明.pdf` 或 ICD | 硬件/链路声明 |
| R-37-C3 | FILE（Read 后） | `control_allocation.c` 等 | **仅证明分配逻辑存在**，不证明适航 |
| R-37-C4 | FILE/PARTIAL | HIL 报告科目表 | 科目是否覆盖声明能力 |
| R-37-C5 | NONE | 动态数据/识别模块 | 若申请写了“具备报送”但无路径 → H |

合成链仅说明**读文件方法**：

```text
attitude_control_entry → rotor_law_update → control_allocation → actuator_command_write
```

对客户说：这条链回答“控制分配到执行器是否在代码里可指”，**不**回答“监视能力已获局方认可”。

| missing | remediation_action | owner |
| ------- | ------------------ | ----- |
| 申请项无代码/试验指针 | 删夸项或补路径/报告页 | 飞控+适航 |
| 混淆 TC 与能力 | 拆证件表（[25](./25-certification-and-operation-chain.md)） | 商务 |
| 只有 PPT | 降宣传句或补正式说明 | 商务 |

**verify_method：** 适航/质量对照：申请每一能力项至少一条 FILE 指针（代码路径或试验科目），否则改申请表述。

---

## 6. 输出模板（整单）

```text
REJECTION_DIAGNOSIS_REPORT
customer:
date:
rejection_source: UOM | 地区局 | 甲方 | UNKNOWN
rejection_quotes: [短引列表，不贴全文]

CLASSIFICATION:
  R-DOC: n
  R-AIR: n
  …

REMEDIATION_TABLE:
  [REMEDIATION_ROW × N]

NOT_PROVIDED_BY_TOKFAI:
  - 审批结果预测
  - UOM 代操作
  - 源码/密钥

NEXT_SUBMIT_OWNER: 客户运行/合规（自行）
```

---

## 7. 纪律

```text
驳回句必须短引原文，无原文则 R-UNK
补件建议 = ADVICE，不是“局方要求”（除非 FILE 指针到条款）
飞控函数不得从驳回句直接发明
常识不得顶替文件定位
```
