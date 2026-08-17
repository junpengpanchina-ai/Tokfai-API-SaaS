# 22 — Decision-Critical Unknowns (P1200-R1.1)

上一轮 75 个 UNKNOWN 重新分级。本文件只跟踪 **会改变客户判断路径** 的项。

```text
BLOCKING_UNKNOWN          — 无法给出可信 Gate 分支
DECISION_RELEVANT_UNKNOWN — 影响路径选择，但可标注假设继续
ENGINEERING_UNKNOWN       — 主要影响实现，不立刻卡法规分支
CASE_DETAIL_UNKNOWN       — 个案细节，不升格为通则
NICE_TO_HAVE_UNKNOWN      — 可延后
```

---

## 1. Reclassification summary（from R1 Q1–75）

| Priority | Count (approx) | Examples |
| -------- | -------------: | -------- |
| BLOCKING_UNKNOWN | 8 → **3 remaining hard** after R1.1 | 地方平台替代 UOM；2026 后存量逐类路径；标准场景全目录 |
| DECISION_RELEVANT_UNKNOWN | ~25 | 运行类转换；设计定型证据模板；融合空域条件 |
| ENGINEERING_UNKNOWN | ~20 | MH/T 字段表；C2 QoS 国标；Simulink 能力 |
| CASE_DETAIL_UNKNOWN | ~12 | UY-100 TC 是否已颁；TC-Only 架次 |
| NICE_TO_HAVE_UNKNOWN | ~10 | 出口适航频率；等效安全公开库 |

P0 before R1.1 (decision-critical basket): **18**  
Resolved or downgraded this round: **11**  
Remaining P0-hard: **7**

---

## 2. P0 resolutions this round

### UOM / Identity interfaces — PARTIALLY RESOLVED

| Question | Status now | Basis |
| -------- | ---------- | ----- |
| 生产者/航空器系统与登记系统接口边界 | **RESOLVED_CORE** | GB 46761—2025：方式1（生产者系统中转）/方式2（无人机系统直连）；三大系统职责 |
| 实名状态验证接口 | **RESOLVED_CORE** | GB 46761 附录 A.2；CAAC 政策解读：对接实名状态验证 |
| 激活状态上报接口 | **RESOLVED_CORE** | 附录 A.3 |
| 注销登记接口 | **RESOLVED_CORE** | 附录 A.4 |
| 激活前不得具备飞行能力 | **RESOLVED_CORE** | GB 46761 + 官方解读 |
| 完整字段加密示例 / 生产 URL / 鉴权发放流程 | **REMAINS ENGINEERING_UNKNOWN** | 附录有示例但对接密钥发放流程未公开完整 |
| 运行识别 | **PARTIAL** | GB 46750 存在；与动态数据管道关系仍 UNKNOWN |
| 飞行动态数据 | **RESOLVED_CORE**（义务层） | UOM-002 + MH/T 4053；字段全集仍 ENGINEERING |
| 地方平台 vs UOM | **BLOCKING_UNKNOWN** | 无官方“可替代”文本；默认不得替代法定义务（`INTERPRETATION`） |
| 运行控制系统 vs UOM | **RESOLVED_CORE** | AC-92-FS-002：云系统批准在 UOM 查询模块公示；系统本身 ≠ UOM |

### Airworthiness — PARTIALLY RESOLVED

| Question | Status now | Basis |
| -------- | ---------- | ----- |
| 设计定型证明材料 | **PARTIAL** | AC-92-AA-2024-01 要求证明材料与试飞；**全国统一模板**仍 UNKNOWN |
| 2026-11-26 适用边界 | **RESOLVED** | 见 `12-2026-transition-window.md` 合取条件 |
| 2026-11-26 后路径 | **DECISION_RELEVANT_UNKNOWN** | 不再受理评定特殊适航；正式 TC/适航回归明确；存量逐类处置细节不足 |
| 何时触发型号合格审定 | **RESOLVED_CORE** | 条例：中/大型适航许可；微轻小无需；CCAR-92/AP-21-71：运输/正常/限用路径 |
| 特殊类别审定基础形成 | **RESOLVED_CORE** | CCAR-21 21.16/21.17；专用条件程序 AP；项目 SC |
| 专用条件 vs 一般标准 | **RESOLVED_CORE** | SC 是补充安全要求，具等效安全水平；项目绑定 |
| TC/PC/AC/Special AC 边界 | **RESOLVED_CORE** | 见 `10-airworthiness-system-map.md` |

### Operation classes — PARTIALLY RESOLVED

| Question | Status now | Basis |
| -------- | ---------- | ----- |
| 开放/特定/审定定义 | **RESOLVED** | CCAR-92 92.7 |
| 进入条件（部分明示） | **PARTIAL** | 92.601 等列出若干直接开放类情形；完整标准场景目录仍 UNKNOWN |
| 相互转换 | **DECISION_RELEVANT_UNKNOWN** | 未见“自动转换”条文；场景/评估变化应触发重新评估（`INTERPRETATION`） |
| 与 Aircraft Class 关系 | **RESOLVED** | 非一一对应；见 dependency graph |
| 与运营合格证关系 | **RESOLVED_CORE** | 条例第11条；CCAR-92 运营评估/颁证；类别写入运营规范 |

### Airspace — PARTIALLY RESOLVED

| Question | Status now | Basis |
| -------- | ---------- | ----- |
| 适飞 vs 管制 | **RESOLVED** | 条例：管制空域列举；以外为微轻小适飞空域 |
| 长期 vs 一次性飞行活动 | **RESOLVED_CORE** | 条例第26条常态长期申请+每日备案 |
| 空中交通管理机构批准权限 | **RESOLVED** | 条例第28条 |
| 地方空域平台 / 地方低空体系 vs UOM | **BLOCKING_UNKNOWN** | 仅有地方公告临时管制等片段；完整治理图不足 |
| 运行控制系统空域申报功能 | **RESOLVED_CORE** | AC-92-FS-002 7.1.1 含空域申报/飞行计划申请 |

### New instrument — RESOLVED as topic

| Topic | Doc |
| ----- | --- |
| 基于计算机的运行控制系统 | `20-computer-based-operation-control-system.md` |

---

## 3. Remaining P0 list (must not pretend resolved)

1. 地方低空平台与 UOM 的法律主从关系（能否替代登记/动态数据/飞行申请）。  
2. 2026-11-26 后存量特殊适航证到期机队的逐类处置与运行过渡细则。  
3. 开放/特定/审定**完整标准场景公开目录**。  
4. “设计定型”全国统一证据模板。  
5. 运行类别相互转换的官方程序。  
6. MH/T 2011 与 MH/T 4053 / UOM 动态数据的字段级对齐。  
7. 融合空域准入的可公开条件全集。  

---

## 4. Decision rule for Tokfai agents

```text
IF question ∈ remaining P0:
  answer with UNKNOWN + ask for official evidence
  DO NOT invent path

IF question ∈ RESOLVED_CORE:
  cite SOURCE + GATE
  still not a substitute for authority decision
```
