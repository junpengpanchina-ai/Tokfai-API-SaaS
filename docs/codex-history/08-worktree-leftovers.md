# 08 — Worktree Leftovers

只读核验（2026-08-16）。**禁止** stash pop / discard / 删文件。

```text
CURRENT_HEAD=5f25c399d08bcb419d77f9061663f835627922b1
```

---

## 当前工作区

```bash
git status --short
#  M docs/codex-cli-tokfai.md
# ?? docs/codex-history/
# （另：本轮可能新增 docs/aviation/）
```

应用代码 / scripts：**干净**（相对 HEAD）。  
`CURRENT_DIRTY_ITEMS`（非 docs）= **0**  
docs 未提交改动 = 本封档本身。

---

## A — 已提交，历史 dirty 已消失

### Wire-diag（P1116R2/P1119）

P1125 时为 dirty/untracked → P1126 **APPROVED / 尚未 commit** → 随后 **`5f25c39` COMMITTED**。

Allowlist 8 paths 与 `git show --name-only 5f25c39` 一致。

### Runbook

`c123495` 已提交 `docs/codex-cli-tokfai.md` + p1124 check。

---

## B — 当前仍 dirty、需另 PR？

**工作区：否**（无 apps/scripts dirty）。

相关改动在 **stash**（见 D），不是当前 index/worktree dirty。

---

## C — 本地 artifact

| 路径 | 当前 |
|------|------|
| `.tokfai-canary/` | **不存在** |
| `/tmp/tokfai-p1123-prompt.txt` | 存在（本机 tmp；不入库） |
| `/tmp/tokfai-p1123-pm2.log` | 空文件 |

---

## D — stash

| Stash | 消息 | 文件 | 归属推断 |
|-------|------|------|----------|
| `stash@{0}` | `p1128r2 freeze leftover diagnostics after codex-cli proof` | p1085r2, p1087, p1088, p1090, p1103, p1104, p1107 | STT dirty-filter + P1109 测试对齐 |
| `stash@{1}` | `p1083: stash P1081R2/P1082 gates before hotfix` | p1081r2 | 旧 P1083 过程残留 |

**未** pop。细节以 `git stash show` 为准。

---

## E — UNKNOWN / 失踪

| 项 | 说明 |
|----|------|
| p1117 / p1120 / p1101 / p1102 / p1105 / p1106 | 曾 untracked；现无；**不在** stash@{0} |
| P1123 完整产物 | PARTIAL |
| 生产是否部署 5f25c39 | UNKNOWN |

---

## P1126 记录（保留历史）

```text
audit: A_APPROVE_WIRE_DIAG_COMMIT
→ commit 5f25c39
→ 当前 COMMITTED
```

禁止混入项（审计时）：STT、canary、p1101/02/05/06、p1117、p1120。

---

## Evidence

`git status` · `git stash list` · `git show 5f25c39` · P1125/P1126 会话
