# 07 — Tests and Regressions

```text
脚本曾运行 ≠ 脚本现在仍在 repo
```

本整理 **未重跑** LIVE。

---

## 表（p108–p112）

| Script | P ID | Purpose | Read-only | Uses Key | Hits Prod | Mutation | Expected Marker | Current Availability |
|--------|------|---------|----------:|---------:|----------:|---------:|-----------------|----------------------|
| p1080-*-smoke.mjs | P1080 | stream cancel smoke | YES* | 视 | API | NO | `TOKFAI_P1080_…_SMOKE_PASS` | IN_REPO |
| p1080-*-hotfix.mts | P1080 | gate | YES* | harness | mock | NO | 见头 | IN_REPO |
| p1081-*.mjs | P1081 | usage total_tokens | YES* | | | NO | `TOKFAI_P1081_…_PASS` | IN_REPO |
| p1081r2-*.mjs | P1081R2 | wire predeploy | YES | | | NO | `TOKFAI_P1081R2_…_PASS` | IN_REPO |
| p1083-*.mjs | P1083 | tools adapter | YES* | LIVE可选 | | NO | `TOKFAI_P1083_…_PASS` | IN_REPO |
| p1084-* | P1084 | usage route audit | YES* | | | NO | 见头 | IN_REPO |
| p1085r2-*.mjs | P1085R2 | STT reality | YES* | | | NO | `TOKFAI_P1085R2_…_PASS` | IN_REPO；stash dirty |
| p1087-*.mts | P1087 | auto retry gate | YES* | harness | | NO | `TOKFAI_P1087_…_PASS` | IN_REPO；stash |
| p1088-*.mts | P1088 | retry effective | YES* | harness | | NO | `TOKFAI_P1088_…_PASS` | IN_REPO；stash |
| p1090-*.mts | P1090 | grsai fallback | YES* | harness | | NO | `TOKFAI_P1090_…_PASS` | IN_REPO；stash |
| p1092-*.mjs | P1092 | global LIVE matrix | YES | LIVE+key | YES | NO | `TOKFAI_P1092_…_PASS` | IN_REPO |
| p1093-*.mts | P1093 | state bridge | YES* | harness | | NO | `TOKFAI_P1093_…_PASS` | IN_REPO |
| p1095-*.mts | P1095 | durable store | YES* | harness | | NO | `TOKFAI_P1095_…_PASS` | IN_REPO |
| p1097-*.mts | P1097 | canonical key | YES* | harness | | NO | `TOKFAI_P1097_…_PASS` | IN_REPO |
| p1098-*.mts | P1098 | stream save | YES* | harness | | NO | `TOKFAI_P1098_…_PASS` | IN_REPO |
| p1100-*.mts | P1100 | transport failover | YES* | harness | | NO | `TOKFAI_P1100_…_PASS` | IN_REPO |
| p1103-* | P1103 | STT admin | YES* | | | NO | `TOKFAI_P1103_…_PASS` | IN_REPO；stash |
| p1104-* | P1104 | STT adapter | YES* | | | NO | `TOKFAI_P1104_…_PASS` | IN_REPO；stash |
| p1107-* | P1107 | STT gate/doc | YES* | | | NO | `TOKFAI_P1107_…_PASS` | IN_REPO；stash |
| p1109-*.mts | P1109 | no-force | YES* | harness | | NO | `TOKFAI_P1109_…_PASS` | IN_REPO |
| p1114-*.mts | P1114 | capability matrix | YES | LIVE+key | YES | NO | `TOKFAI_P1114_…_PASS` | IN_REPO |
| p1115-*.mts | P1115 | policy opt-in | YES* | harness | | NO | `TOKFAI_P1115_…_PASS` | IN_REPO |
| p1116r2-*.mts | P1116R2 | wire proof | YES* | harness | | NO | `TOKFAI_P1116R2_…_PASS` | IN_REPO |
| p1119-*.mts | P1119 | schema wire diff | YES | LIVE可选 | 可选 | NO | `TOKFAI_P1119_…_PASS` | IN_REPO |
| p1124-*.mjs | P1124 | runbook check | YES | NO | NO | NO | `TOKFAI_P1124_…_PASS` | IN_REPO |
| p1117-* | P1117 | upstream LIVE | YES | LIVE+key | YES | NO | 会话 PASS | **TRANSCRIPT-VERIFIED / SCRIPT NOT IN REPOSITORY** |
| p1120-* | P1120 | model canary | YES | LIVE+CLI | YES | NO | 会话 PASS | **TRANSCRIPT-VERIFIED / SCRIPT NOT IN REPOSITORY** |
| p1101/p1102-* | P1101/02 | client helper | YES | 视 | | NO | UNKNOWN | **NOT IN REPOSITORY** |
| p1123-* | P1123/R2 | CLI file proof | ? | ? | ? | ? | **无 marker** | **PARTIAL / NOT IN REPOSITORY** |
| （无脚本） | P1125/26 | audits | YES | NO | NO | NO | 会话 markers | 审计会话 only |

\* harness 加载生产模块但不以改生产为目的。

---

## 会话-only markers

```text
TOKFAI_P1117_RESPONSES_UPSTREAM_TOOLCALL_CAPABILITY_MATRIX_PASS
TOKFAI_P1120_REAL_CODEX_MODEL_CANDIDATE_CANARY_PASS
TOKFAI_P1125_WORKTREE_LEFTOVER_CLASSIFY_PASS
TOKFAI_P1126_WIRE_DIAG_PRECOMMIT_AUDIT_PASS
```

---

## Evidence

`find scripts -maxdepth 2`；文件头 Marker；transcript
