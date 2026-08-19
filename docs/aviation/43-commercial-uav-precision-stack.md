# 43 — Commercial UAV Precision Stack (P1273-R0)

```text
P1273-R0 / DOC-43
COMMERCIAL HIGH-PRECISION UAV TECH STACK
DELIVERY CHECKLIST STYLE — NO VAGUE MARKETING
```

系统地图：[42-uav-war-to-commercial-system-map.md](./42-uav-war-to-commercial-system-map.md)  
证据行：[40-evidence-row-schema.md](./40-evidence-row-schema.md)

每层：**核心组件 → 客户文件常见证据 → Tokfai 可解析字段 → 可输出结论**（须指针，非适航批准）。

---

## L-A 飞控（Flight Control）

| 项 | 内容 |
| -- | ---- |
| **核心组件** | 姿态环、位置环、控制分配、执行器输出、模式状态机、FDIR 降级 |
| **常见证据** | `ControlLaw/**/*.c`、分配矩阵配置、HIL 报告姿态/分配科目、Release Note 飞控版本 |
| **Tokfai 解析字段** | `source_file`, `page_or_line`/行号, `extracted_term`（函数/信号）, `related_code_or_parameter` |
| **可输出结论** | “入口→分配→执行器”路径表；模式切换函数是否存在；**NOT_IN_FILE** 列；不输出“飞控合格” |

---

## L-B 导航（Navigation）

| 项 | 内容 |
| -- | ---- |
| **核心组件** | GNSS/RTK、IMU 融合、航点跟踪、高度/速度约束、备降逻辑 |
| **常见证据** | 导航 `.c/.h`、航点文件格式说明、任务 KML/CSV、试飞导航精度段 |
| **Tokfai 解析字段** | 接口名、坐标系枚举、航点字段名、手册“导航模式”节+页码 |
| **可输出结论** | 任务航点字段 ↔ 导航模块接口是否同名；返航/备降是否在手册有页码指针 |

---

## L-C 感知（Perception / Payload Sensing）

| 项 | 内容 |
| -- | ---- |
| **核心组件** | 相机/激光/红外驱动、云台控制、触发时序、避障（若民用公开） |
| **常见证据** | 载荷 ICD、驱动源码路径、标定 PDF、测绘 POS 规范 |
| **Tokfai 解析字段** | 触发 API、时间戳字段、载荷模式枚举 |
| **可输出结论** | 任务书“采集要求”↔载荷配置指针；缺失则 REMEDIATION_TASK |

---

## L-D 通信（Comms / C2）

| 项 | 内容 |
| -- | ---- |
| **核心组件** | 地面站链路、遥测下行、指令上行、动态数据报送、识别配置 |
| **常见证据** | 通信协议栈路径、地面站手册、UOM 字段表、链路丢包日志 |
| **Tokfai 解析字段** | 异常码原文、ICD 字段名、心跳/超时参数名 |
| **可输出结论** | 日志异常码 ↔ 手册处置步骤（FILE）；申请“具备报送”↔模块路径是否 EMPTY |

---

## L-E 任务（Mission / Ops）

| 项 | 内容 |
| -- | ---- |
| **核心组件** | 任务计划、区域/高度/时段、载荷作业序列、检查单 |
| **常见证据** | 任务 Word、申请 Excel、SOP、合同技术附件 |
| **Tokfai 解析字段** | 栏位原名、任务 ID、边界描述短引 |
| **可输出结论** | 四边界表（任务/空域/时间/人员）；与 [36](./36-approval-rejection-diagnosis-map.md) R-MSN/R-AIR 对齐 |

---

## L-F 数据（Data / Logs）

| 项 | 内容 |
| -- | ---- |
| **核心组件** | 飞参记录、事件标记、影像元数据、版本/构型号 |
| **常见证据** | 架次日志、试验 Excel、影像文件夹 README、DB 导出样本 |
| **Tokfai 解析字段** | 时间戳、模式字段、事件 enum、软件 version 字符串 |
| **可输出结论** | 异常时间段 ↔ 模式/事件字段；版本是否与申报构型一致（指针级） |

---

## L-G 安全（Safety / Compliance）

| 项 | 内容 |
| -- | ---- |
| **核心组件** | 登记、保险、运营资质、空域批准、应急程序、责任链 |
| **常见证据** | 申请 PDF、保单、执照、手册应急章、退回意见 |
| **Tokfai 解析字段** | `original_text` 短引、Gate 映射、approval_risk H/M/L |
| **可输出结论** | 材料缺口表、驳回分层；**不承诺**下批通过 |

---

## L-H 交付（Delivery / Customer Pack）

| 项 | 内容 |
| -- | ---- |
| **核心组件** | EVIDENCE_ROW 集、CUSTOMER_DELIVERABLE、整改清单、飞后报告 |
| **常见证据** | 前述各层文件的索引汇总 |
| **Tokfai 解析字段** | `row_id`, confidence, cannot_infer_flag |
| **可输出结论** | [41-customer-deliverable-template.md](./41-customer-deliverable-template.md) 全套；L4 交付 |

---

## 栈间依赖（工程交付顺序）

```text
L-G 安全（能否合法开展）
  → L-E 任务（边界）
  → L-A/L-B/L-D（飞控/导航/链路证据）
  → L-C/L-F（载荷/数据）
  → L-H（报告与复盘）
```

---

## 场景快速索引

| 场景 | 优先层 |
| ---- | ------ |
| 电力巡检 | E → A → C → F → H |
| 测绘 | E → B → C → F → H |
| 低空物流 | G → E → A → D → G |
| 农林 | G → E → A → C → F |
| 应急 | G → E → D → F → H |

```text
OUTPUT_RULE=POINTER_AND_GAP_TABLES
EMPTY_FILE_CLAIM=FORBIDDEN
```
