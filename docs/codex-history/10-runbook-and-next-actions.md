# 10 — Runbook and Next Actions

## Current operational entrypoint

**唯一操作手册（勿复制冲突第二套）：**

→ [`../codex-cli-tokfai.md`](../codex-cli-tokfai.md)

Check：`scripts/p1124-codex-cli-tokfai-runbook-check.mjs`

Config 模板见该手册（无真实 key）。

---

## Current engineering state

| 项 | 状态 |
|----|------|
| HEAD | `5f25c39` wire-diag |
| P1109 / P1115 | COMMITTED；默认 preserve_auto |
| Wire diag | COMMITTED；deploy UNKNOWN |
| 推荐客户端/模型 | old Codex CLI / gemini-3-pro（as of 2026-08） |
| P1123R2 | PARTIAL（被 runbook 引用） |
| Worktree apps/scripts | 干净；docs 本封档 dirty |
| stash@{0} | STT + P1109 测试对齐待 PR |

---

## Next technical work

1. HGK：确认 deploy ≥ `5f25c39`；确认生产 policy env  
2. 独立 PR：`stash@{0}` STT / p1087–90  
3. 恢复入库：`p1120`（及可选 p1117）canary  
4. 可选：`inputSchema`→`parameters` 兼容补丁（不恢复 force）  
5. 对齐 `cursor-codex-commercial-sop.zh.md` 过时话术  
6. **禁止**默认恢复二次 fetch / Agent orchestration  

---

## Next product work

见下方 Engineering Gateway + [`../aviation/README.md`](../aviation/README.md)（PLANNED）。

---

# From Model Gateway to Engineering Gateway

**Status: PRODUCT_DIRECTION（非 IMPLEMENTED）**

```text
GRSAI / upstream
提供模型能力
        ↓
Tokfai
协议 + 模型路由 + billing + state + logs + 工程能力桥接
        ↓
Codex / Agent
执行本地工具
        ↓
行业工程系统
（验证 / 量化 / 交付）
```

长期差异化不是「更便宜卖 API」，而是：

> 把上游模型能力变成可以在真实工程业务里执行、验证、量化和交付的能力。

当前已验证基座（工程读取前提）：Codex CLI 工具闭环（as of 2026-08：gemini-3-pro）。

---

## Aviation 入口

骨架：[`docs/aviation/`](../aviation/README.md)  
本轮 **不实现** 航空业务逻辑。
