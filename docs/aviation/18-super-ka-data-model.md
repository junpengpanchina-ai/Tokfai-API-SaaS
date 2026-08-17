# 18 — Super-KA Data Model (Draft)

```text
Markdown-only draft for future Super-KA Router.
Not implemented in apps/**.
```

---

## Core objects

| Object | Purpose |
| ------ | ------- |
| SOURCE | 官方来源登记（见 registry） |
| RULE | 可引用条文/条款 |
| REQUIREMENT | 从 RULE 抽出的可检验要求 |
| GATE | Tokfai 分析门（G0–G11） |
| EXCEPTION | 豁免/无需申请/过渡例外 |
| EVIDENCE | 证明材料类型与实例 |
| AIRCRAFT | 航空器/系统实例与类别参数 |
| OPERATION | 开放/特定/审定及运营规范 |
| MISSION | 任务性质与特殊活动标志 |
| ORGANIZATION | 运行人/制造方/申请人 |
| PERSON | 操控员等 |
| SYSTEM | UOM、C2、GCS、RID 模块等 |
| TOOL | 未来 Codex/工程工具 |
| CASE | 官方案例 |
| RESOURCE | 空域、场地、频率等 |
| INDUSTRY | 跨行业路由标签 |
| ACTION | 为关闭 Gate 缺口采取的动作 |

---

## Relations

```text
SOURCE
  ↓ cites
RULE
  ↓ contains
REQUIREMENT
  ↓ controls
GATE
REQUIREMENT
  ↓ expects
EVIDENCE

CASE
  ↓ encountered
GATE
CASE
  ↓ resolved_by
ACTION
ACTION
  ↓ may_require
TOOL
ACTION
  ↓ may_route_to
INDUSTRY

EXCEPTION
  ↓ modifies
REQUIREMENT

AIRCRAFT + OPERATION + MISSION + RESOURCE
  ↓ feed
GATE decisions
```

---

## Suggested record statuses

```text
FACT | INTERPRETATION | CASE | UNKNOWN | HYPOTHESIS
```

---

## Minimal JSON-shaped example (illustrative)

```json
{
  "requirement_id": "REQ-REG-031-01",
  "rule_ref": "REG-001 Art.31(1)",
  "text": "微型、轻型、小型无人驾驶航空器在适飞空域内的飞行活动无需提出飞行活动申请",
  "controls_gates": ["G9"],
  "does_not_waive_gates": ["G2", "G4", "G6", "G7"],
  "status": "FACT"
}
```

---

## Next stage（out of R1 scope）

- 把 registry 行导入结构化库  
- 为每个 REQUIREMENT 挂 EVIDENCE schema  
- Case → Gate 缺口自动提示（仍不得输出法律意见）
