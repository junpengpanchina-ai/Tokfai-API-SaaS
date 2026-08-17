# 05 — Tokfai Regulatory Gate Model

```text
INTERNAL ANALYTICAL MODEL
Not official CAAC terminology.
```

用途：把监管文本拆成可追问的决策门。  
每个 Gate 回答：依据、输入事实、决策变量、可能结果、证据、审批主体、例外、未知。

---

## Gate overview

| Gate | Name |
| ---- | ---- |
| G0 | Scope |
| G1 | Aircraft Classification |
| G2 | Product Identity |
| G3 | Airworthiness |
| G4 | Pilot / Crew |
| G5 | Operator |
| G6 | Insurance |
| G7 | System Connectivity |
| G8 | Airspace |
| G9 | Flight Activity |
| G10 | Mission Specific |
| G11 | Continuing Operation |

---

## G0 — Scope

| Field | Content |
| ----- | ------- |
| Gate | G0 Scope |
| Official basis | REG-001 第二条：境内无人驾驶航空器飞行及有关活动；军用另有规定的适用其规定；CCAR-92 室内飞行对 E/F 章例外 |
| Input facts | 是否军用/警察海关任务；是否航空模型/气球等排除对象；是否室内；是否中国境内 |
| Decision variables | civil vs other；activity type；location |
| Possible outcomes | IN_SCOPE_CIVIL_UAS / OUT_OF_SCOPE / PARTIAL_SCOPE |
| Required evidence | 任务性质说明；航空器定义核对 |
| Approval authority | n/a（资格判断）；争议时主管机关 |
| Exceptions | 军用另有规定；条例用语排除对象 |
| Unknowns | 个别灰色产品（玩具/航模边界）地方执法口径 |

---

## G1 — Aircraft Classification

| Field | Content |
| ----- | ------- |
| Gate | G1 Aircraft Classification |
| Official basis | REG-001 第六十二条微/轻/小/中/大定义 |
| Input facts | 空机重量、最大起飞重量、速度、真高能力、空域保持、可靠被监视、可否随时人工介入、无线电微功率符合性 |
| Decision variables | weight/speed/height/capability bundle（不是单一字段） |
| Possible outcomes | MICRO / LIGHT / SMALL / MEDIUM / LARGE / UNCLASSIFIED |
| Required evidence | 制造方规格书、检验报告、登记系统参数 |
| Approval authority | 分类本身是法定定义；登记系统记载参数；改装参数变更须更新平台（条例） |
| Exceptions | 定义排除链（例如轻型不含微型） |
| Unknowns | 边界参数争议时的实验室认定程序细节 |

**Note:** G1 ≠ 开放/特定/审定类（见 G5）。

---

## G2 — Product Identity

| Field | Content |
| ----- | ------- |
| Gate | G2 Product Identity |
| Official basis | REG-001 第九–十条（唯一产品识别码标注、实名登记）；LAW-001 第三十四条第二款（唯一产品识别码）；GB 46761-2025（FUTURE）；UOM 登记服务 |
| Input facts | 生产者是否设置唯一识别码；所有者是否实名登记；是否激活；是否注销/转让 |
| Decision variables | registration status；activation status；ID presence |
| Possible outcomes | IDENTITY_COMPLETE / REGISTRATION_GAP / ACTIVATION_GAP / ID_GAP |
| Required evidence | UOM 登记记录；机体标识；激活状态 |
| Approval authority | 民航管理部门登记办法；公安对未登记飞行处罚 |
| Exceptions | 条例未要求微型以外的细节差异以登记办法为准 |
| Unknowns | GB 2026-05-01 前后存量机过渡执行细节的工程验收口径 |

---

## G3 — Airworthiness

