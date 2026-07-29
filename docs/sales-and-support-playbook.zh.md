# 销售与售后话术手册

> 可复制给下一客户。配套：`docs/commercial-delivery-pack.zh.md` · `docs/model-capability-commercial-matrix.zh.md`

---

## 1. 电梯话术（30 秒）

「Tokfai 是 OpenAI 兼容的 API 网关。一个 Key、一个 Base URL，就能接 Cursor 或自研应用；按算力积分计费，失败请求通常不扣费，每笔都能用 request_id 对账。」

---

## 2. 能说 / 不能说

| 能说 ✅ | 不能说 ❌ |
|---|---|
| OpenAI-compatible（`/v1/chat/completions` 等） | 所有模型 fully compatible |
| 推荐 `auto-fast` / `auto-pro` / `auto-cheap` 起步 | 保证任意模型 tool calling |
| 成功扣费、失败通常不扣费 | 别名 = 某家官方直连 |
| Tools 需白名单验证后才承诺 | 「和 OpenAI 一模一样」 |
| 图片用 Nano Banana + Image API | 图片模型走 Chat |

---

## 3. 客户画像匹配

| 客户需求 | 推荐说法 | 推荐模型 |
|---|---|---|
| 先跑通 | 「10 分钟 curl / Cursor」 | `auto-fast` |
| 写代码质量 | 「质量优先别名」 | `auto-pro` 或 `gpt-5.5` |
| 控成本试跑 | 「便宜路由」 | `auto-cheap` |
| 出图 | 「单独 Image API」 | `nano-banana` |
| Agent / tools | 「先验证再进白名单，当前不默认承诺」 | 勿写进标配合同 |

---

## 4. 演示脚本（现场）

1. 打开 Dashboard → 首次接入页 / API Keys  
2. 展示 Base URL + 创建 Key  
3. 跑 curl（`auto-fast`）→ 指出 `request_id`  
4. 打开 Usage：成功行有扣费；故意错误模型 → 失败不扣费  
5. 打开 Docs Cursor 章节  
6. 收尾：「反馈问题必须带 request_id」

---

## 5. 售后边界

- 只处理带 **request_id** 的工单（见 error SOP）  
- 计费争议：以 Usage `credits_charged` / `billing_status` 为准  
- tools 相关投诉：对照是否白名单；未验证 → 引导降级普通 Chat，不计费失败属保护机制（P971–P974）  
- 不向客户泄露上游域名或原始上游错误串  

---

## 6. 移交下一客户的检查单

- [ ] 已发交付包索引 + 首次接入 SOP  
- [ ] 客户跑通至少一次成功请求  
- [ ] 客户知道失败不扣费与 request_id  
- [ ] 合同/邮件未写「全量 tools / fully compatible」  
- [ ] 销售备注：推荐模型与是否有 tools 需求  

---

## 7. 常见异议应答

**Q: 能不能当 OpenAI 官方用？**  
A: 协议兼容，便于迁移；能力以 `/v1/models` 的 capabilities 与商业矩阵为准，不是官方镜像。

**Q: Cursor Agent 报 tools 错？**  
A: 当前默认不承诺 tools。可先普通对话；若必须 tools，走验证白名单流程。

**Q: 失败扣了我的费？**  
A: 请给 request_id。失败应为 `credits_charged=0`；若不符由售后核对账本。
