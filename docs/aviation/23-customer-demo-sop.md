# 23 — Aviation Customer Demo SOP (P1250-R0)

```text
P1250-R0 = CUSTOMER DEMO SOP
AUDIENCE=无人机 / eVTOL 工程与适航团队
TOKFAI_EXECUTES_LOCAL_TOOLS=NO
CUSTOMER_SOURCE_LEAVES_CUSTOMER_DISK=YES
PREFERRED_DEMO=fixed-file-scope + segmented engineering trace
COMMIT_PUSH_DEPLOY=NO
```

Internal proof this SOP rests on: [testing/19-p1240-r3-strict-chain-execution.md](./testing/19-p1240-r3-strict-chain-execution.md)  
CLI connection runbook: [../codex-cli-tokfai.md](../codex-cli-tokfai.md)

---

## 1. 客户演示定位

Tokfai 对无人机 / eVTOL 客户的演示目标不是“聊天会飞控”，而是：

> 在客户自己的工程目录里，用本地工具读到真实文件，输出**有路径、有函数、可追溯**的控制律 / 分配 / 执行器链路摘要。

| 角色 | 做什么 | 不做什么 |
| ---- | ------ | -------- |
| **客户源码** | 留在客户本机 workspace | 不上传 Tokfai、不进仓库、不进演示文档 |
| **old Codex CLI** | 在客户本机执行 Read / Write / Shell | 不替代飞控机、不签发适航结论 |
| **Tokfai** | OpenAI-compatible 中转、模型路由、计费、日志（安全字段） | **不读取/保存客户源码，不执行本地工具** |
| **上游模型** | 在固定文件范围内做工程追踪 | 不以函数名猜测代替读文件 |

已验证（synthetic 飞控树、`gemini-3-pro`、fixed-file-scope）：

```text
txg_control_task.c
  → attitude_control_entry
  → rotor_law_update
  → control_allocation
  → actuator_command_write
```

演示策略：**固定文件范围 + 分段工程追踪**。不要用自由目录搜索 + 超长 full prompt 作为默认客户场。

输出只允许：路径、函数名、控制逻辑摘要、工程推断（标明推断）、风险点、适航材料线索。  
**禁止**完整源码正文。

---

## 2. 演示前准备清单

操作员在客户现场 / 远程桌面前勾选：

- [ ] 已约定演示用**本机工程目录**（或事先准备的 synthetic 孪生树），客户书面同意范围
- [ ] 客户确认：**源码不离开本机**；不向 Tokfai 上传工程包
- [ ] 本机已安装 **old Codex CLI**（`codex` / `codex exec`），不是 ChatGPT Desktop 作为首选
- [ ] `~/.codex/config.toml` 指向 Tokfai：`base_url` = `https://api.tokfai.com/v1`，`wire_api` = `responses`，`env_key` 指向环境变量（**不要**把 key 写入文件或投影）
- [ ] 当前 shell 已设置 API key 环境变量；现场只说“环境变量已配置”，不展示值
- [ ] 推荐模型：`gemini-3-pro`（工具流已在 fixed-file-scope 下验证）
- [ ] 已从客户（或 synthetic）选出 **≤4 个** 控制律相关文件作为本场范围
- [ ] 分段问题卡已打印 / 便签：入口 → RotorLaw → 分配 → 执行器（一次一跳）
- [ ] 输出模板已打开（§7）；投影只显示路径/函数/摘要，不滚动源码
- [ ] 失败兜底包就绪（§10）：无网、无工具调用、读不到文件、超时
- [ ] 计费预期已口头说明：本场为短会话、固定范围，避免并发压测话术

内部可用 synthetic 预演：`test-fixtures/aviation/p1240-r2-synthetic-fcu/`（**不要**把 canary 或源码贴进客户材料）。

---

## 3. 客户本地环境要求

