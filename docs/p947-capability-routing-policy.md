# P947 — Tokfai capability routing / model policy

> **性质：** 能力分类 + 模型路由建议文档与静态测试框架（判定层 / 产品策略层）。  
> **硬限制：** 不改 chat 主链路稳定逻辑、不改 billing、不改 alias、不改 Cherry、不改 Nginx、不改 Nano Banana 生产链路。  
> **现状：** Nano Banana / 图片 / 视频 **生产开放暂停**；图片与视频仅保留策略边界，不进入公开 chat 稳定面。  
> **脚本：** [`scripts/p947-capability-routing-policy-smoke.mjs`](../scripts/p947-capability-routing-policy-smoke.mjs)

---

## 0. 决策摘要

| 原则 | 说明 |
|------|------|
| 能力先于模型 | 先按任务能力选路，再选具体模型家族 |
| Chat 主链路隔离 | `POST /v1/chat/completions` 与 `POST /v1/responses` **只承载文本类能力**；禁止被图片 / 视频能力污染 |
| 媒体异步化 | 图片生成 / 编辑、视频生成必须走独立 async 任务面，不进 chat 同步主路径 |
| 生产开放暂停 | Nano Banana / 图片 / 视频 **not public stable**；本阶段只固化策略与静态门禁 |
| 不碰稳定面 | 本任务不修改计费、alias、Cherry 兼容、Nginx、亦不改动现有 Nano Banana 实现代码 |

---

## 1. 能力分类（capability taxonomy）

以下为 Tokfai 产品与路由策略使用的能力 ID。文档与 smoke 均以这些 ID 为准。

| Capability ID | 家族（六类） | 同步面 | 说明 |
|---------------|--------------|--------|------|
| `text_chat` | **text** | chat / responses | 通用对话、问答、摘要、轻推理 |
| `code_agent` | **code** | chat / responses | 代码生成、Agent 工具循环、工程分析、复杂推理 |
| `long_context` | text（长文切片） | chat / responses | 长文档理解、大批量上下文、跨章节综合 |
| `ecommerce_copy` | **ecommerce** | chat / responses | 电商文案、标题、卖点、SKU 描述精修 |
| `geo_content` | **geo** | chat / responses | 多语言 / GEO 本地化内容、区域化文案 |
| `image_generation_async` | **image** | **async-only** | 文生图；禁止进入 chat/completions 与 responses |
| `image_edit_async` | **image** | **async-only** | 图编辑 / 参考图改图；禁止进入 chat 主链路 |
| `video_generation_async` | **video** | **future async-only** | 视频生成；未来独立 async queue，禁止进入 chat 主链路 |

### 1.1 六类能力（smoke 必检）

Smoke 按以下六类关键字 / 能力族校验文档覆盖：

1. **text** — `text_chat`（及长文相关 `long_context`）
2. **code** — `code_agent`
3. **ecommerce** — `ecommerce_copy`
4. **geo** — `geo_content`
5. **image** — `image_generation_async` + `image_edit_async`
6. **video** — `video_generation_async`

---

## 2. 模型路由建议（routing policy）

### 2.1 GPT 系列

**优先能力：** `code_agent`、复杂推理、工程分析、精修内容（含 `ecommerce_copy` 高质量精修）、Agent 工具调用密集场景。

| 建议 | |
|------|--|
| 适用 | 代码、Agent、复杂推理、工程分析、精修内容 |
| 同步面 | `POST /v1/chat/completions`、`POST /v1/responses` |
| 不适用 | 图片生成 / 编辑、视频生成 |

### 2.2 Gemini 系列

**优先能力：** `long_context`、`text_chat` 批量内容、低成本泛化、`geo_content` 多语言 / GEO、大批量 `ecommerce_copy` 初稿。

| 建议 | |
|------|--|
| 适用 | 长文本、批量内容、低成本泛化、多语言 / GEO |
| 同步面 | `POST /v1/chat/completions`、`POST /v1/responses` |
| 不适用 | 图片生成 / 编辑、视频生成 |

### 2.3 Nano Banana（图片）

**仅** `image_generation_async` / `image_edit_async`。

| 标记 | 含义 |
|------|------|
| **async-only** | 必须走异步任务（创建任务 → 轮询 / webhook），禁止当同步 chat 模型调用 |
| **not public stable** | 当前 **生产开放暂停**；不作为公开稳定 chat 能力宣传或默认路由 |
| 隔离 | **不进入** `POST /v1/chat/completions` 与 `POST /v1/responses` 主链路 |
| 本任务 | **不修改** Nano Banana 生产链路代码；仅固化策略边界 |

### 2.4 Video

**仅** `video_generation_async`。

| 标记 | 含义 |
|------|------|
| **future async-only** | 未来独立 async queue；当前无公开稳定同步入口 |
| 隔离 | **不进入** `POST /v1/chat/completions` 与 `POST /v1/responses` 主链路 |
| 生产 | 视频生产开放暂停；策略先行，实现另开任务 |

---

## 3. Chat 主链路污染禁令（hard isolation）

下列能力 **不得** 路由进、混入或伪装为 chat 主链路能力：

- `image_generation_async`
- `image_edit_async`
- `video_generation_async`

**禁止污染的表面：**

- `POST /v1/chat/completions`
- `POST /v1/responses`

**允许的文本类表面（能力子集）：**

- `text_chat`
- `code_agent`
- `long_context`
- `ecommerce_copy`
- `geo_content`

含义：客户在 chat/completions 或 responses 上选择的模型，必须是文本 / 代码 / 内容类路由目标（GPT / Gemini 等）；不得因 Nano Banana 或 Video 能力把图片 / 视频任务塞进这两条同步路径。

---

## 4. 生产开放状态（当前）

| 领域 | 状态 | 策略标签 |
|------|------|----------|
| Text chat（GPT / Gemini 文本面） | 维持既有稳定逻辑 | public text paths |
| Nano Banana / 图片生成与编辑 | **暂停生产开放** | async-only · not public stable |
| Video | **暂停 / 未开放** | future async-only |
| 本仓库本任务改动面 | 仅 docs + p947 smoke | 不改 billing / alias / Cherry / Nginx / 图片实现 |

---

## 5. 怎么跑（静态 smoke）

```bash
# 仅文档 + 静态检查；不启 mock、不打 LIVE、不触生产链路
node scripts/p947-capability-routing-policy-smoke.mjs
```

Smoke **只**做：

1. 文档存在且包含 text / code / ecommerce / geo / image / video 六类能力
2. Nano Banana 标记为 **async-only** 与 **not public stable**
3. Video 标记为 **future async-only**
4. 文档明确：`chat/completions` 与 `responses` 不允许被图片 / 视频能力污染

不调用上游、不改计费、不改 alias、不跑 Cherry 矩阵。

---

## 6. 与既有 suite 的关系

| Suite | 关系 |
|-------|------|
| p932 / p933 Cherry | **不修改**；本策略不改 Cherry 请求体或兼容矩阵 |
| p941 isolation | 互补：隔离观测 vs 能力路由策略 |
| p942 vision analyze | 视觉「分析」文本面 ≠ Nano Banana 生图；本策略不改 p942 |
| billing / alias / Nginx | **不纳入、不修改** |
| release gate | **不纳入**；P947 PASS 不替代五门禁标记 |

---

## 7. Acceptance

运行后必须出现：

```text
TOKFAI_P947_CAPABILITY_ROUTING_POLICY_PASS
```
