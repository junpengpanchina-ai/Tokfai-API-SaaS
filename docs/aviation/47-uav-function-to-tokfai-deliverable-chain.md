# 47 — UAV Function to Tokfai Deliverable Chain (P1274-R0)

```text
P1274-R0 / DOC-47
F1–F8 → CUSTOMER DELIVERABLE → COMMERCIAL TIERS
READABLE BY CUSTOMER + EXECUTABLE BY ENGINEER
NO_APPROVAL_GUARANTEE=YES
```

函数：[45-uav-mission-function-map.md](./45-uav-mission-function-map.md) · 环境：[46-uav-extreme-environment-commercialization.md](./46-uav-extreme-environment-commercialization.md)  
证据：[40-evidence-row-schema.md](./40-evidence-row-schema.md) · 报告：[41-customer-deliverable-template.md](./41-customer-deliverable-template.md) · 试点：[32-paid-pilot-offer.md](./32-paid-pilot-offer.md)

---

## 1. 总链路（8 函数通用）

```text
customer input
  → parsed fields
  → risk diagnosis
  → EVIDENCE_ROW
  → report output (CUSTOMER_DELIVERABLE)
  → pilot upsell
```

| 阶段 | 输入 | 解析字段 | 风险诊断 | 证据行 | 报告 | 升级 |
| ---- | ---- | -------- | -------- | ------ | ---- | ---- |
| 示例 F3 飞控 | 4×`.c` + HIL PDF | 函数/信号/页码 | 分配链是否 NOT_IN_FILE | FILE rows | 技术证据链章 | B 试点 |
| 示例 F5 链路 | 日志 + ICD | 异常码/超时 | 丢链处置是否无指针 | FILE/INFER | 通信检查表 | C |
| 示例 F7 任务 | 申请+任务书 | 栏位原名 | R-MSN/R-AIR | REMEDIATION | 整改清单 | B→C |

**纪律：** `cannot_infer_flag=true` 的行不进客户一页结论。

---

## 2. 按函数的最小交付包

| 函数 | customer input（典型） | parsed fields | risk diagnosis | report 章节 |
| ---- | ---------------------- | ------------- | -------------- | ------------- |
| F1 Environment | 手册限飞章、任务气象 | 温/风速阈值原文 | 任务 vs 手册超限 | 环境检查表 |
| F2 Energy | BMS 代码/日志 SOC | 阈值参数名 | 低电策略是否空 | 能量相关指针 |
| F3 Flight Control | ControlLaw 文件 | path+function | 链断裂点 | 技术证据链 |
| F4 Navigation | 航点+导航代码 | 字段/模式 enum | 备降 NOT_IN_FILE | 导航检查表 |
| F5 Link | 日志+手册 | 异常码 | 处置无指针 H | 通信检查表 |
| F6 Payload | ICD+任务书 | 触发 API | 采集要求缺口 | 载荷检查表 |
| F7 Mission | 申请+计划 | 四边界 | R-类 | 整改清单 |
| F8 Maintenance | 工单+日志 version | 构型/版本 | 版本不一致 H | 复盘+下轮申报 |

多函数项目：按 [45](./45-uav-mission-function-map.md) 依赖顺序打包 L2→L4。

---

## 3. 环境叠加（F1+F5 等）

[46](./46-uav-extreme-environment-commercialization.md) 每个 E1–E8 走同一链路：

```text
input: 手册环境节 + 任务书 + 相关日志
parsed: original_text + page_or_line
risk: APPROVAL_RISK H/M/L（材料/运行准备，非飞行安全评级）
EVIDENCE_ROW: ≥2
report: 环境专节 + 41 模板检查表
upsell: 含日志的 B/C 档
```

---

## 4. 商业四档

### 4.1 Free diagnosis（免费诊断）

| 项 | 内容 |
| -- | ---- |
| **input** | 口头卡点 + 可选 1 页退回意见；**无客户源码** |
| **output** | R-类或 F? 指向；3 条 ADVICE；synthetic 飞控链 30 分钟 |
| **evidence** | 教学树 only |
| **upsell** | “要接到你们文件，走付费试点” |
| **参照** | [30](./30-first-10-calls-battlecard.md)、[29](./29-demo-to-close-playbook.md) |

### 4.2 Paid pilot（付费试点）

| 项 | 内容 |
| -- | ---- |
| **input** | 书面授权清单；申请/手册/≤4 代码/日志样本 |
| **output** | EVIDENCE_ROW 表 + 部分 CUSTOMER_DELIVERABLE（L2/L3） |
| **risk** | 函数级 NOT_IN_FILE + 环境/材料 H/M/L |
| **tier** | [32](./32-paid-pilot-offer.md) A/B/C |
| **upsell** | 缺函数补第二工作流（日志/矩阵） |

### 4.3 Monthly SaaS（月度订阅）

| 项 | 内容 |
| -- | ---- |
| **input** | 机队 recurring：架次日志 + 版本变更 + 任务模板 |
| **output** | 每月飞后摘要、版本一致性、环境窗口提醒（指针） |
| **evidence** | 增量 EVIDENCE_ROW；不存客户正文在 Tokfai |
| **metering** | API 用量包 + 席位（合同定义上限） |
| **not** | 无限扫描、不代飞、不保证审批 |

### 4.4 Enterprise deployment（企业部署）

| 项 | 内容 |
| -- | ---- |
| **input** | 多项目/多机型；合规目录；与 [39](./39-composite-delivery-standard.md) L4/L5 |
| **output** | 标准化 CUSTOMER_DELIVERABLE、函数检查表库、复盘沉淀（ anonymized） |
| **execution** | 客户 VPC/本机 CLI 为主；Tokfai 网关；密钥客户自持 |
| **not** | 武器化模块、实时控飞、替客户承担运行责任 |

---

## 5. 端到端示例（电力巡检 + 高温 E1）

```text
1. customer input: 任务书 PDF + 手册限温节 + 1 架次日志（授权）
2. parsed fields: 手册 p.X 最高温 45°C；任务书写 50°C；日志 temp 字段
3. risk diagnosis: F1 H — 任务书超限；F3 待读（若含飞控文件）
4. EVIDENCE_ROW: 2–5 行 FILE
5. report: 41 模板 — 一页结论 + 环境/飞控检查表 + 整改清单
6. pilot upsell: B 工程链路（四文件）+ 日志月包 SaaS
```

---

## 6. 工程师执行 SOP（可打印）

1. 标定本次覆盖函数 F? 与环境 E?  
2. 收 [35](./35-aviation-file-intake-checklist.md) MUST 项  
3. 本机 Read → 只产出 [40](./40-evidence-row-schema.md) 行  
4. 合成 risk + REMEDIATION（[37](./37-rejection-to-evidence-remediation-chain.md)）  
5. 填 [41](./41-customer-deliverable-template.md) — 含免责声明  
6. 对照四档：免费止于此步之前；试点发 SOW；SaaS/enterprise 另附用量与席位  

---

## 7. 客户可见承诺

| 承诺 | 不承诺 |
| ---- | ------ |
| 函数/环境/材料指针化诊断 | 审批通过 |
| 提高完整性、一致性、可复盘 | 实时控飞 |
| 可重复交付格式 | 武器化或规避监管能力 |

```text
DELIVERABLE_CHAIN=F1–F8 → EVIDENCE → REPORT → TIER_UPSELL
TOKFAI_P1274_FUNCTION_DELIVERABLE_CHAIN=READY
```