| 项 | 要求 |
| -- | ---- |
| 机器 | 客户工程师笔记本 / 工控机开发机；能打开飞控工程目录 |
| OS | macOS 或 Linux 优先（与 Codex CLI 一致）；Windows 需事先验证 CLI |
| 网络 | 能访问 `https://api.tokfai.com`（公司代理/证书提前测一次） |
| Workspace | 本地 clone / 已有工程树；演示账号对该目录有读权限 |
| CLI | old Codex CLI；工作目录设为工程根或 `Flight/` 上一级 |
| 密钥 | 仅进程环境变量；不进 `config.toml`、不进聊天、不进截图 |
| 模型 | `gemini-3-pro`；勿默认用未验证工具流的 GPT 档做飞控读文件 |
| 范围 | 当场只打开约定子树；不要把整个公司 mono-repo 当第一场 |

Tokfai 侧无“上传工程”步骤。若客户问能否把代码放到云上分析：**回答否**——价值就是代码留在本地。

---

## 4. old Codex CLI + Tokfai 连接方式

完整参数见 [../codex-cli-tokfai.md](../codex-cli-tokfai.md)。现场只讲链路：

```text
客户本地 workspace
    ↕  Read / Search / Shell   ← old Codex CLI 在本机执行
Codex CLI
    ↕  HTTPS  OpenAI-compatible /v1  (responses)
Tokfai（路由 / 计费 / 安全日志）
    ↕
上游模型（推荐 gemini-3-pro）
```

连接要点（无密钥）：

```text
base_url     = https://api.tokfai.com/v1
wire_api     = responses
model        = gemini-3-pro
model_provider = tokfai
env_key      = TOKFAI_API_KEY   # 值只存在客户/操作员环境变量里
```

现场话术一句：

> Codex 在您电脑上读文件；Tokfai 只把对话和工具协议转到模型并计费。源码不会变成我们服务器上的一份拷贝。

若 Desktop UI 不触发工具：改用 old Codex CLI，而不是先怀疑“网关会不会跑 Shell”。

---

## 5. 固定文件范围演示法（fixed-file-scope）

**不要**说：“请在整个仓库里找姿态控制”。第一场把范围钉死。

### 5.1 选文件（客户工程，只列路径类型）

与客户共同指定最多四个文件，例如：

| 角色 | 典型路径形态（示例名，以客户树为准） |
| ---- | -------------------------------- |
| 任务 / 姿态入口 | `…/FlightControl/ControlLaw/txg_control_task.c` |
| RotorLaw | `…/ControlLaw/RotorLaw/*.c` |
| 控制分配 | `…/ControlLaw/control_allocation.c` |
| 执行器输出 | `…/Actuator/actuator_command.c` |

P1240-R3 已在 **synthetic** 上证明这四类文件足够走通：

`attitude_control_entry` → `rotor_law_update` → `control_allocation` → `actuator_command_write`

客户树符号名可能不同：**以当场 Read 到的函数名为准**，不要背 synthetic 名字硬套 OEM。

### 5.2 开场约束（贴进第一条消息）

```text
本场只允许使用客户已指定的文件列表。
必须使用本地文件工具实际读取。
结论必须带：路径 + 函数名 + 证据类型（文件证据 | 工程推断）。
不要猜测；读不到就写「读不到」。
不要粘贴源码正文；不要上传仓库。
```

### 5.3 为什么不用自由搜索

| 自由目录搜索 + 长 prompt | 固定四文件 |
| ------------------------ | ---------- |
| 易超时、易跑偏、工具轮次不可控 | 轮次短、投影可控 |
| 像“AI 自己逛仓库”，客户难验收 | 像工程师 code review |
| 失败时说不清读了什么 | 四个路径即可对账 |

---

## 6. 分段工程追踪法（segmented engineering trace）

一跳一个问题。上一跳的路径/函数作为下一跳输入，而不是一篇作文。

