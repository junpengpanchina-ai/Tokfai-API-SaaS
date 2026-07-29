# Tokfai 模型商业矩阵（对外话术）

> 销售 / 实施选型用。运行时以 `GET /v1/models` 的 `enabled`/`visible`/`capabilities` 为准。  
> **Tools 不作为公开承诺能力**，除非运维在 `VERIFIED_TOOLS_CAPABLE_MODEL_IDS` 白名单中验证通过，且 `/v1/models` 上该模型 `capabilities.tools=true`。

图例：

| 符号 | 含义 |
|---|---|
| ✅ | 公开可承诺 |
| ⚠️ | 可用但需说明限制 |
| ❌ | 不承诺 / 不适用 |
| 白名单 | 仅验证名单内才可承诺 tools |

---

## 1. 推荐入口（优先卖这些）

| 模型 | 定位 | 适用场景 | 推荐 | Chat | Stream | Coding | Image 生成 | Tools |
|---|---|---|---|---|---|---|---|---|
| `auto-fast` | 智能路由·日常 | 新手接入、日常对话、控成本 | ✅ | ✅ | ✅ | ⚠️ | ❌ | ❌（默认非白名单） |
| `auto-pro` | 智能路由·质量 | 复杂问答、写代码偏好质量 | ✅ | ✅ | ✅ | ✅ | ❌ | ❌（默认非白名单） |
| `gpt-5.5` | 高质量对话 | 推理、代码、复杂任务 | ✅ | ✅ | ✅ | ✅ | ❌ | 白名单 |
| `gemini-2.5-flash` / `gemini-3-flash` | 快·多模态理解 | 长文、图片输入理解 | ✅ | ✅ | ✅ | ⚠️ | ❌ | 白名单 |
| `nano-banana` | 文生图主推 | 电商图、批量出图 | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |

---

## 2. 公开 Chat / Vision 模型

| 模型 | 定位 | 适用场景 | 推荐 | Chat | Stream | Coding | Vision 输入 | Image 生成 | Tools |
|---|---|---|---|---|---|---|---|---|---|
| `gpt-5.4` | 通用高质量 | 大多数业务对话 | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | 白名单 |
| `gpt-5.5` | 更高质量 | 复杂推理 / 代码 | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | 白名单 |
| `gemini-3-flash` | 更快 Gemini | 长文 + 图理解 | ✅ | ✅ | ✅ | ⚠️ | ✅ | ❌ | 白名单 |
| `gemini-3-pro` | 更高质量 Gemini | 长文 + 图理解 | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | 白名单 |
| `gemini-2.5-flash` | 稳定省积分 | 控成本多模态 | ✅ | ✅ | ✅ | ⚠️ | ✅ | ❌ | 白名单 |
| `gemini-2.5-pro` | 稳定高质量 | 长文 / 视觉理解 | ⚠️ | ✅ | ✅ | ✅ | ✅ | ❌ | 白名单 |

说明：

- **Vision 输入** = 在 Chat 消息里带图片理解，**不是**文生图。
- **Coding**：模型擅长写代码；不等于 Cursor Agent tools 已验证。

---

## 3. 兼容别名（Catalog aliases）

| 模型 | 定位 | 适用场景 | 推荐 | Chat | Stream | Coding | Image 生成 | Tools |
|---|---|---|---|---|---|---|---|---|
| `auto-fast` | 日常默认 | 接入试跑 | ✅ | ✅ | ✅ | ⚠️ | ❌ | ❌ 默认 |
| `auto-pro` | 质量优先路由 | 质量敏感客户 | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ 默认 |
| `auto-cheap` | 更省积分 | 大批量试跑 | ⚠️ | ✅ | ✅ | ⚠️ | ❌ | ❌ 默认 |
| `gpt-5` / `gpt-5-chat` / `gpt-5-pro` / `gpt-5.4-pro` / `gpt-5.1` / `gpt-5.2` | 旧客户端兼容 | 迁移、改名兼容 | ⚠️ | ✅ | ✅ | ⚠️ | ❌ | 白名单 |

话术：**别名不是独立上游**；内部会路由到具体模型。对账以 Usage 中的实际 `model` / `request_id` 为准。

---

## 4. 图片模型（仅 Image API）

| 模型 | 定位 | 适用场景 | 推荐 | Chat | Stream | Coding | Image 生成 | Tools |
|---|---|---|---|---|---|---|---|---|
| `nano-banana` | 主推文生图 | 电商主图、批量 | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| `nano-banana-fast` | 轻量快图 | 试跑、低成本批量 | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| `nano-banana-2` | 更高质量图 | 品牌视觉、稳定批量 | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| `gpt-image-2` / `gpt-image-2-vip` | 兼容风格图 | 兼容客户端文生图 | ⚠️ | ❌ | ❌ | ❌ | ✅ | ❌ |

硬规则：

- 图片模型 **禁止** 走 `/v1/chat/completions`（`image_model_not_for_chat`，不计费）
- Chat / Gemini **禁止** 走文生图接口（`model_not_image_capable`，不计费）
- 提交 → `task_id` → 轮询；**成功出图才扣费**，失败/超时不计费

---

## 5. Tools 政策（必须说清楚）

1. **默认对外话术**：Tokfai 保证 OpenAI 兼容的 Chat / Stream / 计费对账；**不保证** tool calling / function calling 对所有模型可用。
2. 仅当模型 id 在服务端环境变量 `VERIFIED_TOOLS_CAPABLE_MODEL_IDS` 中，且 `/v1/models` 返回 `capabilities.tools=true` 时，才可对该客户写进合同或 SOP。
3. 未验证模型：
   - 强制 `tool_choice=required` / `function` → `model_not_tool_capable`，**not_billable**
   - `tool_choice=auto` → 降级为普通对话（可能去掉 tools），成功则正常计费
4. Cursor Agent 强依赖 tools 的客户：先 LIVE 验证 → 加白名单 → 再更新本矩阵「Tools」列。

---

## 6. 销售一句话选型

| 客户说 | 你推荐 |
|---|---|
| 「先跑通 Cursor / curl」 | `auto-fast` |
| 「写代码要稳」 | `auto-pro` 或 `gpt-5.5` |
| 「要看图理解」 | `gemini-*-flash/pro` |
| 「要出图」 | `nano-banana` + Image API |
| 「要 function calling」 | 先查白名单；未验证则 **不承诺** |

配套：`docs/customer-onboarding-playbook.zh.md` · `docs/error-code-guide.zh.md`
