# 样例 — 证据链 Demo 结构化输出（P1276 运行时验证）

```text
P1276-R0 / RUNTIME_VERIFICATION_OUTPUT
INPUTS=demo/sample-flight-approval-rejection.md
       demo/sample-uav-device-params.md
       demo/sample-flight-log-excerpt.md
SYNTHETIC_ONLY=YES
APPROVAL_GUARANTEE=NO
```

本文件演示：客户材料 → 提取字段 → 风险 → 缺口 → 补件建议 → Tokfai 可交付项。  
**不是**真实客户项目结论。

---

## 1. 原始材料来源

| ID | 文件 | 类型 | 用途 |
| -- | ---- | ---- | ---- |
| S1 | [sample-flight-approval-rejection.md](./sample-flight-approval-rejection.md) | 审批驳回意见（合成） | R-类分型 |
| S2 | [sample-uav-device-params.md](./sample-uav-device-params.md) | 设备参数表（合成） | 限值指针 |
| S3 | [sample-flight-log-excerpt.md](./sample-flight-log-excerpt.md) | 飞控日志摘录（合成） | 架次异常 |

---

## 2. 提取字段

| row | source | page_or_line | original_text / field | extracted_term |
| --- | ------ | ------------ | --------------------- | -------------- |
| E-01 | S1 | 意见 1 | 飞行区域描述不清晰 | 空域范围 |
| E-02 | S1 | 意见 2 | 应急程序附件缺失 | 应急程序 |
| E-03 | S1 | 意见 3 | 风速 10 m/s 与说明 8 m/s 不一致 | 最大风速 |
| E-04 | S2 | ENV-WMAX | 8 m/s | ENV-WMAX |
| E-05 | S2 | ENV-TMAX | 45 °C | ENV-TMAX |
| E-06 | S2 | BAT-DEGR | 300 次后容量≤80% | 电池衰减 |
| E-07 | S3 | 06:33:19 | GNSS_DEGRADED | gnss_fix |
| E-08 | S3 | 06:34:05 | LINK_LOSS | link |
| E-09 | S3 | route_file | demo_route_v1.csv | 任务航线 |
| E-10 | S1 | 意见 4 | 动态数据报送…未附说明 | UOM-DYN |

---

## 3. 风险点

| 风险 ID | 等级 | 描述 | 证据 row |
| ------- | ---- | ---- | -------- |
| R-01 | H | 申请风速能力高于设备表 ENV-WMAX | E-03, E-04 |
| R-02 | H | 应急程序栏空且退回点名 | E-02 |
| R-03 | M | 架次 winds 超 8 m/s 且出现 WIND_WARN | E-04, S3 |
| R-04 | M | 高温 41–43°C 接近 ENV-TMAX 45 | E-05, S3 |
| R-05 | M | GNSS 降级 + 丢链 RTH，需手册对照 | E-07, E-08 |
| R-06 | M | 动态数据报送勾选与 ICD 索引缺失 | E-10 |
| R-07 | L | 电池循环衰减维护提示（未证本次架次违规） | E-06 |

---

## 4. 缺失材料

| 缺口 | 状态 | 说明 |
| ---- | ---- | ---- |
| 空域 polygon/KML 与申请一致附件 | NONE | 退回意见 1 |
| 应急程序手册节/附件 | NONE | 退回意见 2 |
| 动态数据 ICD 或模块说明 | NONE | 退回意见 4 |
| 运行手册 GNSS 降级处置页 | NOT_IN_DEMO | 需客户授权 PDF |
| 运行手册丢链 RTH 页（如 p.40） | NOT_IN_DEMO | 需客户授权 PDF |
| 低温/预热 SOP（若冬季作业） | NOT_APPLICABLE | 本架次为高温 |

---

## 5. 驳回可能原因（材料层归纳，非局方决定）

| R-类 | 与样例退回对应 |
| ---- | -------------- |
| R-AIR | 空域描述不清（E-01） |
| R-EMG | 应急程序缺失（E-02） |
| R-EQP / R-FMT | 风速声明与设备表不一致（E-03, E-04） |
| R-UOM | 动态数据证明不足（E-10） |
| R-FMT | 操控员信息（S1 意见 5，未展开 row） |

---

## 6. 建议补充材料

| 序号 | 动作 | 责任人（客户侧） |
| ---- | ---- | ---------------- |
| 1 | 补空域范围：polygon 或半径+真高，与 [demo_route_v1.csv] 一致说明 | 运行 |
| 2 | 附运行手册「应急处置」节页码，并回填申请【应急程序】栏 | 运行+合规 |
| 3 | 将申请最大风速改为 **≤8 m/s** 或与设备说明一致 | 运行 |
| 4 | 附动态数据 ICD 索引或通信模块说明路径 | 工程 |
| 5 | 架次复盘：06:33–06:34 GNSS/LINK 事件对照手册处置步骤 | 机务 |
| 6 | 若夏季作业：任务窗口避开 temp>40°C 时段（对照 ENV-TMAX） | 调度 |

---

## 7. Tokfai 可交付项（若为本机授权试点）

| 交付物 | 对应档（见 doc 50） |
| ------ | ------------------- |
| EVIDENCE_ROW 全表（如上扩展） | B |
| 材料缺口 + 整改清单 | B |
| 环境/通信/任务检查表（41 模板节） | B |
| 飞前/飞后日志对照摘要 | B 或 C |
| CLI 方法演示（synthetic 四文件链） | 免费/A |

**不包含：** 代报 UOM、改飞控代码、实时控飞。

---

## 8. 不承诺审批通过声明

```text
本输出为合成 Demo 运行时验证结果，用于展示 Tokfai 证据链交付格式。
不构成对任何主管机关批准结果的预测或保证。
客户真实项目须以授权文件与书面许可为准。
Tokfai 仅提供材料整理、证据指针、风险诊断与补件建议。
```

```text
TOKFAI_P1276_DEMO_RUNTIME_VERIFICATION=PASS
EVIDENCE_ROWS=10
RISK_ITEMS=7
GAP_ITEMS=6
```
