# P973 Production Mixed Storm Report

> 日期：2026-07-29
> 范围：生产混合风暴 / Cursor-compatible adversarial acceptance（无新功能）
> 约束：不破坏 P954/P961/P970/P971/P972；不打印 API Key 明文

## 最终结论

```
TOKFAI_P973_PRODUCTION_MIXED_STORM_PASS
```

## 配置

- LIVE: `false`
- base: `http://127.0.0.1:8787`
- counts: chat=5 stream=2 tool=2 negative=4 concurrency=5
- models: chat=`auto-fast` tool=`auto-pro`

## 波次汇总

```json
{
  "byWave": {
    "chat_nonstream": {
      "n": 5,
      "ok": 5,
      "soft": 0,
      "fail": 0
    },
    "chat_stream": {
      "n": 2,
      "ok": 2,
      "soft": 0,
      "fail": 0
    },
    "tool_auto": {
      "n": 2,
      "ok": 2,
      "soft": 0,
      "fail": 0
    },
    "tool_forced_nonstream": {
      "n": 2,
      "ok": 2,
      "soft": 0,
      "fail": 0
    },
    "tool_forced_stream": {
      "n": 2,
      "ok": 2,
      "soft": 0,
      "fail": 0
    },
    "negative": {
      "n": 4,
      "ok": 4,
      "soft": 0,
      "fail": 0
    }
  },
  "latency": {
    "n": 17,
    "min": 1,
    "p50": 1,
    "p95": 3,
    "max": 3
  }
}
```

## 检查结果

- **PASS** `static_p954_present` — scripts/p954-image-provider-routing-isolation-smoke.mjs
- **PASS** `static_p961_present` — scripts/p961-image-cost-reconciliation-smoke.mjs
- **PASS** `static_p970_present` — scripts/p970-cursor-tool-call-smoke.mjs
- **PASS** `static_p971_present` — scripts/p971-fake-tool-call-guard-smoke.mjs
- **PASS** `static_p972_present` — scripts/p972-forced-tool-failure-envelope-smoke.mjs
- **PASS** `static_p971_p972_guards` — billing guard + graceful envelope present
- **PASS** `wave_chat_nonstream` — ok=5/5 soft=0 fail=0
- **PASS** `wave_chat_stream` — ok=2/2 soft=0 fail=0
- **PASS** `wave_tool_auto` — ok=2/2 fail=0
- **PASS** `wave_tool_forced_nonstream` — ok=2/2 jqFail=0 html504=0
- **PASS** `wave_tool_forced_stream` — ok=2/2 fail=0
- **PASS** `wave_negative_routes` — ok=4/4 fail=0
- **PASS** `billing_failures_credits_zero` — failures_checked=8
- **PASS** `billing_no_orphan_markers_in_results` — clean
- **PASS** `billing_success_credits_consistent` — success_rows=7 bad=0
- **SOFT** `pm2_status` — no online process (soft offline)
- **PASS** `pm2_dirty_logs` — clean
- **SOFT** `prior_smokes` — SKIP_PRIOR=1

## PM2

- online: no
- dirty: none

## 验收标记

```
TOKFAI_P973_PRODUCTION_MIXED_STORM_PASS
```