| 段 | 客户可见问题（短） | 期望看见 |
| -- | ------------------ | -------- |
| S1 入口 | 请 Read 指定的 task 文件，指出姿态控制入口函数名与路径 | 如 `attitude_control_entry` @ `txg_control_task.c` |
| S2 Rotor | 从入口追到 RotorLaw 更新函数：输入/输出信号名（仅文件中有的） | 如 `rotor_law_update`；attitude_error / angular_rate → virtual_control |
| S3 分配 | 定位控制分配函数：虚拟控制 → 通道 | 如 `control_allocation`；mixer / 通道映射仅当文件支持 |
| S4 执行器 | 追到执行器写出函数 | 如 `actuator_command_write` |
| S5 收口 | 用一张表串四跳；区分文件证据与推断；列出风险与适航线索 | §7 报告，无源码 |

每段都重复：本地工具、列路径、不猜、读不到就说读不到。

现场节奏建议：每段 2–4 分钟；超时就停在当前段，用已完成的表交差（见兜底）。

---

## 7. 输出报告模板

演示结束把下面填进纪要（可复制）。只填路径与名称，不贴代码。

```text
TOKFAI_AVIATION_DEMO_REPORT
DATE=
CUSTOMER=
WORKSPACE_ROOT=   # 本机路径，可脱敏为相对路径
MODEL=gemini-3-pro
SCOPE_FILES=
  1.
  2.
  3.
  4.

CALL_CHAIN=
  entry_fn=                 path=
  rotor_fn=                 path=
  allocation_fn=            path=
  actuator_fn=              path=

CONTROL_LOGIC_SUMMARY=      # 三到六句，无源码
ENGINEERING_INFERENCE=      # 明确标「推断」
FILE_EVIDENCE_VS_INFER=     # 哪些行是 Read 支持的
RISKS=
  -
AIRWORTHINESS_CLUES=        # 线索，不是取证结论
  - 控制律 / 分配 / 执行器接口是否可追溯到文件
  - 是否便于后续对照需求/试验矩阵（需客户体系）
READ_FAILURES=
UNSUPPORTED_CLAIMS_COUNT=
DEMO_RESULT=PASS_TRACE | PARTIAL | FAIL_NO_FILE_ACCESS | BLOCKED
```

适航材料线索只允许写成“下一步该对哪类证据”，例如：控制律需求 ↔ 该函数、HIL 激励点 ↔ 分配输入。  
**禁止**写成“已满足 CCAR / 已取证”。

---

## 8. 禁止事项

```text
禁止把客户源码上传 Tokfai 或任何云盘“方便分析”
禁止在投影、纪要、聊天里粘贴完整源码正文
禁止把 API key / Authorization / apiKeyId 打在屏幕或文档里
禁止把 canary / 内部测试 token 告诉客户或写进 SOP 正文
禁止把 Tokfai 说成会执行客户本机 Read/Write/Shell
禁止用自由全库搜索 + 超长 prompt 作为默认第一场
禁止凭函数名编分配矩阵 / mixer 拓扑
禁止把模型说「我已读取」当作证据（必须有 CLI 工具记录）
禁止把演示结论当成主管机关决定或适航批准
禁止当场做并发压测、改限流、改 Heavy Queue、改生产网关
禁止 commit / push 客户文件到 Tokfai 仓库
```

---

## 9. 销售话术

**开场（30 秒）**

> 飞控代码最敏感，所以我们不碰拷贝。Codex 在您电脑上读您指定的几个文件；Tokfai 只做模型中转和计费。今天看的是：能不能把姿态入口追到分配再追到执行器，而且每一步都有路径。

**价值一句**

> 我们卖的不是会聊天的飞控专家，而是把上游模型接到真实研发目录里的工程化能力——证据在文件上，不在口头上。

**和“自己把代码丢给 ChatGPT”的区别**

> 那边通常要上传或粘贴；这边文件不出门。而且我们按固定范围、分段追踪，您能验收读了哪四个文件。

