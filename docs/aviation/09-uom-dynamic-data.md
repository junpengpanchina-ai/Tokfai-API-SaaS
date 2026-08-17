# 09 — UOM Dynamic Data

Primary source: **UOM-002**（2024-11-15 CAAC 公告）  
Interface standard: **MH/T 4053-2022**  
Upstream legal hooks: REG-001；RULE-001；《民用无人驾驶航空器系统安全要求》（公告引用，本轮未单列深读全文 → 部分 `UNKNOWN`）

---

## 1. Who must do what（FACT from UOM-002）

| Actor | Obligation |
| ----- | ---------- |
| 运行人 | 使用**轻型、小型、中型、大型**民用无人驾驶航空器实施飞行活动时，确保向 UOM 联网报送飞行动态数据；运行时**不得关闭**报送功能 |
| 制造方 | 确保生产的**轻型和小型**民用无人驾驶航空器具备按规定向 UOM 报送飞行动态数据的能力 |
| 接口 | 按 MH/T 4053 执行 |
| 原 UTMISS 用户 | 切换至 UOM；制造方与民航局信息中心联系；**2024-12-31 前**完成切换 |
| 尚未实现者 | 及时按接口标准直接向 UOM 报送 |

**微型：** 本公告第一款未列入轻/小/中/大运行人句。条例另有识别信息要求（第二十四条）。微型动态数据与 RID 的精确工程重叠：`UNKNOWN`。

---

## 2. Regulation → engineering translation

```text
REGULATION (条例 / CCAR-92 / 公告)
    ↓
NETWORK INTERFACE (MH/T 4053)
    ↓
AIRCRAFT / GCS SOFTWARE (telemetry + identity + session)
    ↓
DATA FIELDS (position, status, identity… — field list PARTIAL until full standard table)
    ↓
TRANSPORT (IP / cellular / other — exact profiles in standard)
    ↓
UOM
    ↓
MONITORING (ATM / regulator)
```

这是 Tokfai 未来：

```text
Aviation × Software × Telecom
```

的第一跨行业连接点。

---

## 3. Responsibility split

| Stage | Manufacturer | Operator | Tag |
| ----- | ------------ | -------- | --- |
| 设计生产能力（轻/小） | 必须具备报送能力 | — | `FACT` |
| 运行中开启报送（轻/小/中/大） | 设备能力 | 确保启用且不关闭 | `FACT` |
| 接口切换 UTMISS→UOM | 联系信息中心完成 | 使用已切换设备 | `FACT` |
| 中/大型制造方能力是否同等强制写入公告第二款 | 公告第二款只写轻/小 | — | `FACT`（文本范围）；是否另有规章覆盖中大型制造能力：`UNKNOWN` |

---

## 4. Relation to GB 46750 RID（FUTURE_EFFECTIVE 2026-05-01）

| Item | Status |
| ---- | ------ |
| GB 要求开机后及飞行全过程报送身份/位置/速度/状态 | `FACT`（官方发布解读） |
| 与 MH/T 4053 / UOM 动态数据是否同一管道 | `UNKNOWN` |
| 存量机加装过渡（媒体/地方转述 12 个月加装等） | 需回国家标准正文核对；本轮标 `UNKNOWN` 直至全文条款级摘录 |

---

## 5. Open engineering questions

见 [19-open-questions.md](./19-open-questions.md) UOM / C2 / ENGINEERING 分类。
