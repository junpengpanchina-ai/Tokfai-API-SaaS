# 21 — eVTOL Certification Landscape

```text
INTERNAL RESEARCH
Status enums: VERIFIED | IN_PROGRESS | APPLICATION_ACCEPTED | PUBLIC_CONSULTATION | ISSUED | NOT_FOUND | UNKNOWN
Prefer: CAAC / 地区管理局 / 交通运输部 / 企业官方对证件的明确陈述（仍需交叉验证）
Do not infer from marketing headlines alone.
```

---

## 0. Name normalization

| Brand / chat name | Likely legal / project entity | Notes |
| ----------------- | ----------------------------- | ----- |
| 亿航 / EHang | 亿航智能设备（广州）有限公司 | CAAC/中南局公开文件使用该主体 |
| 上海峰飞 / AutoFlight (cargo eVTOL) | 上海峰飞航空科技有限公司 | 华东局 V2000CG |
| 沃飞长空 / Aerofugia | 四川沃飞长空科技发展有限公司（曾用名：成都沃飞天驭科技有限公司） | 西南局 AE200-100 征求意见 |
| 小鹏汇天 / HT Aero | 需以营业执照/申请书为准；本轮 **CAAC 证件页 NOT_FOUND** | 品牌≠主体 |
| 上海时的 / AutoFlight (passenger?) | 主体待核；与峰飞品牌关系 **UNKNOWN** | 勿与峰飞混为同一 TC |
| 上海沃兰特 / Volant | 主体待核；本轮 CAAC TC/SC **NOT_FOUND** | — |
| 广汽高域 / GOVY | 主体待核；本轮 CAAC TC/SC **NOT_FOUND** | — |

---

## 1. Certification Matrix

| Company | Aircraft | Manned/Unmanned | Intended Mission | TC Application | Special Conditions | TC | PC | AC | Operator Approval | Evidence |
| ------- | -------- | --------------- | ---------------- | -------------- | ------------------ | -- | -- | -- | ----------------- | -------- |
| 亿航智能设备（广州）有限公司 | EH216-S | Unmanned manned-carrying UAS / eVTOL | 载人交通等（官方描述） | APPLICATION_ACCEPTED（2021 受理，中国民航网） | ISSUED SC-21-002（2022-02-09 CAAC） | ISSUED（2023-10 民航局/中国民航网） | ISSUED PC0076A-ZN（中南局 2024-03-28 新闻） | ISSUED 标准适航证（中南局新闻：TC 后约两月首架） | IN_PROGRESS / UNKNOWN（运营合格证：企业/媒体有受理报道；本轮未核到 CAAC 颁证全文） | caacnews；zn.caac.gov.cn；SC 页 |
| 上海峰飞航空科技有限公司 | V2000CG | Unmanned cargo eVTOL | 载货 | APPLICATION_ACCEPTED NATC0145A（2022-09） | PUBLIC_CONSULTATION→项目专用条件（征求意见稿公开；正式编号公开材料不完全） | ISSUED（华东局 2024-03-22 颁证活动） | IN_PROGRESS（华东局新闻称后续生产许可审定） | NOT_FOUND（本轮未核到 AC 颁发公告） | NOT_FOUND | hd.caac.gov.cn；征求意见 PDF |
| 四川沃飞长空科技发展有限公司 | AE200-100 | eVTOL（特殊类别有人驾驶语境） | 按专用条件征求意见：设计特征+预期运行场景 | APPLICATION_ACCEPTED（西南局已受理，CAAC 通知） | PUBLIC_CONSULTATION（2023-12 征求意见通知） | NOT_FOUND | NOT_FOUND | NOT_FOUND | NOT_FOUND | caac.gov.cn 意见征集通知 |
| 小鹏汇天（品牌） | 旅航者等（产品名待核） | 分体式陆空 / 有人驾驶倾向（行业描述） | UNKNOWN | NOT_FOUND（本轮 caac.gov.cn 未核到 TC/SC 页） | NOT_FOUND | NOT_FOUND | NOT_FOUND | NOT_FOUND | NOT_FOUND | — |
| 上海时的（品牌） | UNKNOWN | UNKNOWN | UNKNOWN | NOT_FOUND | NOT_FOUND | NOT_FOUND | NOT_FOUND | NOT_FOUND | NOT_FOUND | — |
| 上海沃兰特（品牌） | VE25 等（非 CAAC 核验） | 有人驾驶试验报道存在 | UNKNOWN | NOT_FOUND | NOT_FOUND | NOT_FOUND | NOT_FOUND | NOT_FOUND | NOT_FOUND | — |
| 广汽高域（品牌） | UNKNOWN | UNKNOWN | UNKNOWN | NOT_FOUND | NOT_FOUND | NOT_FOUND | NOT_FOUND | NOT_FOUND | NOT_FOUND | — |

