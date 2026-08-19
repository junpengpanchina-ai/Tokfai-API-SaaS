# 36 — Approval Rejection Diagnosis Map (P1271-R0)

```text
P1271-R0 / DOC-36
REJECTION = MATERIAL RISK DIAGNOSIS + REMEDIATION ADVICE
NOT = GUARANTEE OF APPROVAL
TOKFAI_DOES_NOT_SUBMIT_TO_UOM=YES
TOKFAI_DOES_NOT_APPROVE_FLIGHTS=YES
SOURCE_STAYS_LOCAL=YES
```

配套：[37-rejection-to-evidence-remediation-chain.md](./37-rejection-to-evidence-remediation-chain.md) · [38-rejection-diagnosis-intake-playbook.md](./38-rejection-diagnosis-intake-playbook.md)  
根因枚举：[06-why-cannot-fly-taxonomy.md](./06-why-cannot-fly-taxonomy.md) · 证据链：[34-pdf-to-evidence-chain.md](./34-pdf-to-evidence-chain.md)  
资料分层：[33-pdf-precision-composite-map.md](./33-pdf-precision-composite-map.md)

**诊断包** = 把退回意见、申请表、UOM/手册、任务计划、飞控/设备证据串成可交付的补件清单。  
**不是**替客户重新填 UOM、不是保证下批通过。

---

## 1. 被驳回类型分层（内部诊断码）

退回短信/平台意见往往混说。先拆 **R-类**，再映射 [06](./06-why-cannot-fly-taxonomy.md) Gate。

| 码 | 类型 | 常见退回表述（示意） | 典型 Gate |
| -- | ---- | -------------------- | --------- |
| R-DOC | 文件不完整 / 缺附件 | 材料不全、请补充 | G9 / EVIDENCE_INCOMPLETE |
| R-AIR | 空域描述不清 | 空域范围不明、高度不符 | G8 |
| R-MSN | 任务边界不清 | 任务性质不清、超申请范围 | G9 / G10 |
| R-CREW | 人员资质不足 | 操控员/运行人资质 | G4 / G5 |
| R-EQP | 设备/飞控能力证明不足 | 能力无法核实、设备参数 | G3 / G7 / G9 |
| R-EMG | 应急预案不足 | 无应急处置、无返航迫降说明 | G9 EMERGENCY_PROCEDURE_GAP |
| R-INS | 保险/责任链不清 | 未投保、主体不一致 | G6 / G2 |
| R-FMT | 格式/字段错误 | 填报错误、字段缺失 | APPLICATION_FORMAT_GAP |
| R-UOM | 平台/动态数据/识别 | 报送失败、识别不符 | G7 |
| R-LOC | 地方协调/场地 | 需当地证明、主办方 | LOCAL_COORDINATION_GAP |
| R-AW | 适航/证件类 | 无适航证、证件不符 | G3 |
| R-UNK | 无法归类 | 需客户补原文 | UNKNOWN |

同一单可同时 R-DOC + R-AIR + R-EMG。**诊断输出按 R-类分行**，不合并成“材料有问题”一句。

---

## 2. 每类问题：要检查哪些文件

| R-类 | 必查文件（客户本机） | 重要交叉 | 可选 |
| ---- | -------------------- | -------- | ---- |
| R-DOC | 退回意见全文、申请书、附件清单 | UOM 填报截图（脱敏） | 历次提交版本对比 |
| R-AIR | 申请书空域/高度栏、航图或 KML 说明、运营规范空域段 | 适飞/管制查询记录 | 地方空域批复 |
| R-MSN | 任务计划、运行手册任务章节、载荷说明 | 合同/甲方任务书 | 风险缓解说明 |
| R-CREW | 操控员执照、培训记录、运行人资质 | 运营合格证及规范 | 第三方用工协议 |
| R-EQP | 设备说明、飞控版本说明、能力自证表 | ≤4 个 ControlLaw 源文件 | 试验/HIL 摘要 |
| R-EMG | 手册应急章、任务计划应急段、SOP | C2 丢失处置 | 应急演练记录 |
| R-INS | 保单、被保人主体、运行人法人 | 登记主体 | 分包责任说明 |
| R-FMT | 平台字段说明、Excel 模板、填写实例 | UOM 操作手册 | — |
| R-UOM | ICD/字段表、通信模块说明、识别配置 | 动态数据相关代码路径 | 联调记录 |
| R-LOC | 场地许可、主办方函、地方协调件 | 活动方案 | — |
| R-AW | TC/PC/AC/特许飞行证复印件（客户自有） | 构型说明 | 过渡特殊适航路径材料 |

