# 33 — Aviation PDF Precision Composite Map (P1270-R0)

```text
P1270-R0 / DOC-33
NOT GENERIC RAG
COMPOSITE = file evidence + aviation terms + approval/FC/ops mapping
TOKFAI_EXECUTES_LOCAL_TOOLS=NO
SOURCE_STAYS_LOCAL=YES
NO_APPROVAL_PROMISE=YES
```

配套：[34-pdf-to-evidence-chain.md](./34-pdf-to-evidence-chain.md) · [35-aviation-file-intake-checklist.md](./35-aviation-file-intake-checklist.md)  
准入：[25-certification-and-operation-chain.md](./25-certification-and-operation-chain.md)  
工作流：[26-ai-workflow-for-aviation-customers.md](./26-ai-workflow-for-aviation-customers.md)

**精密复合化** = 把 PDF / Word / Excel / 代码当作**同一条证据链上的不同介质**，不是把全文切块丢进向量库后自由作文。

Tokfai 只做模型路由、计费、安全日志。本机 Read 由 Codex CLI 执行。客户文件不出门。

---

## 1. 资料类型分层

| 层 | 典型介质 | 谁产生 | 复合化目的 |
| -- | -------- | ------ | ---------- |
| L1 政策法规 | PDF（CCAR、条例、AC、GB 摘要） | 局方 / 标准委 | 条款号、生效日、适用范围 |
| L2 UOM / 操作手册 | PDF、网页导出、Word | 平台 / 主机厂 / 运行人 | 字段、流程步骤、禁止项 |
| L3 审批材料 | Word/PDF 申请书、Excel 清单 | 运行人 / 承建方 | 表格字段 vs 实际能力 |
| L4 飞控代码 | `.c` / `.h` / 生成代码 | 飞控组 | 函数、信号、调用链 |
| L5 测试报告 | PDF/Word + Excel 记录 | 试验室 / 试飞 | 科目 ID、版本、超差 |
| L6 客户 SOP | Word/PDF 检查单 | 机务 / 教务 | 步骤与机载模式是否一致 |
| L7 销售材料 | PPT/PDF | 商务 | **不得**当法规或代码证据 |

L7 只能当“客户怎么对外说”；与 L1–L6 冲突时，以 L1/L3/L4/L5 为准并标冲突。

---

## 2. 每类要抽取的字段（结构化，不贴正文）

### L1 政策法规

| 字段 | 说明 |
| ---- | ---- |
| `source_id` | 内部来源号或官方文号 |
| `title` | 文件名 |
| `clause` | 条/款/项 |
| `page` | 页码（扫描件也要页） |
| `effective` | 生效 / 过渡截止 |
| `scope` | 适用航空器类 / 运行类 |
| `obligation` | 应当 / 不得 / 可以 |
| `gate` | 映射 G0–G11（内部，标 `INTERPRETATION`） |

### L2 UOM / 操作手册

| 字段 | 说明 |
| ---- | ---- |
| `procedure` | 登记 / 申请 / 动态数据 / 识别 |
| `ui_or_api_field` | 平台字段名（原文） |
| `required` | 必填 / 条件必填 |
| `actor` | 运行人 / 操控员 / 系统 |
| `fail_symptom` | 退回常见表述（若手册有） |

### L3 审批材料

| 字段 | 说明 |
| ---- | ---- |
| `form_field` | 申请表栏位原文 |
| `claimed_capability` | 客户填写值 |
| `evidence_ptr` | 应指向的手册章节、代码函数或试验科目 |
| `gap` | 有填写无证据 / 有证据无填写 |

### L4 飞控代码

| 字段 | 说明 |
| ---- | ---- |
| `path` | 仓库相对路径 |
| `function` | 函数名 |
| `caller` / `callee` | 调用关系 |
| `signal_in` / `signal_out` | 仅文件中出现的名字 |
| `mode` | 若文件有飞行模式枚举 |