**和“我们请顾问读代码”的区别**

> 顾问也可以读。差别是：同样的追踪可以重复跑、可以换成您指定的下一组文件，并且模型路由和用量在 Tokfai 上可计量。

**被问“你们能保证适航吗”**

> 不能。我们帮您把控制链路从文件里抽成可评审摘要和线索。批准只来自主管机关和您的构型/试验证据。

**被问“能不能全库自动审查”**

> 可以作为后续课题。第一场我们故意做窄：四个文件、四段追踪。宽了容易变成演示事故。

**被问“Gemini 会不会看我的代码”**

> 对话和工具协议会经 Tokfai 转到所选上游。源码仍由本机 CLI 读取；我们不在 Tokfai 落一份客户工程树。具体数据处理范围以合同与控制台条款为准，现场不展开密钥。

---

## 10. 失败兜底方案

| 现象 | 现场动作 | 对客户怎么说 |
| ---- | -------- | ------------ |
| CLI 连不上 / 401 | 不亮 key；换终端重载环境变量；确认 `base_url` 以 `/v1` 结尾 | “账号通道问题，与您的源码无关；改用预录 synthetic 屏或改期。” |
| Desktop 无工具调用 | 立即切 old Codex CLI + `gemini-3-pro` | “工具在 CLI 里跑，这是我们推荐的工程客户端。” |
| 模型空答 / 自称已读但无 Read | 停；打开工具面板给客户看；重发 S1 并强调必须 Read | “没有工具记录就不算读到。这正是我们要防的幻觉。” |
| 读不到指定文件 | 写「读不到」+ 已尝试路径；请客户改权限或改范围 | “系统诚实失败，总比编一个分配矩阵好。” |
| 客户树符号与 demo 名字不同 | 只用 Read 到的符号填报告；不硬套 synthetic 函数名 | “您的构型名字不同很正常，我们追的是文件里的链。” |
| 超时 / stream 断开后重连 | 若最终仍给出路径+函数表则继续；否则保存已完成段 | “链路噪音不等于失败；以是否读到文件为准。” |
| 客户坚持全库搜索 | 拒绝作为本场主路径；答应会后出第二场范围清单 | “全库是下一阶段；今天先证明窄范围可验收。” |
| 被要求贴源码进纪要 | 拒绝；只留路径 | “纪要只留索引，代码留在您的配置管理里。” |
| 无网 | 改讲架构图 + 事先准备的 **synthetic** 截图（无客户代码、无密钥） | “离线只能讲方法和已公开验证链，不能读您的树。” |

预录兜底只使用 synthetic 路径与公开函数名（§1 调用链），**不要**使用客户文件截图。

---

## 11. 客户价值解释

无人机 / eVTOL 客户买的不是“再一个聊天窗口”，而是：

1. **源码治理**：工程不出门；Tokfai 不做客户代码仓库。
2. **可验收的读取**：固定文件、分段追踪、路径 + 函数 + 证据类型——和 code review 同一语言。
3. **控制律到执行器的可见性**：入口 → RotorLaw → 分配 → 执行器，便于系统和适航工程师对表，而不是模型散文。
4. **适航辅助而非替代**：输出是材料线索（追溯、接口、试验钩子），不是证书。
5. **可计量落地**：路由、用量、安全日志在网关；本地工具在 Codex CLI。职责清晰，便于安全与采购评审。

内部优先级（对销售同步）：**先证明单 Agent 深度读文件，再谈高并发。** 并发是另一条容量曲线，不是本场 SOP。

---

## 12. Honesty bound

```text
P1250-R0 is a demo SOP draft.
P1240-R3 proved synthetic fixed-file-scope chain on gemini-3-pro.
This SOP does not certify any aircraft.
Tokfai does not execute customer local tools.
APPLICATION_CODE_CHANGED=NO
COMMIT_CREATED=NO
PUSHED=NO
DEPLOYED=NO
```
