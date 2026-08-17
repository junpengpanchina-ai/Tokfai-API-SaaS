# 02 — Regulatory Authority Map

Status tags: `FACT` / `INTERPRETATION` / `UNKNOWN`

> 只记录官方可证实的职责。边界不清处标 `UNKNOWN`。  
> 无人机监管不是“只有 CAAC”。

---

## 1. High-level map

```text
国务院 / 中央军委
        │
        ▼
国家空中交通管理领导机构（空域 / 飞行活动统筹）
        │
        ├──────────────────────┐
        ▼                      ▼
中国民用航空局（CAAC）     其他部委 / 地方
  ├ 低空安全司               ├ 公安
  ├ 航空器适航审定司         ├ 工信
  ├ 飞行标准司               ├ 市场监管
  ├ 空管行业管理办公室       ├ 应急管理 / 海关 / 警察（条例特指）
  └ 地区管理局 / 审定中心    └ 地方政府（公告、地方协调等）
```

---

## 2. Authority entries

### A-001 国务院 / 中央军委

| Field | Content |
| ----- | ------- |
| Role | 联合发布《无人驾驶航空器飞行管理暂行条例》（令第761号） |
| Verified basis | 国务院公报；条例公布令 |
| Status | `FACT` |
| UAS relevance | 行政法规层顶层规范：生产、操控、空域、飞行活动、法律责任 |

### A-002 国家空中交通管理领导机构

| Field | Content |
| ----- | ------- |
| Role | 条例明确：统筹建设无人驾驶航空器一体化综合监管服务平台；空域划设、飞行活动管理相关权限 |
| Verified basis | 《无人驾驶航空器飞行管理暂行条例》相关条款（含平台、空域、飞行申请批准权限） |
| Status | `FACT` |
| Boundary note | 具体组织形态、日常对外窗口与民航 UOM 的精确边界：部分 `UNKNOWN`（需对照后续细则） |

### A-003 中国民用航空局（CAAC）

| Field | Content |
| ----- | ------- |
| Role | 国务院民用航空主管部门；条例与 CCAR-92 下的民用无人驾驶航空器运行安全、适航、运营、登记等管理 |
| Verified basis | 条例；CCAR-92；多项 CAAC 公告 / AP / AC |
| Status | `FACT` |

### A-004 低空安全司

| Field | Content |
| ----- | ------- |
| Official duty text | 起草低空民航发展规划、统筹低空安全与发展、建设低空飞行服务调度平台和低空飞行服务站体系等工作 |
| Verified basis | caac.gov.cn 低空安全司机构职责页 |
| Status | `FACT` |
| UAS detail split vs 飞标/适航 | 细化分工表：`UNKNOWN`（官网公开职责较概括） |

### A-005 航空器适航审定司

| Field | Content |
| ----- | ------- |
| Official duty text（摘录） | 民用航空产品型号/补充型号合格审定、生产许可审定、单机适航审定、国籍登记和注册、适航指令等 |
| Verified basis | caac.gov.cn 航空器适航审定司机构职责页；AP-21-AA-2022-71 办文单位 |
| Status | `FACT` |
| UAS relevance | 中大型无人机设计/生产/适航批准程序与专用条件相关文件的主管司局之一 |

### A-006 飞行标准司

| Field | Content |
| ----- | ------- |
| Role | 公开组织机构中存在；CCAR-92 运行安全管理规则由民航规章体系落地，运营合格证等运行侧管理由局方实施 |
| Verified basis | CAAC 组织机构；CCAR-92 机构与职责条款 |
| Status | `FACT`（机构存在与规章角色）；飞标司对 UAS 的逐项职责清单：`UNKNOWN`（未在本轮读到与适航司同粒度的公开职责全文） |

### A-007 空管行业管理办公室

