# 开发者 Agent 场景交付 Checklist

> Hermes / Cursor / Codex 商业复制验收用。打勾再签「可交付」。

---

## 1. 销售交付 checklist

- [ ] 已发客户画像摘要 + Cursor SOP + 模型分层（A–E）  
- [ ] 口头声明：**不承诺**全模型 tools / fully compatible  
- [ ] 推荐起步：`auto-fast`；写代码：`auto-pro` / `gpt-5.5`  
- [ ] 说明 Base URL：`https://api.tokfai.com/v1`  
- [ ] 说明成功扣费 / 失败不扣费 + `request_id`  
- [ ] 异议手册要点已过一遍（原生效率、稳定性、Cursor、tools、扣费、可复制）  

---

## 2. 客户接入 checklist

- [ ] 注册登录，Credits 可见  
- [ ] 创建并保存 `sk-tokfai_…`  
- [ ] Cursor（或 Codex）填好 Base URL + Key  
- [ ] `auto-fast` 试通至少 1 次  
- [ ] Usage 能看到对应 `request_id`  
- [ ] 知道失败不扣费的查看方式  

---

## 3. 售后排障 checklist

- [ ] 收齐五件套：`request_id`、模型、时间、是否 stream、是否 tools  
- [ ] Usage / Admin 定位该行  
- [ ] 核对 `credits_charged` / `billing_status`  
- [ ] 按错误码表给处理建议（`model_not_tool_capable` 等）  
- [ ] 未向客户泄露上游原始域名/堆栈  

---

## 4. 技术验收 checklist

- [ ] `GET /v1/models` 含 `capabilities`  
- [ ] 普通 Chat 200 + `request_id`  
- [ ] 故意失败（错误模型或未验证强制 tools）→ **not_billable / credits=0**  
- [ ] 普通 Chat 路径未被本次交付改动破坏  
- [ ] 无要求客户侧出现 charged 失败脏账  

---

## 5. 商业复盘 checklist

- [ ] 本客户是否走完「只读分析」演示  
- [ ] 是否演示「小范围改码 + git diff」边界  
- [ ] tools 需求是否记录（要/不要/待验证）  
- [ ] 下一同类客户可复用同一文档包（无需改核心计费）  
- [ ] 复盘记录：异议、选型、未承诺项  

---

## 6. 关联文档

| 文档 |
|---|
| `docs/hermes-developer-agent-customer-profile.zh.md` |
| `docs/cursor-codex-commercial-sop.zh.md` |
| `docs/developer-agent-model-routing.zh.md` |
| `docs/hermes-objection-handling.zh.md` |
| `docs/commercial-delivery-pack.zh.md`（总包） |
| `docs/error-and-request-id-sop.zh.md` |
