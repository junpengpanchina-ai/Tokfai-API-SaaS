/** Customer troubleshooting case copy — merged into i18n messages. */
export const troubleshootingCaseMessagesEn: Record<string, string> = {
  "integration.troubleshooting.case.missing_token.title": "missing_token — no API Key sent",
  "integration.troubleshooting.case.missing_token.likelyCause":
    "The Authorization header was missing or broken — often from a multi-line curl paste with line breaks.",
  "integration.troubleshooting.case.missing_token.action1":
    "Use Copy one-line Chat curl from API Keys or Integration Workbench.",
  "integration.troubleshooting.case.missing_token.action2":
    "Confirm the header is Authorization: Bearer sk-tokfai_… on every request.",
  "integration.troubleshooting.case.missing_token.action3":
    "Do not type the key by hand — copy the full secret once from API Keys.",

  "integration.troubleshooting.case.invalid_token.title": "invalid_token — key not accepted",
  "integration.troubleshooting.case.invalid_token.likelyCause":
    "Key is incomplete, revoked, expired, or not a sk-tokfai_… format.",
  "integration.troubleshooting.case.invalid_token.action1":
    "Create a new API Key or copy the full key again from API Keys.",
  "integration.troubleshooting.case.invalid_token.action2":
    "Re-copy one-line curl — partial copy is the most common cause.",
  "integration.troubleshooting.case.invalid_token.action3":
    "Store the key on your backend only — not in browser frontend code.",

  "integration.troubleshooting.case.insufficient_credits.title": "insufficient_credits — balance too low",
  "integration.troubleshooting.case.insufficient_credits.likelyCause":
    "Your account credits cannot cover this request.",
  "integration.troubleshooting.case.insufficient_credits.action1":
    "Open Credits — add credits or review your balance.",
  "integration.troubleshooting.case.insufficient_credits.action2":
    "Check Usage for recent successful charges.",
  "integration.troubleshooting.case.insufficient_credits.action3":
    "Retry after topping up — failed auth/billing errors are usually not charged.",

  "integration.troubleshooting.case.route_not_found.title": "route_not_found — wrong HTTP path",
  "integration.troubleshooting.case.route_not_found.likelyCause":
    "URL path does not exist on api.tokfai.com — often missing /v1 or wrong endpoint.",
  "integration.troubleshooting.case.route_not_found.action1":
    "Use base URL https://api.tokfai.com/v1 with paths like /chat/completions.",
  "integration.troubleshooting.case.route_not_found.action2":
    "Compare your path with Chat API or Batch API docs.",
  "integration.troubleshooting.case.route_not_found.action3":
    "HTTP 404 route errors are usually not charged.",

  "integration.troubleshooting.case.invalid_request_error.title": "invalid_request_error — bad JSON body",
  "integration.troubleshooting.case.invalid_request_error.likelyCause":
    "Request JSON is malformed or required fields are missing.",
  "integration.troubleshooting.case.invalid_request_error.action1":
    "Validate model, messages, and Content-Type: application/json.",
  "integration.troubleshooting.case.invalid_request_error.action2":
    "Copy a working one-line curl and adapt fields gradually.",
  "integration.troubleshooting.case.invalid_request_error.action3":
    "Check error.message in the response for the specific field.",

  "integration.troubleshooting.case.invalid_prompt.title": "invalid_prompt — prompt rejected",
  "integration.troubleshooting.case.invalid_prompt.likelyCause":
    "Prompt content violates policy or format rules for the model.",
  "integration.troubleshooting.case.invalid_prompt.action1":
    "Shorten or rewrite the user message content.",
  "integration.troubleshooting.case.invalid_prompt.action2":
    "Try auto-fast with a simpler test prompt first.",
  "integration.troubleshooting.case.invalid_prompt.action3":
    "Usually not charged — verify in Usage if unsure.",

  "integration.troubleshooting.case.request_body_too_large.title": "request_body_too_large — payload too big",
  "integration.troubleshooting.case.request_body_too_large.likelyCause":
    "JSON body exceeds the allowed size — often huge context or batch items inline.",
  "integration.troubleshooting.case.request_body_too_large.action1":
    "Reduce messages length or split work into Batch jobs.",
  "integration.troubleshooting.case.request_body_too_large.action2":
    "For bulk work use POST /v1/batches/chat instead of giant sync payloads.",
  "integration.troubleshooting.case.request_body_too_large.action3":
    "Usually not charged.",

  "integration.troubleshooting.case.stream_not_supported.title": "stream_not_supported — streaming disabled",
  "integration.troubleshooting.case.stream_not_supported.likelyCause":
    "Request set stream: true but this path or client expects non-streaming JSON.",
  "integration.troubleshooting.case.stream_not_supported.action1":
    "Set stream: false for first tests and one-line curl.",
  "integration.troubleshooting.case.stream_not_supported.action2":
    "In OpenAI SDK disable streaming until basic calls work.",
  "integration.troubleshooting.case.stream_not_supported.action3":
    "Usually not charged.",

  "integration.troubleshooting.case.model_not_found.title": "model_not_found — model id unknown",
  "integration.troubleshooting.case.model_not_found.likelyCause":
    "Model string is not available on Tokfai — typo or deprecated id.",
  "integration.troubleshooting.case.model_not_found.action1":
    "Open Models page — start with auto-fast, auto-pro, or auto-cheap.",
  "integration.troubleshooting.case.model_not_found.action2":
    "Copy model id exactly from the Models list.",
  "integration.troubleshooting.case.model_not_found.action3":
    "Usually not charged.",

  "integration.troubleshooting.case.model_not_available.title": "model_not_available — model paused",
  "integration.troubleshooting.case.model_not_available.likelyCause":
    "Model exists but is temporarily unavailable for routing.",
  "integration.troubleshooting.case.model_not_available.action1":
    "Switch to auto-fast or auto-pro for the same workload.",
  "integration.troubleshooting.case.model_not_available.action2":
    "Retry with backoff after 5–30 seconds (max 3 attempts).",
  "integration.troubleshooting.case.model_not_available.action3":
    "Usually not charged.",

  "integration.troubleshooting.case.upstream_model_busy.title": "upstream_model_busy — model congested",
  "integration.troubleshooting.case.upstream_model_busy.likelyCause":
    "Upstream capacity is busy — common on premium models at peak.",
  "integration.troubleshooting.case.upstream_model_busy.action1":
    "Retry with backoff — or route via auto-fast / auto-cheap aliases.",
  "integration.troubleshooting.case.upstream_model_busy.action2":
    "Reduce sync concurrency — use traffic governor templates.",
  "integration.troubleshooting.case.upstream_model_busy.action3":
    "Usually not charged — check Usage for request_id if present.",

  "integration.troubleshooting.case.upstream_timeout.title": "upstream_timeout — request timed out",
  "integration.troubleshooting.case.upstream_timeout.likelyCause":
    "Upstream did not finish within the gateway timeout — slow model or large prompt.",
  "integration.troubleshooting.case.upstream_timeout.action1":
    "Search Usage by request_id — if no debit, safe to retry with backoff.",
  "integration.troubleshooting.case.upstream_timeout.action2":
    "Shorten prompts or lower Image / Chat concurrency.",
  "integration.troubleshooting.case.upstream_timeout.action3":
    "Move bulk jobs to Batch instead of long sync calls.",

  "integration.troubleshooting.case.gateway_overloaded.title": "gateway_overloaded — gateway busy",
  "integration.troubleshooting.case.gateway_overloaded.likelyCause":
    "Shared gateway capacity is under pressure — often from high concurrent sync traffic.",
  "integration.troubleshooting.case.gateway_overloaded.action1":
    "Pause new in-flight requests — backoff 5–30s before retry.",
  "integration.troubleshooting.case.gateway_overloaded.action2":
    "Apply client concurrency limits from Capacity Planner.",
  "integration.troubleshooting.case.gateway_overloaded.action3":
    "Usually not charged.",

  "integration.troubleshooting.case.upstream_rate_limited.title": "upstream_rate_limited — upstream throttled",
  "integration.troubleshooting.case.upstream_rate_limited.likelyCause":
    "Tokfai or upstream rate limits were hit — too many requests in a short window.",
  "integration.troubleshooting.case.upstream_rate_limited.action1":
    "Backoff retry — max 3 attempts with increasing delay.",
  "integration.troubleshooting.case.upstream_rate_limited.action2":
    "Move bulk copy to Batch — not parallel sync Chat floods.",
  "integration.troubleshooting.case.upstream_rate_limited.action3":
    "Usually not charged.",

  "integration.troubleshooting.case.upstream_error.title": "upstream_error — upstream failure",
  "integration.troubleshooting.case.upstream_error.likelyCause":
    "Upstream returned an error Tokfai could not map to a finer code.",
  "integration.troubleshooting.case.upstream_error.action1":
    "Copy request_id and search Usage — confirm whether credits were debited.",
  "integration.troubleshooting.case.upstream_error.action2":
    "Retry once with backoff — switch model alias if it persists.",
  "integration.troubleshooting.case.upstream_error.action3":
    "Check Credits reference_id if charged unexpectedly.",

  "integration.troubleshooting.case.too_many_requests.title": "too_many_requests — HTTP 429",
  "integration.troubleshooting.case.too_many_requests.likelyCause":
    "Account or route rate limit exceeded.",
  "integration.troubleshooting.case.too_many_requests.action1":
    "Slow down request rate — queue on the client.",
  "integration.troubleshooting.case.too_many_requests.action2":
    "Use traffic governor worker templates from Workbench.",
  "integration.troubleshooting.case.too_many_requests.action3":
    "Usually not charged.",

  "integration.troubleshooting.case.too_many_concurrent_requests.title":
    "too_many_concurrent_requests — concurrency cap hit",
  "integration.troubleshooting.case.too_many_concurrent_requests.likelyCause":
    "Too many parallel in-flight sync requests from your app.",
  "integration.troubleshooting.case.too_many_concurrent_requests.action1":
    "Cap Chat concurrency (10–25 per app) from Capacity Planner.",
  "integration.troubleshooting.case.too_many_concurrent_requests.action2":
    "Use Batch for bulk — not unlimited Promise.all on Chat.",
  "integration.troubleshooting.case.too_many_concurrent_requests.action3":
    "Usually not charged.",

  "integration.troubleshooting.case.invalid_image_url.title": "invalid_image_url — bad image URL",
  "integration.troubleshooting.case.invalid_image_url.likelyCause":
    "Image URL is unreachable, blocked, or not allowed for image-to-image.",
  "integration.troubleshooting.case.invalid_image_url.action1":
    "Use a public HTTPS URL or valid base64 per Image API docs.",
  "integration.troubleshooting.case.invalid_image_url.action2":
    "Test text-to-image first before image-to-image.",
  "integration.troubleshooting.case.invalid_image_url.action3":
    "Usually not charged.",

  "integration.troubleshooting.case.image_generation_failed.title":
    "image_generation_failed — image job failed",
  "integration.troubleshooting.case.image_generation_failed.likelyCause":
    "Image upstream failed after accepting the request.",
  "integration.troubleshooting.case.image_generation_failed.action1":
    "Search Usage by request_id — confirm credits_charged.",
  "integration.troubleshooting.case.image_generation_failed.action2":
    "Retry with simpler prompt or different image model.",
  "integration.troubleshooting.case.image_generation_failed.action3":
    "Lower Image concurrency (3–10 parallel).",

  "integration.troubleshooting.case.batch_cancelled.title": "batch_cancelled — batch stopped",
  "integration.troubleshooting.case.batch_cancelled.likelyCause":
    "Batch job was cancelled before all items finished.",
  "integration.troubleshooting.case.batch_cancelled.action1":
    "Succeeded items may still be charged — reconcile each request_id in Usage.",
  "integration.troubleshooting.case.batch_cancelled.action2":
    "Create a new batch for remaining items — do not infinite-poll cancelled jobs.",
  "integration.troubleshooting.case.batch_cancelled.action3":
    "Check Credits for partial charges.",

  "integration.troubleshooting.case.batch_item_failed.title": "batch_item_failed — one item failed",
  "integration.troubleshooting.case.batch_item_failed.likelyCause":
    "A single item in the batch failed — others may have succeeded.",
  "integration.troubleshooting.case.batch_item_failed.action1":
    "List batch items — copy each item request_id.",
  "integration.troubleshooting.case.batch_item_failed.action2":
    "Reconcile succeeded items in Usage / Credits first.",
  "integration.troubleshooting.case.batch_item_failed.action3":
    "Retry failed items individually — not the whole batch blindly.",

  "integration.troubleshooting.case.batch_pending_too_long.title":
    "batch_pending_too_long — batch still running",
  "integration.troubleshooting.case.batch_pending_too_long.likelyCause":
    "Large batch still processing — or polling stopped too early.",
  "integration.troubleshooting.case.batch_pending_too_long.action1":
    "Poll GET /v1/batches/{id} every 5s with a max poll cap (~60).",
  "integration.troubleshooting.case.batch_pending_too_long.action2":
    "Split very large jobs into smaller batches.",
  "integration.troubleshooting.case.batch_pending_too_long.action3":
    "Do not replace Batch with thousands of sync Chat calls.",

  "integration.troubleshooting.case.powershell_line_break.title":
    "PowerShell — curl line break error",
  "integration.troubleshooting.case.powershell_line_break.likelyCause":
    "Multi-line curl or broken quotes split the Authorization header in PowerShell.",
  "integration.troubleshooting.case.powershell_line_break.action1":
    "Copy PowerShell one-line curl.exe — single line only.",
  "integration.troubleshooting.case.powershell_line_break.action2":
    "Do not paste bash multi-line curl into PowerShell.",
  "integration.troubleshooting.case.powershell_line_break.action3":
    "Usually shows as missing_token or invalid_token in the API response.",

  "integration.troubleshooting.case.zsh_header_split.title": "Terminal — header split across lines",
  "integration.troubleshooting.case.zsh_header_split.likelyCause":
    "Line breaks inside curl split -H headers so Bearer token is not sent.",
  "integration.troubleshooting.case.zsh_header_split.action1":
    "Use Copy one-line curl — paste as one line in bash or zsh.",
  "integration.troubleshooting.case.zsh_header_split.action2":
    "If you need multi-line, ensure backslashes continue lines correctly.",
  "integration.troubleshooting.case.zsh_header_split.action3":
    "Usually not charged.",

  "integration.troubleshooting.case.cursor_connection_failed.title":
    "Cursor — connection or model test failed",
  "integration.troubleshooting.case.cursor_connection_failed.likelyCause":
    "Base URL, API Key, or model id in Cursor provider settings is wrong.",
  "integration.troubleshooting.case.cursor_connection_failed.action1":
    "Base URL https://api.tokfai.com/v1 — model auto-fast for first test.",
  "integration.troubleshooting.case.cursor_connection_failed.action2":
    "Verify one-line curl in terminal before Cursor.",
  "integration.troubleshooting.case.cursor_connection_failed.action3":
    "Copy Cursor config snippet from Integration Workbench.",

  "integration.troubleshooting.case.cherry_connection_failed.title":
    "Cherry Studio — connection failed",
  "integration.troubleshooting.case.cherry_connection_failed.likelyCause":
    "Tokfai Provider misconfigured, wrong provider selected, or Base URL / API Key is incomplete.",
  "integration.troubleshooting.case.cherry_connection_failed.action1":
    "Use Tokfai / | tokfai only — Base URL https://api.tokfai.com and an sk-tokfai_… key.",
  "integration.troubleshooting.case.cherry_connection_failed.action2":
    "If the error-detail host is not api.tokfai.com, switch back from Gemini / OpenAI / other providers to Tokfai.",
  "integration.troubleshooting.case.cherry_connection_failed.action3":
    "Copy Cherry Studio config from Docs → Cherry Studio.",

  "integration.troubleshooting.case.sdk_base_url_wrong.title": "SDK — wrong base URL",
  "integration.troubleshooting.case.sdk_base_url_wrong.likelyCause":
    "baseURL / base_url missing /v1 or points to the wrong host.",
  "integration.troubleshooting.case.sdk_base_url_wrong.action1":
    "Set baseURL to https://api.tokfai.com/v1 exactly.",
  "integration.troubleshooting.case.sdk_base_url_wrong.action2":
    "Copy OpenAI SDK config snippet from Docs.",
  "integration.troubleshooting.case.sdk_base_url_wrong.action3":
    "Verify with one-line curl before SDK.",

  "integration.troubleshooting.case.sdk_streaming_enabled.title":
    "SDK — streaming enabled too early",
  "integration.troubleshooting.case.sdk_streaming_enabled.likelyCause":
    "stream: true before non-streaming calls succeed.",
  "integration.troubleshooting.case.sdk_streaming_enabled.action1":
    "Disable streaming for first integration test.",
  "integration.troubleshooting.case.sdk_streaming_enabled.action2":
    "Match stream: false in one-line curl smoke test.",
  "integration.troubleshooting.case.sdk_streaming_enabled.action3":
    "Usually not charged.",
};