无退回原文：只能做 **R-UNK 问诊**，不能猜驳回类型。

---

## 3. 每类问题：Tokfai 能输出什么诊断结果

输出类型固定为 **诊断与补件建议**，禁止“会批/已符合”。

| R-类 | 可交付诊断结果 | 不可交付 |
| ---- | -------------- | -------- |
| R-DOC | 缺件对照表：退回句 ↔ 应有附件 ↔ 是否在本机找到 | 代客户上传 UOM |
| R-AIR | 空域/高度/时间三边界拆分表 + 申请书栏位缺口 | 保证该空域可飞 |
| R-MSN | 任务边界四象限（见 [37](./37-rejection-to-evidence-remediation-chain.md)） | 替客户改任务性质 |
| R-CREW | 资质栏位 ↔ 证照文件指针；主体是否一致 | 判定执照有效（局方事项） |
| R-EQP | 申请表能力声明 ↔ 手册/代码/试验指针；`NOT_IN_FILE` 列 | 编造飞控能力 |
| R-EMG | 应急义务指针 ↔ 手册/计划/SOP 是否覆盖 | 写正式应急手册定稿 |
| R-INS | 保单字段 ↔ 运行人/机主一致性检查 | 代投保 |
| R-FMT | 字段名级错误清单 | 保证平台一次过 |
| R-UOM | 字段 ↔ ICD/模块路径线索 | 保证报送成功 |
| R-LOC | 地方件缺口清单 | 替客户跑地方协调 |
| R-AW | 证件类型混淆表（TC/AC/OC 等） | 保证取证 |

技术路径：客户本机 Codex CLI Read PDF/Word/Excel/代码；Tokfai 路由模型；纪要只留**文件名、页码、栏位、函数名**。

演示默认：**退回意见（若客户提供）+ synthetic 飞控链** 说明“能力证明”方法，不把教学函数写成该机能力。

---

## 4. 诊断包三层交付物

```text
L1 驳回分型表     — R-类 + Gate + 退回原句（短引）
L2 证据定位表     — EVIDENCE_REMEDIATION_ROW（见 doc 37）
L3 补件行动单     — 动作 + 责任人 + 复核方式（非批准承诺）
```

可销售名称：**航飞审批材料风险诊断**（不是“代办审批”）。

---

## 5. 与「飞不了」taxonomy 对照

| 客户说 | 先查 R-类 | 再查 06 ID |
| ------ | --------- | ---------- |
| 申请被退 | 退回原文 | FLIGHT_APPLICATION_REJECTED |
| 能报不能批空域 | R-AIR | AIRSPACE_RESTRICTION |
| 说飞控不行 | R-EQP | 可能 C2/NAV/EMG，勿默认代码 bug |
| 运营证问题 | R-CREW / R-AW | OPERATOR / AIRWORTHINESS |

---

## 6. 禁止承诺

```text
禁止：保证审批通过 / 保证下次 UOM 绿 / 代提交 / 代签章
禁止：无退回原文就定 R-类
禁止：用行业常识填“局方要什么”
禁止：飞控教学链 = 客户已具备报送/应急/空域能力
禁止：输出源码正文、密钥、canary
```

Tokfai 价值：**把退回意见翻译成可执行的补件与证据指针**，缩短客户与适航/运行/飞控之间的对齐时间。

```text
TOKFAI_OUTPUT_CLASS=MATERIAL_RISK_DIAGNOSIS_AND_REMEDIATION_ADVICE_ONLY
APPROVAL_GUARANTEE=NO
```
