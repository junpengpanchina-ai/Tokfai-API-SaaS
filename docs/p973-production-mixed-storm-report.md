# P973 Production Mixed Storm Report

> 日期：2026-07-29
> 范围：生产混合风暴 / Cursor-compatible adversarial acceptance（无新功能）
> 约束：不破坏 P954/P961/P970/P971/P972；不打印 API Key 明文
> 验证：`npm run typecheck` + `npm run build` + offline SAFE storm

## 最终结论

```
TOKFAI_P973_PRODUCTION_MIXED_STORM_PASS
```

## 交付物

| 路径 | 说明 |
|---|---|
| `scripts/p973-production-mixed-storm.mjs` | SAFE/LIVE 混合风暴验收 |
| `docs/p973-production-mixed-storm-report.md` | 本报告 |
| `tmp/p973-production-mixed-storm-summary.json` | JSON summary |

## SAFE 默认规模

| 波次 | 默认 |
|---|---|
| chat non-stream | 50 (`CHAT_COUNT`) |
| chat stream | 20 (`STREAM_COUNT`) |
| tool non-stream / stream | 各 10 (`TOOL_COUNT`) |
| invalid/negative | 10 (`NEGATIVE_COUNT`) |
| concurrency | 5 (`CONCURRENCY`) |

## 覆盖矩阵

1. 普通 non-stream chat → 200 + content + usage + credits
2. 普通 stream → SSE + `data:[DONE]`
3. `tool_choice:auto` → content 或 tool_calls；禁止空结果假扣费
4. forced tool → billable tool_calls **或** not_billable JSON/SSE（无 504 HTML / jq 失败）
5. invalid model → validation/not_available + not_billable
6. image→chat / text→image 隔离 + not_billable
7. upstream timeout（mock / LIVE soft）→ not_billable
8. billing：失败 credits=0；无 orphan dirty markers
9. pm2：offline soft；LIVE 要求 online；dirty log 扫描

## 生产运行

```bash
LIVE=1 BASE=https://api.tokfai.com/v1 TOKFAI_API_KEY=sk-tokfai_... \
  node scripts/p973-production-mixed-storm.mjs
```

## 验收标记

```
TOKFAI_P973_PRODUCTION_MIXED_STORM_PASS
```
