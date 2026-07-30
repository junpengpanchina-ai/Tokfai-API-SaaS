# 客户风控 SOP（试用 / 配额 / 排障）

> 销售、实施、售后共用。配合：`docs/trial-quota-commercial-guard.zh.md`

---

## 1. 灰度售卖流程

1. 注册 → 创建 API Key  
2. DB/运维将 Key 标为 `trial_mode=true`（必要时设 `trial_credits_limit`）  
3. 客户只用 `auto-fast` / `auto-cheap` 试跑  
4. 证明：成功有扣费；超额/禁模失败 **不扣费** + 有 `request_id`  
5. 付费转正：关闭 `trial_mode`，开放正式模型  

---

## 2. 客户话术

- 「试用阶段推荐 auto-fast / auto-cheap，避免误打高成本模型。」  
- 「超额或禁用模型会被拦截，且**不计费**。」  
- 「反馈问题请带 request_id、模型、时间。」  
- 「不承诺所有模型 tool calling / fully compatible。」  

---

## 3. 售后排障清单

- [ ] 收齐：`request_id`、模型、时间、是否 stream、是否 tools  
- [ ] Usage：状态、`error_code`、`credits_charged`、`billing_status`  
- [ ] 若为 `trial_*` / `daily_limit_exceeded` / `quota_exceeded` → 解释额度，确认未扣费  
- [ ] 若失败却扣费 → 升级钱袋子排查（P961 风险项）  
- [ ] 日志只用 mask，不索要完整 Key  

---

## 4. Admin 一眼看

- 今日成功 / 失败 / not_billable  
- Top models / 最近错误  
- 「试用额度 / 配额风控」提示卡  

---

## 5. 技术验收要点

- 普通 Chat 成功可扣费  
- 不存在模型 / 试用禁模 / 超额 → 失败且 `credits_charged=0`  
- 不破坏 P971–P981 保护  
