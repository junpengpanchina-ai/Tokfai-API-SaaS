# Tokfai Aviation Industry Brain

```text
Stage:            P1200-R1.1 + P1200-R2 + P1230 SIM DESIGN
Current maturity: FOUNDATION → ENGINEERING_PACK_V0
Round:            P1200-R1.1 / R2 / P1230
```

## Not yet

```text
Customer Decision System
Regulatory Advice Engine
Automated Submission
Certification Agent
Customer Sandbox (blocked until isolation/billing/load gates)
Production DMIT load test (requires human auth)
```

## Hard disclaimer

本知识库是 Tokfai 内部行业研究底座，用于理解监管结构、Gate、证据与跨行业工程钩子。

**本知识库不能把 AI 推断替代主管机关正式决定。**

任何项目结论必须回到：

1. 官方来源正文（S0–S5）
2. 主管机关书面决定 / 许可文件
3. 项目具体设计、任务、空域与运行事实

状态标签统一使用：

| Tag | Meaning |
| --- | --- |
| `FACT` | 官方来源明确支持 |
| `INTERPRETATION` | 基于多个事实形成的行业理解 |
| `CASE` | 某项目真实做法 |
| `UNKNOWN` | 当前无法证明 |
| `HYPOTHESIS` | 下一阶段待验证 |

## Long-term Tokfai positioning

```text
Multi-Model Gateway
        +
Industry Brain
        +
Case Intelligence
        +
Cross-Industry Router
        +
Codex / Tools
        ↓
Super-KA Engineering Network
```

本轮只做：

```text
INDUSTRY DEEP READ
+
OFFICIAL SOURCE MAPPING
+
REGULATORY GATE MODEL
```

不写业务功能，不改 `apps/**`，不 commit / push / deploy。

## Document map

