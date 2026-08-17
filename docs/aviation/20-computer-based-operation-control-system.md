# 20 — Computer-Based Operation Control System

```text
Source: AC-92-FS-002
Title: 基于计算机的民用无人驾驶航空器运行控制系统管理办法
Doc no: 民航规〔2026〕2号
Issuer: 中国民用航空局（飞行标准司办文）
Issued: 2026-01-16
Status on CAAC page: 有效
Basis: CCAR-92 第 92.615 条
```

Tag discipline: `FACT` = official rule; `INTERPRETATION` = Tokfai product opportunity (not regulatory advice).

---

## 1. What this instrument is

| Item | Content | Tag |
| ---- | ------- | --- |
| Nature | 咨询通告 / 管理程序型指导，统一申请与审批 | `FACT` |
| Core duty | 运行人应对运行控制负责；可用基于计算机的运行控制系统履行职责 | `FACT` |
| Two paths | **自建运行控制系统** 或 **具备运行控制功能的无人机云系统** | `FACT` |
| Voluntary application | 申请人“自愿向局方提出申请” | `FACT` |
| Supersedes | 原 AC-91-FS-2015-31 第15条无人机云提供商相关要求作废 | `FACT` |

---

## 2. Definitions（FACT）

| Term | Meaning |
| ---- | ------- |
| 基于计算机的运行控制系统 | 运行人对其民用无人驾驶航空器运行全过程进行有效控制和动态监视的计算机系统 |
| 无人机云系统 | 运行动态数据库系统；向运行人提供运行控制、航行服务、飞行记录等；对运行时间/位置/高度/速度等实时监测、记录、保存 |

---

## 3. Applicant qualifications（FACT）

### 3.1 自建运行控制系统

1. 功能满足 7.1  
2. 质量管理体系（参照 GB/T19001 / ISO 9001）  
3. 安全管理体系（参照 ICAO Doc9859）  
4. 民用无人驾驶航空器运行数据分享机制  
5. 满足 7.2 / 7.3 / 7.4 相应要求（若提供经历记录 / 风险评估等）

### 3.2 无人机云系统（云侧申请人）

除 7.1 功能外，额外：

- 至少稳定运行 **6 个月**  
- 至少 **100** 个运行人注册并使用  
- QMS + SMS  
- 保密制度  
- 数据分享机制  
- 7.2–7.4 相应要求

### 3.3 使用云系统的运行人

运营合格申请中说明；提供使用协议；证明云系统处于现行有效批准。

---

## 4. Review / Approval / Oversight（FACT）

| Actor path | Review path | Approval form |
| ---------- | ----------- | ------------- |
| 自建系统运行人 | 可结合运营合格审定向地区局提出 → 飞标司指派专家 + 地区局监察员 | 在**运营规范**相应条款批准 |
| 使用云系统的运行人 | 地区局审定 | 运营规范相应条款（按 7.1 符合性） |
| 无人机云系统申请人 | 向飞标司申请；专家 + 地区局监察员 | UOM **信息查询模块**发布试运行批准 → 1 年后可正式运行批准 |

持续监督要点：

- 自建系统有效期与运营合格证一致  
- 使用云系统：与运营合格证及 UOM 中云系统批准信息先到期者为准  
- 云系统正式批准有效期 **2 年**；连续 12 个日历月无实际有效运行数据可取消批准  
- 重大功能/架构变更：上线后 **30 个工作日**内变更申请  
- 系统应定期更新扩容，保证可靠、低延迟、飞行区域信息实时有效  

---

## 5. Functional requirements map（FACT）

| Block | Requirement highlights | Standard hook |
| ----- | ---------------------- | ------------- |
| 基础功能 | 航空器/操控员/运行人（云）管理；运行动态监视；空域申报；飞行计划申请（常规农用仅作业除外） | MH/T 2011—2019 6.1/6.2 + 第10章字段 |
| 飞行数据 | 记录、回放、分析；至少保存 **24 个日历月** | — |
| 自查 | 过滤非真实/错误运行数据 | — |
| 告警通知 | 满足 MH/T 2011 6.3.5 | MH/T 2011 |
| 上报频率 | 重点地区/机场净空以下常规农用+轻型：≥1/min；人口密集区小/中/大：≥1/s；非人口密集区：≥1/30s | 7.1.2 |
| 通信/信息安全/电子地图/存储 | MH/T 2011 第8章 | MH/T 2011 |
| 飞行经历记录（可选能力） | 附件4：字段、生物识别、真高/速度/半径校验等 | CCAR-92 + 附件4 |
| 运行风险评估（可选能力） | 附件5 | 附件5 |
| 鼓励创新 | 7.4 鼓励持续探索功能 | — |

---

## 6. Relation to UOM（FACT + boundary）

| Statement | Tag |
| --------- | --- |
| 无人机云系统试运行/正式批准信息在 **UOM 信息查询模块**发布/查询 | `FACT` |
| 运行控制系统 ≠ UOM 本身 | `INTERPRETATION` |
| 运行控制系统须满足与 MH/T 2011 等数据规范对接；与 UOM 动态数据（MH/T 4053）关系需工程对齐 | `REQUIRES_RESEARCH` / 部分 `UNKNOWN` |
| 地方低空平台是否可替代经批准的运行控制系统 | `UNKNOWN` |

---

## 7. Tokfai / Super-KA implications

### FACT (what regulation requires)

- 运行控制是运行人责任；计算机系统是履行手段之一。  
- 云系统成为可批准的第三方服务形态，有规模门槛与 UOM 公示。  
- 经历记录与风险评估是可附加、可审查的功能块，带字段级要求。  
- 重大变更触发补充审定。  

### INTERPRETATION (product opportunity — not advice)

```text
Aviation SaaS / Super-KA 可能扮演：
1) 运行人自建运行控制系统的工程与证据助手
2) 无人机云系统合规差距分析（功能/QMS/SMS/接口）
3) 运营规范条款 ↔ 系统能力 ↔ 测试证据 的追溯图
4) MH/T 2011 / MH/T 4053 / GB 登记激活 的跨标准映射
5) 变更管理（30 工作日窗口）工作流提醒
```

**禁止：** 把 Tokfai 写成“已获局方批准的运行控制系统/云系统”。除非真实持有该批准。

---

## 8. Cross-industry hooks

| Requirement | PRIMARY_DOMAIN | LINKED_DOMAINS |
| ----------- | -------------- | -------------- |
| 运行动态监视 | AVIATION | SOFTWARE, TELEMETRY, API |
| 数据保存 24 月 | AVIATION | DATA_PLATFORM, COMPLIANCE |
| 信息安全 / 等保相关引用 | AVIATION | CYBERSECURITY |
| 飞行经历防造假（生物识别+位置校验） | AVIATION | IDENTITY, MOBILE, GIS |
| 系统压力测试程序（审查关注） | AVIATION | SRE, PERFORMANCE |
| UOM 公示批准 | AVIATION | GOVERNMENT_AFFAIRS, SOFTWARE |

---

## 9. Remaining unknowns

1. MH/T 2011—2019 全文字段表与现行 UOM/MH/T 4053 的精确重叠。  
2. 附件5 运行风险评估模型的强制算法是否存在。  
3. “自愿申请”与运营规范中实际强制程度的执法口径。  
4. 已获批准的无人机云系统公开名单完整性与更新节奏。  
