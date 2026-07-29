# 模型能力商业矩阵（交付分类）

> 销售选型用。运行时以 `GET /v1/models` 的 `capabilities` / `enabled` 为准。  
> **Tools / Tool Call 默认「暂不承诺」**，除非白名单验证且 `capabilities.tools=true`。

详细展开表可参考：`docs/model-commercial-matrix.zh.md`

---

## 分类总览

| 分类 | 含义 | 对外承诺 |
|---|---|---|
| **推荐接入** | 首次交付默认推荐 | ✅ 可写进 SOP |
| **普通 Chat** | 标准对话 / 非流或流式文本 | ✅ Chat + Stream（以列表为准） |
| **Cursor 可用** | 填 Base URL + Key + 模型 id 即可聊 | ✅ 普通补全；❌ 不默认承诺 Agent tools |
| **Tool Call 暂不承诺** | 未进 `VERIFIED_TOOLS_CAPABLE_MODEL_IDS` | ❌ 不得宣传 fully tools compatible |
| **图片模型专用** | 仅 Image API | ✅ 文生图；❌ 禁止走 Chat |

---

## 1. 推荐接入（优先交付）

| 模型 | 分类标签 | 说明 |
|---|---|---|
| `auto-fast` | 推荐接入 · Cursor 可用 · 普通 Chat | 日常默认；**首次试跑首选** |
| `auto-pro` | 推荐接入 · Cursor 可用 · 普通 Chat | 质量优先路由 |
| `auto-cheap` | 推荐接入 · Cursor 可用 · 普通 Chat | 控成本 |
| `nano-banana` | 推荐接入 · 图片模型专用 | 文生图主推 |

---

## 2. 普通 Chat（公开文本 / 视觉理解）

| 模型 | Chat | Stream | Cursor 可用 | Tool Call | 备注 |
|---|---|---|---|---|---|
| `gpt-5.4` / `gpt-5.5` | ✅ | ✅ | ✅ | 暂不承诺* | 高质量对话 / 代码 |
| `gemini-2.5-flash` / `gemini-3-flash` | ✅ | ✅ | ✅ | 暂不承诺* | 快、长文、图理解 |
| `gemini-2.5-pro` / `gemini-3-pro` | ✅ | ✅ | ✅ | 暂不承诺* | 更高质量 Gemini |

\* 仅当运维写入白名单且 `/v1/models` 标 `capabilities.tools=true` 后，才可对该客户单独承诺。

---

## 3. Cursor 可用（配置口径）

- Base URL：`https://api.tokfai.com/v1`
- 推荐模型 id：先 `auto-fast`，再按需 `auto-pro` / `auto-cheap`
- **Cursor Agent tools**：归入「Tool Call 暂不承诺」，除非白名单

---

## 4. Tool Call 暂不承诺（统一话术）

1. 默认：`auto-fast` / `auto-pro` / `auto-cheap` **不承诺** tools  
2. 强制 `tool_choice=required` 且未验证 → 常见 `model_not_tool_capable`，**不计费**  
3. `tool_choice=auto` 可能降级普通对话（成功则正常计费）  
4. 客户强需求：LIVE 验证 → 加白名单 → 更新本合同附件，再改本表分类  

---

## 5. 图片模型专用

| 模型 | 接口 | Chat | 说明 |
|---|---|---|---|
| `nano-banana` / `nano-banana-fast` / `nano-banana-2` | `/v1/images/generations` | ❌ | 异步 task_id；成功才扣费 |
| `gpt-image-2` 等 | 同上 | ❌ | 兼容风格图 |

错路由（图片走 Chat / 文本走 Image）→ 错误码 + **不扣费**。

---

## 6. 销售一页纸选型

| 客户说 | 你归类到 | 推荐 |
|---|---|---|
| 「先接上」 | 推荐接入 | `auto-fast` |
| 「Cursor 写代码」 | Cursor 可用 | `auto-pro`（tools 不承诺） |
| 「要 function calling」 | Tool Call 暂不承诺 | 升级验证流程，勿口头保证 |
| 「出主图」 | 图片模型专用 | `nano-banana` |
