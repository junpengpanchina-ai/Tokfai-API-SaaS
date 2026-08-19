# 45 — UAV Mission Function Map (P1274-R0)

```text
P1274-R0 / DOC-45
FUNCTION-LEVEL REVERSE ENGINEERING (COMMERCIAL)
NO_WEAPONIZATION / NO_FLIGHT_CONTROL / NO_REGULATORY_EVASION
EVIDENCE_POINTER_OUTPUT_ONLY
```

环境商用化：[46-uav-extreme-environment-commercialization.md](./46-uav-extreme-environment-commercialization.md)  
交付链：[47-uav-function-to-tokfai-deliverable-chain.md](./47-uav-function-to-tokfai-deliverable-chain.md)  
前置：[42-uav-war-to-commercial-system-map.md](./42-uav-war-to-commercial-system-map.md) · [43-commercial-uav-precision-stack.md](./43-commercial-uav-precision-stack.md)

**反推逻辑：** 高可靠无人系统在**极端环境、弱网、失联压力**下仍要完成**合法任务闭环**的工程函数 → 商业精密无人机在巡检/测绘/电力/水利/矿山/农林/应急/低空物流/城市治理中需要的**同等函数**，用客户文件与日志验证，而非战术叙述。

Tokfai：**资料解析、任务规划辅助、日志复盘、证据链交付**；不直接控飞、不武器化。

---

## F1 — Environment Function

| 维度 | 内容 |
| ---- | ---- |
| **function purpose** | 感知并约束运行环境（温湿度、风、尘、盐雾、海拔），决定是否允许起飞/降级/终止 |
| **battlefield-grade pressure source** | 宽温域、快速温变、沙尘遮挡、强风扰动 — **任务持续性与设备保护**（非作战效果） |
| **commercial precision equivalent** | 电力/矿山/海边/高原作业的环境限飞表；城市治理扬尘区作业窗口 |
| **customer file evidence** | 环境限制章节（手册 PDF）、任务书气象条件、试验环境大纲 |
| **Tokfai parse fields** | `source_file`, `page_or_line`, `original_text`（限飞温/风速阈值原文）, `extracted_term` |
| **Tokfai output** | 环境限值指针表；任务书条件 vs 手册是否一致；缺口 REMEDIATION_TASK |

---

## F2 — Energy Function

| 维度 | 内容 |
| ---- | ---- |
| **function purpose** | 电量/油量/功率预算、BMS 健康、低能量返航与负载降额 |
| **battlefield-grade pressure source** | 长航时、低温容量衰减、高负载 — **续航与功率管理** |
| **commercial precision equivalent** | 物流航线能耗预算、农林大载荷喷洒、测绘长航线 |
| **customer file evidence** | BMS/动力 `.c`、能量管理策略 PDF、架次日志 SOC 曲线 |
| **Tokfai parse fields** | 低电阈值参数名、降额函数路径、`related_code_or_parameter` |
| **Tokfai output** | 能量策略函数指针；日志 SOC 异常段 ↔ 模式字段；不判电池合格 |

---

## F3 — Flight Control Function

| 维度 | 内容 |
| ---- | ---- |
| **function purpose** | 姿态/轨迹稳定、控制分配、执行器输出、模式切换与 FDIR |
| **battlefield-grade pressure source** | 强扰动下仍保持可控 — **稳定性与降级** |
| **commercial precision equivalent** | 精密测绘姿态 hold、电力近塔风扰、物流进近 |
| **customer file evidence** | ControlLaw 源文件、HIL 姿态/分配科目、Release Note |
| **Tokfai parse fields** | 函数名、信号名、行号；合成链仅作形态演示 |
| **Tokfai output** | 入口→律→分配→执行器路径表（[40](./40-evidence-row-schema.md)）；`NOT_IN_FILE` 列 |

---

## F4 — Navigation Function

