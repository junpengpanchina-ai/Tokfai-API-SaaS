# 10 — Airworthiness System Map

```text
First-layer knowledge tree. Not claiming expert-level certification practice.
All conclusions cite sources.
```

---

## 1. Tree

```text
Design Approval          (TC / STC / design change approval)
        │
Production Approval      (PC / TC-Only limited production path — CASE)
        │
Airworthiness Approval   (Standard AC / Special AC / Export AC)
        │
Continuing Airworthiness (maintenance, records, AD, configuration control)
        │
Special Flight           (特许飞行证 — for flights before/outside normal AW)
```

---

## 2. Certificate meanings（民用航空产品语境 + 无人机适用）

| Term | Meaning (official-oriented) | UAS relevance | Tag |
| ---- | --------------------------- | ------------- | --- |
| TC 型号合格证 | 证明产品符合相应适航规章与环境保护要求的设计批准证件 | 中大型等需设计批准的 UAS；案例 EH216-S、V2000CG | `FACT` |
| STC 补充型号合格证 | 对已批准型号设计的更改批准路径之一 | AP-21-71 / CCAR-92 设计更改语境 | `FACT` |
| PC 生产许可证 | 生产批准，证明按批准质量体系生产 | EH216-S 获 PC0076A-ZN | `FACT`/`CASE` |
| AC 适航证（标准） | 单机适航批准；标准适航证路径 | 载人等正常/运输类路径；EH216-S 报道签发标准适航证 | `FACT`/`CASE` |
| Special AC 特殊适航证 | 限用类或过渡安全评定等路径下的适航批准；有使用限制 | CCAR-92；AC-92-AA-2024-01；AP-21-71 | `FACT` |
| Special Flight Permit 特许飞行证 | 尚未取得适航证书，为生产试飞等目的，按规申请后在许可范围飞行（民用航空法相关制度；CCAR-92 地区局职责含特许飞行证） | 取证试飞等 | `FACT` |

---

## 3. Who needs airworthiness permission?

| Aircraft class | REG-001 Art.8 | Tag |
| -------------- | ------------- | --- |
| 中型、大型 | 设计、生产、进口、飞行、维修应申请适航许可 | `FACT` |
| 微型、轻型、小型 | 无需取得适航许可；应符合产品质量法律法规及强制性国家标准 | `FACT` |

LAW-001 Art.34（2026-07-01）：设计/生产/进口/维修/飞行应申请适航许可，**按规定无需除外**。`FACT`

---

## 4. Design category split inside medium/large（AP-21-71 / CCAR-92）

| Path | Typical idea | Tag |
| ---- | ------------ | --- |
| 运输类 / 正常类 | 更高运行风险场景（载人、融合、人员稠密等）— 详见程序与风险指南 | `FACT`/`INTERPRETATION` |
| 限用类 | 不用于载人、不融合、不在人口密集区域上方等条件下可走限用类；特殊适航证 + 限制条件 | `FACT`（AP-21-71 表述） |

精确数值边界与最新程序修订以现行有效文件为准；2026 征求意见中的新型号合格审定程序文本显示进一步定义运输/正常/限用类无人驾驶航空器 — 该 PDF 状态需再核（`UNKNOWN` 是否已生效替换）。

---

## 5. Special Conditions

| Item | Content | Tag |
| ---- | ------- | --- |
| Legal hook | CCAR-92 92.327；CCAR-21 专用条件传统 | `FACT` |
| When | 新颖/独特设计；用途使现有标准不足；或尚无颁布标准 | `FACT` |
| Nature | **项目级**补充安全要求，不是行业通用规章 | `FACT` |
| Examples | EH216-S SC-21-002；V2000CG；UY-100（CONSULTATION）；TD550D SC-92-002 | `CASE` |

---

## 6. Anti-confusions

1. **型号存在 ≠ 已取得 TC**  
2. **有 TC ≠ 可任意商业飞行**（仍需运营、空域、飞行活动、保险等）  
3. **特殊适航证 ≠ 标准适航证**  
4. **过渡特殊适航 ≠ 长期替代正式型号合格审定**（见 doc 12）
