# 46 — UAV Extreme Environment Commercialization (P1274-R0)

```text
P1274-R0 / DOC-46
EXTREME ENV → COMMERCIAL DIAGNOSIS
FOR SALES + ENGINEERS — NO EMPTY CLAIMS
NO_WEAPONIZATION / NO_REGULATORY_EVASION
```

函数地图：[45-uav-mission-function-map.md](./45-uav-mission-function-map.md)  
交付链：[47-uav-function-to-tokfai-deliverable-chain.md](./47-uav-function-to-tokfai-deliverable-chain.md)

商业场景：巡检、测绘、电力、水利、矿山、农林、应急、低空物流、**城市治理**。

---

## 使用方式

每种环境一行诊断包：**risk → 系统 → 场景 → 证据 → 问诊 → Remediation 输出**。  
销售用于首访；工程师用于 EVIDENCE_ROW + [41](./41-customer-deliverable-template.md) 检查表。

---

## E1 高温

| 项 | 内容 |
| -- | ---- |
| **risk** | 电池/电调/计算机热节流；传感器漂移；限飞温度被突破仍作业 |
| **drone system affected** | F2 Energy、F1 Environment、F3 飞控（IMU/Baro） |
| **customer scenario** | 夏日电力巡检、矿山 midday 测绘、城市治理露天作业 |
| **file/log evidence** | 手册最高环境温度、BMS 温度保护参数、日志 `temp`/`throttle` 字段 |
| **diagnosis question** | 任务书允许温度区间是否 ≤ 手册？架次日志是否出现 thermal 相关模式/事件？ |
| **remediation output** | 限飞对照表；改作业时段 ADVICE；补手册页码指针；**不承诺**局方额外批准 |

---

## E2 低温

| 项 | 内容 |
| -- | ---- |
| **risk** | 容量骤降、电压 sag、凝露；启动自检失败 |
| **drone system affected** | F2、F1、F8 维护（贮存条件） |
| **customer scenario** | 北方农林 preseason、水利冬季监测、应急寒区 |
| **file/log evidence** | 贮存/预热 SOP、低温试验摘要、SOC 下降日志段 |
| **diagnosis question** | 是否有预热步骤且 SOP 与手册一致？低温架次是否同一构型/版本？ |
| **remediation output** | SOP↔手册步骤对照；版本一致性 row；补试验或改任务窗口建议 |

---

## E3 沙尘 / 粉尘

| 项 | 内容 |
| -- | ---- |
| **risk** | 视觉/激光退化、进气堵塞、散热变差 |
| **drone system affected** | F6 Payload（视觉）、F1、F3（若用视觉辅助） |
| **customer scenario** | 矿山、工地城市治理、农林粉剂环境 |
| **file/log evidence** | 载荷防护等级说明、清洁维护间隔、任务书环境描述 |
| **diagnosis question** | 采集设备是否有维护间隔在手册？任务环境是否声明粉尘等级？ |
| **remediation output** | 维护间隔指针；任务书补环境栏；载荷降级模式是否在代码/手册出现 |

---

## E4 强风

| 项 | 内容 |
| -- | ---- |
| **risk** | 姿态饱和、航线偏离、进近失败 |
| **drone system affected** | F3、F4、F7 |
| **customer scenario** | 海边电力、开阔测绘、物流起降场 |
| **file/log evidence** | 手册最大风速、风扰试验/HIL、日志 wind/模式切换 |
| **diagnosis question** | 申请/任务书风速上限是否超过手册？日志是否记录阵风段模式变化？ |
| **remediation output** | 风速限值 EVIDENCE_ROW；建议改窗口；飞控模式切换函数指针（若 Read 到） |

---

## E5 海边盐雾

| 项 | 内容 |
| -- | ---- |
| **risk** | 腐蚀、连接器故障、链路误码上升 |
| **drone system affected** | F5 Link、F8 Maintenance、结构/载荷（客户说明） |
| **customer scenario** | 海岸巡检、港口城市治理、近海测绘 |
| **file/log evidence** | 维护防腐章节、IP 等级、架次后检查单 |
| **diagnosis question** | 是否有盐雾区维护附加步骤？链路错误率是否在日志可对照？ |
| **remediation output** | 检查单缺口表；链路异常码↔手册；不替客户做防腐认证 |

---

## E6 山区 / 高海拔

| 项 | 内容 |
| -- | ---- |
| **risk** | 稀薄空气推力不足、GNSS 多路径、地形遮挡链路 |
| **drone system affected** | F2、F4、F5、F1（高度限制） |
| **customer scenario** | 矿山、水利库区、应急山区、测绘 DEM |
| **file/log evidence** | 高度-推力说明、RTK 基线方案、链路预算 PDF |
| **diagnosis question** | 任务最高点是否超过手册高度/推力包线？是否有备降点定义页？ |
| **remediation output** | 高度/航点对照；备降指针；RTK 方案栏位 vs ICD |

---

## E7 弱网 / 间歇连接

| 项 | 内容 |
| -- | ---- |
| **risk** | 指令延迟、丢包、误触发 RTH、动态数据中断 |
| **drone system affected** | F5 Link、F7 Mission（中断续作） |
| **customer scenario** | 低空物流超视距、偏远水利、城市峡谷 |
| **file/log evidence** | 链路超时参数、RTH 触发条件代码/手册、日志 `link_loss` 类字段 |
| **diagnosis question** | 丢链后行为在手册与代码是否同一描述？申请是否声明超视距能力？ |
| **remediation output** | 异常码处置链；能力声明↔模块 NOT_IN_FILE 表；**不教绕过监管通信要求** |

---

## E8 复杂电磁环境（商业合规语境）

| 项 | 内容 |
| -- | ---- |
| **risk** | 图传干扰、GNSS 偶发失效、误告警 — **合规运行风险** |
| **drone system affected** | F5、F4、F1（是否允许飞） |
| **customer scenario** | 城市治理、电力变电站附近、机场净空区**合法审批内**作业 |
| **file/log evidence** | 电磁兼容说明、禁飞/限制区申请、日志 GNSS 状态 enum |
| **diagnosis question** | 是否在批准空域/时段？手册是否要求特殊天线/地面站配置？ |
| **remediation output** | 申请材料↔手册配置指针；日志 GNSS 异常段摘要；禁止“抗干扰突防”类表述 |

---

## 销售速查（环境 → 第一句话）

| 环境 | 开场 |
| ---- | ---- |
| 高温 | 夏天作业窗口和手册最高温对得上吗？ |
| 弱网 | 丢链以后飞机按哪一页手册动作？有日志吗？ |
| 山区 | 任务最高点在不在推力/高度包线文件里？ |
| 城市治理 | 电磁和净空是审批材料问题，不是“飞控调参”问题 |

---

## 工程师输出模板（每环境 1 页）

```text
ENVIRONMENT_ID: E1–E8
EVIDENCE_ROWS: (≥2 or mark cannot_infer)
APPROVAL_RISK: H/M/L
REMEDIATION_TASKS: (owner + verify_method)
CUSTOMER_SCENARIO: (one line)
NOT_PROMISED: approval / flight authority
```

```text
EXTREME_ENV_PACK=DIAGNOSIS_ONLY
WEAPON_OR_EVASION=FORBIDDEN
```