| Field | Content |
| ----- | ------- |
| Role | 飞行动态数据报送公告办文单位；MH/T 4053 办文单位 |
| Verified basis | 2024-11-15 动态数据公告；MH/T 4053 信息公开页 |
| Status | `FACT` |

### A-008 民航地区管理局

| Field | Content |
| ----- | ------- |
| Role | CCAR-92：辖区运行人监管；特定类标准场景运营评估；受委托实施部分适航行政许可；PC、特许飞行证等 |
| Verified cases | 华东局 V2000CG TC；中南局 EH216-S PC；东北局 UY-100 受理审查 |
| Status | `FACT` |

### A-009 中国民用航空适航审定中心 / 地区审定中心

| Field | Content |
| ----- | ------- |
| Role | 参与型号审查（案例报道提及沈阳审定中心等） |
| Status | `CASE` + `INTERPRETATION`：技术审查支撑；法定行政许可名义通常仍为局方 |
| Exact legal mandate for UAS | `UNKNOWN` |

### A-010 公安

| Field | Content |
| ----- | ------- |
| Role | 条例法律责任：未实名登记飞行等由公安机关责令改正并可处罚；管制空域违规等情形 |
| Verified basis | 《暂行条例》第四十七条等 |
| Status | `FACT` |

### A-011 工信

| Field | Content |
| ----- | ------- |
| Role | 条例涉及无线电、产品相关国家标准协同；工信部网站转载条例 |
| Precise UAS licensing list | `UNKNOWN`（本轮未逐条核验无线电型号核准与条例条款的完整映射） |

### A-012 市场监管（SAMR / 国家标准委）

| Field | Content |
| ----- | ------- |
| Role | 微/轻/小产品质量与召回；强制性国家标准发布（GB 46750、GB 46761） |
| Verified basis | 《暂行条例》第十三条、第五十四条；sac.gov.cn / 国家标准平台 |
| Status | `FACT` |

### A-013 地方政府

| Field | Content |
| ----- | ------- |
| Role | 临时增加管制空域时，设区的市级以上地方人民政府发布公告（条例） |
| Status | `FACT` |
| Local practice ≠ national rule | 地方试点/案例不得升格为全国统一规则 |

### A-014 警察 / 海关 / 应急管理（条例特指主体）

| Field | Content |
| ----- | ------- |
| Role | 其辖有无人驾驶航空器在特定场地上方不超过真高120米的部分飞行活动，可适用“无需飞行活动申请”但有起飞前确认要求 |
| Verified basis | 《暂行条例》第三十一条 |
| Status | `FACT` |

---

## 3. What “who approves what” looks like (analytical)

| Matter | Typical approving / managing side | Tag |
| ------ | -------------------------------- | --- |
| 行政法规制定 | 国务院、中央军委 | `FACT` |
| 民航规章 CCAR-92 | 交通运输部令 | `FACT` |
| 型号合格证（正常类/运输类/限用类） | 民航局 / 地区局受委托（限用类等） | `FACT`（见 CCAR-92 92.305） |
| 生产许可证 | 地区管理局 | `FACT` |
| 适航证 / 特殊适航证 | 地区管理局受委托等 | `FACT` |
| 运营合格证 | 民航局 / 地区管理局（按运行类别） | `FACT` |
| 飞行活动申请批准 | 空中交通管理机构（按管制分区/区权限） | `FACT` |
| 实名登记违规处罚 | 公安 | `FACT` |
| 微/轻/小产品质量召回 | 市场监管 | `FACT` |

---

## 4. Unknowns (authority layer)

1. 国家空中交通管理领导机构日常对外办事窗口与 UOM 账号体系的精确映射。  
2. 低空安全司与飞行标准司在运营合格证、飞行服务站之间的内部分工细则。  
3. 地方低空经济试点文件与全国规则冲突时的适用顺序（除上位法优于下位法的一般原则外，具体个案：`UNKNOWN`）。  
4. 军民航协同接口对民用项目申请人的可见流程：`UNKNOWN`。