| Field | Content |
| ----- | ------- |
| Gate | G3 Airworthiness |
| Official basis | REG-001 第八条；LAW-001 第三十四条；CCAR-92 D章；92.303；AP-21-71；AC-21-40；AC-92-01；专用条件 |
| Input facts | 微轻小 vs 中大；是否载人/融合/人口密集；设计是否 2024-01-01 前定型；是否设计更改；拟运行类别；是否已有 TC/PC/AC/特殊适航证 |
| Decision variables | need_AW_permit；AW_path；certificate_type；transition_eligible |
| Possible outcomes | NO_AW_PERMIT_REQUIRED（微轻小路径，但仍有产品质量/国标）；STANDARD_TC_PC_AC；LIMITED_CATEGORY_SPECIAL_AC；TRANSITION_SPECIAL_AC；SPECIAL_FLIGHT_PERMIT；GAP |
| Required evidence | 设计资料、审定基础、符合性报告、安全评定试飞、证件 |
| Approval authority | 民航局 / 地区管理局（按证件类型） |
| Exceptions | 条例：微/轻/小无需适航许可；过渡政策见 doc 12 |
| Unknowns | 具体项目“设计定型”证明材料被接受标准的个案差异 |

**Critical anti-confusions:**

- 有 TC ≠ 可执行任何商业飞行  
- 有特殊适航证 ≠ 完成全部合规  
- 特殊条件 ≠ 全行业通用标准  

---

## G4 — Pilot / Crew

| Field | Content |
| ----- | ------- |
| Gate | G4 Pilot / Crew |
| Official basis | REG-001 第十六–十七条；CCAR-92 B章 |
| Input facts | 航空器类别；是否管制空域；操控员民事行为能力；执照/培训证明 |
| Decision variables | licence_required；training_required；capability_limits |
| Possible outcomes | LICENCE_OK / TRAINING_OK / NO_LICENCE_NEEDED / GAP |
| Required evidence | 操控员执照、培训合格证明、身份证明 |
| Approval authority | 国务院民用航空主管部门（执照） |
| Exceptions | 微/轻通常无需执照但有能力与指导要求；轻型在管制空域有培训要求 |
| Unknowns | 分布式操作下多人资质组合细节 |

---

## G5 — Operator

| Field | Content |
| ----- | ------- |
| Gate | G5 Operator |
| Official basis | REG-001 第十一条；CCAR-92 92.7、92.603 及开放/特定/审定运行要求 |
| Input facts | 单位还是个人；是否除微型以外；经营性与否；最大起飞重量；是否常规农用；运营安全评估结果 |
| Decision variables | ops_certificate_needed；operation_category；ops_specs |
| Possible outcomes | NO_OPS_CERT（条例列举例外）/ OPEN / SPECIFIC / CERTIFIED / GAP |
| Required evidence | 运营合格证、运营规范、安全评估材料 |
| Approval authority | 民航局 / 地区管理局 |
| Exceptions | 常规农用（≤150 kg 在农林牧渔区域适飞空域）无需运营合格证 |
| Unknowns | 标准场景清单的完整公开目录（部分存在但本轮未建全表） |

---

## G6 — Insurance

| Field | Content |
| ----- | ------- |
| Gate | G6 Insurance |
| Official basis | REG-001 第十二条；罚则第四十八条 |
| Input facts | 是否经营性飞行；是否小/中/大非经营性飞行 |
| Decision variables | liability_insurance_required |
| Possible outcomes | REQUIRED_AND_PRESENT / REQUIRED_MISSING / NOT_REQUIRED |
| Required evidence | 责任保险保单 |
| Approval authority | 民用航空管理部门监督检查 |
| Exceptions | 微型非经营性等需按条文核对（经营性一律；小中大非经营性需投保） |
| Unknowns | 保额最低标准是否另有细则 |

---

## G7 — System Connectivity

| Field | Content |
| ----- | ------- |
| Gate | G7 System Connectivity |
| Official basis | REG-001 第二十四条；UOM-002；MH/T 4053；GB 46750（FUTURE）；CCAR-92 C2 与平台交互条款 |
| Input facts | 类别；是否除微型以外；广播式识别能力；UOM 联网报送能力；C2 链路类型；制造方/运行人角色 |
| Decision variables | RID_ok；dynamic_data_ok；C2_ok；UOM_link_ok |
| Possible outcomes | CONNECTIVITY_OK / RID_GAP / UOM_GAP / C2_GAP |
| Required evidence | 接口测试报告、UOM 联调记录、设备符合性声明 |
| Approval authority | 民航局信息中心对接；空管行业管理相关要求；运行中监管 |
| Exceptions | 微型广播/报送差异按条例；动态数据公告对微型运行人未列入轻小中大报送句 |
| Unknowns | MH/T 4053 字段级强制清单与 GB RID 的精确重叠 |

