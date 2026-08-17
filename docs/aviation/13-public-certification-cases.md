# 13 — Public Certification Cases

```text
S5 sources only for CASE facts.
GENERAL RULE vs CASE-SPECIFIC must stay separated.
Fields REUSABLE / CASE_SPECIFIC / UNKNOWN required.
```

---

## Case index

| CASE_ID | Aircraft | Outcome (public) | Authority |
| ------- | -------- | ---------------- | --------- |
| CASE-EH216S | EH216-S | TC + PC + 标准适航证（报道） | 民航局 / 中南局 |
| CASE-V2000CG | V2000CG | TC | 华东局 |
| CASE-UY100 | UY-100 | TC 受理 + 专用条件征求意见（尚未本轮核到 TC 颁发） | 东北局 |
| CASE-TD550D | TD550D | 专用条件已颁发 SC-92-002 | 中南局受理 |
| CASE-FP981C | FP-981C | 专用条件征求意见 | 华东局受理 |

---

## CASE-EH216S

| Field | Content |
| ----- | ------- |
| CASE_ID | CASE-EH216S |
| Applicant | 亿航智能设备（广州）有限公司 |
| Aircraft | EH216-S |
| Aircraft Type | 载人无人驾驶航空器系统（多旋翼） |
| Intended Operation | 载人相关（以专用条件/审定资料为准） |
| Authority | 民航局颁发 TC；中南局 PC 与适航证相关工作 |
| Application | PC 申请于 2023-05（当时 TC 仍在符合性验证） |
| Certification Path | TC 审查中并行申请 PC；TC 后 TC-Only 限量生产；再完成 PC |
| Certification Basis | 专用条件 SC-21-002 等 |
| Special Conditions | SC-21-002（针对 EH216-S） |
| Timeline | TC：2023-10-12；TC 后约两月首架标准适航证；PC：2024-03-28（PC0076A-ZN） |
| Evidence / Tests Mentioned | 官方新闻未逐条列试验；PC 审查含质量体系、现场、供应商管理 |
| Outcome | TC + PC + 标准适航证（中南局新闻） |
| Unique Procedure | **允许在 TC 审查过程中申请 PC**；**TC-Only** 特殊程序限量生产 |
| Reusable Lesson | `REUSABLE`：规章程序允许 TC 过程中申请 PC（新闻明确“按照现行有效规章程序”） |
| Non-Reusable Elements | `CASE_SPECIFIC`：SC-21-002 条款；载人构型；限量生产批准数量；审查组裁量 |
| Official Sources | [中南局新闻](http://zn.caac.gov.cn/ZN_DQYW/202404/t20240416_223537.html)；[SC-21-002](https://www.caac.gov.cn/XXGK/XXGK/BZGF/ZYTJHHM/202202/t20220222_211914.html) |

### EH216-S deep notes（§17）

| Question | Answer | Tag |
| -------- | ------ | --- |
| 为什么允许 TC/PC 并行？ | 中南局：按现行有效规章程序，允许在 TC 审查过程中申请 PC | `CASE`+`FACT`（对该案程序依据的官方陈述） |
| TC-Only 是什么？ | “依据型号合格证生产”特殊程序：对生产检查系统专项评估，批准一定数量限制的生产计划 | `CASE` |
| 能否推广为“永远一起办”？ | **不能**。并行与 TC-Only 依赖规章程序条件、质量体系成熟度与局方评估 | `INTERPRETATION` |
| 什么不能当普遍规则？ | 专用条件全文；限量架次；“全球首张”叙事下的商业承诺 | `CASE_SPECIFIC` |

---

## CASE-V2000CG

| Field | Content |
| ----- | ------- |
| CASE_ID | CASE-V2000CG |
| Applicant | 上海峰飞航空科技有限公司 |
| Aircraft | V2000CG |
| Aircraft Type | 吨级以上电动垂直起降（eVTOL）无人驾驶航空器系统；载货 |
| Intended Operation | 载货（专用条件征求意见稿） |
| Authority | 华东局审查组；民航局指导 |
| Application | 2022-09-27 申请；2022-09-29 受理 NATC0145A |
| Certification Path | 型号合格审定；依据 CCAR-92、CCAR-21-R4、AP-21-AA-2022-71 |
| Certification Basis | 因局方尚未针对该类型颁布专门适航规章，按 CCAR-21 制定专用条件 |
| Special Conditions | 峰飞 V2000CG 专用条件（征求意见稿公开；正式编号公开材料指向 SC-21-004 类） |
| Timeline | 受理 2022-09；审查组 2022-11（约20人）；颁证活动 2024-03-22；新闻 2024-04-10 |
| Evidence / Tests Mentioned | “符合性验证审查”；基于 eVTOL 设计及运行特点优化审定模式（新闻未列科目清单） |
| Outcome | 颁发 TC；新闻称后续推进生产许可审定 |
| Unique Procedure | 吨级 eVTOL 审定方法探索（地区局总结表述） |
| Reusable Lesson | `REUSABLE`：**设计特征 + 预期用途/场景 → 驱动专用条件/审定基础** |
| Non-Reusable Elements | `CASE_SPECIFIC`：eVTOL 动力/升力构型条款；载货运行包线；审查组创新措施细节 |
| Official Sources | [华东局新闻](http://hd.caac.gov.cn/HD_DQYW/202404/t20240410_223477.html)；[专用条件征求意见稿](https://www.caac.gov.cn/PHONE/HDJL/YJZJ/202305/P020230531536211321623.pdf) |

### V2000CG deep notes（§18）

为什么设计特点 + 预期运行场景影响审定基础？

- 官方征求意见稿：尚无专门适航规章时，须按 CCAR-21 制定适用于**该具体型号设计和预期用途**且具有可接受安全水平的适航要求。`FACT`  
- 审查组综合设计特征与预期用途/运行场景编制专用条件。`FACT`  
→ 同类“eVTOL”也不能直接复制另一型号专用条件。`INTERPRETATION`

---

## CASE-UY100

| Field | Content |
| ----- | ------- |
| CASE_ID | CASE-UY100 |
| Applicant | 哈尔滨哈飞航空工业有限责任公司 |
| Aircraft | UY-100 |
| Aircraft Type | 大型货运固定翼无人机系统（有人机平台改型） |
| Intended Operation | 人口稀疏区、不载人、隔离空域、点对点货物运输 |
| Authority | 东北地区管理局；受理编号 NATC0200A（2024-01-03） |
| Application | 型号合格证申请 |
| Certification Path | AP-21-AA-2022-71；CCAR-92 92.327 专用条件 |
| Certification Basis | **项目专用条件**（征求意见稿明确作为型号合格审定基础） |
| Special Conditions | UY-100 专用条件征求意见稿（2025-02 公开征求意见） |
| Timeline | 受理 2024-01；2024-08 专用条件草案与 PSCP 审查报道；2025-02 公开征求意见 |
| Evidence / Tests Mentioned | 征求意见稿描述能力（自主起降、故障诊断、航路重规划等）；符合性验证细节未在新闻列全 |
| Outcome | 本轮**未核到** TC 已颁发 → Outcome=`UNKNOWN`（进行中） |
| Unique Procedure | 成熟有人机取消驾驶体系 + 加装飞控/测控等；场景高度限定 |
| Reusable Lesson | `REUSABLE`：专用条件由**具体设计特征 + 预期用途及运行场景**共同决定 |
| Non-Reusable Elements | `CASE_SPECIFIC`：UY-100 条款；隔离空域货运假设；改型基线 |
| Official Sources | [征求意见函](https://www.caac.gov.cn/PHONE/HDJL/YJZJ/202502/t20250212_226675.html)；[草案 PDF](https://www.caac.gov.cn/HDJL/YJZJ/202502/P020250212301961035758.pdf)；[东北局审查新闻](http://db.caac.gov.cn/DB_DQYW/202409/t20240903_225264.html) |

### UY-100 deep notes（§19）

典型 **Case-specific certification basis**：

- 不是“大型货运固定翼通用规章已完备”  
- 而是审查组按 92.327 为**该型号**制定专用条件  
- 预期场景写入审定逻辑（人口稀疏、隔离、点对点）→ 换场景可能触发不同基础 `INTERPRETATION`

---

## CASE-TD550D（additional）

| Field | Content |
| ----- | ------- |
| CASE_ID | CASE-TD550D |
| Applicant | 深圳联合飞机科技有限公司 |
| Aircraft | TD550D 共轴式无人直升机系统 |
| Intended Operation | 电力巡线、林草巡检、边防巡检等（专用条件背景） |
| Authority | 中南局受理 NATC0205A（2023-12-29） |
| Certification Basis | SC-92-002（2025-02-10 颁发） |
| Outcome | 专用条件已颁；TC 是否已颁本轮 `UNKNOWN` |
| Reusable | 无现成规章 → 92.327 专用条件 |
| Case-specific | 共轴构型与任务载荷场景条款 |
| Official Sources | SC-92-002 PDF（caac.gov.cn） |

---

## CASE-FP981C（additional）

| Field | Content |
| ----- | ------- |
| CASE_ID | CASE-FP981C |
| Applicant | 航天时代飞鹏有限公司 |
| Aircraft | FP-981C（型别 FP-981C-BE） |
| Intended Operation | 商业载货；非人口密集区/边远、海岛、应急等；通常不融合空域 |
| Authority | 华东局受理 NATC0222A（2024-04） |
| Status | CONSULTATION 专用条件 |
| Official Sources | 2025-04 征求意见稿 PDF |

---

## Cross-case lessons

| Lesson | Type |
| ------ | ---- |
| 专用条件绑定具体型号 | `FACT` |
| 预期运行场景进入审定基础叙事 | `FACT`/`CASE` |
| TC 与运营/空域合规是不同 Gate | `INTERPRETATION` |
| 并行 PC / TC-Only 是程序可能性 + 局方评估，不是自动权利 | `CASE`+`INTERPRETATION` |
| 征求意见稿 ≠ 已批准 TC | `FACT` |
