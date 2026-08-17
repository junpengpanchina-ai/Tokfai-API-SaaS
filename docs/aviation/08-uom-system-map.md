# 08 — UOM System Map

UOM = 民用无人驾驶航空器综合管理平台  
官方入口：`https://uom.caac.gov.cn`（UOM-001 / UOM-002）

```text
UOM is a system-of-systems surface, not “just a website”.
INTERNAL MAP — functions inferred only from official texts.
```

---

## 1. Official role statements

| Statement | Source | Tag |
| --------- | ------ | --- |
| 国家空中交通管理领导机构统筹建设无人驾驶航空器一体化综合监管服务平台 | REG-001 | `FACT` |
| 2024-01-01 零时起 UOM 上线 | UOM-001 | `FACT` |
| CCAR-92：民用无人驾驶航空器综合管理平台是一体化综合监管服务平台组成部分；局方实现操控员管理、登记管理、适航管理、空中交通管理、运营管理等功能并提供服务 | RULE-001 | `FACT` |
| 飞行动态数据向 UOM 联网报送 | UOM-002 | `FACT` |
| 航行服务提供方系统应与平台交互空域航线、飞行活动申请、起飞前确认、身份及飞行动态等 | RULE-001 | `FACT` |

---

## 2. Function decomposition

| Function block | What official texts support | Gate |
| -------------- | --------------------------- | ---- |
| 实名登记 | 条例第十条；UOM 作为登记执行面 | G2 |
| 人员资质 | CCAR-92 平台功能列举含操控员管理 | G4 |
| 航空器适航 | 平台功能列举含适航管理；证件状态查询能力细节 | G3；细节 `UNKNOWN` |
| 运营管理 | 运营合格证转换/填报（UOM-001 第八条） | G5 |
| 空域查询 | 适飞/管制空域服务（UOM-001 主题） | G8 |
| 飞行申请 | 飞行活动申请与确认流程的数字化入口 | G9 |
| 动态数据 | UOM-002 + MH/T 4053 | G7 |
| 监管 | 一体化动态监管与服务（条例平台条款） | 多 Gate |

---

## 3. Actor diagram

```text
Aircraft
   │
   ├─ Identity (unique ID / RID)
   ├─ Registration / Activation
   ├─ Operational / dynamic data
   │
Operator ─────→ UOM ←──── Regulator (CAAC / ATM / others)
   │               ▲
Pilot ─────────────┘
   │
Flight Plan / Application / Pre-flight confirmation
```

---

## 4. What UOM is not

| Claim | Verdict |
| ----- | ------- |
| UOM 账号开通 = 全部合规完成 | False |
| UOM 显示可申请 = 适航/运营已满足 | False |
| UOM 动态数据通 = 空域永久开放 | False |
| 地方低空平台可替代 UOM 法定义务 | `UNKNOWN` / 通常不可替代全国法定义务（`INTERPRETATION`） |

---

## 5. Engineering view (for Tokfai later)

```text
Human + Org credentials
        ↓
UOM web / API surfaces   ← many interfaces UNKNOWN publicly
        ↓
Registry DB / Airspace / Ops / AW modules
        ↓
Interconnect: ATM service providers, manufacturers, aircraft/GCS
```

公开 API 完整规范：`UNKNOWN`（除 MH/T 4053 动态数据接口被公告引用外）。