---

## G8 — Airspace

| Field | Content |
| ----- | ------- |
| Gate | G8 Airspace |
| Official basis | REG-001 空域章：管制空域列举；适飞空域=管制空域范围以外（对微轻小） |
| Input facts | 起降点、航线、高度、是否机场管制地带、是否临时管制空域公告 |
| Decision variables | controlled vs suitable-to-fly；height band |
| Possible outcomes | SUITABLE_AIRSPACE / CONTROLLED_NEED_APPROVAL / PROHIBITED / UNKNOWN_MAP |
| Required evidence | UOM/官方空域图、航行情报、地方政府公告 |
| Approval authority | 空中交通管理机构；地方公告主体 |
| Exceptions | 临时管制空域 24h 前公告等 |
| Unknowns | 各地电子围栏数据滞后问题 |

---

## G9 — Flight Activity

| Field | Content |
| ----- | ------- |
| Gate | G9 Flight Activity |
| Official basis | REG-001 第二十六–三十一条 |
| Input facts | 是否落入第三十一条无需申请情形；是否触发第二款回流申请；是否紧急任务 |
| Decision variables | application_required；lead_time；approval_level |
| Possible outcomes | NO_APPLICATION / APPLICATION_REQUIRED / EMERGENCY_FAST_TRACK / REJECTED |
| Required evidence | 见 doc 07 Requirement Matrix |
| Approval authority | 空中交通管理机构（分区/区/授权机构） |
| Exceptions | 第三十一条；紧急任务第二十九条 |
| Unknowns | UOM 表单字段与条例第27条的字段级一一对应（平台版本会变） |

---

## G10 — Mission Specific

| Field | Content |
| ----- | ------- |
| Gate | G10 Mission Specific |
| Official basis | REG-001 特殊飞行任务批准文件；第三十一条第二款特殊情形；其他外部许可（危险品等） |
| Input facts | 中继飞行、危险品/投放、集会人群上空、移动交通工具上操控、分布式/集群；特殊通航任务 |
| Decision variables | extra_permits；extra_evidence |
| Possible outcomes | MISSION_CLEAR / MISSION_PERMISSION_GAP |
| Required evidence | 任务批准文件、危险品许可、活动主办方协调证明等 |
| Approval authority | 视任务类型：空管 + 可能其他部门 |
| Exceptions | 常规农用投放例外；微/轻在适飞空域无需特殊通航任务批准文件 |
| Unknowns | 危险品清单与民航危险品规则的交叉索引 |

---

## G11 — Continuing Operation

| Field | Content |
| ----- | ------- |
| Gate | G11 Continuing Operation |
| Official basis | REG-001 持续适航/召回；CCAR-92 维修管理体系、手册记录、运行控制；AC 安全评定后使用限制 |
| Input facts | 维修资质、记录保存、动态报送是否持续开启、构型是否更改、证件有效期 |
| Decision variables | continuing_AW_ok；records_ok；no_silent_mod |
| Possible outcomes | CONTINUE_OK / MAINTENANCE_GAP / RECORD_GAP / DESIGN_CHANGE_TRIGGERS_REENTRY |
| Required evidence | 维修记录、飞行数据、UOM 动态、适航指令执行 |
| Approval authority | 民航管理部门持续监督 |
| Exceptions | 微轻小走产品质量/召回路径为主 |
| Unknowns | 中大型持续适航组织批准与有人机体系的完全对齐度 |

---

## Customer “审批被退” first-fact pack

第一轮应向客户索取（分析用 checklist）：

1. 航空器类别与重量参数（G1）  
2. UOM 登记/激活截图（G2）  
3. 适航证件类型与限制（G3）  
4. 操控员执照/培训（G4）  
5. 运营合格证与运营规范/评估类别（G5）  
6. 责任保险（G6）  
7. 拟飞空域与高度（G8）  
8. 飞行活动申请编号或“无需申请”主张依据（G9）  
9. 任务是否含第三十一条第二款情形（G10）  
10. 退回意见原文（机关、时间、理由代码）  

缺任一关键事实 → 根因只能标 `UNKNOWN`，不可猜。