| 维度 | 内容 |
| ---- | ---- |
| **function purpose** | 定位、航点跟踪、高度/速度约束、备降/返航点 |
| **battlefield-grade pressure source** | GNSS 拒止/弱信号下的**安全续行或终止**（商业语境：遮挡、多路径，非对抗战术） |
| **commercial precision equivalent** | 矿山/山区 RTK、城市峡谷测绘、水利 corridor |
| **customer file evidence** | 导航模块代码、航点文件格式、试飞精度报告 |
| **Tokfai parse fields** | 坐标系/融合模式枚举、航点字段名、手册导航节页码 |
| **Tokfai output** | 任务航点 ↔ 导航接口对照；备降逻辑是否有文件指针 |

---

## F5 — Link Function

| 维度 | 内容 |
| ---- | ---- |
| **function purpose** | 上下行链路、心跳、丢链检测、降级与 RTH 触发 |
| **battlefield-grade pressure source** | 弱网、长距离、间歇连通 — **链路可靠与失联处置** |
| **commercial precision equivalent** | 超视距物流、水利/矿山远距、城市治理多楼遮挡 |
| **customer file evidence** | 通信 ICD、地面站手册、链路日志、UOM 动态数据字段 |
| **Tokfai parse fields** | 异常码原文、超时参数、字段名 |
| **Tokfai output** | 异常码↔手册处置步骤 EVIDENCE_ROW；申请“报送能力”↔模块路径 |

---

## F6 — Payload Function

| 维度 | 内容 |
| ---- | ---- |
| **function purpose** | 载荷驱动、触发时序、云台/喷洒/传感器协同 |
| **battlefield-grade pressure source** | 任务窗口内可靠采集/投送 — **载荷任务完成度**（民用采集/喷洒，非武器） |
| **commercial precision equivalent** | 测绘触发、电力红外、农林喷洒、应急侦察影像 |
| **customer file evidence** | 载荷 ICD、驱动路径、POS 规范、任务书采集要求 |
| **Tokfai parse fields** | 触发 API、模式 enum、任务书栏位 |
| **Tokfai output** | 采集要求↔载荷配置指针；缺失则补件建议 |

---

## F7 — Mission Function

| 维度 | 内容 |
| ---- | ---- |
| **function purpose** | 任务分解、时序、区域/高度/时段、检查单与完成判定 |
| **battlefield-grade pressure source** | 复杂约束下**一次规划多次执行可重复** |
| **commercial precision equivalent** | 政企巡检包、测绘块、物流 SLA、城市治理工单 |
| **customer file evidence** | 任务 Word、申请 Excel、SOP、合同技术附件 |
| **Tokfai parse fields** | 栏位原名、任务 ID、边界短引 |
| **Tokfai output** | 四边界表；与审批材料一致性；任务规划**辅助**（不替客户填非法空域） |

---

## F8 — Maintenance Function

| 维度 | 内容 |
| ---- | ---- |
| **function purpose** | 构型/版本、定检、故障码、架次限制、飞后复盘入库 |
| **battlefield-grade pressure source** | 高出动率下的**可维护性与状态可追溯** |
| **commercial precision equivalent** | 机队运维、培训校、物流多机队 |
| **customer file evidence** | 维护手册、工单、日志 version 字段、试验构型说明 |
| **Tokfai parse fields** | 构型号、版本字符串、检查单步骤号 |
| **Tokfai output** | 架次版本一致性表；复盘 REMEDIATION；L5 方法沉淀（无客户正文） |

---

## 函数依赖（反推顺序）

```text
F1 Environment + F2 Energy  → 能否启动/续行
F5 Link + F4 Navigation     → 能否在范围内完成
F3 Flight Control           → 能否稳定执行
F6 Payload + F7 Mission     → 能否交付作业结果
F8 Maintenance              → 能否持续运行与复盘
```

---

## Tokfai 边界（全文适用）

```text
不直接控飞 | 不武器化 | 不规避监管 | 不保证审批
只做：资料解析、任务规划辅助、日志复盘、证据链与报告（[41](./41-customer-deliverable-template.md)）
```

```text
TOKFAI_P1274_MISSION_FUNCTION_MAP=COMMERCIAL_ONLY
```
