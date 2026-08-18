# 24 — Aviation Industry Depth Map (P1251-R0)

```text
P1251-R0 / DOC-24
INTERNAL INDUSTRY BASE FOR CUSTOMER DEMO PREP
NOT A REGULATORY ADVICE ENGINE
TOKFAI_EXECUTES_LOCAL_TOOLS=NO
CUSTOMER_SOURCE_STAYS_LOCAL=YES
```

配套：[25-certification-and-operation-chain.md](./25-certification-and-operation-chain.md) · [26-ai-workflow-for-aviation-customers.md](./26-ai-workflow-for-aviation-customers.md) · [23-customer-demo-sop.md](./23-customer-demo-sop.md)

工程读取已验证（synthetic、fixed-file-scope）：[testing/19-p1240-r3-strict-chain-execution.md](./testing/19-p1240-r3-strict-chain-execution.md)

**本知识库不能把 AI 推断替代主管机关正式决定。** 标签：`FACT` / `INTERPRETATION` / `CASE` / `UNKNOWN` / `HYPOTHESIS`。

---

## 1. 行业分层

消费电子口号（“无人机/低空经济”）必须拆层。不同层的**证书、空域、工程文件、买家**都不同。

| 层 | 典型产品/任务 | 监管重心（内部对照） | 工程文件重心 | Tag |
| -- | ------------- | -------------------- | ------------ | --- |
| 消费级无人机 | 航拍、娱乐、轻小型 | 实名登记、适飞空域、识别；多数**无需适航许可**（微/轻/小） | App、固件、图传；少见完整 ControlLaw 审定包 | `FACT` 分类门槛见 [10](./10-airworthiness-system-map.md)；产品形态 `INTERPRETATION` |
| 工业无人机 | 测绘、安防巡更、行业载荷 | 视重量/运行类：登记 + 可能运营评估；空域申请 | 飞控+载荷+地面站；任务规划 | `INTERPRETATION` |
| 物流无人机 | 点对点货运、末端配送 | 中大型常涉适航 + 特定类运行 + 运营合格证 | 控制分配、航线、应急、UOM 动态数据 | `INTERPRETATION`；货运 eVTOL `CASE` 见 [21](./21-evtol-certification-landscape.md) |
| 巡检无人机 | 电力/油气管廊/光伏 | 运行申请、C2、应急；业主安全规程 | 导航、避障、载荷云台、日志 | `INTERPRETATION` |
| 农业无人机 | 农林牧渔作业 | 常规农用在适飞空域有运营合格证**例外**口径（条例） | 喷洒控制、GNSS、作业日志 | `FACT` 例外钩子见 [05](./05-regulatory-gate-model.md) G5；作业细节 `INTERPRETATION` |
| 警用/应急 | 公安、救援、海关等 | 可能部分出民用条例口径；任务许可 | 加密通信、证据链、指挥 | `FACT` 军/警另有规定见 G0；边界 `UNKNOWN` |
| eVTOL 载人/载货 | 电动垂直起降交通/货运 | TC/PC/AC + 专用条件 + 运行；**有 TC ≠ 可任意商业飞** | ControlLaw、推进、HIL、符合性矩阵 | `FACT`/`CASE` [10](./10-airworthiness-system-map.md) [21](./21-evtol-certification-landscape.md) |
| 低空运营平台 | 空域/起降点/调度/UOM 对接 | 空域、飞行活动、动态数据、运行控制系统 | API、航线库、身份、日志 | `FACT` 平台角色见 [08](./08-uom-system-map.md) [20](./20-computer-based-operation-control-system.md) |
| 适航/测试/仿真 | 试飞、HIL/SIL、检测认证 | 证据包、专用条件符合性 | 试验大纲、报告、追溯矩阵 | `INTERPRETATION` |

**反混淆（演示前必须能说清）**