合成教学链仅作形态：`attitude_control_entry` → `rotor_law_update` → `control_allocation` → `actuator_command_write`。客户符号以 Read 为准。

### L5 测试报告

| 字段 | 说明 |
| ---- | ---- |
| `subject_id` | 大纲科目 |
| `sw_version` | 软件/构型号 |
| `result` | 通过 / 超差 / 中止 |
| `timestamp` | 记录时间 |
| `link_fn` | 应对照的函数或模块路径 |

### L6 客户 SOP

| 字段 | 说明 |
| ---- | ---- |
| `step_no` | 步骤号 |
| `action` | 操作原文摘要（可短引，见 §4） |
| `related_mode` | 手册中的模式名 |

### L7 销售材料

| 字段 | 说明 |
| ---- | ---- |
| `claim` | 宣传句 |
| `conflict_with` | 指向 L1/L3/L4 哪条 |

---

## 3. PDF / Word / Excel / 代码如何互映射

```text
L1 条款 (PDF p.N / 第X条)
    → L2 手册步骤 / UOM 字段 (Word 节 Y)
        → L3 申请表单元格 (Excel 列 Z)
            → L4 函数路径 (code)
                → L5 科目与记录 (PDF+xlsx)
                    → L6 SOP 步骤
L7 宣传句 ──冲突检测──► 以上任一层
```

| 从 | 到 | 连接键 |
| -- | -- | ------ |
| PDF 条款 | Word 手册 | 术语原词（如“动态数据”“运营合格证”） |
| 手册字段 | Excel 申请表 | **完全相同的栏位名**；别名必须单列“推断” |
| 申请能力 | 代码 | 客户自己的需求 ID 或接口名；禁止用教学函数名冒充 OEM |
| 代码 | 试验 | 版本哈希 / 科目 ID / 时间戳 |
| 试验 | SOP | 超差处置步骤号 |

**复合单元（一行证据）最少包含：**

```text
medium | filename | page_or_cell_or_path | locator (clause/fn/field) | quote_or_name | maps_to | risk
```

向量检索只允许用来**找候选页**，入表前必须本机打开该页/该文件核对。找不到就写 `NOT_IN_FILE`。

---

## 4. 哪些内容不能自由发挥（必须保留原文证据）

必须保留（短引或逐字字段名，**禁止改写后再当原文**）：

- 法规条号、应当/不得、生效与过渡日期  
- 申请表栏位名与客户填报值  
- UOM/手册字段名、错误码原文  
- 函数名、路径、信号名、模式枚举  
- 试验结论用语（通过/超差）与科目编号  
- 证件类型名称（TC/PC/AC/运营合格证/特殊适航证）——不得互相替换  

允许摘要（必须标 `摘要`，并保留指针）：

- 长段落的结构提纲  
- 调用链关系（仍要路径+函数）  
- 给客户的“下一步建议”（标 `建议`，不是局方决定）  

禁止当文件结论：

- “行业都是这样飞的”  
- 教学树函数名 = 客户机型  
- 销售 PPT 上的“已获适航”无证件细分  
- 未打开的 PDF 页上的想象条款  

风险等级（复合表用）：

| 级 | 含义 |
| -- | ---- |
| R0 | 原文指针完整 |
| R1 | 摘要，指针完整 |
| R2 | 跨文件映射，一边是推断 |
| R3 | 无来源 — **不得输出为结论** |

---

## 5. 与普通 RAG 的差别

| RAG 常见做法 | 本标准 |
| ------------ | ------ |
| 块相似度最高即答 | 无指针不答 |
| 混语料当知识 | 分层；L7 不能压过 L1 |
| 一次吞全库 | 固定文件范围 + 分段 |
| 改写后像官方 | 条号/字段/函数保持原文 |

```text
NO_SOURCE = NO_CLAIM
COMMON_SENSE ≠ FILE_CONCLUSION
APPROVAL_OUTCOME = NEVER_FROM_TOKFAI
```
