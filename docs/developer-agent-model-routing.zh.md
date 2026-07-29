# 开发者 / Agent 模型路由（商业分层）

> Hermes / Cursor / Codex 交付用。运行时以 `GET /v1/models` 的 `capabilities` 为准。  
> **不宣传 Tokfai 强于官方原生 API。** Tools 默认暂不承诺。

---

## 分层总览

| 层 | 名称 | 对外承诺 |
|---|---|---|
| **A** | 推荐 Cursor / Coding | ✅ 对话与补全可交付；写代码场景优先 |
| **B** | 推荐普通 Chat | ✅ 日常对话 / 试跑 |
| **C** | 可试用，不承诺工具调用 | ⚠️ Chat 可用；tools 不进标配 |
| **D** | Tool Call 暂不承诺 | ❌ 不得宣传 fully tools compatible |
| **E** | 图片模型专用 | ✅ 仅 Image API |

---

## A. 推荐 Cursor / Coding

| 模型 | 销售话术 | 风险边界 |
|---|---|---|
| `auto-pro` | 「质量优先智能路由，适合 Cursor 写代码」 | 别名非独立上游；tools 默认不承诺 |
| `gpt-5.5` | 「高质量推理与代码」 | 成本高于 flash；tools 需白名单才承诺 |
| `gpt-5.4` | 「通用高质量对话 / 代码」 | 同上 |

适合：解释代码、小范围改码、生成测试、读 diff。

---

## B. 推荐普通 Chat

| 模型 | 销售话术 | 风险边界 |
|---|---|---|
| `auto-fast` | 「首次接入与日常默认」 | 复杂长任务可升 A |
| `auto-cheap` | 「控成本试跑」 | 质量可能弱于 pro |

适合：连通性验证、轻量问答、成本敏感试跑。

---

## C. 可试用，不承诺工具调用

| 模型 | 销售话术 | 风险边界 |
|---|---|---|
| `gemini-*-flash/pro` | 「长文 / 图理解可用」 | Vision ≠ 文生图；Agent tools 不默认 |
| 兼容别名 `gpt-5` / `gpt-5-chat` 等 | 「旧客户端兼容」 | 路由到具体模型；以 Usage 为准 |

适合：多模态理解、迁移旧配置；**不要**当成已验证 tool 模型卖。

---

## D. Tool Call 暂不承诺

统一口径：

1. 未在 `VERIFIED_TOOLS_CAPABLE_MODEL_IDS` → **暂不承诺** tool calling  
2. 强制 tools → 可能 `model_not_tool_capable`，**不计费**  
3. 客户硬需求：LIVE 验证 → 加白名单 → 更新合同附件  

销售话术：「我们保证失败有明确错误码且不乱扣费；不保证所有模型 Agent tools 可用。」

---

## E. 图片模型专用

| 模型 | 销售话术 | 风险边界 |
|---|---|---|
| `nano-banana*` | 「文生图走 Image API」 | ❌ 禁止 Chat；成功才扣费 |

---

## 路由决策树（实施用）

```text
只要连通？ → B: auto-fast
写代码 / Cursor 质量？ → A: auto-pro 或 gpt-5.5
控成本？ → B: auto-cheap
要 Agent tools？ → D: 先说明暂不承诺 → 验证白名单
要出图？ → E: nano-banana
```

---

## 与 capabilities 的关系

- `/v1/models` 返回 `capabilities`（含 `tools`）为运行时真相  
- 商业话术不得超越白名单：`tools=false` 就按 D 类讲  
- 详细表：`docs/model-capability-commercial-matrix.zh.md` · `docs/model-commercial-matrix.zh.md`
