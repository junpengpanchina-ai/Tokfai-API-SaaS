# Codex CLI → Tokfai runbook

面向用户 / 运维：如何用 **old Codex CLI** 连接 Tokfai，并跑通工具流（读文件 / 写文件 / Shell）。

依据：P1120 / P1123R2 已验证事实。Tokfai **不执行**本地工具；Codex CLI 在本机执行 Read / Write / Shell。

---

## 1. 推荐客户端与模型

| 项 | 推荐 | 说明 |
|---|---|---|
| 客户端 | **old Codex CLI**（`codex` / `codex exec`） | **不要**把 ChatGPT Desktop / 新版 Codex Desktop UI 当作首选 |
| 模型 | **`gemini-3-pro`** | 真实 Codex tools schema 下可返回 `tool_calls` 并完成文件读写 |
| 备选（工具流） | 其他已验证 Gemini 路由 | 以控制台 `/v1/models` 为准 |
| 不推荐（工具流） | `gpt-5.5` / `gpt-5.4` | 在真实 Codex 全量 tools schema 下常出现 `finish_reason=stop` 且 `upstreamReturnedToolCalls=false` |

Desktop UI 无响应或工具不触发时：优先改用 old Codex CLI + `gemini-3-pro`，而不是先改 Tokfai 网关。

---

## 2. Tokfai 在链路中的角色

Tokfai 只做：

- 透明 relay（OpenAI-compatible `/v1/responses`）
- provider adapter（Responses ↔ Chat Completions 等形状适配）
- billing（计费扣款）
- state bridge（如 `previous_response_id` / tool state）
- logs（安全字段：requestId、model、toolsCount、finishReason 等）

Tokfai **不**执行本地工具；本地 Read / Write / Shell 由 **Codex CLI** 执行。

---

## 3. 连接参数（必填）

| 参数 | 值 |
|---|---|
| Base URL | `https://api.tokfai.com/v1`（不要写成 `.../v1/responses`） |
| `wire_api` | `responses` |
| API key 环境变量 | `TOKFAI_API_KEY` |
| 推荐 `model` | `gemini-3-pro` |

**不要把真实 key 写入文档、repo 或 `config.toml`。** 只用 `env_key` 指向环境变量。

---

## 4. macOS：`~/.codex/config.toml` 示例

使用占位符；下方为可工作的 Codex CLI 结构（`base_url` / `wire_api` / `env_key` 写在 provider 段内）：

```toml
model = "gemini-3-pro"
model_provider = "tokfai"
model_reasoning_effort = "low"
disable_response_storage = true

[model_providers.tokfai]
name = "Tokfai"
base_url = "https://api.tokfai.com/v1"
wire_api = "responses"
env_key = "TOKFAI_API_KEY"
```

要点：

- `model_provider = "tokfai"` 与 `[model_providers.tokfai]` 名称一致
- `base_url = "https://api.tokfai.com/v1"`
- `wire_api = "responses"`
- `env_key = "TOKFAI_API_KEY"`（进程环境里必须能读到该变量）

改配置前建议自行备份：`cp ~/.codex/config.toml ~/.codex/config.toml.bak`

---

## 5. 安全设置 `TOKFAI_API_KEY`

### 当前 shell（推荐）

```bash
export TOKFAI_API_KEY="sk-tokfai_xxx"
```

将 `sk-tokfai_xxx` 换成你自己的 Tokfai key。验证进程可见：

```bash
# 只检查是否存在，不要 echo 完整 key
test -n "$TOKFAI_API_KEY" && echo "TOKFAI_API_KEY=present"
```

### macOS GUI 可选（launchd 继承）

若从 Dock / Finder 启动的 GUI 进程读不到 shell 的 `export`，可临时：

```bash
launchctl setenv TOKFAI_API_KEY "sk-tokfai_xxx"
```

注销 / 重启后可能失效；仍优先用 shell 启动 CLI。

### 禁止事项

