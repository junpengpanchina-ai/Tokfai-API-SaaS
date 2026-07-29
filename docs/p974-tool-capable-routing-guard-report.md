# P974 Tool-capable Routing Guard Report

> 日期：2026-07-29
> 范围：`VERIFIED_TOOLS_CAPABLE_MODEL_IDS` 白名单；`/v1/models` tools；forced reject；auto degrade
> 约束：保留 P971/P972；P973 接受 `model_not_tool_capable`；不打印 API Key
> 验证：`npm run typecheck` + `npm run build` + offline `p974`（含 p972/p971）

## 最终结论

```
TOKFAI_P974_TOOL_CAPABLE_ROUTING_GUARD_PASS
```

## 核心改动

| 文件 | 作用 |
|---|---|
| `apps/dmit-api/src/env.ts` | `VERIFIED_TOOLS_CAPABLE_MODEL_IDS`（默认空） |
| `apps/dmit-api/src/lib/toolCallCapability.ts` | `isVerifiedToolCapableModel`；catalog tools 仅白名单 |
| `apps/dmit-api/src/lib/executeChatCompletion.ts` | forced → `model_not_tool_capable`；auto → degrade chat |
| `apps/dmit-api/src/lib/respondEarlySse.ts` / `toolCallFailureEnvelope.ts` | stream SSE for routing guard |
| `scripts/p786-offline-customer-mock.mjs` | 离线镜像 |
| `scripts/p973/p970/p971/p972` | 验收语义对齐空白名单 |
| `scripts/p974-tool-capable-routing-guard-smoke.mjs` | 本验收 |

## 行为

| 场景 | 期望 |
|---|---|
| `capabilities.tools` | 仅白名单 → `true`；默认 `false`（含 auto-fast / auto-pro） |
| forced tools + 非白名单 | HTTP 400 `model_not_tool_capable` + not_billable / credits=0 |
| stream forced + 非白名单 | SSE error + `data: [DONE]` + not_billable |
| `tool_choice:auto` + 非白名单 | 普通 Chat + `tokfai.auto_no_tool_call=true`（可计费） |
| 白名单模型 + forced | 仍走 P971/P972（真 tool_calls 或 not_billable） |

## 生产配置

```bash
# 仅在 LIVE 真返回 tool_calls 后加入：
VERIFIED_TOOLS_CAPABLE_MODEL_IDS=gpt-5.5,gemini-2.5-flash
```

## 验收标记

```
TOKFAI_P974_TOOL_CAPABLE_ROUTING_GUARD_PASS
```
