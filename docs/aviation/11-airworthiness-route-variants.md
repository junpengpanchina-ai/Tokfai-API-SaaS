# 11 — Airworthiness Route Variants

核心意识：

> **不是所有项目都走同一条 TC 路。**

---

## 1. Variant axes

| Axis | Official basis | Effect |
| ---- | -------------- | ------ |
| 航空器类别（微轻小 vs 中大） | REG-001 Art.8 | 是否进入适航许可体系 |
| 运行风险 / 审定分级 | AC-21-AA-2022-40；AP-21-71 | 可接受安全性水平与审查深度 |
| 设计类别（运输/正常/限用） | AP-21-71；CCAR-92 | 标准适航 vs 特殊适航等 |
| 设计历史（是否 2024-01-01 前定型） | CCAR-92 92.303 | 是否可走过渡安全评定 |
| 是否设计更改 | 92.303；AC-92-01 | 过渡资格丧失条件 |
| 预期运行场景 | 92.327；专用条件实践 | 审定基础内容 |
| 新颖设计特征 | 92.327 | 触发专用条件 |
| 豁免 / 等效安全水平 | CCAR-92 豁免条款；AP 颁发豁免程序 | 条款级偏离 |

---

## 2. Route catalogue（analytical）

| Route ID | Description | Who it fits | Tag |
| -------- | ----------- | ----------- | --- |
| R-NONE | 微/轻/小：无需适航许可，走产品质量+强制国标+登记激活等 | 微轻小 | `FACT` |
| R-TC-STD | 正式型号合格审定 → 生产批准 → 标准/相应适航证 | 新研中大型、高风险场景 | `FACT` |
| R-LIMITED | 限用类 TC → 特殊适航证 + 限制条件 | 隔离/低风险场景中大型 | `FACT` |
| R-TRANSITION | 2024-01-01 前定型 + 不更改 + 特定类运营需求 → 安全评定 → 特殊适航证（至迟 2026-11-26） | 存量中大型 | `FACT`/`TRANSITIONAL` |
| R-SC-DRIVEN | 无现成标准或新颖特征 → 项目专用条件作为审定基础 | eVTOL/共轴/改型货运等 | `FACT`/`CASE` |
| R-SFP | 特许飞行（试飞等） | 取证过程 | `FACT` |
| R-EXEMPT | 条款豁免 / 等效安全 | 经局方批准的偏离 | `FACT`（机制存在）；个案 `CASE` |

---

## 3. Why V2000CG / EH216-S / UY-100 diverge

| Project | Design | Intended operation (public) | Basis type | Reusable? |
| ------- | ------ | --------------------------- | ---------- | --------- |
| EH216-S | 载人多旋翼 UAS | 载人相关（专用条件针对该型号） | SC-21-002 + TC + PC | 程序可参考；专用条件 **CASE_SPECIFIC** |
| V2000CG | 吨级 eVTOL 载货 | 载货 eVTOL | 专用条件 + TC（华东局） | eVTOL 经验可参考；条款 **CASE_SPECIFIC** |
| UY-100 | 有人机改大型货运固定翼 | 人口稀疏区隔离空域点对点货运 | 专用条件（征求意见） | “设计特征+场景→审定基础”模式可参考；条文 **CASE_SPECIFIC** |

详见 [13-public-certification-cases.md](./13-public-certification-cases.md)。

---

## 4. Decision reminder

```text
GENERAL RULE          ← 条例 / CCAR-92 / AP
CASE-SPECIFIC CONDITION ← 专用条件 / 使用限制 / 审查组问题纪要
```

不得把 CASE-SPECIFIC 写成 GENERAL RULE。