| File | Purpose |
| ---- | ------- |
| [01-file-capability-matrix.md](./01-file-capability-matrix.md) | Codex 工程文件读取能力矩阵（既有） |
| [02-regulatory-authority-map.md](./02-regulatory-authority-map.md) | 监管主体职责地图 |
| [03-regulatory-source-registry.md](./03-regulatory-source-registry.md) | 官方来源登记册 |
| [04-regulatory-dependency-graph.md](./04-regulatory-dependency-graph.md) | 法规依赖关系图 |
| [05-regulatory-gate-model.md](./05-regulatory-gate-model.md) | Tokfai 内部 Gate 模型（G0–G11） |
| [06-why-cannot-fly-taxonomy.md](./06-why-cannot-fly-taxonomy.md) | “飞不了”根因分类 |
| [07-flight-application-requirements.md](./07-flight-application-requirements.md) | 飞行活动申请 Requirement Matrix |
| [08-uom-system-map.md](./08-uom-system-map.md) | UOM 系统拆解 |
| [09-uom-dynamic-data.md](./09-uom-dynamic-data.md) | 飞行动态数据报送 |
| [10-airworthiness-system-map.md](./10-airworthiness-system-map.md) | 适航体系第一层知识树 |
| [11-airworthiness-route-variants.md](./11-airworthiness-route-variants.md) | 审定路径差异 |
| [12-2026-transition-window.md](./12-2026-transition-window.md) | 2026-11-26 过渡窗口 |
| [13-public-certification-cases.md](./13-public-certification-cases.md) | 官方适航案例库 |
| [17-cross-industry-links.md](./17-cross-industry-links.md) | 跨行业工程钩子 |
| [18-super-ka-data-model.md](./18-super-ka-data-model.md) | Super-KA 数据模型草案 |
| [19-open-questions.md](./19-open-questions.md) | 开放问题清单（≥50） |
| [20-computer-based-operation-control-system.md](./20-computer-based-operation-control-system.md) | AC-92-FS-002 运行控制系统 |
| [21-evtol-certification-landscape.md](./21-evtol-certification-landscape.md) | eVTOL 取证矩阵 |
| [22-decision-critical-unknowns.md](./22-decision-critical-unknowns.md) | P0 UNKNOWN 硬化 |
| [23-customer-demo-sop.md](./23-customer-demo-sop.md) | P1250-R0 无人机/eVTOL 客户演示 SOP |
| [24-industry-depth-map.md](./24-industry-depth-map.md) | P1251-R0 行业分层、客户画像与演示底座 |
| [25-certification-and-operation-chain.md](./25-certification-and-operation-chain.md) | P1251-R0 政策与准入链（证、UOM、2026、运行类） |
| [26-ai-workflow-for-aviation-customers.md](./26-ai-workflow-for-aviation-customers.md) | P1251-R0 本机 AI 工作流（文件链→申请辅助） |
| [27-customer-attack-map.md](./27-customer-attack-map.md) | P1252-R0 客户攻坚地图（七类画像×白嫖/成交信号） |
| [28-first-call-question-bank.md](./28-first-call-question-bank.md) | P1252-R0 首访题库（90 问） |
| [29-demo-to-close-playbook.md](./29-demo-to-close-playbook.md) | P1252-R0 演示到付费试点话术 |
| [30-first-10-calls-battlecard.md](./30-first-10-calls-battlecard.md) | P1253-R0 前 10 类客户电话作战卡 |
| [31-aviation-sales-scripts.md](./31-aviation-sales-scripts.md) | P1253-R0 可复制话术（微信/电话/异议） |
| [32-paid-pilot-offer.md](./32-paid-pilot-offer.md) | P1253-R0 三档付费试点与人民币报价带 |
| [33-pdf-precision-composite-map.md](./33-pdf-precision-composite-map.md) | P1270-R0 航飞 PDF/Word/Excel/代码精密复合分层 |
| [34-pdf-to-evidence-chain.md](./34-pdf-to-evidence-chain.md) | P1270-R0 回答必须带文件证据链 |
| [35-aviation-file-intake-checklist.md](./35-aviation-file-intake-checklist.md) | P1270-R0 首次文件清单与资料体检包装 |
| [36-approval-rejection-diagnosis-map.md](./36-approval-rejection-diagnosis-map.md) | P1271-R0 审批/起飞申请驳回分型与诊断输出 |
| [37-rejection-to-evidence-remediation-chain.md](./37-rejection-to-evidence-remediation-chain.md) | P1271-R0 驳回→证据→补件 REMEDIATION_ROW |
| [38-rejection-diagnosis-intake-playbook.md](./38-rejection-diagnosis-intake-playbook.md) | P1271-R0 驳回客户首访、演示与交付 playbook |
| [39-composite-delivery-standard.md](./39-composite-delivery-standard.md) | P1272-R0 航飞复合交付标准 L1–L5 |
| [40-evidence-row-schema.md](./40-evidence-row-schema.md) | P1272-R0 EVIDENCE_ROW canonical schema |
| [41-customer-deliverable-template.md](./41-customer-deliverable-template.md) | P1272-R0 客户可读交付报告模板 |
| [engineering/](./engineering/) | R2 工程知识库 |
| [testing/](./testing/) | P1230–P1234 测试设计 |
| `test-fixtures/aviation/customer-001/` | 合成客户 + 30 缺陷金标 |
| `scripts/aviation-sim/` | Mock upstream / load harness（默认本地） |

## R1 acceptance checklist (internal)

知识库应能基于官方来源回答：

1. “飞不了”可能对应哪些不同 Gate？
2. Aircraft class ≠ Operation class
3. 适航问题 vs 运行问题
4. UOM 在监管链中的作用
5. 何时需要飞行活动申请
6. “无需飞行活动申请” ≠ “随便飞”
7. 动态数据报送落到哪些工程系统
8. TC / PC / AC 各解决什么
9. 为什么审定路径不同
10. 专用条件是什么类型的问题
11. 为什么 EH216-S / V2000CG / UY-100 不能互相复制
12. 2026-11-26 过渡节点影响谁
13. 客户说“审批被退”时第一轮该索取什么事实

无法官方支撑处一律标 `UNKNOWN`。

## Related

- Codex 历史：[`../codex-history/README.md`](../codex-history/README.md)
- Codex 操作基座：[`../codex-cli-tokfai.md`](../codex-cli-tokfai.md)
