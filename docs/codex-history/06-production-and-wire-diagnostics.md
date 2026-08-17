# 06 — Production and Wire Diagnostics

## Wire-diag 状态史

```text
P1126 audit:
  A_APPROVE_WIRE_DIAG_COMMIT / 尚未 commit

        ↓

commit 5f25c39
  chore(diagnostics): add upstream tool choice wire diag
  8 files = allowlist（git show 核验，无 STT/canary 混入）

        ↓ 当前 HEAD

WIRE_DIAG_STATUS=COMMITTED_IN_MAIN
WIRE_DIAG_COMMIT=5f25c39
DEPLOYED_ON_HGK=UNKNOWN
```

模块：`upstreamToolChoiceWireDiag.ts` — **只摘要 + log**，不改 upstream body。

---

## 关键日志

| Log | 证明什么 | 不能证明什么 |
|-----|----------|--------------|
| `cursor_tool_request_received` | Tokfai **收到**带 tools 的请求（counts 等） | provider 收到**完全相同** schema；上游一定 tool_calls |
| `codex_explicit_tool_choice_policy` | P1115 是否 applied、before/after kind | outbound JSON 最终字节（需 wire） |
| `transparent_tool_force_bypassed` | P1109 跳过了 force/retry | 模型为何 stop |
| `upstream_tool_choice_wire` | **outbound** tool_choice/tools 指纹已在 `providerFetch` 前确定 | 上游必然返回 tool_calls；不改变行为 |
| `responses_tool_state_saved` | tool state 已保存（resume） | 客户端本地工具已成功 |
| `chat_completion_succeeded` 的 `toolChoice` | 常反映 **client** 侧 | **不是** outbound 铁证 |
| `codex_auto_tool_retry_*` / `grsai_tool_compat_fallback_*` | 非 bypass 路径二次逻辑 | transparent auto 默认不应依赖 |

### `upstream_tool_choice_wire` 字段（源码）

允许：requestId、route、providerId、models、toolsCount、inbound/outbound kinds、shapes、toolTypesSummary、toolNameHashes、parametersByteLengths、largest/total bytes、missing*、inputSchemaPresentCount、emptyParametersStubCount、nonFunctionPassthroughCount、billing_status、credits_charged  

禁止：prompt、tool args、Authorization、API key、完整 schema、明文工具名

---

## requestId / 多轮

必须用**同一会话链**关联：

```text
第一轮：tool_calls
第二轮：resume → stop   ← 常为正常收尾
```

不要看到最后一条 `stop` 就判定「Gemini 没调工具」。

resume 信号示例：`incomingToolMessageCount=1`、`responses_tool_state_saved`。

---

## HGK

`deploy@api.tokfai.com` · 钥路径运维约定 `~/.ssh/tokfai_hgk_ed25519`  
本封档 **未** SSH 核验 PM2 build / env。

待核验：

1. 运行中是否含 `upstream_tool_choice_wire`（`5f25c39+`）  
2. `TOKFAI_CODEX_TOOL_CHOICE_POLICY` 实际值  

---

## Evidence

- `executeChatCompletion.ts`（wire log 块）  
- `upstreamToolChoiceWireDiag.ts` · `logger.ts`  
- `git show --name-only 5f25c39`  
- P1126 会话 allowlist
