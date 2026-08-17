# 03 — Regulatory Source Registry

状态枚举（仅允许）：

```text
CURRENT_EFFECTIVE
FUTURE_EFFECTIVE
SUPERSEDED
TRANSITIONAL
DRAFT
CONSULTATION
UNKNOWN
```

`已读正文`：`YES` = 本轮打开官方全文/附件并摘录；`PARTIAL` = 读到官方页面要点或部分 PDF；`NO` = 仅发现标题。

---

## Source Registry Table

| Source ID | 名称 | 文号 | 发布机关 | 层级 | 发布日 | 生效日 | 当前状态 | 适用对象 | 核心主题 | 官方来源 | 已读正文 |
| --------- | ---- | ---- | -------- | ---- | ------ | ------ | -------- | -------- | -------- | -------- | -------- |
| LAW-001 | 中华人民共和国民用航空法（2026-07-01起施行版本） | 全国人大常委会通过文本 | 全国人大常委会 | S0 法律 | 2025-12-27（通过/公布相关） | 2026-07-01 | FUTURE_EFFECTIVE | 民用航空活动；含民用无人驾驶航空器专条 | 适航许可、唯一产品识别码、飞行/设计/生产/维修边界 | [npc.gov.cn](http://www.npc.gov.cn/npc/c2/c30834/202512/t20251227_450737.html)；[caac.gov.cn](http://www.caac.gov.cn/XXGK/XXGK/FLFG/202512/t20251227_229597.html) | YES |
| REG-001 | 无人驾驶航空器飞行管理暂行条例 | 国务院、中央军委令第761号 | 国务院、中央军委 | S1 行政法规 | 2023-05-31 | 2024-01-01 | CURRENT_EFFECTIVE | 境内无人驾驶航空器飞行及有关活动 | 分类、登记、适航、运营、保险、操控员、空域、飞行申请、无需申请、法律责任 | [gov.cn 公报](https://www.gov.cn/gongbao/2023/issue_10586/202307/content_6893000.html) | YES |
| RULE-001 | 民用无人驾驶航空器运行安全管理规则 | 交通运输部令2024年第1号；CCAR-92 | 交通运输部 | S2 民航规章 | 2024-01-01 | 2024-01-01（公布之日起施行） | CURRENT_EFFECTIVE | 境内民用无人驾驶航空器运行及有关活动；室内例外见规章 | 开放/特定/审定类、操控员、登记、适航、运营、C2、持续适航、UOM、法律责任 | [caac.gov.cn](https://www.caac.gov.cn/XXGK/XXGK/MHGZ/202401/t20240103_222566.html)；PDF附件 | YES |
| RULE-002 | 民用航空产品和零部件合格审定规定 | CCAR-21（本轮引用版次：R4） | 交通运输部 / 民航规章体系 | S2 | （以现行有效版为准） | （以现行有效版为准） | CURRENT_EFFECTIVE（据案例与程序引用） | 民用航空产品合格审定；案例中被 UAS TC/PC 引用 | TC/PC/AC 基础框架、专用条件授权条款 | 案例引用；本轮未重读全文每一条 | PARTIAL |
| PROC-001 | 民用无人驾驶航空器系统适航审定管理程序 | 民航规〔2022〕64号；AP-21-AA-2022-71 | 中国民用航空局 | S3 管理程序 | 2022-12-19 | 下发即适用（信息公开页：有效） | CURRENT_EFFECTIVE | 中型、大型民用无人驾驶航空器系统设计/生产/适航批准 | TC/STC、PC、适航证、特殊适航证、限用/正常/运输类路径 | [caac.gov.cn](http://www.caac.gov.cn/XXGK/XXGK/GFXWJ/202302/t20230213_217212.html)；PDF | YES |
| AC-001 | 民用无人驾驶航空器系统适航审定分级分类和系统安全性分析指南 | 民航适发〔2022〕18号；AC-21-AA-2022-40 | CAAC 航空器适航审定司 | S3 咨询通告 | 2022-12-21 | （信息公开：有效） | CURRENT_EFFECTIVE | 面向适航审定的分级分类与系统安全性分析 | 运行风险等级、可接受安全性水平、FHA/PSSA 等 | [caac.gov.cn](http://www.caac.gov.cn/XXGK/XXGK/GFXWJ/202302/t20230213_217211.html)；PDF | YES |
| AC-002 | 民用无人驾驶航空器系统适航安全评定指南 | 民航适函〔2024〕5号；AC-92-AA-2024-01 | CAAC 航空器适航审定司 | S3 咨询通告 | 2024-02-05 | 下发适用；与过渡窗口绑定 | TRANSITIONAL | 2024-01-01前已设计定型且不设计更改的中/大型；拟特定类运营合格证路径 | 安全评定→特殊适航证；有效期至迟 2026-11-26 | [caac.gov.cn](http://www.caac.gov.cn/XXGK/XXGK/GFXWJ/202402/t20240226_223030.html)；PDF | YES |
| STD-001 | 民用无人驾驶航空器系统运行识别规范 | GB 46750-2025 | 国家标准委 | S4 强制性国家标准 | 2025-10-31 | 2026-05-01 | FUTURE_EFFECTIVE | 民用无人驾驶航空器系统运行识别 | 开机后及飞行全过程报送身份/位置/速度/状态等 | [国家标准平台](https://std.samr.gov.cn/gb/search/gbDetailed?id=42BD8BAE300A08A1E06397BE0A0AB162)；[sac.gov.cn](https://www.sac.gov.cn/xw/bzhdt/art/2025/art_8ebe87cd5e4b4b62a3b48b61d82c1f89.html) | PARTIAL（官方摘要+平台元数据；全文条款级未逐条抄录） |
| STD-002 | 民用无人驾驶航空器实名登记和激活要求 | GB 46761-2025 | 国家标准委 | S4 强制性国家标准 | 2025-10-31 | 2026-05-01 | FUTURE_EFFECTIVE | 实名登记与激活 | 激活前/取消激活后不得具备飞行能力等 | [ndls/国家标准信息](https://www.ndls.org.cn/standard/detail/9a0bf99393146fd304c5fe0076f85cc9)；sac.gov.cn | PARTIAL |
| STD-003 | 民用无人驾驶航空器空中交通管理信息服务系统数据接口规范 | MH/T 4053-2022 | CAAC（空管行业管理办公室办文） | S4 行业标准 | 2022-07-04 | （信息公开：有效） | CURRENT_EFFECTIVE | UTMISS/UOM 飞行动态数据接口 | 接口规范；被 2024-11-15 公告引用 | [caac.gov.cn](http://www.caac.gov.cn/XXGK/XXGK/BZGF/HYBZ/202207/t20220712_214079.html) | PARTIAL（元数据+公告引用；接口字段全文未逐字段建表） |
| UOM-001 | 中国民用航空局关于民用无人驾驶航空器监管服务有关事宜的公告 | （通知公告） | 中国民用航空局 | S3 官方公告 | 2023-12-31 前后发布 | 配合条例 2024-01-01 | CURRENT_EFFECTIVE + 含 TRANSITIONAL 条款 | UOM 上线；实名登记/空域/飞行申请/运营换证；中大型适航过渡 | UOM；2026-11-26 过渡政策 | [caac.gov.cn](https://www.caac.gov.cn/XXGK/XXGK/TZTG/202312/t20231231_222550.html) | PARTIAL（多源官方转载全文要点已核；主站一次超时，以官方转载与规章交叉验证） |
| UOM-002 | 关于发布民用无人驾驶航空器飞行动态数据报送要求的公告 | （通知公告） | 中国民用航空局（空管行业管理办公室） | S3 官方公告 | 2024-11-15 | 公告之日起适用；UTMISS 切换截止 2024-12-31 | CURRENT_EFFECTIVE | 轻/小/中/大运行人报送；轻/小制造方能力；接口 MH/T 4053 | 动态数据；UOM；UTMISS→UOM | [caac.gov.cn](https://www.caac.gov.cn/XXGK/XXGK/TZTG/202411/t20241115_225851.html) | YES |
| SC-001 | 亿航 EH216-S 型无人驾驶航空器系统专用条件 | SC-21-002 | CAAC 航空器适航审定司 | S3 专用条件 | 2022-02-09 | 颁发之日起（信息公开：有效） | CURRENT_EFFECTIVE（对该型号） | **仅** EH216-S | 项目专用审定基础 | [caac.gov.cn](https://www.caac.gov.cn/XXGK/XXGK/BZGF/ZYTJHHM/202202/t20220222_211914.html)；PDF | YES |
| SC-002 | 峰飞 V2000CG 型无人驾驶航空器系统专用条件 | SC-21-004（征求意见稿/后续正式编号以局方为准） | 审查组/局方 | S3 | 2023 征求意见 | 以正式颁发文本为准 | UNKNOWN→CASE 材料存在；正式页状态待再核 | **仅** V2000CG | eVTOL 载货审定基础 | [征求意见稿 PDF](https://www.caac.gov.cn/PHONE/HDJL/YJZJ/202305/P020230531536211321623.pdf) | PARTIAL |
| SC-003 | UY-100 大型货运固定翼无人机系统专用条件 | （征求意见稿） | 东北局审查组 / 局方征求意见 | S3 | 2025-02 征求意见 | 未作为普遍规章 | CONSULTATION | **仅** UY-100 项目 | 设计特征+预期场景驱动的审定基础 | [caac.gov.cn 意见征集](https://www.caac.gov.cn/PHONE/HDJL/YJZJ/202502/t20250212_226675.html)；PDF | YES |
| SC-004 | TD550D 型共轴式无人直升机系统专用条件 | SC-92-002 | CAAC | S3 | 2025-02-10 | 颁发之日起 | CURRENT_EFFECTIVE（对该型号） | **仅** TD550D | 共轴无人直升机审定基础 | [caac.gov.cn PDF](http://www.caac.gov.cn/PHONE/XXGK_17/XXGK/BZGF/ZYTJHHM/202502/P020250210617013476158.pdf) | PARTIAL |
| SC-005 | FP-981C 型无人驾驶航空器系统专用条件 | （征求意见稿） | 华东局审查组 | S3 | 2025-04 左右征求意见 | — | CONSULTATION | **仅** FP-981C | 商业载货、非人口密集区场景 | [caac.gov.cn PDF](https://www.caac.gov.cn/HDJL/YJZJ/202504/P020250421614665245539.pdf) | PARTIAL |
| PROC-002 | 生产批准和监督程序 | AP-21-AA-2023-31R2（案例引用） | CAAC | S3 | （以现行有效版为准） | — | CURRENT_EFFECTIVE（据 EH216-S PC 案例引用） | 生产批准 | PC 审查 | 案例引用；全文未本轮通读 | PARTIAL |
| CASE-SRC-001 | 中南局颁发全国首张载人无人机生产许可证（EH216-S） | 地区新闻 | 中南地区管理局 | S5 官方案例 | 2024-04-16 | n/a | CASE 叙述 | EH216-S PC / TC-Only | TC 与 PC 并行、TC-Only 特殊程序 | [zn.caac.gov.cn](http://zn.caac.gov.cn/ZN_DQYW/202404/t20240416_223537.html) | YES |
| CASE-SRC-002 | 华东局颁发 V2000CG 型号合格证 | 地区新闻 | 华东地区管理局 | S5 | 2024-04-10 | n/a | CASE | V2000CG TC | 吨级 eVTOL 审定路径 | [hd.caac.gov.cn](http://hd.caac.gov.cn/HD_DQYW/202404/t20240410_223477.html) | YES |
| CASE-SRC-003 | 东北局 UY-100 专用条件草案审查报道 | 地区新闻 | 东北地区管理局 | S5 | 2024-08-30 | n/a | CASE | UY-100 | 专用条件+PSCP 审查 | [db.caac.gov.cn](http://db.caac.gov.cn/DB_DQYW/202409/t20240903_225264.html) | YES |
| AC-003 | 基于计算机的民用无人驾驶航空器运行控制系统管理办法 | 民航规〔2026〕2号；AC-92-FS-002 | CAAC 飞行标准司 | S3 | 2026-01-16 | 下发之日起 | CURRENT_EFFECTIVE | 自建运行控制系统 / 无人机云系统 | 运行控制、申请批准、MH/T 2011、UOM 公示 | [caac.gov.cn](http://www.caac.gov.cn/XXGK/XXGK/GFXWJ/202602/t20260202_229945.html)；PDF | YES |
| STD-004 | 民用无人驾驶航空器实名登记数据交换接口规范 | MH/T 3030-2023 | CAAC | S4 | 2023-03-08 | （信息公开：有效） | CURRENT_EFFECTIVE | 实名登记数据交换 | 接口规范 | [caac.gov.cn](http://www.caac.gov.cn/PHONE/XXGK_17/XXGK/BZGF/HYBZ/202307/t20230712_220608.html) | PARTIAL |
| STD-005 | 无人机云系统数据规范 | MH/T 2011—2019 | CAAC（由 AC-92-FS-002 引用） | S4 | 2019（引用） | （以现行有效版为准） | CURRENT_EFFECTIVE（据 AC 引用） | 运行控制系统/云系统数据 | 传输/告警/上报/安全 | AC-92-FS-002 引用；全文未本轮通读 | PARTIAL |
| CASE-SRC-004 | 沃飞长空 AE200-100 专用条件征求意见通知 | 意见征集 | 西南局 / CAAC | S5 | 2023-12-01 | n/a | CONSULTATION | AE200-100 | 特殊类别 eVTOL SC | [caac.gov.cn](https://www.caac.gov.cn/PHONE/HDJL/YJZJ/202312/t20231201_222195.html) | YES |

---

## LAW-001 — Article 34 focus

**Status:** `FACT`（2026-07-01 起施行文本）

第三十四条要点：

1. 从事民用无人驾驶航空器的**设计、生产、进口、维修和飞行活动**，应当按照国家有关规定向国务院民用航空主管部门申请取得**适航许可**，**按照规定无需取得适航许可的除外**。  
2. 从事生产的机构应当按照国家有关规定设置**唯一产品识别码**。

**INTERPRETATION：** 新民用航空法把“无需适航许可”的例外继续留给“国家有关规定”（当前主要对应条例第八条微/轻/小无需适航许可等）。不可把第34条读成“所有无人机一律立刻要适航证”。

---

## REG-001 — Topic index（条例）

| Topic | Typical articles（条例） | Tag |
| ----- | ------------------------ | --- |
| 分类定义 | 第二条相关用语第六十二条 | `FACT` |
| 实名登记 | 第十条；罚则第四十七条 | `FACT` |
| 适航 | 第八条；中大型 vs 微轻小 | `FACT` |
| 运营合格证 | 第十一条；常规农用例外 | `FACT` |
| 保险 | 第十二条；罚则第四十八条 | `FACT` |
| 操控员 | 第十六–十七条 | `FACT` |
| 空域 / 适飞空域 | 管制空域列举；适飞空域定义 | `FACT` |
| 飞行活动申请 | 第二十六–三十条 | `FACT` |
| 无需申请 | 第三十一条 + 例外回流 | `FACT` |
| 特殊飞行活动 | 第三十一条第二款等 | `FACT` |
| 识别信息 / 广播 | 第二十四条 | `FACT` |
| 应急 / 紧急任务 | 第二十九条等 | `FACT` |
| 法律责任 | 第四十四章起 | `FACT` |
| 部门职责 | 总则及监督管理章 | `FACT` |

---

## RULE-001 — Topic index（CCAR-92）

| Topic | Pointer | Tag |
| ----- | ------- | --- |
| 开放类 / 特定类 / 审定类 | 92.7；G章运行要求 | `FACT` |
| 操控员 | B章 | `FACT` |
| 登记 | C章 | `FACT` |
| 适航 / 溯及力 / 过渡 | D章；92.303 | `FACT` + `TRANSITIONAL` |
| 运营合格证 | 92.603 等 | `FACT` |
| 运行控制 | 92.615 等 | `FACT` |
| 持续适航 / 维修 / 记录 | 审定类等条款；92.707 等 | `FACT` |
| C2 | 92.679；92.697 等 | `FACT` |
| UOM | 总则平台定义与交互条款 | `FACT` |
| 法律责任 | J章等 | `FACT` |

---

## Count snapshot (R1)

| Metric | Count |
| ------ | ----- |
| Registry rows | 21 |
| CURRENT_EFFECTIVE（整份或主体） | 12 |
| FUTURE_EFFECTIVE | 3（LAW-001；STD-001；STD-002） |
| TRANSITIONAL（整份或以过渡为主） | 2（AC-002；UOM-001 第七条等） |
| DRAFT / CONSULTATION | 2（SC-003；SC-005） |
| UNKNOWN / CASE-only | 若干元数据字段 |

> `TRANSITIONAL` 不等于“无效”；表示含有明确时间窗/存量过渡路径的官方文件或条款。