```text
Aircraft class（微/轻/小/中/大）≠ 运行类（开放 / 特定 / 审定）
有型号宣传 ≠ 已取得 TC
有 TC ≠ 已有 PC / AC / 运营合格证 / 空域
适航问题 ≠ 运行问题 ≠ 地方协调问题
```

详见 [06-why-cannot-fly-taxonomy.md](./06-why-cannot-fly-taxonomy.md)。

---

## 2. 客户画像

| 画像 | 买什么决策 | 典型痛点 | Tokfai 第一场该见谁 |
| ---- | ---------- | -------- | -------------------- |
| 主机厂 | 构型、飞控、取证计划 | 代码–需求–试验对不上；顾问贵、上传代码不能接受 | 飞控/系统/适航工程 |
| 运营商 | 能不能飞、能不能持续飞 | 申请材料、UOM、异常复盘、多机队日志 | 运行/安全/机务 |
| 低空平台公司 | 对接局方平台与场站 | 接口字段、申请状态、动态数据 | 产品+合规 |
| 系统供应商 | 航电/飞控计算机/地面站 | 接口控制文件、ICD、集成问题定位 | 系统工程 |
| 飞控/导航/BMS/通信供应商 | 子系统交付与符合性 | 调用链、FDIR、HIL 记录解释 | 算法/软件负责人 |
| 检测认证/试验单位 | 试验效率与报告一致性 | 大纲–用例–日志对表 | 试验室主任 |
| 政企低空项目承建方 | 项目交付与“能飞”叙事 | 把商业承诺拆成 Gate；材料汇编 | 项目经理+技术负责人 |

同一“无人机公司”可能同时是主机厂+运营商——**当场拆法人与证件主体**，不要混谈。

---

## 3. 客户痛点（跨层）

| ID | 痛点 | 常见错解 |
| -- | ---- | -------- |
| P1 | “飞不了”说不清是证、空域、登记还是链路 | 当成单一审批 |
| P2 | 飞控/分配/执行器只在少数人脑子里 | 用聊天模型空口讲 mixer |
| P3 | 适航/试验包与仓库路径脱节 | 以为有 TC 新闻就能飞 |
| P4 | 代码不能出厂 | 拒绝所有云端 AI |
| P5 | 日志/HIL 海量，复盘靠加班 | 只买看板不追函数 |
| P6 | 申请被退不知缺哪类证据 | 再交一版更厚的 Word |
| P7 | 多供应商接口扯皮 | 没有路径级调用链 |

---

## 4. Tokfai 切入点

Tokfai = OpenAI-compatible **中转、路由、计费、安全日志**。  
**本地 Read / Write / Shell 由客户侧 old Codex CLI 执行。Tokfai 不执行客户本地工具，不保存客户源码树。**

| 切入 | 对应层/画像 | 演示形态（见 SOP） |
| ---- | ----------- | ------------------ |
| 固定文件范围读取 | 飞控/分配供应商、主机厂 | 四文件 ControlLaw 链 |
| 分段调用链 | 系统工程 | 入口 → RotorLaw → allocation → actuator |
| 需求–代码–试验线索 | 适航/试验 | 只出路径+函数+摘要，不出源码 |
| 日志/异常解释 | 运营商 | 客户本机日志目录 + 固定范围 |
| 申请材料辅助 | 运营/平台 | 清单与缺口，**不代为提交、不保证批准** |
| 内部知识库问答 | 全画像 | 客户本地规程/ICD，不上云拷贝 |

已验证能力边界：`gemini-3-pro` + fixed-file-scope 可读 synthetic 飞控树并走出：

```text
txg_control_task.c → attitude_control_entry
  → rotor_law_update → control_allocation → actuator_command_write
```

客户树函数名以当场 Read 为准，禁止把 synthetic 名字当成 OEM 事实。

---

## 5. 演示问题清单（按层选用，一次不超过 4 问）

**主机厂 / 飞控**

