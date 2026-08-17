# 04 — Regulatory Dependency Graph

目的：回答

> 一条真实无人机业务为什么同时会碰到多部规则？

```text
INTERNAL ANALYTICAL MODEL — not an official CAAC diagram.
```

---

## 1. Verified hierarchy (law → regulation → rule → procedure)

```text
Civil Aviation Law (LAW-001)          [FUTURE_EFFECTIVE 2026-07-01]
        │  Art.34 UAS airworthiness / unique ID
        ▼
UAS Interim Regulation (REG-001)      [CURRENT_EFFECTIVE 2024-01-01]
        │
        ├──────────────────────────────┬────────────────────────────┐
        ▼                              ▼                            ▼
   CCAR-92 (RULE-001)           Airspace / ATM               Product / Standards
   running safety               (national ATM leader;        (SAMR GB; MIIT radio
   open/specific/certified      flight application;          UNKNOWN detail map)
        │                       UOM platform duty)
        │
        ├─ Pilot (B)
        ├─ Registration (C)
        ├─ Airworthiness (D) ──► AP-21-AA-2022-71
        │                         AC-21-AA-2022-40
        │                         AC-92-AA-2024-01 (TRANSITIONAL)
        │                         Special Conditions (project)
        ├─ Operator (G)
        ├─ Operation / C2 / continuing AW
        └─ UOM interactions
                 │
                 ▼
          UOM announcements + MH/T 4053 + GB RID/activation (FUTURE)
```

**Tag:** structure = `INTERPRETATION`；节点文件存在性 = `FACT`。

---

## 2. Why one commercial mission hits many instruments

示例任务（分析用，非案例）：

```text
中型货运旋翼机 × 特定类运行 × 非适飞空域航线 × 联网 C2
```

| Layer | Instrument | Why it attaches |
| ----- | ---------- | --------------- |
| S1 | REG-001 | 中型→适航许可；运营合格证；责任保险；飞行申请；识别信息 |
| S2 | RULE-001 | 运行类别评估；操控员；适航证件类别；运营规范；C2；运行控制 |
| S3 | PROC-001 / AC | 若走正式 TC/特殊适航/过渡安全评定 |
| S3 | UOM-001/002 | 登记、申请、动态数据入口 |
| S4 | MH/T 4053 / GB | 接口与识别技术要求 |
| S5 | Cases | 仅参考类似机型审定路径，不得直接套用专用条件 |

---

## 3. Two classification systems (must not conflate)

### 3.1 Aircraft Classification（航空器分类）— REG-001

| Class | Key official criteria（摘要） | Source |
| ----- | ----------------------------- | ------ |
| 微型 | 空机重量 <0.25 kg；真高≤50 m；平飞≤40 km/h；微功率短距离；可随时人工介入 | 条例第六十二条 |
| 轻型 | 空机≤4 kg 且最大起飞≤7 kg；平飞≤100 km/h；空域保持+可靠被监视；可随时人工介入；不含微型 | 同上 |
| 小型 | 空机≤15 kg 且最大起飞≤25 kg；空域保持+可靠被监视；可随时人工介入；不含微/轻 | 同上 |
| 中型 | 最大起飞重量 ≤150 kg；不含微/轻/小 | 同上 |
| 大型 | 最大起飞重量 >150 kg | 同上 |

**Tag:** `FACT`

### 3.2 Operation Classification（运行分类）— RULE-001

| Class | Official meaning（摘要） | Source |
| ----- | ------------------------ | ------ |
| 开放类 | 运营安全评估认定场景风险较小，满足一般要求即可规避风险 | CCAR-92 92.7 |
| 特定类 | 存在一定风险，除一般要求外还需风险缓解措施 | 92.7 |
| 审定类 | 风险更高，需满足审定类运行要求及运营规范 | 92.7 |

**Tag:** `FACT`

### 3.3 Mapping rule

```text
Aircraft Properties
        +
Mission
        +
Environment
        +
Operating Method
        ↓
Operation Risk / Category   ← via 运营安全评估 (CCAR-92)
```

**禁止简化为：**

```text
小型 = 开放类
中型 = 特定类
大型 = 审定类
```

**官方明确的部分耦合（≠一一对应）：**

- 条例：中型、大型系统设计/生产/进口/飞行/维修 → 需适航许可；微/轻/小原则上无需适航许可但需产品质量与强制国标等。`FACT`
- CCAR-92：若干情形直接指向开放类要求（如微型运行；轻型在适飞空域；常规农用）。`FACT`
- 仍须经运营安全评估确定特定类/审定类。`FACT`

---

## 4. Airworthiness vs Operation split

| Concern | Primary instruments | Gate cluster |
| ------- | ------------------- | ------------ |
| 设计批准 / 生产批准 / 单机适航 | REG-001 Art.8；CCAR-92 D；AP-21-71；AC；SC | G3 |
| 操控员资质 | REG-001 Art.16–17；CCAR-92 B | G4 |
| 运营合格证 / 运营规范 | REG-001 Art.11；CCAR-92 G | G5 |
| 空域与飞行活动申请 | REG-001 Ch.3 | G8–G10 |
| 动态数据 / 识别 | REG-001 Art.24；UOM-002；GB RID | G2 / G7 |
| 持续适航 / 维修 / 记录 | REG-001 Art.13；CCAR-92 维修条款 | G11 |

---

## 5. Dependency edges that matter for Tokfai routing

| From | To | Edge meaning | Tag |
| ---- | -- | ------------ | --- |
| REG-001 Art.8 | CCAR-92 D / AP-21-71 | 中大型适航管理落地 | `FACT` |
| CCAR-92 92.303 | AC-92-AA-2024-01 | 过渡安全评定操作化 | `FACT` |
| REG-001 Art.26–31 | UOM 飞行申请模块 | 申请/无需申请执行入口 | `INTERPRETATION`（平台是执行面；法律义务在条例） |
| UOM-002 | MH/T 4053 | 动态数据接口标准 | `FACT` |
| CCAR-92 92.327 | Project Special Conditions | 新颖设计/无标准→专用条件 | `FACT` |
| Project SC | Case TC | 个案审定基础 | `CASE` |

---

## 6. What this graph is not

- 不是办事流程图。  
- 不是地方管理局自由裁量清单。  
- 不是“有了 TC 就能商业飞任意空域”的证明。
