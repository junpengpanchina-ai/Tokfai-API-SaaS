# 11 — Glossary

| 名词 | 含义 |
|------|------|
| Tokfai | OpenAI-compatible Gateway；`https://api.tokfai.com` |
| DMIT / apps/dmit-api | 核心后端 |
| apps/web | 前端（anon only） |
| GRSAI | 上游 provider |
| HGK | 生产机约定 |
| Codex CLI / old Codex | 推荐客户端 |
| Codex Desktop UI | 非首选验证入口 |
| Responses / Chat Completions | `/v1/responses` vs `/v1/chat/completions` |
| tool_choice auto/required/named | 工具选择语义 |
| transparent | 透明网关模式 |
| inputSchema / parameters | session vs chat schema 字段 |
| tool_calls / previous_response_id / resume | 工具调用与多轮 |
| TOKFAI_API_KEY | 用户 key 环境变量名 |
| TOKFAI_CODEX_TOOL_CHOICE_POLICY | preserve_auto \| required_when_tools_present |
| upstream_tool_choice_wire | outbound wire 诊断日志 |
| cursor_tool_request_received | tools 到达网关 |
| transparent_tool_force_bypassed | P1109 bypass |
| codex_explicit_tool_choice_policy | P1115 日志 |
| responses_tool_state_saved | state 已存 |
| P1083…P1126 | 见 ledger / timeline |
| P1123 / P1123R2 | PARTIAL CLI proof；被 P1124 引用 |
| CLASS A/C/E | P1120 模型分类 |
| Compatibility Prime Directive | AGENTS.md 加法兼容 |

封档 HEAD：`5f25c39`
