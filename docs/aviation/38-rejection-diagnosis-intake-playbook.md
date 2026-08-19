# 38 — Rejection Diagnosis Intake Playbook (P1271-R0)

```text
P1271-R0 / DOC-38
WHEN CUSTOMER SAYS "APPLICATION REJECTED"
SELL = 航飞审批材料风险诊断
NOT = 代办审批
NO_SOURCE_UPLOAD=YES
```

地图：[36-approval-rejection-diagnosis-map.md](./36-approval-rejection-diagnosis-map.md)  
补件链：[37-rejection-to-evidence-remediation-chain.md](./37-rejection-to-evidence-remediation-chain.md)  
首访文件：[35-aviation-file-intake-checklist.md](./35-aviation-file-intake-checklist.md)  
话术：[31-aviation-sales-scripts.md](./31-aviation-sales-scripts.md) · 试点：[32-paid-pilot-offer.md](./32-paid-pilot-offer.md)

---

## 1. 客户说「被驳回」时第一轮要什么

**30 秒内只要三样（本机，不发网盘）：**

| 序 | 要件 | 为什么 |
| -- | ---- | ------ |
| 1 | 退回意见**原文**（截图或 PDF 一页，脱敏可） | 无原文不做 R-类 |
| 2 | 同一次提交的申请书/附件清单 | 对照缺件 |
| 3 | 书面授权：本次只打开哪几个文件 | 合规 |

然后再按 [36](./36-approval-rejection-diagnosis-map.md) 补：手册应急章、空域描述、设备说明、保单等。

---

## 2. 文件优先级（驳回专用）

| 级 | 文件 | 缺则降级 |
| -- | ---- | -------- |
| **必须** | 退回意见 + 授权清单 | 只做问诊清单，不出分型表 |
| **必须** | 当次申请书（或平台导出） | 无法做栏位级诊断 |
| **重要** | 运行/UOM 手册相关节 | 应急/空域类 R-EMG/R-AIR 只能给 ADVICE |
| **重要** | 任务计划 / 场地说明 | R-MSN/R-LOC |
| **重要** | 设备说明 + 可选 ≤4 飞控路径 | R-EQP |
| **可选** | 保单、执照、试验摘要 | 对应 R-INS/R-CREW |

---

## 3. 销售提问话术（可复制）

1. 退回意见原文能不能在本机打开？不用发我，我们对着屏幕做诊断。  
2. 是 UOM 平台退的，还是地区局/甲方书面意见？  
3. 退回句里有没有具体栏位名？（空域、应急、资质……）  
4. 申请里哪些格子你们最有把握、哪些是当时“先填上”的？  
5. 飞控能力写在申请表哪一格？有没有对应手册页或代码路径？  
6. 我们**不保证**下批过；只出补件和证据指针对照表，能接受吗？  
7. 谁负责下次提交？（运行/合规——Tokfai 不代点提交）

对方要“你们帮改到能过”：

> 做不了。能做的是把退回句拆成缺什么文件、哪一页、谁去补。批不批仍是局方和你们的材料质量。

---

## 4. 可演示流程（30–45 分钟）

| 段 | 内容 | 工具 |
| -- | ---- | ---- |
| 1 | 读退回短引，标 R-类（doc 36） | 客户投屏 PDF |
| 2 | 打开申请书，指栏位 | Read 授权文件 |
| 3 | 演示 **synthetic** 四文件链：能力证明**方法**（非该机已具备） | 教学树 |
| 4 | 填 2–3 行 REMEDIATION_ROW 样例 | doc 37 模板 |
| 5 | 明确 NOT_PROVIDED：不代报、不保证通过 | 口头 |

无退回原文：改演示 [29-demo-to-close-playbook.md](./29-demo-to-close-playbook.md) 3 分钟版 + 留问诊清单。

---

## 5. 可交付物（付费试点对齐）

**产品名：** 航飞审批材料风险诊断报告

| 章节 | 内容 |
| ---- | ---- |
| 1 | 驳回分型（R-类 + Gate） |
| 2 | REMEDIATION_TABLE（不含源码正文） |
| 3 | 四边界表（若 R-AIR/R-MSN） |
| 4 | 能力声明 ↔ 证据指针（若 R-EQP） |
| 5 | 责任人 + 复核方式 |
| 6 | 免责声明 |

建议试点档：[32](./32-paid-pilot-offer.md) **B 工程链路**（有申请+手册+少量代码）或 **A**（仅退回+申请，无代码）。

---

## 6. 降级路径

| 情况 | 交付 |
| ---- | ---- |
| 无退回原文 | 《首轮问诊 12 题》+ 预约补件后诊断 |
| 有退回无申请 | 仅分型 + 猜测栏位标 R-UNK |
| 有申请无手册 | 栏位缺口表，应急/空域标 H |
| 涉密/军警未确认民用 | 停止 |

---

## 7. 与资料体检的关系

- [35](./35-aviation-file-intake-checklist.md) **资料体检** = 主动对表。  
- **驳回诊断** = 被动从退回句反查。  
- 可打包：**体检 + 驳回诊断** 连续两单（先 35 清单，再 36–37 表）。

---

## 8. 边界

```text
TOKFAI = 路由 / 计费 / 日志
CODEX CLI = 本机读文件
不保存客户材料室
不承诺审批通过
不输出 key / 源码全文 / canary
```

```text
TOKFAI_P1271_REJECTION_DIAGNOSIS_PLAYBOOK=READY
APPROVAL_GUARANTEE=NO
```
