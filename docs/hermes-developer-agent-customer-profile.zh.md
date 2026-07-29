# Hermes 型开发者客户画像

> 目标客户：**开发工具型 / Agent 工作流型**（Cursor、Codex、Agent Window、Claude Code 类）。  
> 配套：`docs/cursor-codex-commercial-sop.zh.md` · `docs/developer-agent-model-routing.zh.md` · `docs/hermes-objection-handling.zh.md`

---

## 1. 画像摘要

| 维度 | 特征 |
|---|---|
| 角色 | 独立开发者、小团队 Tech Lead、外包工程组、内部平台组 |
| 工具 | Cursor / Codex / Agent 类 IDE 助手；少量自研脚本 |
| 工作 | 读仓库、改代码、看 diff、跑命令、写测试、排错 |
| 敏感点 | 模型质量、延迟、稳定性、成本、**能力边界是否说清楚** |
| 不敏感 | 营销落地页、复杂 Dashboard UI |
| 硬需求 | `request_id`、失败原因、账单可对账、失败不乱扣费 |

他们不买「万能兼容神话」，买的是：**可预期的 OpenAI 兼容接入 + 清晰边界 + 可复制交付**。

---

## 2. 购买动机

1. **统一 Key / 统一账单**：多个客户端共用一个 `sk-tokfai_…`  
2. **Cursor 可配 Base URL**：`https://api.tokfai.com/v1` 即可开工  
3. **模型选型简单**：`auto-fast` / `auto-pro` / `auto-cheap` 起步  
4. **工程场景可交付**：只读分析 → 可控改码，有 SOP  
5. **账务可信**：成功扣费、失败通常 `not_billable`；用 `request_id` 对账  

---

## 3. 典型使用路径

```text
注册 → 创建 API Key → 配置 Cursor Base URL
  → auto-fast 试聊 / 试补全
  → 只读：解释模块、定位 bug、总结 diff
  → 改码：小范围修改 + 本地 git diff 自检
  → Usage 对账 request_id
  → 需要 tools 时：先确认白名单，不默认承诺
```

产品入口：

- Dashboard → 首次接入（`/dashboard/integration-workbench`）
- Docs → `#cursor` / `#quickstart`
- Usage / Credits

---

## 4. 主要异议（销售会听到）

| 异议 | 本质担心 |
|---|---|
| 「原生 API 更高效」 | 延迟 / 质量 / 多一跳 |
| 「中转不稳定」 | 超时、503、模型不可用 |
| 「Cursor 能不能用」 | 配置是否真能跑 |
| 「工具调用失败」 | Agent tools 期望 vs 实际能力 |
| 「失败会不会扣费」 | 钱袋子信任 |
| 「能不能商业化复制」 | 下一项目是否还能同样交付 |

应答见：`docs/hermes-objection-handling.zh.md`

---

## 5. Tokfai 对应价值（对 Hermes）

| 客户要什么 | Tokfai 给什么 | 不夸大什么 |
|---|---|---|
| 接上 Cursor | OpenAI Compatible Base URL + Key | 不是官方原生镜像 |
| 写代码 | `auto-pro` / `gpt-5.5` 等质量路由 | 不保证超过某厂官方 |
| 工程只读 / 改码流程 | SOP + checklist | 不保证 Agent 全自动闭环 |
| 边界清晰 | capabilities + 白名单 tools 政策 | 不承诺全模型 tool calling |
| 账务干净 | 失败不扣费 + request_id | — |

---

## 6. 成功标准（商业可复制）

对**下一个**同类客户，销售/实施能在不改核心产品的情况下：

1. 10 分钟跑通 Cursor  
2. 讲清推荐模型分层（见 routing 文档）  
3. 讲清 tools 暂不承诺  
4. 教会用 `request_id` 排障  
5. 用 Usage 证明失败不扣费  

→ 才算 Hermes 场景「可复制交付」，而非「单次跑通」。