export const troubleshootingCaseMessagesZh: Record<string, string> = {
  "integration.troubleshooting.case.missing_token.title": "missing_token — 未发送 API Key",
  "integration.troubleshooting.case.missing_token.likelyCause":
    "Authorization 请求头缺失或断裂 — 常见于多行 curl 粘贴换行错误。",
  "integration.troubleshooting.case.missing_token.action1":
    "从 API Keys 或接入工作台使用「复制单行 Chat curl」。",
  "integration.troubleshooting.case.missing_token.action2":
    "确认每次请求携带 Authorization: Bearer sk-tokfai_…。",
  "integration.troubleshooting.case.missing_token.action3":
    "不要手打密钥 — 在 API Keys 一次性复制完整 secret。",

  "integration.troubleshooting.case.invalid_token.title": "invalid_token — 密钥不被接受",
  "integration.troubleshooting.case.invalid_token.likelyCause":
    "密钥不完整、已吊销、过期或不是 sk-tokfai_… 格式。",
  "integration.troubleshooting.case.invalid_token.action1":
    "创建新 API Key 或在 API Keys 重新复制完整密钥。",
  "integration.troubleshooting.case.invalid_token.action2":
    "重新复制单行 curl — 部分复制是最常见原因。",
  "integration.troubleshooting.case.invalid_token.action3":
    "密钥仅保存在后端 — 不要放在浏览器前端。",

  "integration.troubleshooting.case.insufficient_credits.title": "insufficient_credits — 余额不足",
  "integration.troubleshooting.case.insufficient_credits.likelyCause": "账户 credits 不足以支付本次请求。",
  "integration.troubleshooting.case.insufficient_credits.action1": "打开 Credits — 充值或查看余额。",
  "integration.troubleshooting.case.insufficient_credits.action2": "在 Usage 查看近期成功扣费。",
  "integration.troubleshooting.case.insufficient_credits.action3":
    "充值后重试 — 失败的鉴权/计费错误通常不扣费。",

  "integration.troubleshooting.case.route_not_found.title": "route_not_found — HTTP 路径错误",
  "integration.troubleshooting.case.route_not_found.likelyCause":
    "URL 路径在 api.tokfai.com 上不存在 — 常因缺少 /v1 或端点错误。",
  "integration.troubleshooting.case.route_not_found.action1":
    "使用 base URL https://api.tokfai.com/v1 及 /chat/completions 等路径。",
  "integration.troubleshooting.case.route_not_found.action2": "对照 Chat API 或 Batch API 文档核对路径。",
  "integration.troubleshooting.case.route_not_found.action3": "HTTP 404 路径错误通常不扣费。",

  "integration.troubleshooting.case.invalid_request_error.title": "invalid_request_error — JSON 请求错误",
  "integration.troubleshooting.case.invalid_request_error.likelyCause":
    "请求 JSON 格式错误或缺少必填字段。",
  "integration.troubleshooting.case.invalid_request_error.action1":
    "检查 model、messages 与 Content-Type: application/json。",
  "integration.troubleshooting.case.invalid_request_error.action2":
    "复制可用的单行 curl 并逐步修改字段。",
  "integration.troubleshooting.case.invalid_request_error.action3":
    "查看响应 error.message 了解具体字段。",

  "integration.troubleshooting.case.invalid_prompt.title": "invalid_prompt — 提示词被拒绝",
  "integration.troubleshooting.case.invalid_prompt.likelyCause":
    "提示词内容不符合模型策略或格式要求。",
  "integration.troubleshooting.case.invalid_prompt.action1": "缩短或改写用户消息内容。",
  "integration.troubleshooting.case.invalid_prompt.action2": "先用 auto-fast 和简单测试提示词。",
  "integration.troubleshooting.case.invalid_prompt.action3": "通常不扣费 — 不确定时在 Usage 核对。",

  "integration.troubleshooting.case.request_body_too_large.title": "request_body_too_large — 请求体过大",
  "integration.troubleshooting.case.request_body_too_large.likelyCause":
    "JSON 超过大小限制 — 常见于超长上下文或内联大批量 items。",
  "integration.troubleshooting.case.request_body_too_large.action1":
    "缩短 messages 或拆分为 Batch 任务。",
  "integration.troubleshooting.case.request_body_too_large.action2":
    "大批量使用 POST /v1/batches/chat，而非巨型同步请求。",
  "integration.troubleshooting.case.request_body_too_large.action3": "通常不扣费。",

  "integration.troubleshooting.case.stream_not_supported.title": "stream_not_supported — 不支持流式",
  "integration.troubleshooting.case.stream_not_supported.likelyCause":
    "请求设置了 stream: true，但当前路径或客户端期望非流式 JSON。",
  "integration.troubleshooting.case.stream_not_supported.action1":
    "首次测试与单行 curl 使用 stream: false。",
  "integration.troubleshooting.case.stream_not_supported.action2":
    "OpenAI SDK 先关闭 streaming 直到基础调用成功。",
  "integration.troubleshooting.case.stream_not_supported.action3": "通常不扣费。",

  "integration.troubleshooting.case.model_not_found.title": "model_not_found — 模型不存在",
  "integration.troubleshooting.case.model_not_found.likelyCause":
    "model 字符串在 Tokfai 上不可用 — 拼写错误或已下线。",
  "integration.troubleshooting.case.model_not_found.action1":
    "打开 Models 页 — 从 auto-fast、auto-pro、auto-cheap 起步。",
  "integration.troubleshooting.case.model_not_found.action2": "从 Models 列表精确复制 model id。",
  "integration.troubleshooting.case.model_not_found.action3": "通常不扣费。",

  "integration.troubleshooting.case.model_not_available.title": "model_not_available — 模型暂不可用",
  "integration.troubleshooting.case.model_not_available.likelyCause":
    "模型存在但暂时无法路由。",
  "integration.troubleshooting.case.model_not_available.action1":
    "改用 auto-fast 或 auto-pro 处理同类任务。",
  "integration.troubleshooting.case.model_not_available.action2":
    "5–30 秒后退避重试（最多 3 次）。",
  "integration.troubleshooting.case.model_not_available.action3": "通常不扣费。",

  "integration.troubleshooting.case.upstream_model_busy.title": "upstream_model_busy — 上游繁忙",
  "integration.troubleshooting.case.upstream_model_busy.likelyCause":
    "上游容量繁忙 — 高峰时 premium 模型常见。",
  "integration.troubleshooting.case.upstream_model_busy.action1":
    "退避重试 — 或通过 auto-fast / auto-cheap 别名路由。",
  "integration.troubleshooting.case.upstream_model_busy.action2":
    "降低同步并发 — 使用流量治理模板。",
  "integration.troubleshooting.case.upstream_model_busy.action3":
    "通常不扣费 — 有 request_id 时在 Usage 核对。",

  "integration.troubleshooting.case.upstream_timeout.title": "upstream_timeout — 上游超时",
  "integration.troubleshooting.case.upstream_timeout.likelyCause":
    "网关在超时前未收到上游完成 — 慢模型或大提示词。",
  "integration.troubleshooting.case.upstream_timeout.action1":
    "在 Usage 搜 request_id — 无扣费可安全退避重试。",
  "integration.troubleshooting.case.upstream_timeout.action2":
    "缩短提示词或降低 Image / Chat 并发。",
  "integration.troubleshooting.case.upstream_timeout.action3":
    "大批量任务改用 Batch，而非长同步调用。",

  "integration.troubleshooting.case.gateway_overloaded.title": "gateway_overloaded — 网关繁忙",
  "integration.troubleshooting.case.gateway_overloaded.likelyCause":
    "共享网关容量承压 — 常因高并发同步流量。",
  "integration.troubleshooting.case.gateway_overloaded.action1":
    "暂停新发请求 — 5–30s 后退避重试。",
  "integration.troubleshooting.case.gateway_overloaded.action2":
    "按容量规划器设置客户端并发上限。",
  "integration.troubleshooting.case.gateway_overloaded.action3": "通常不扣费。",

  "integration.troubleshooting.case.upstream_rate_limited.title": "upstream_rate_limited — 上游限流",
  "integration.troubleshooting.case.upstream_rate_limited.likelyCause":
    "短时间内请求过多触发 Tokfai 或上游限流。",
  "integration.troubleshooting.case.upstream_rate_limited.action1":
    "退避重试 — 最多 3 次递增延迟。",
  "integration.troubleshooting.case.upstream_rate_limited.action2":
    "大批量文案走 Batch — 不要同步 Chat 洪峰。",
  "integration.troubleshooting.case.upstream_rate_limited.action3": "通常不扣费。",

  "integration.troubleshooting.case.upstream_error.title": "upstream_error — 上游错误",
  "integration.troubleshooting.case.upstream_error.likelyCause":
    "上游返回错误，Tokfai 无法映射为更细的错误码。",
  "integration.troubleshooting.case.upstream_error.action1":
    "复制 request_id 在 Usage 搜索 — 确认是否扣费。",
  "integration.troubleshooting.case.upstream_error.action2":
    "退避重试一次 — 持续失败可换模型别名。",
  "integration.troubleshooting.case.upstream_error.action3":
    "异常扣费时查 Credits reference_id。",

  "integration.troubleshooting.case.too_many_requests.title": "too_many_requests — HTTP 429",
  "integration.troubleshooting.case.too_many_requests.likelyCause": "账户或路由速率超限。",
  "integration.troubleshooting.case.too_many_requests.action1": "降低请求频率 — 在客户端排队。",
  "integration.troubleshooting.case.too_many_requests.action2":
    "使用工作台的流量治理 worker 模板。",
  "integration.troubleshooting.case.too_many_requests.action3": "通常不扣费。",

  "integration.troubleshooting.case.too_many_concurrent_requests.title":
    "too_many_concurrent_requests — 并发超限",
  "integration.troubleshooting.case.too_many_concurrent_requests.likelyCause":
    "应用并行在途同步请求过多。",
  "integration.troubleshooting.case.too_many_concurrent_requests.action1":
    "按容量规划将 Chat 并发限制在 10–25。",
  "integration.troubleshooting.case.too_many_concurrent_requests.action2":
    "大批量用 Batch — 不要无限 Promise.all Chat。",
  "integration.troubleshooting.case.too_many_concurrent_requests.action3": "通常不扣费。",

  "integration.troubleshooting.case.invalid_image_url.title": "invalid_image_url — 图像 URL 无效",
  "integration.troubleshooting.case.invalid_image_url.likelyCause":
    "图像 URL 不可达、被拦截或不符合图生图要求。",
  "integration.troubleshooting.case.invalid_image_url.action1":
    "使用公网 HTTPS URL 或文档允许的 base64。",
  "integration.troubleshooting.case.invalid_image_url.action2": "先测文生图再测图生图。",
  "integration.troubleshooting.case.invalid_image_url.action3": "通常不扣费。",

  "integration.troubleshooting.case.image_generation_failed.title":
    "image_generation_failed — 图像生成失败",
  "integration.troubleshooting.case.image_generation_failed.likelyCause":
    "请求已接受但图像上游最终失败。",
  "integration.troubleshooting.case.image_generation_failed.action1":
    "在 Usage 搜 request_id 确认 credits_charged。",
  "integration.troubleshooting.case.image_generation_failed.action2":
    "简化提示词或换图像模型重试。",
  "integration.troubleshooting.case.image_generation_failed.action3":
    "降低 Image 并发（3–10 并行）。",

  "integration.troubleshooting.case.batch_cancelled.title": "batch_cancelled — 批量任务已取消",
  "integration.troubleshooting.case.batch_cancelled.likelyCause":
    "Batch 在完成前被取消。",
  "integration.troubleshooting.case.batch_cancelled.action1":
    "已成功 item 可能仍扣费 — 在 Usage 对账各 request_id。",
  "integration.troubleshooting.case.batch_cancelled.action2":
    "剩余条目创建新 batch — 不要无限轮询已取消任务。",
  "integration.troubleshooting.case.batch_cancelled.action3": "在 Credits 核对部分扣费。",

  "integration.troubleshooting.case.batch_item_failed.title": "batch_item_failed — 单条失败",
  "integration.troubleshooting.case.batch_item_failed.likelyCause":
    "Batch 中某条失败 — 其他条目可能已成功。",
  "integration.troubleshooting.case.batch_item_failed.action1":
    "列出 batch items — 复制各 item request_id。",
  "integration.troubleshooting.case.batch_item_failed.action2":
    "先在 Usage / Credits 对账成功条目。",
  "integration.troubleshooting.case.batch_item_failed.action3":
    "单独重试失败条目 — 不要盲目重跑整个 batch。",

  "integration.troubleshooting.case.batch_pending_too_long.title":
    "batch_pending_too_long — Batch 长时间未完成",
  "integration.troubleshooting.case.batch_pending_too_long.likelyCause":
    "大批量仍在处理 — 或轮询过早停止。",
  "integration.troubleshooting.case.batch_pending_too_long.action1":
    "每 5s 轮询 GET /v1/batches/{id}，最多约 60 次。",
  "integration.troubleshooting.case.batch_pending_too_long.action2":
    "超大任务拆成多个较小 batch。",
  "integration.troubleshooting.case.batch_pending_too_long.action3":
    "不要用数千同步 Chat 替代 Batch。",

  "integration.troubleshooting.case.powershell_line_break.title":
    "PowerShell — curl 换行错误",
  "integration.troubleshooting.case.powershell_line_break.likelyCause":
    "多行 curl 或引号断裂导致 Authorization 头在 PowerShell 中被拆分。",
  "integration.troubleshooting.case.powershell_line_break.action1":
    "复制 PowerShell 单行 curl.exe — 仅一行。",
  "integration.troubleshooting.case.powershell_line_break.action2":
    "不要将 bash 多行 curl 粘贴到 PowerShell。",
  "integration.troubleshooting.case.powershell_line_break.action3":
    "API 响应常显示为 missing_token 或 invalid_token。",

  "integration.troubleshooting.case.zsh_header_split.title": "终端 — 请求头被换行拆开",
  "integration.troubleshooting.case.zsh_header_split.likelyCause":
    "curl 内换行导致 -H 头断裂，Bearer 未发送。",
  "integration.troubleshooting.case.zsh_header_split.action1":
    "使用单行 curl — 在 bash/zsh 一次性粘贴。",
  "integration.troubleshooting.case.zsh_header_split.action2":
    "多行时必须正确使用反斜杠续行。",
  "integration.troubleshooting.case.zsh_header_split.action3": "通常不扣费。",

  "integration.troubleshooting.case.cursor_connection_failed.title":
    "Cursor — 连接或模型测试失败",
  "integration.troubleshooting.case.cursor_connection_failed.likelyCause":
    "Cursor Provider 中 Base URL、API Key 或 model 配置错误。",
  "integration.troubleshooting.case.cursor_connection_failed.action1":
    "Base URL https://api.tokfai.com/v1 — 首次测试 model auto-fast。",
  "integration.troubleshooting.case.cursor_connection_failed.action2":
    "先在终端验证单行 curl。",
  "integration.troubleshooting.case.cursor_connection_failed.action3":
    "从接入工作台复制 Cursor 配置片段。",

  "integration.troubleshooting.case.cherry_connection_failed.title":
    "Cherry Studio — 连接失败",
  "integration.troubleshooting.case.cherry_connection_failed.likelyCause":
    "Tokfai Provider 配置错误、选错了供应商，或 Base URL / API Key 未填全。",
  "integration.troubleshooting.case.cherry_connection_failed.action1":
    "只使用 Tokfai / | tokfai — Base URL https://api.tokfai.com，API Key 以 sk-tokfai_ 开头。",
  "integration.troubleshooting.case.cherry_connection_failed.action2":
    "若错误详情请求主机不是 api.tokfai.com，说明误选了 Gemini / OpenAI / 其它供应商，请切回 Tokfai。",
  "integration.troubleshooting.case.cherry_connection_failed.action3":
    "从文档 → Cherry Studio 复制正确配置。",

  "integration.troubleshooting.case.sdk_base_url_wrong.title": "SDK — Base URL 错误",
  "integration.troubleshooting.case.sdk_base_url_wrong.likelyCause":
    "baseURL / base_url 缺少 /v1 或指向错误主机。",
  "integration.troubleshooting.case.sdk_base_url_wrong.action1":
    "将 baseURL 设为 https://api.tokfai.com/v1。",
  "integration.troubleshooting.case.sdk_base_url_wrong.action2":
    "从文档复制 OpenAI SDK 配置片段。",
  "integration.troubleshooting.case.sdk_base_url_wrong.action3":
    "SDK 之前先用单行 curl 验证。",

  "integration.troubleshooting.case.sdk_streaming_enabled.title":
    "SDK — 过早启用 streaming",
  "integration.troubleshooting.case.sdk_streaming_enabled.likelyCause":
    "非流式调用未成功前就设置 stream: true。",
  "integration.troubleshooting.case.sdk_streaming_enabled.action1":
    "首次接入测试关闭 streaming。",
  "integration.troubleshooting.case.sdk_streaming_enabled.action2":
    "与单行 curl 一致使用 stream: false。",
  "integration.troubleshooting.case.sdk_streaming_enabled.action3": "通常不扣费。",
};
