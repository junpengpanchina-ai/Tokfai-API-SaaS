-- =============================================================================
-- Tokfai P754 — model availability & billing announcement (data only)
--
-- Updates the model-availability notice with production risk guidance.
-- Out of scope: billing / checkout / webhook / schema changes.
-- =============================================================================

update public.announcements
set
  title = '模型可用性与扣费说明',
  summary = '了解 Chat / Image 模型可用性、推荐测试模型与成功请求扣费规则。',
  content = E'## 模型可用性与扣费说明\n\n- Tokfai API 当前支持 **Chat** 与 **Image**。\n- 模型可用性可能受上游负载影响，部分模型在高负载时可能暂时不可用。\n- 推荐测试优先使用 **gpt-5.4**（也可尝试 gpt-5.5）。\n- 仅 **成功** 请求才会扣除 credits；失败请求通常不扣费。\n- 可在 **Usage** 与 **Credits** 页面查看请求记录与账本明细。',
  type = 'model',
  priority = 15,
  enabled = true,
  pinned = false,
  updated_at = now()
where slug = 'model-availability';