**Counts:** companies researched = 7；certification cases with CAAC-verifiable issued TC = 2（EH216-S, V2000CG）；SC issued = 1+（EH216-S）；SC consultation = 2+（V2000CG historical, AE200）。

---

## 2. Why same “eVTOL” label ≠ same certification path

```text
Aircraft Architecture
+ Expected Operation
+ Certification Basis (rules + SC)
+ Means of Compliance
+ Timeline / Authority
```

| Dimension | EH216-S | V2000CG | AE200-100 |
| --------- | ------- | ------- | --------- |
| Occupants | 载人无人驾驶 | 不载人货运 | 有人驾驶特殊类别（征求意见语境） |
| Rule stack | CCAR-92 UAS + 项目 SC | CCAR-92/21 + AP-21-71 + 项目 SC | CCAR-21 特殊类别 + 项目 SC |
| Basis driver | 载人无人驾驶新颖特征 | 吨级 eVTOL 货运 + 无专门规章 | 特殊类别 eVTOL 设计+场景 |
| Reusable | 程序：SC→符合性验证→TC/PC | 程序：设计+场景→SC | 程序：特殊类别 SC |
| Case-specific | SC-21-002 全文 | V2000CG SC 条款 | AE200 SC 条款 |

---

## 3. Certification Strategy Patterns（INTERNAL）

### PATTERN_A — 无人驾驶载人型

| | |
| - | - |
| KNOWN | EH216-S：SC + TC + PC + 标准 AC 路径公开 |
| UNKNOWN | 运营合格证普遍条件；载人商业空域常态化规则 |
| CASE_SPECIFIC | SC-21-002；TC-Only 限量生产 |

### PATTERN_B — 无人驾驶货运型

| | |
| - | - |
| KNOWN | V2000CG TC；UY-100/FP-981C 等货运 UAS 走项目 SC |
| UNKNOWN | 货运 eVTOL 通用适航标准是否已成型 |
| CASE_SPECIFIC | 各型号运行场景写入审定基础 |

### PATTERN_C — 有人驾驶载客型

| | |
| - | - |
| KNOWN | AE200 按特殊类别+CCAR-21 制定 SC（征求意见） |
| UNKNOWN | 最终 SC/TC 状态 |
| CASE_SPECIFIC | 有人驾驶人因/座舱条款 |

### PATTERN_D — 分体式陆空交通工具

| | |
| - | - |
| KNOWN | 行业存在此类产品概念 |
| UNKNOWN | 是否按航空器/道路车辆/组合产品监管；CAAC 证件 NOT_FOUND |
| CASE_SPECIFIC | 若存在申请，必为项目基础 |

### PATTERN_E — 其他特殊类别

| | |
| - | - |
| KNOWN | CCAR-21 特殊类别机制；限用类 UAS 标准在发展（征求意见材料存在） |
| UNKNOWN | 类别标准生效后对存量 SC 项目的迁移 |
| CASE_SPECIFIC | 共轴无人直升机等（TD550D SC-92-002） |

---

## 4. Hard rule for Tokfai

```text
品牌宣传 “已获适航” ≠ TC/PC/AC/运营合格证 任一具体证件
必须问：哪一种证？文号？颁发机关？使用限制？
```
