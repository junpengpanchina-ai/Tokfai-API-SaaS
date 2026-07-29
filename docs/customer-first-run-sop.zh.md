# 客户首次接入 SOP（约 10 分钟）

> 客户拿到 API Key 后按本页操作。  
> 产品入口：Dashboard → **首次接入**（`/dashboard/integration-workbench`）· **API Keys** · **Docs**。

---

## 0. 开场检查（1 分钟）

- [ ] 已登录 https://tokfai.com → Dashboard
- [ ] Credits 余额可见（不足先充值）
- [ ] 已创建 API Key，并**复制保存**完整 `sk-tokfai_…`（只展示一次）

---

## 1. Base URL（必须抄对）

| 用途 | 值 |
|---|---|
| API 根 | `https://api.tokfai.com` |
| OpenAI / Cursor `baseURL` | `https://api.tokfai.com/v1` |

不要填其它厂商主机名。

---

## 2. API Key

```http
Authorization: Bearer sk-tokfai_********
```

- Key **不绑定**模型；模型写在每次请求的 `model` 字段
- 泄露 → Dashboard → API Keys → **撤销** → 新建

---

## 3. 推荐模型（先用这三个）

| 模型 | 什么时候用 |
|---|---|
| `auto-fast` | **首次试跑默认**、日常对话 |
| `auto-pro` | 更重质量 / 写代码偏好 |
| `auto-cheap` | 控成本、大批量试跑 |

图片请用 `nano-banana` 走 **Image API**，不要塞进 Chat。

---

## 4. curl 示例（2 分钟）

```bash
export TOKFAI_API_KEY='sk-tokfai_********'

curl -sS https://api.tokfai.com/v1/chat/completions \
  -H "Authorization: Bearer $TOKFAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "auto-fast",
    "messages": [{"role":"user","content":"用一句话介绍 Tokfai"}],
    "stream": false
  }'
```

成功应看到：

- HTTP **200**
- `choices[0].message.content`
- **`request_id`**（或 `tokfai.request_id`）
- 有扣费时 `credits_charged` / Usage 出现记录

---

## 5. Cursor 配置（3 分钟）

| 项 | 值 |
|---|---|
| 类型 | OpenAI Compatible / Custom OpenAI |
| Base URL | `https://api.tokfai.com/v1` |
| API Key | 你的 `sk-tokfai_…` |
| 模型 | 先填 `auto-fast` |

分步说明：Dashboard → Docs → **Cursor**（`#cursor`）。

**注意：** Cursor Agent 的 tools **不作为默认承诺**；若报 `model_not_tool_capable`，先关掉强制 tools，改普通对话。

---

## 6. 账单怎么看（2 分钟）

1. Dashboard → **Usage**：时间、模型、类型、成功/失败、tokens、扣费、`request_id`、错误码  
2. Dashboard → **Credits**：余额与流水  

口径：

- **成功** → 扣算力积分  
- **失败** → **不扣费**（`not_billable` / `credits_charged=0`）

---

## 7. 出问题怎么反馈（1 分钟）

必须提供：

1. **`request_id`**
2. **模型名**（如 `auto-fast`）
3. **大致时间**（含时区）
4. **是否 stream**（`true` / `false`）
5. **是否带 tools**（有/无；`tool_choice` 是什么）

模板见：`docs/error-and-request-id-sop.zh.md`

---

## 8. 完成标准（打勾即交付）

- [ ] curl 或 Cursor 任意一条路径返回 200  
- [ ] Usage 能搜到对应 `request_id`  
- [ ] 客户能口述：Base URL、推荐模型、失败不扣费、request_id 用途  