1. 指定 task 文件里，姿态入口函数叫什么、在哪个路径？
2. 入口之后谁更新 RotorLaw？输入/输出在文件里叫什么？
3. 控制分配函数把什么映射到执行器通道？文件没写的标推断。
4. 执行器写出函数在哪个路径？

**运营商**

5. 这次“飞不了”更像登记、空域、适航还是运营合格证？（对照 [06](./06-why-cannot-fly-taxonomy.md)）
6. 动态数据/识别相关模块在仓库或接口文档的哪几个路径？

**试验 / 适航**

7. 这条控制链对应试验大纲哪一类科目（只做线索，不宣称符合性）？
8. 符合性矩阵里该函数是否有可追溯 ID（有则列路径，无则写找不到）？

**禁止当第一场问的**

- 全仓库自动找出全部适航缺口
- “帮我们拿 TC/运营合格证”
- 自由目录搜索 + 超长 prompt

---

## 6. 销售问法

进门先问事实，再谈模型：

1. 主体是设计单位、生产单位、运行人，还是平台/集成？
2. 航空器法定分类（微/轻/小/中/大）是否已在登记系统落参？
3. 目标是适航取证、特定类运行，还是适飞空域内的行业作业？
4. 飞控/分配源码能否在**本机**打开？哪些目录绝对不能投屏？
5. 现在卡在工程定位、材料编写，还是局方决定？
6. 是否接受 **Codex CLI 本机读文件 + Tokfai 只做中转**？
7. 第一场能否指定不超过四个文件？

---

## 7. 成交抓手

| 抓手 | 为什么有效 |
| ---- | ---------- |
| 源码不出门 | 对主机厂/军工 comms 的采购红线 |
| 可验收的四文件链 | 当场对路径，不是“AI 很懂飞控” |
| 与顾问互补 | 顾问做判断与送审；Tokfai 做可重复的文件追踪与摘要 |
| 分段 SOP | 降低超时/幻觉演示事故（[23](./23-customer-demo-sop.md)） |
| 计量与路由 | 安全部门要“谁调用了什么模型”，网关有安全字段日志 |
| 窄切口扩单 | 飞控链 → 导航/C2/BMS → 试验包 → 运行材料辅助 |

---

## 8. 风险边界

| 风险 | 处置 |
| ---- | ---- |
| 把行业研究当成法律意见 | 必须回到官方来源与书面许可 |
| 客户层判断错误（消费级方案卖给载人 eVTOL） | 用本表分层后再报价 |
| 演示变全库扫描 | 停；改固定范围 |
| 上游处理对话/工具协议 | 合同与条款；现场不展开密钥 |
| 标准场景完整目录 | 内部标 `UNKNOWN`（见 [22](./22-decision-critical-unknowns.md)） |
| 警用/军用 | G0 可能出民用范围；不要承诺民用网关覆盖 |

---

## 9. 禁止承诺

```text
禁止承诺：Tokfai 执行客户本地工具
禁止承诺：Tokfai 持有或训练客户源码
禁止承诺：保证取得 TC / PC / AC / 运营合格证 / 空域批准
禁止承诺：替代主管机关或检测机构
禁止承诺：全自动符合性判定
禁止承诺：客户树与 synthetic 函数名一致
禁止承诺：高并发多 Agent 审查作为第一交付
禁止输出：完整源码、真实 key、Authorization、apiKeyId、canary、日志正文
```

---

## 10. 演示前必读顺序

1. 本文分层 + 画像  
2. [25](./25-certification-and-operation-chain.md) 准入链  
3. [26](./26-ai-workflow-for-aviation-customers.md) 工作流  
4. [23](./23-customer-demo-sop.md) 现场 SOP  
5. 对应官方钩子： [05](./05-regulatory-gate-model.md) [08](./08-uom-system-map.md) [10](./10-airworthiness-system-map.md) [12](./12-2026-transition-window.md)
