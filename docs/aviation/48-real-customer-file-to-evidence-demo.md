# 48 — Real Customer File to Evidence Demo (P1275-R0)

```text
P1275-R0 / DOC-48
REAL / SIMULATED FILES → DEMO → QUOTE → DELIVER
NO_FLIGHT_CONTROL / NO_APPROVAL_BYPASS / NO_APPROVAL_GUARANTEE
SOURCE_STAYS_ON_CUSTOMER_MACHINE=YES
```

演示脚本：[49-uav-customer-demo-script.md](./49-uav-customer-demo-script.md) · 报价：[50-uav-paid-pilot-pricing-and-scope.md](./50-uav-paid-pilot-pricing-and-scope.md)  
证据行：[40-evidence-row-schema.md](./40-evidence-row-schema.md) · 报告：[41-customer-deliverable-template.md](./41-customer-deliverable-template.md)  
函数链：[47-uav-function-to-tokfai-deliverable-chain.md](./47-uav-function-to-tokfai-deliverable-chain.md)

**说明：** “客户文件”= 客户本机授权目录内的 PDF/Word/Excel/日志/航线/驳回意见/参数表；**不是**上传到 Tokfai 服务器。模拟文件 = `test-fixtures/aviation/p1240-r2-synthetic-fcu/` 等教学树。

---

## 1. 客户原始文件类型 → 处理动作

| 类型 | 典型内容 | Tokfai 侧动作 | 本机工具 |
| ---- | -------- | ------------- | -------- |
| PDF | 法规摘要、手册、试验报告、驳回扫描件 | 条号/页码/节名抽取 | Codex Read |
| Word | 任务计划、说明、SOP | 步骤号、边界描述短引 | Read |
| Excel | 申请表、设备参数表、矩阵 | 单元格地址+栏位原名+显示值（短） | Read |
| 飞控日志 | `.ulg`/csv/自研 | 时间戳、模式、事件码、版本字段 | Read/Search |
| 航线文件 | KML/CSV/自研航点 | 字段名、高度/区域关键字 | Read |
| 审批驳回意见 | PDF/邮件导出 | **退回句短引**（原文） | Read |
| 设备参数表 | Excel/PDF | 型号、限值、接口名 | Read |
| 飞控源码（可选） | `.c/.h` | 路径、函数、信号名 — **不出站正文** | Read |

无书面授权清单 → 只用 synthetic 演示，不打开客户目录。

---

## 2. Tokfai 如何拆字段（解析层）

统一落到 [40](./40-evidence-row-schema.md) 与复合地图 [33](./33-pdf-precision-composite-map.md)：

| 来源 | 拆出字段 | 进入对象 |
| ---- | -------- | -------- |
| PDF/Word | `source_file`, `page_or_line`, `original_text`, `extracted_term` | EVIDENCE_ROW |
| Excel | `Sheet!Cell`, 栏位原名, 填报值（短） | EVIDENCE_ROW + 缺口表 |
| 日志 | 时间戳, `mode`, `event`, `link_*`, `sw_version` | EVIDENCE_ROW + 时间线 |
| 航线 | 航点字段, 高度, 区域描述 | EVIDENCE_ROW + 四边界 |
| 驳回 | `rejection_quote`, R-类 | REJECTION_REASON + REMEDIATION |
| 参数表 | 限温/限风/推力等 **原文阈值** | F1/F2 环境能量诊断 |
| 代码 | `path`, `function`, `signal` | F3–F6 技术链 |

**硬约束：** `confidence=FILE` 时必须有 `page_or_line` + `original_text`（条号/栏位/函数名级，非整页粘贴）。

---

## 3. 字段分流：Evidence / 风险 / 报告

```text
parsed fields
    ├─► EVIDENCE_ROW（所有 FILE 级指针）
    ├─► APPROVAL_RISK / R-类（缺口、超限、不一致）
    └─► CUSTOMER_DELIVERABLE（汇总，无源码正文）
```

| 字段示例 | EVIDENCE_ROW | 风险诊断 | 客户报告章节 |
| -------- | ------------ | -------- | ------------ |
| 手册 p.X 最高风速 | ✓ | F1/F4 超限 M/H | 环境检查表 |
| 申请 `应急程序` 空 | ✓（空栏位） | R-EMG H | 材料缺口 + 整改清单 |
| 日志 `link_loss` 码 | ✓ | F5 H | 通信检查表 + 时间线 |
| `control_allocation` 路径 | ✓ | F3 链完整/断点 | 技术证据链 |
| 访谈“应该能过” | ✗（不得 FILE） | 不进入 | 禁止 |

`cannot_infer_flag=true` 的行：**不进**报告一页结论。

---

## 4. Demo 路径（真实 vs 模拟）

| 阶段 | 文件 | 演示产出 |
| ---- | ---- | -------- |
| D0 免费 | synthetic 四文件 | 工具记录 + 路径表（方法） |
| D1 轻量 | 1 份 PDF + 1 份 Excel 或驳回 1 页 | 3–5 行 EVIDENCE_ROW + 1 页 ADVICE |
| D2 试点 B | 申请+手册+≤4 代码+日志片段 | 41 模板 L2/L3 |
| D3 试点 C | 多函数 + 环境 E? + 多架次 | 41 全套 + 函数检查表 |

报价对齐 [50](./50-uav-paid-pilot-pricing-and-scope.md)。

---

## 5. 端到端示例（脱敏，无客户正文）

**输入（客户本机）：**  
`申请.xlsx` · `运行手册.pdf` · `架次_20250801.log` · 授权 `ControlLaw/*.c`（4 个）

**拆字段：**  
- 手册 p.12 `最大风速 8m/s` → EVIDENCE_ROW  
- 申请 B7 写 `10m/s` → EVIDENCE_ROW + F1 H  
- 日志 `14:32 link_loss` → EVIDENCE_ROW  
- 手册 p.40 `丢链返航` 节 → EVIDENCE_ROW  
- `txg_control_task.c` 入口函数 → EVIDENCE_ROW（若路径与授权一致）

**风险：** R-AIR（若空域栏宽）+ F5 H + F1 M  
**报告：** 41 模板 — 一页结论 + 缺口表 + 技术链 + 整改清单  
**报价：** B 档试点

---

## 6. Tokfai 明确不做

```text
不替客户操控无人机
不绕审批、不代报 UOM
不承诺审批通过、不承诺空域可用
不做武器化、极端环境“突防”叙事
```

**只做：** 材料整理（指针化）、证据链、风险/缺口诊断、客户报告、交付与续费建议。

```text
TOKFAI_ROLE=EVIDENCE_AND_MATERIAL_INTEGRITY
FLIGHT_AUTHORITY=CUSTOMER_ONLY
```