- 不要把 key 写入 git 仓库
- 不要提交 `.env` / `auth.json` 中的真实密钥
- 不要把真实 `sk-tokfai_…` 贴进文档、工单或聊天记录

---

## 6. 最小验证流程（文件读写）

在任意可信项目目录（示例以仓库根为例）：

```bash
mkdir -p .tokfai-canary/p1124
echo 'TOKFAI_P1124_CANARY_TOKEN_OK' > .tokfai-canary/p1124/input.txt
```

用 Codex CLI（需已 `export TOKFAI_API_KEY`，且 `config.toml` 指向 Tokfai + `gemini-3-pro`）：

```bash
codex exec -m gemini-3-pro --sandbox workspace-write \
  "请读取 .tokfai-canary/p1124/input.txt，把文件里的整行 token 原样写入 .tokfai-canary/p1124/output.txt。不要解释，不要改写。"
```

本地验收：

```bash
# 期望两边内容一致
diff -u .tokfai-canary/p1124/input.txt .tokfai-canary/p1124/output.txt && echo PASS_FILE_ROUNDTRIP
```

### 服务端日志信号（链路正常时）

在 Tokfai / HGK PM2 日志（同一 `requestId` 时间窗）若看到：

- `cursor_tool_request_received`
- `upstreamReturnedToolCalls=true`
- `incomingToolMessageCount=1`（第二轮带 tool result 时）
- `responses_tool_state_saved`

则代表：**Codex → Tokfai `/v1/responses` → 上游 tool_calls → 客户端执行工具 → resume** 主路径正常。

不要在日志里查找或粘贴 prompt、文件内容、tool args、Authorization。

---

## 7. 故障判断表

| 现象 | 常见原因 | 处理 |
|---|---|---|
| Missing `TOKFAI_API_KEY` / 客户端报未配置 key | 环境变量未被 **Codex 进程**继承 | 在启动 CLI 的同一 shell `export TOKFAI_API_KEY`；GUI 可试 `launchctl setenv`；确认 `env_key = "TOKFAI_API_KEY"` |
| `gpt-5.5` / `gpt-5.4`：HTTP 200 但 `no tool_calls` / `finish_reason=stop` | 模型在真实 Codex tools schema 下选择不调工具 | **换 `gemini-3-pro`**，不要先改网关 |
| Desktop UI no response / 工具不跑 | ChatGPT Desktop / 新版 Codex Desktop UI 路径不稳定 | **优先使用 old Codex CLI** |
| HTTP 401 / 403 | Tokfai key 无效、过期、或账号权限 / 余额不足 | 在控制台核对 key 与额度；轮换 key；不要把真实 key 发到公开渠道 |
| HTTP 400 invalid request | 请求体 / schema / 字段不被接受 | 保留 `requestId`，查 Tokfai 日志安全字段；**不要盲目改生产网关** |
| 有 `tool_calls` 但本地无 `output.txt` | 沙箱权限或工作目录不对 | 确认 `--sandbox workspace-write` 与 `-C` 项目根目录 |

---

## 8. 快速自检清单

1. `codex --version` 可用（CLI，非仅 Desktop UI）
2. `~/.codex/config.toml`：`model = "gemini-3-pro"`，`wire_api = "responses"`，`base_url = "https://api.tokfai.com/v1"`，`env_key = "TOKFAI_API_KEY"`
3. 当前进程 `TOKFAI_API_KEY` 已设置且不以明文提交到 repo
4. 最小 canary：`input.txt` → Codex → `output.txt` 内容一致
5. 日志出现 `upstreamReturnedToolCalls=true`（及 resume 时的 `incomingToolMessageCount=1`）

---

## 9. 相关材料

- 内部配置辅助（可选）：`scripts/p1102-real-codex-client-config-helper.mjs`
- 模型候选 canary（内部）：`scripts/p1120-real-codex-model-candidate-canary.mjs`
- 本手册检查脚本：`scripts/p1124-codex-cli-tokfai-runbook-check.mjs`
