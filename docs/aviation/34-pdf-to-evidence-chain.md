# 34 — PDF to Evidence Chain (P1270-R0)

```text
P1270-R0 / DOC-34
EVIDENCE CHAIN FOR AVIATION ANSWERS
NO_SOURCE = NO_CLAIM
COMMON_SENSE ≠ FILE_CONCLUSION
TOKFAI_DOES_NOT_APPROVE_FLIGHTS=YES
```

分层字段：[33-pdf-precision-composite-map.md](./33-pdf-precision-composite-map.md)  
Gate：[05-regulatory-gate-model.md](./05-regulatory-gate-model.md) · [25](./25-certification-and-operation-chain.md)

---

## 1. 回答航飞问题时的证据链格式

每一条对客户可见的判断，必须能展开成下表一行（纪要不贴源码正文）。

```text
EVIDENCE_ROW
id:
claim:                 # 一句话结论
claim_class: FILE | SUMMARY | INFER | ADVICE
risk: R0 | R1 | R2     # R3 禁止作为 claim
file:                  # 文件名或相对路径
medium: PDF | DOCX | XLSX | CODE | SOP
page_or_cell:          # p.12 / Sheet1!B4 / —
section:               # 章/节标题原文或 NOT_IN_FILE
term:                  # 行业术语原词
function:              # 代码函数名或 —
approval_field:        # 申请表/UOM 栏位原名或 —
maps_to:               # 下一跳指针
customer_action:       # 可执行建议（ADVICE），非批准
```

多跳链用同一 `id` 前缀：`E-17a`（法规）→ `E-17b`（手册）→ `E-17c`（代码）→ `E-17d`（建议）。

**输出纪律**

- `FILE`：短引字段名/条号/函数名，并给出页码或路径。  
- `SUMMARY`：改写允许，但 `file`+`page_or_cell` 必填。  
- `INFER`：必须写清“从哪两跳推出来、缺哪边原文”。  
- `ADVICE`：用“建议你们核对/补材料”，**禁止**“局方会批/已符合 CCAR”。

---

## 2. 必填维度说明

| 维度 | 航飞为什么要 |
| ---- | ------------ |
| 文件名 | 构型管理；换一版 PDF 结论作废 |
| 页码 | 扫描件与电子版对审 |
| 章节 | 手册步骤 vs 附录表经常打架 |
| 术语 | “适航证”≠“运营合格证”；禁止近义替换当原文 |
| 函数 | 飞控验收只认路径+符号 |
| 审批字段 | 申请退回几乎都是栏位级 |
| 风险等级 | 让适航/商务知道哪句能上会 |

缺页码的 PDF：标 `page=UNKNOWN`，`risk` 至少 R2，不得当 R0。

---

## 3. 示例：UOM 条款 → 飞控函数 → 客户建议

**这是方法示例。** 条款指针指向客户**本机打开的**法规/手册页；函数名来自 **synthetic 教学链** 或客户授权代码。不得把教学函数写成某 OEM 事实。

### 3.1 假设客户问题

> 动态数据报不上去，是不是飞控没做？申请表也填了“具备报送能力”。

### 3.2 证据链（示意，无源码、无密钥）

| id | claim_class | file / locator | term / function / approval_field | claim |
| -- | ----------- | -------------- | -------------------------------- | ----- |
| E-1 | FILE | `CCAR或UOM手册.pdf` p.? 节“飞行动态数据” | term=`飞行动态数据` | 手册要求运行中向平台报送动态数据（**条号以打开页为准**） |
| E-2 | FILE | `申请表.xlsx` `能力清单!C12` | approval_field=`具备动态数据报送` | 客户填“是” |
| E-3 | FILE | `…/ControlLaw/txg_control_task.c` | function=`attitude_control_entry` | 教学/授权树中存在姿态入口（**与报送不是同一函数**） |
| E-4 | INFER | E-1 + E-3 | maps_to=通信/UOM 适配模块 **未在本范围** | 姿态链存在 ≠ 动态数据模块存在 |
| E-5 | ADVICE | — | customer_action | 建议：把申请表该栏改指向实际 ICD/报送模块路径；四文件飞控链不能当报送证据；缺模块则改表或补工程 |

调用链形态（仅当本场范围包含这些文件时填写 E-3 类）：

```text
attitude_control_entry → rotor_law_update → control_allocation → actuator_command_write
```

此链回答的是**控制分配到执行器**，不是 UOM 报送。混为一谈 = 无来源判断。

### 3.3 正确的客户可执行建议（ADVICE 模板）

1. 打开申请表该单元格，记下栏位**原文**。  
2. 在手册/ICD 里 Search 同一栏位名；没有则写 `NOT_IN_FILE`。  
3. 若只有飞控 ControlLaw：明确告诉甲方“本包证明的是姿态–分配–执行器，不证明动态数据”。  
4. 补证据：通信/地面站/UOM 适配代码或接口文档路径。  
5. **不要**在未补证据前对局方声称已具备报送。

---

## 4. 禁止无来源判断

| 禁止 | 正确做法 |
| ---- | -------- |
| “一般都要报 UOM”当该项目结论 | 打开该客户适用文本，写出条号+页 |
| “分配肯定在 control_allocation” | Read 到再写；否则 `NOT_IN_FILE` |
| “有 TC 就能飞” | 拆 TC/PC/AC/OC/空域，各给指针 |
| 用模型记忆的 CCAR 年份 | 以客户提供的现行 PDF 页为准 |
| 把 SOP 口头习惯当手册 | 对不到文件则 R3，删除结论 |

行业常识可以出现在 `ADVICE` 的“建议核对清单”，且必须写：`未在本次打开的文件中证实`。

---

## 5. 问答包装（给模型/工程师的系统约束）

```text
1. 先列本次打开的文件清单（名，不贴正文）。
2. 每条 claim 带 EVIDENCE_ROW 必填项。
3. 跨介质映射：两边都有 locator，缺一边则 INFER 或停止。
4. 飞控函数不得从法规条款“脑补”出来。
5. 法规义务不得从函数名“脑补”出来。
6. 结尾区分：FILE 事实 / INFER / ADVICE。
7. 任何审批结果句直接删除。
```

与演示 SOP 一致：固定范围、分段、工具记录优先于“我已阅读”。
