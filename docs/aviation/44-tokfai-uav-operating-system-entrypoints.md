# 44 — Tokfai UAV Operating System Entrypoints (P1273-R0)

```text
P1273-R0 / DOC-44
WHERE TOKFAI ENTERS A UAV PROJECT
PRE / IN-FLIGHT-LOGS-ONLY / POST / COMMERCIAL
NO_FLIGHT_CONTROL=YES
NO_WEAPONIZATION=YES
CUSTOMER_READABLE + ENGINEER_SOP=YES
```

地图：[42-uav-war-to-commercial-system-map.md](./42-uav-war-to-commercial-system-map.md) · 栈：[43-commercial-uav-precision-stack.md](./43-commercial-uav-precision-stack.md)  
试点：[32-paid-pilot-offer.md](./32-paid-pilot-offer.md) · 交付：[39](./39-composite-delivery-standard.md) · [41](./41-customer-deliverable-template.md)

---

## 0. 总原则

| 角色 | Tokfai | 客户侧 Codex CLI |
| ---- | ------ | ---------------- |
| 协议与模型 | 路由、计费、安全日志 | — |
| 文件与日志 | — | Read/Search 本机授权目录 |
| 控飞 | **从不** | **从不**（CLI 不替代飞控计算机） |

敏感资料不出站。结论用指针，不用源码全文。

---

## 1. 飞前（Pre-flight）

### 1.1 资料解析

**介入：** 客户授权 PDF/Word/Excel/代码目录。  
**动作：** 生成 EVIDENCE_ROW；复合 [33](./33-pdf-precision-composite-map.md)。  
**产出：** 资料索引、术语表（原文）、版本/构型指针。  
**不做：** 上传整包、替客户改密件。

### 1.2 审批材料

**介入：** 申请书、手册节、退回意见（若有）。  
**动作：** [36–37](./36-approval-rejection-diagnosis-map.md) 分型 + REMEDIATION_TASK。  
**产出：** 材料缺口表、四边界表。  
**不做：** 代报 UOM、保证批准。

### 1.3 任务边界

**介入：** 任务计划 + 申请栏位。  
**动作：** 任务/空域/时间/人员边界对照。  
**产出：** 一页结论中的“能否对表”（材料一致性，非空域批复）。  
**演示：** 无客户文件时用 synthetic 飞控链讲**方法**（[23](./23-customer-demo-sop.md)）。

**飞前 SOP 清单（操作员）**

- [ ] 书面授权文件清单  
- [ ] 退回原文（若有）  
- [ ] 固定范围（≤4 代码文件起步）  
- [ ] CLI + 环境变量 key（不进纪要）  
- [ ] 免责声明已口头确认  

---

## 2. 飞中（In-flight — 仅日志/状态解析）

**硬边界：Tokfai 不直连飞机、不下发实时控制指令、不参与闭环控飞。**

### 2.1 可介入（客户本机事后或近实时日志文件）

| 输入 | 解析 | 输出 |
| ---- | ---- | ---- |
| 地面站/飞参日志 | 模式、事件码、链路状态字段 | 异常段时间线（ADVICE） |
| 异常码 | 对照手册/ICD 原文 | EVIDENCE_ROW（码↔处置节） |
| 任务 ID | 对照任务书 | 是否偏离声明边界（材料层） |

### 2.2 不可介入

- 实时注入航点、绕过限飞、未授权空域规划  
- 武器/打击相关任何解析  
- 替客户做“继续飞/强制降落”决策（运行人责任）

**飞中 SOP：** 仅当客户把**已落盘日志**放入授权目录；会话内 Read，纪要只留时间戳+字段名+指针。

---

## 3. 飞后（Post-flight）

| 步骤 | 内容 | 交付物 |
| ---- | ---- | ------ |
| 1 | 日志架次摘要 | 模式/事件/链路异常段 |
| 2 | 轨迹/影像元数据 | 文件夹结构、POS 字段对照任务书 |
| 3 | 异常点 | row_id 链接手册/代码 |
| 4 | 报告 | [41](./41-customer-deliverable-template.md) 飞后章节 + 复盘清单 |
| 5 | 沉淀 | L5  anonymized 方法（无客户正文） |

**工程师认可点：** 每个异常点有 `source_file`+`page_or_line` 或标 `cannot_infer`。

---

## 4. 商务路径（客户可读）

```text
免费：synthetic 四文件链 + 方法（30 分钟）
  ↓
付费 A：CLI 接通 + 教学树（见 doc 32）
  ↓
付费 B：授权目录证据链 + 申请/任务对表（L2/L3）
  ↓
付费 C：多席位 + 日志/矩阵第二工作流（L4）
  ↓
长期：按架次/按项目的 L4 报告 + 用量订阅（不包审批）
```

| 阶段 | 客户买到什么 | 买不到什么 |
| ---- | ------------ | ---------- |
| 免费诊断 | 看懂指针化交付长什么样 | 该机已合规 |
| 试点 | 1–4 文件/日志范围内的表 | 无限 Token、全库扫描 |
| 长期 | 可重复的飞前/飞后复合交付 | 代运营、代飞、保证通过 |

话术：[31](./31-aviation-sales-scripts.md) · 首访：[30](./30-first-10-calls-battlecard.md)

---

## 5. 项目阶段 × 介入点矩阵

| 阶段 | Tokfai 介入 | 典型交付级别 |
| ---- | ----------- | ------------ |
| 投标/方案 | 资料体检、缺口清单 | L1 |
| 首次申请 | 驳回诊断、补件链 | L3 |
| 联试前 | 飞控/导航/链路证据 | L2 |
| 作业期 | 飞前检查表对表、飞后日志 | L2–L4 |
| 验收 | CUSTOMER_DELIVERABLE | L4 |
| 机队运维 | 排故知识库（本机） | L2 + 订阅 |

---

## 6. 工程师 SOP（一页）

1. **授权** → 只打开清单内路径。  
2. **Read** → 每条结论一行 EVIDENCE_ROW（[40](./40-evidence-row-schema.md)）。  
3. **禁止** → 无页码/无函数名的 FILE 结论。  
4. **控飞** → 任何实时控制需求直接拒绝，转客户飞控/运行人。  
5. **出站** → 只发 [41](./41-customer-deliverable-template.md)，不发源码。  
6. **升级** → 缺文件按 [35](./35-aviation-file-intake-checklist.md) 降级演示。  

---

## 7. 禁止事项（对客户与内部）

```text
武器化 / 攻击 / 伤害 / 规避监管 / 未授权飞行协助
实时控飞 / 代报 UOM / 保证审批通过
源码与密钥出站
把战争能力映射写成作战指导
```

```text
TOKFAI_UAV_OS=EVIDENCE_AND_REPORT_LAYER_ONLY
FLIGHT_AUTHORITY=CUSTOMER_OPERATOR_ONLY
```
