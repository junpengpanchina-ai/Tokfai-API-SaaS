# P1038R STEP4 FINAL EVIDENCE

- baseline: 2 pass / 6 fail
- 最终: 8 pass / 0 fail

## 实际修改文件
- src/assistantMessage.mjs
- src/budget.mjs
- src/roundTrip.mjs
- src/usage.mjs
- result.txt
- solution-report.md

## root cause
- roundTrip 未严格按原始 tool_call 顺序匹配 tool results，无法拒绝重复、缺失、未匹配结果。
- usage 聚合只覆盖部分成功 upstream component，未完整累加所有成功组件 usage。
- timeout budget 过期后未钳制为 0。
- assistant tool-call message shape 不符合 OpenAI-compatible tool_calls 结构。
- ordinary assistant text 路径与 tool-call 路径混淆，未保持普通 text 输出。

## minimal fix
- 在 roundTrip 中按原始 tool_call id 顺序建立匹配，并拒绝 duplicate/unmatched/missing tool results。
- 在 usage 中遍历每个 successful upstream component 并累加 usage 字段。
- 在 budget 中对 expired timeout budget 返回 0。
- 在 assistantMessage 中输出 OpenAI-compatible tool_calls 形状。
- 保持普通 assistant text 为普通 text message，不注入 tool_calls。

## 约束确认
- test/benchmark.test.mjs 未修改
- package.json 未修改
- 未安装依赖
- 未访问网络
- 未修改 Tokfai 主仓生产代码
