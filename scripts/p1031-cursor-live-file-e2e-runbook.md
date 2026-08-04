# P1031 — Cursor LIVE File E2E Runbook

**本文件不是自动测试。** 本地 `p1031-cursor-agent-protocol-closure.mts` 通过后，仅表示：

`TOKFAI_P1031_READY_FOR_CURSOR_LIVE_FILE_CANARY`

**不得**在未完成下列真实 Cursor 验收前输出：

`TOKFAI_CURSOR_REAL_FILE_E2E_PASS`

---

## 前置条件

1. 已部署包含 P1030 + P1031 的 `apps/dmit-api` 到 `https://api.tokfai.com`
2. Cursor 设置：
   - OpenAI API Key：Tokfai `sk-tokfai_...`
   - Override OpenAI Base URL：开启
   - Base URL：`https://api.tokfai.com/v1`
   - 模型：**auto-pro**（不要用 Cursor 内置 GPT/Gemini 额度路径）
3. 可读取 DMIT 结构化日志（含 `cursor_tool_*` 事件）

---

## 固定 Cursor Agent 任务文本

复制到 Cursor Agent（选中 **auto-pro**）：

```text
任务编号：TOKFAI-CURSOR-LIVE-FILE-E2E

只能使用 Cursor 文件工具，不允许使用终端、Shell、Python、Git 命令或仅回复代码。

按顺序完成：

1. 创建目录 .tokfai-cursor-e2e
2. 创建文件 .tokfai-cursor-e2e/source.txt
3. 写入：
   TOKFAI_CURSOR_SOURCE_V1
4. 读取 source.txt
5. 将 source.txt 修改为：
   TOKFAI_CURSOR_SOURCE_V2
6. 再次读取 source.txt
7. 创建 .tokfai-cursor-e2e/result.txt
8. 写入：
   SOURCE_READ=Tokfai Cursor Source V2
   TOOL_CHAIN=CREATE_READ_UPDATE_READ_CREATE
9. 读取 result.txt
10. 最终只回复：
   TOKFAI_CURSOR_REAL_FILE_E2E_PASS
```

---

## 四类证据（缺一不可）

### 1. 客户端证据

- Cursor UI 显示真实文件工具调用（create/read/update）
- 不是只贴代码让用户手动创建
- 不是人工在 Finder/编辑器里创建文件

### 2. 文件证据

在仓库根目录检查：

```bash
cat .tokfai-cursor-e2e/source.txt
# 期望：TOKFAI_CURSOR_SOURCE_V2

cat .tokfai-cursor-e2e/result.txt
# 期望包含：
# SOURCE_READ=Tokfai Cursor Source V2
# TOOL_CHAIN=CREATE_READ_UPDATE_READ_CREATE
```

### 3. 服务端证据（日志）

按 `request_id` 关联，至少看到：

| 事件 | 条件 |
|---|---|
| `cursor_tool_request_received` | `toolsCount > 0` |
| `cursor_tool_response_generated` | `toolCallCount > 0`，`finishReason=tool_calls`（工具轮） |
| `cursor_tool_sse_completed` | `emittedFinishReason=tool_calls`，`doneFrameEmitted=true`（若 stream=true） |
| `cursor_tool_round2_received` | `unmatchedToolCallIdCount=0` |
| `chat_completion_succeeded` | 最终文本轮成功 |

日志**不得**含 Authorization、prompt 正文、完整 arguments、文件内容。

### 4. 商业证据

- 每个成功客户端请求 `recordSuccessfulUsageAndDebit` / charged **一次**
- 若发生 AUTO arbitration：usage 聚合（P1030）
- 失败轮 `billing_status=not_billable`，不重复扣款

---

## 判定

四类证据全部通过后，后续任务才可输出：

```text
TOKFAI_CURSOR_REAL_FILE_E2E_PASS
```

任一缺失 → 记录失败层，例如：

- `CURSOR_REQUEST_NOT_REACHING_TOKFAI`
- `TOOLS_NOT_PRESENT`
- `SSE_TOOL_CALLS_INVALID`
- `TOOL_CALL_ID_MISMATCH`
- `ROUND2_TOOL_MESSAGE_REJECTED`
- `CLIENT_REJECTED_VALID_RESPONSE`
