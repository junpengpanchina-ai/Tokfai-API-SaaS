# Cursor / Codex 商业接入 SOP（Hermes 场景）

> 开发者工具型客户标准流程。  
> Base URL：`https://api.tokfai.com/v1` · Key：`sk-tokfai_…`

---

## 1. Cursor 接入（优先交付）

### 1.1 配置

| 项 | 值 |
|---|---|
| 类型 | OpenAI Compatible / Custom OpenAI |
| Base URL | `https://api.tokfai.com/v1` |
| API Key | Dashboard → API Keys 创建的 `sk-tokfai_…` |
| 首次模型 | `auto-fast` |
| 写代码偏好 | `auto-pro` 或 `gpt-5.5` |

分步也见：Dashboard Docs → **Cursor**（`#cursor`）。

### 1.2 验证（必须）

1. 任意对话返回正常内容  
2. 响应或 Usage 中有 **`request_id`**  
3. Dashboard → Usage 能搜到该 id，并看到扣费或失败不计费  

### 1.3 Agent / Tools

- **默认不承诺** Cursor Agent tool calling  
- 强制 tools 且模型未白名单 → 常见 `model_not_tool_capable`，**不计费**  
- 交付话术：先普通 Chat/补全；tools 需求走验证白名单后再写进合同  

---

## 2. Codex / Agent 类工具

适用：OpenAI Compatible 自定义 Base URL 的 Codex、Agent Window、同类 CLI。

| 项 | 值 |
|---|---|
| API Base | `https://api.tokfai.com/v1` |
| Auth | Bearer `sk-tokfai_…` |
| 模型 | 先 `auto-fast`；质量任务 `auto-pro` / `gpt-5.5` |

说明：

- 以各工具当前 UI 为准，核心是 **Base URL + Key + 模型 id**  
- 复杂 tool 链 / Responses 专属字段：能力以 `/v1/models` `capabilities` 为准，**勿宣传强于官方原生**  
- 若工具强依赖 function calling：对照 `docs/developer-agent-model-routing.zh.md` 的 D 类  

---

## 3. 模型选择速查

| 场景 | 推荐 |
|---|---|
| 首次连通 | `auto-fast` |
| 读代码 / 解释 / 定位 | `auto-pro` 或 `gpt-5.5` |
| 控成本试跑 | `auto-cheap` |
| Tool Call | **暂不承诺**（除非白名单） |
| 出图 | `nano-banana`（Image API，勿走 Chat） |

---

## 4. 只读工程分析场景

目标：理解仓库、定位问题、**不改文件**。

建议提示词模式：

```text
只读分析，不要修改文件。
仓库路径：…
问题：…
请给出：相关文件列表、根因假设、验证步骤。
```

验收：

- [ ] 回答引用了具体路径/符号  
- [ ] 客户可用本地搜索核对  
- [ ] Usage 有成功 `request_id`  

---

## 5. 代码修改类任务

目标：小范围可控改动，**本地 git 自检**。

建议流程：

1. 先只读定位（上节）  
2. 明确范围：「只改 X 文件 / 不做大重构」  
3. 应用修改后：`git diff` / 测试  
4. 异常保留 `request_id`  

风险话术：

- Agent 自动改多文件可能越界 → 要求客户设范围  
- 不承诺「一次生成即生产可上线」  
- tools 失败时改走普通对话 + 人工粘贴补丁  

---

## 6. 失败反馈 request_id 模板

```text
【Hermes / Cursor 反馈】
request_id:
model:
time (timezone):
stream: true | false
tools: none | auto | required | …
client: Cursor | Codex | other:
task: read-only | code-edit | chat:
HTTP / error.code (if any):
expected:
```

售后按 `docs/error-and-request-id-sop.zh.md` 定位 Usage。

---

## 7. 财务证明（给客户看）

1. 故意错误模型或强制未验证 tools → 应失败且 **`credits_charged=0`**  
2. 成功对话 → Usage 有扣费记录  
3. 两边都用同一套 `request_id` 话术  

→ 建立「中转也可对账」信任，而不是比拼原生延迟叙事。
