/** Basic starter template copy — merged via i18n provider flat map. */
export const starterTemplateMessagesEn: Record<string, string> = {
  "integration.starterTemplates.reconcileStep1":
    "Copy request_id from the JSON response (or each batch item).",
  "integration.starterTemplates.reconcileStep2":
    "Dashboard → Usage — search request_id.",
  "integration.starterTemplates.reconcileStep3":
    "Dashboard → Credits — search reference_id or request_id.",
  "integration.starterTemplates.reconcileBatchStep1":
    "Poll batch until completed or partial_failed — list items.",
  "integration.starterTemplates.reconcileBatchStep2":
    "Copy each succeeded item request_id into Usage.",
  "integration.starterTemplates.reconcileBatchStep3":
    "Sum credits_charged in Credits — match batch totals.",
  "integration.starterTemplates.retryAdvice1":
    "429 / 503 / 504 — backoff 5–30s, max 3 attempts.",
  "integration.starterTemplates.retryAdvice2":
    "401 / 402 / invalid_request — fix config; do not retry blindly.",
  "integration.starterTemplates.retryAdviceNo":
    "Fix API Key or prompt first — auth errors do not retry.",

  "integration.starterTemplates.template.one-line-chat-curl.title": "One-line Chat curl",
  "integration.starterTemplates.template.one-line-chat-curl.useCase":
    "Smoke-test your API Key with a single Chat completion.",
  "integration.starterTemplates.template.one-line-chat-curl.when1":
    "First verification after creating an API Key.",
  "integration.starterTemplates.template.one-line-chat-curl.when2":
    "Quick terminal check before SDK or Cursor setup.",
  "integration.starterTemplates.template.one-line-chat-curl.inputShape":
    "JSON: model, messages[{role, content}], stream:false.",
  "integration.starterTemplates.template.one-line-chat-curl.expected1":
    "HTTP 200 — choices[0].message.content",
  "integration.starterTemplates.template.one-line-chat-curl.expected2":
    "request_id, credits_charged, tokfai.resolved_model",

  "integration.starterTemplates.template.one-line-responses-curl.title": "One-line Responses curl",
  "integration.starterTemplates.template.one-line-responses-curl.useCase":
    "Test the Responses API path with one paste.",
  "integration.starterTemplates.template.one-line-responses-curl.when1": "Apps using OpenAI Responses shape.",
  "integration.starterTemplates.template.one-line-responses-curl.when2": "Before wiring SDK responses client.",
  "integration.starterTemplates.template.one-line-responses-curl.inputShape":
    "JSON: model, input (string prompt).",
  "integration.starterTemplates.template.one-line-responses-curl.expected1": "HTTP 200 with output text",
  "integration.starterTemplates.template.one-line-responses-curl.expected2": "request_id for Usage / Credits",

  "integration.starterTemplates.template.one-line-image-curl.title": "One-line Image curl",
  "integration.starterTemplates.template.one-line-image-curl.useCase": "Text-to-image smoke test.",
  "integration.starterTemplates.template.one-line-image-curl.when1": "Validate Image API billing path.",
  "integration.starterTemplates.template.one-line-image-curl.when2": "Before high-volume image jobs.",
  "integration.starterTemplates.template.one-line-image-curl.inputShape":
    "JSON: model, prompt, size, n, response_format.",
  "integration.starterTemplates.template.one-line-image-curl.expected1": "HTTP 200 — data[0].url",
  "integration.starterTemplates.template.one-line-image-curl.expected2": "request_id, credits_charged",

  "integration.starterTemplates.template.one-line-batch-create-curl.title": "One-line Batch create curl",
  "integration.starterTemplates.template.one-line-batch-create-curl.useCase":
    "Create a bulk Chat batch job.",
  "integration.starterTemplates.template.one-line-batch-create-curl.when1": "Dozens to thousands of chat items.",
  "integration.starterTemplates.template.one-line-batch-create-curl.when2":
    "Replace parallel sync Chat floods.",
  "integration.starterTemplates.template.one-line-batch-create-curl.inputShape":
    "JSON: model, items[{messages}].",
  "integration.starterTemplates.template.one-line-batch-create-curl.expected1": "HTTP 202 — batch id",
  "integration.starterTemplates.template.one-line-batch-create-curl.expected2": "status pending or processing",

  "integration.starterTemplates.template.one-line-batch-poll-curl.title": "One-line Batch poll curl",
  "integration.starterTemplates.template.one-line-batch-poll-curl.useCase": "Poll batch status by id.",
  "integration.starterTemplates.template.one-line-batch-poll-curl.when1": "After batch create returns id.",
  "integration.starterTemplates.template.one-line-batch-poll-curl.when2": "Every 5–10s until terminal status.",
  "integration.starterTemplates.template.one-line-batch-poll-curl.inputShape": "GET /v1/batches/{id}",
  "integration.starterTemplates.template.one-line-batch-poll-curl.expected1":
    "status: completed | partial_failed | failed",
  "integration.starterTemplates.template.one-line-batch-poll-curl.expected2": "succeeded_items, credits_charged",

  "integration.starterTemplates.template.one-line-batch-items-curl.title": "One-line Batch items curl",
  "integration.starterTemplates.template.one-line-batch-items-curl.useCase": "List per-item results.",
  "integration.starterTemplates.template.one-line-batch-items-curl.when1": "After batch reaches terminal status.",
  "integration.starterTemplates.template.one-line-batch-items-curl.when2": "Reconcile each item request_id.",
  "integration.starterTemplates.template.one-line-batch-items-curl.inputShape": "GET /v1/batches/{id}/items",
  "integration.starterTemplates.template.one-line-batch-items-curl.expected1": "Per item: status, request_id",
  "integration.starterTemplates.template.one-line-batch-items-curl.expected2": "credits_charged per succeeded item",

  "integration.starterTemplates.template.powershell-chat-curl.title": "PowerShell one-line Chat curl.exe",
  "integration.starterTemplates.template.powershell-chat-curl.useCase":
    "Windows terminal verification — single line only.",
  "integration.starterTemplates.template.powershell-chat-curl.when1": "Windows Server or PowerShell users.",
  "integration.starterTemplates.template.powershell-chat-curl.when2": "Do not paste bash multi-line curl.",
  "integration.starterTemplates.template.powershell-chat-curl.inputShape":
    "curl.exe with -H Authorization and -d JSON.",
  "integration.starterTemplates.template.powershell-chat-curl.expected1": "Same as Chat curl — HTTP 200 JSON",
  "integration.starterTemplates.template.powershell-chat-curl.expected2": "request_id in response body",

  "integration.starterTemplates.template.node-chat-fetch.title": "Node.js chat fetch",
  "integration.starterTemplates.template.node-chat-fetch.useCase":
    "Backend Chat call without OpenAI SDK.",
  "integration.starterTemplates.template.node-chat-fetch.when1": "Node 18+ backend services.",
  "integration.starterTemplates.template.node-chat-fetch.when2": "Store API Key in server env — not browser.",
  "integration.starterTemplates.template.node-chat-fetch.inputShape":
    "fetch POST with Authorization header and JSON body.",
  "integration.starterTemplates.template.node-chat-fetch.expected1": "choices[0].message.content logged",
  "integration.starterTemplates.template.node-chat-fetch.expected2": "request_id and credits_charged logged",

  "integration.starterTemplates.template.python-chat-requests.title": "Python chat requests",
  "integration.starterTemplates.template.python-chat-requests.useCase":
    "Python backend Chat with requests library.",
  "integration.starterTemplates.template.python-chat-requests.when1": "Django / Flask / FastAPI services.",
  "integration.starterTemplates.template.python-chat-requests.when2": "API Key from os.environ on server.",
  "integration.starterTemplates.template.python-chat-requests.inputShape":
    "requests.post with json payload.",
  "integration.starterTemplates.template.python-chat-requests.expected1": "HTTP 200 — message content",
  "integration.starterTemplates.template.python-chat-requests.expected2": "request_id printed for reconciliation",

  "integration.starterTemplates.template.node-safe-retry.title": "Node.js safe retry client",
  "integration.starterTemplates.template.node-safe-retry.useCase":
    "Retry only 429 / 503 / 504 with backoff.",
  "integration.starterTemplates.template.node-safe-retry.when1": "Production sync Chat with backoff.",
  "integration.starterTemplates.template.node-safe-retry.when2": "Max 3 attempts — no infinite loops.",
  "integration.starterTemplates.template.node-safe-retry.inputShape": "fetch with retryable code list.",
  "integration.starterTemplates.template.node-safe-retry.expected1": "Success logs request_id",
  "integration.starterTemplates.template.node-safe-retry.expected2": "Non-retryable exits with error.code",

  "integration.starterTemplates.template.python-safe-retry.title": "Python safe retry client",
  "integration.starterTemplates.template.python-safe-retry.useCase":
    "Python retry wrapper for Chat calls.",
  "integration.starterTemplates.template.python-safe-retry.when1": "Same policy as Node safe retry.",
  "integration.starterTemplates.template.python-safe-retry.when2": "Use with traffic governor for scale.",
  "integration.starterTemplates.template.python-safe-retry.inputShape": "requests with attempt loop.",
  "integration.starterTemplates.template.python-safe-retry.expected1": "200 response with request_id",
  "integration.starterTemplates.template.python-safe-retry.expected2": "Raises on non-retryable errors",

  "integration.starterTemplates.template.node-traffic-governor.title": "Node.js traffic governor",
  "integration.starterTemplates.template.node-traffic-governor.useCase":
    "Queue sync Chat with concurrency cap.",
  "integration.starterTemplates.template.node-traffic-governor.when1": "10–25 concurrent Chat per app.",
  "integration.starterTemplates.template.node-traffic-governor.when2": "Before high online traffic.",
  "integration.starterTemplates.template.node-traffic-governor.inputShape": "In-memory queue + worker pool.",
  "integration.starterTemplates.template.node-traffic-governor.expected1": "Steady throughput without 429 storms",
  "integration.starterTemplates.template.node-traffic-governor.expected2": "Each job logs request_id",

  "integration.starterTemplates.template.python-traffic-governor.title": "Python traffic governor",
  "integration.starterTemplates.template.python-traffic-governor.useCase":
    "Python concurrency queue for Chat.",
  "integration.starterTemplates.template.python-traffic-governor.when1": "Mirror Node governor in Python stack.",
  "integration.starterTemplates.template.python-traffic-governor.when2": "Pair with Batch for bulk.",
  "integration.starterTemplates.template.python-traffic-governor.inputShape": "Thread/async pool with max workers.",
  "integration.starterTemplates.template.python-traffic-governor.expected1": "Controlled in-flight requests",
  "integration.starterTemplates.template.python-traffic-governor.expected2": "request_id per completed job",

  "integration.starterTemplates.template.node-batch-worker.title": "Node.js batch worker",
  "integration.starterTemplates.template.node-batch-worker.useCase":
    "Create, poll, and list batch items safely.",
  "integration.starterTemplates.template.node-batch-worker.when1": "Bulk copy, classification, summaries.",
  "integration.starterTemplates.template.node-batch-worker.when2": "Cap poll count — no infinite loop.",
  "integration.starterTemplates.template.node-batch-worker.inputShape":
    "POST batches/chat → poll GET → GET items.",
  "integration.starterTemplates.template.node-batch-worker.expected1": "Terminal batch status",
  "integration.starterTemplates.template.node-batch-worker.expected2": "Item request_ids for Usage",

  "integration.starterTemplates.template.python-batch-worker.title": "Python batch worker",
  "integration.starterTemplates.template.python-batch-worker.useCase":
    "Python batch create / poll / items worker.",
  "integration.starterTemplates.template.python-batch-worker.when1": "Same flow as Node batch worker.",
  "integration.starterTemplates.template.python-batch-worker.when2": "Use auto-cheap for SKU volume.",
  "integration.starterTemplates.template.python-batch-worker.inputShape": "requests POST + poll loop.",
  "integration.starterTemplates.template.python-batch-worker.expected1": "Batch summary counts",
  "integration.starterTemplates.template.python-batch-worker.expected2": "Per-item reconciliation list",

  "integration.starterTemplates.industry.hospitalChart.title": "Hospital chart summary",
  "integration.starterTemplates.industry.hospitalChart.when1": "Outpatient intake text cleanup.",
  "integration.starterTemplates.industry.hospitalChart.when2": "Assistive only — clinician reviews.",
  "integration.starterTemplates.industry.hospitalFollowUp.title": "Hospital follow-up reminders (Batch)",
  "integration.starterTemplates.industry.hospitalFollowUp.when1": "Batch SMS / App reminder drafts.",
  "integration.starterTemplates.industry.hospitalFollowUp.when2": "No diagnosis in outbound text.",
  "integration.starterTemplates.industry.hospitalImage.title": "Hospital image / OCR prompt helper",
  "integration.starterTemplates.industry.hospitalImage.when1": "Structure text from imaging notes.",
  "integration.starterTemplates.industry.autoTicket.title": "Auto service ticket summary",
  "integration.starterTemplates.industry.autoTicket.when1": "After-sales ticket triage.",
  "integration.starterTemplates.industry.autoTicket.when2": "Staff confirms before work order.",
  "integration.starterTemplates.industry.autoClassify.title": "Auto work order classification (Batch)",
  "integration.starterTemplates.industry.autoClassify.when1": "Batch classify ticket modules.",
  "integration.starterTemplates.industry.autoImage.title": "Auto vehicle image description",
  "integration.starterTemplates.industry.autoImage.when1": "Service photo documentation prompts.",
  "integration.starterTemplates.industry.ecommerceSku.title": "Ecommerce SKU copy batch",
  "integration.starterTemplates.industry.ecommerceSku.when1": "Bulk listing copy with auto-cheap.",
  "integration.starterTemplates.industry.ecommerceSku.when2": "Human review before publish.",
  "integration.starterTemplates.industry.ecommerceImage.title": "Ecommerce product image prompt",
  "integration.starterTemplates.industry.ecommerceImage.when1": "Listing-style product shots.",
  "integration.starterTemplates.industry.ecommerceFaq.title": "Ecommerce FAQ chat",
  "integration.starterTemplates.industry.ecommerceFaq.when1": "FAQ drafts without refund promises.",
  "integration.starterTemplates.industry.supportClassify.title": "AI support ticket classification",
  "integration.starterTemplates.industry.supportClassify.when1": "Batch intent routing.",
  "integration.starterTemplates.industry.supportReply.title": "AI support reply draft",
  "integration.starterTemplates.industry.supportReply.when1": "Agent-edited replies only.",
  "integration.starterTemplates.industry.supportSummary.title": "AI support conversation summary",
  "integration.starterTemplates.industry.supportSummary.when1": "Post-chat internal summary.",
};

export const starterTemplateMessagesZh: Record<string, string> = {
  "integration.starterTemplates.reconcileStep1": "从 JSON 响应（或每条 batch item）复制 request_id。",
  "integration.starterTemplates.reconcileStep2": "Dashboard → Usage — 搜索 request_id。",
  "integration.starterTemplates.reconcileStep3": "Dashboard → Credits — 搜索 reference_id 或 request_id。",
  "integration.starterTemplates.reconcileBatchStep1": "轮询 batch 至 completed / partial_failed — 列出 items。",
  "integration.starterTemplates.reconcileBatchStep2": "将每条成功 item 的 request_id 复制到 Usage。",
  "integration.starterTemplates.reconcileBatchStep3": "在 Credits 汇总 credits_charged — 核对 batch 总额。",
  "integration.starterTemplates.retryAdvice1": "429 / 503 / 504 — 退避 5–30 秒，最多 3 次。",
  "integration.starterTemplates.retryAdvice2": "401 / 402 / invalid_request — 修正配置，勿盲目重试。",
  "integration.starterTemplates.retryAdviceNo": "先修正 API Key 或提示词 — 鉴权错误不重试。",

  "integration.starterTemplates.template.one-line-chat-curl.title": "单行 Chat curl",
  "integration.starterTemplates.template.one-line-chat-curl.useCase": "用一次 Chat 请求验证 API Key。",
  "integration.starterTemplates.template.one-line-chat-curl.when1": "创建 API Key 后的首次验证。",
  "integration.starterTemplates.template.one-line-chat-curl.when2": "接入 SDK 或 Cursor 前的终端快测。",
  "integration.starterTemplates.template.one-line-chat-curl.inputShape":
    "JSON：model、messages[{role, content}]、stream:false。",
  "integration.starterTemplates.template.one-line-chat-curl.expected1": "HTTP 200 — choices[0].message.content",
  "integration.starterTemplates.template.one-line-chat-curl.expected2":
    "request_id、credits_charged、tokfai.resolved_model",

  "integration.starterTemplates.template.one-line-responses-curl.title": "单行 Responses curl",
  "integration.starterTemplates.template.one-line-responses-curl.useCase": "一次粘贴测试 Responses API。",
  "integration.starterTemplates.template.one-line-responses-curl.when1": "使用 OpenAI Responses 形态的应用。",
  "integration.starterTemplates.template.one-line-responses-curl.when2": "接入 SDK responses 客户端前。",
  "integration.starterTemplates.template.one-line-responses-curl.inputShape": "JSON：model、input（字符串提示）。",
  "integration.starterTemplates.template.one-line-responses-curl.expected1": "HTTP 200 含输出文本",
  "integration.starterTemplates.template.one-line-responses-curl.expected2": "request_id 用于 Usage / Credits",

  "integration.starterTemplates.template.one-line-image-curl.title": "单行 Image curl",
  "integration.starterTemplates.template.one-line-image-curl.useCase": "文生图冒烟测试。",
  "integration.starterTemplates.template.one-line-image-curl.when1": "验证 Image API 计费路径。",
  "integration.starterTemplates.template.one-line-image-curl.when2": "大批量图像任务前。",
  "integration.starterTemplates.template.one-line-image-curl.inputShape":
    "JSON：model、prompt、size、n、response_format。",
  "integration.starterTemplates.template.one-line-image-curl.expected1": "HTTP 200 — data[0].url",
  "integration.starterTemplates.template.one-line-image-curl.expected2": "request_id、credits_charged",

  "integration.starterTemplates.template.one-line-batch-create-curl.title": "单行 Batch 创建 curl",
  "integration.starterTemplates.template.one-line-batch-create-curl.useCase": "创建批量 Chat 任务。",
  "integration.starterTemplates.template.one-line-batch-create-curl.when1": "数十至数千条对话条目。",
  "integration.starterTemplates.template.one-line-batch-create-curl.when2": "替代并行同步 Chat 洪峰。",
  "integration.starterTemplates.template.one-line-batch-create-curl.inputShape": "JSON：model、items[{messages}]。",
  "integration.starterTemplates.template.one-line-batch-create-curl.expected1": "HTTP 202 — batch id",
  "integration.starterTemplates.template.one-line-batch-create-curl.expected2": "status pending 或 processing",

  "integration.starterTemplates.template.one-line-batch-poll-curl.title": "单行 Batch 轮询 curl",
  "integration.starterTemplates.template.one-line-batch-poll-curl.useCase": "按 id 轮询 batch 状态。",
  "integration.starterTemplates.template.one-line-batch-poll-curl.when1": "创建 batch 获得 id 之后。",
  "integration.starterTemplates.template.one-line-batch-poll-curl.when2": "每 5–10 秒直至终态。",
  "integration.starterTemplates.template.one-line-batch-poll-curl.inputShape": "GET /v1/batches/{id}",
  "integration.starterTemplates.template.one-line-batch-poll-curl.expected1":
    "status：completed | partial_failed | failed",
  "integration.starterTemplates.template.one-line-batch-poll-curl.expected2": "succeeded_items、credits_charged",

  "integration.starterTemplates.template.one-line-batch-items-curl.title": "单行 Batch items curl",
  "integration.starterTemplates.template.one-line-batch-items-curl.useCase": "列出每条 item 结果。",
  "integration.starterTemplates.template.one-line-batch-items-curl.when1": "batch 到达终态后。",
  "integration.starterTemplates.template.one-line-batch-items-curl.when2": "对账各 item request_id。",
  "integration.starterTemplates.template.one-line-batch-items-curl.inputShape": "GET /v1/batches/{id}/items",
  "integration.starterTemplates.template.one-line-batch-items-curl.expected1": "每条：status、request_id",
  "integration.starterTemplates.template.one-line-batch-items-curl.expected2": "成功 item 的 credits_charged",

  "integration.starterTemplates.template.powershell-chat-curl.title": "PowerShell 单行 Chat curl.exe",
  "integration.starterTemplates.template.powershell-chat-curl.useCase": "Windows 终端验证 — 仅单行。",
  "integration.starterTemplates.template.powershell-chat-curl.when1": "Windows Server 或 PowerShell 用户。",
  "integration.starterTemplates.template.powershell-chat-curl.when2": "勿粘贴 bash 多行 curl。",
  "integration.starterTemplates.template.powershell-chat-curl.inputShape":
    "curl.exe 带 Authorization 与 JSON -d。",
  "integration.starterTemplates.template.powershell-chat-curl.expected1": "与 Chat curl 相同 — HTTP 200 JSON",
  "integration.starterTemplates.template.powershell-chat-curl.expected2": "响应体含 request_id",

  "integration.starterTemplates.template.node-chat-fetch.title": "Node.js Chat fetch",
  "integration.starterTemplates.template.node-chat-fetch.useCase": "无需 OpenAI SDK 的后端 Chat 调用。",
  "integration.starterTemplates.template.node-chat-fetch.when1": "Node 18+ 后端服务。",
  "integration.starterTemplates.template.node-chat-fetch.when2": "API Key 存服务端环境 — 非浏览器。",
  "integration.starterTemplates.template.node-chat-fetch.inputShape":
    "fetch POST，Authorization 头与 JSON body。",
  "integration.starterTemplates.template.node-chat-fetch.expected1": "记录 choices[0].message.content",
  "integration.starterTemplates.template.node-chat-fetch.expected2": "记录 request_id 与 credits_charged",

  "integration.starterTemplates.template.python-chat-requests.title": "Python Chat requests",
  "integration.starterTemplates.template.python-chat-requests.useCase": "Python 后端使用 requests 库调用 Chat。",
  "integration.starterTemplates.template.python-chat-requests.when1": "Django / Flask / FastAPI 服务。",
  "integration.starterTemplates.template.python-chat-requests.when2": "服务端 os.environ 读取 API Key。",
  "integration.starterTemplates.template.python-chat-requests.inputShape": "requests.post 与 json 载荷。",
  "integration.starterTemplates.template.python-chat-requests.expected1": "HTTP 200 — 消息内容",
  "integration.starterTemplates.template.python-chat-requests.expected2": "打印 request_id 用于对账",

  "integration.starterTemplates.template.node-safe-retry.title": "Node.js 安全重试客户端",
  "integration.starterTemplates.template.node-safe-retry.useCase": "仅对 429 / 503 / 504 退避重试。",
  "integration.starterTemplates.template.node-safe-retry.when1": "生产同步 Chat 带退避。",
  "integration.starterTemplates.template.node-safe-retry.when2": "最多 3 次 — 无无限循环。",
  "integration.starterTemplates.template.node-safe-retry.inputShape": "fetch 与可重试 error.code 列表。",
  "integration.starterTemplates.template.node-safe-retry.expected1": "成功时记录 request_id",
  "integration.starterTemplates.template.node-safe-retry.expected2": "不可重试时输出 error.code 并退出",

  "integration.starterTemplates.template.python-safe-retry.title": "Python 安全重试客户端",
  "integration.starterTemplates.template.python-safe-retry.useCase": "Python Chat 重试封装。",
  "integration.starterTemplates.template.python-safe-retry.when1": "与 Node 安全重试相同策略。",
  "integration.starterTemplates.template.python-safe-retry.when2": "扩容时配合流量治理。",
  "integration.starterTemplates.template.python-safe-retry.inputShape": "requests 与尝试循环。",
  "integration.starterTemplates.template.python-safe-retry.expected1": "200 响应含 request_id",
  "integration.starterTemplates.template.python-safe-retry.expected2": "不可重试错误抛出异常",

  "integration.starterTemplates.template.node-traffic-governor.title": "Node.js 流量治理",
  "integration.starterTemplates.template.node-traffic-governor.useCase": "有并发上限的 Chat 队列。",
  "integration.starterTemplates.template.node-traffic-governor.when1": "每应用 10–25 路同步 Chat。",
  "integration.starterTemplates.template.node-traffic-governor.when2": "高在线流量前部署。",
  "integration.starterTemplates.template.node-traffic-governor.inputShape": "内存队列 + worker 池。",
  "integration.starterTemplates.template.node-traffic-governor.expected1": "稳定吞吐避免 429",
  "integration.starterTemplates.template.node-traffic-governor.expected2": "每任务记录 request_id",

  "integration.starterTemplates.template.python-traffic-governor.title": "Python 流量治理",
  "integration.starterTemplates.template.python-traffic-governor.useCase": "Python Chat 并发队列。",
  "integration.starterTemplates.template.python-traffic-governor.when1": "Python 栈镜像 Node 治理。",
  "integration.starterTemplates.template.python-traffic-governor.when2": "大批量配合 Batch。",
  "integration.starterTemplates.template.python-traffic-governor.inputShape": "线程/异步池与 max workers。",
  "integration.starterTemplates.template.python-traffic-governor.expected1": "控制在途请求数",
  "integration.starterTemplates.template.python-traffic-governor.expected2": "每完成任务有 request_id",

  "integration.starterTemplates.template.node-batch-worker.title": "Node.js Batch worker",
  "integration.starterTemplates.template.node-batch-worker.useCase": "安全地创建、轮询、列出 batch items。",
  "integration.starterTemplates.template.node-batch-worker.when1": "大批量文案、分类、摘要。",
  "integration.starterTemplates.template.node-batch-worker.when2": "限制轮询次数 — 无无限循环。",
  "integration.starterTemplates.template.node-batch-worker.inputShape":
    "POST batches/chat → 轮询 GET → GET items。",
  "integration.starterTemplates.template.node-batch-worker.expected1": "batch 终态",
  "integration.starterTemplates.template.node-batch-worker.expected2": "item request_id 用于 Usage",

  "integration.starterTemplates.template.python-batch-worker.title": "Python Batch worker",
  "integration.starterTemplates.template.python-batch-worker.useCase": "Python batch 创建/轮询/items worker。",
  "integration.starterTemplates.template.python-batch-worker.when1": "与 Node batch worker 相同流程。",
  "integration.starterTemplates.template.python-batch-worker.when2": "SKU 大批量可用 auto-cheap。",
  "integration.starterTemplates.template.python-batch-worker.inputShape": "requests POST + 轮询循环。",
  "integration.starterTemplates.template.python-batch-worker.expected1": "batch 汇总计数",
  "integration.starterTemplates.template.python-batch-worker.expected2": "逐条对账列表",

  "integration.starterTemplates.industry.hospitalChart.title": "医院病历摘要",
  "integration.starterTemplates.industry.hospitalChart.when1": "门诊自述文本整理。",
  "integration.starterTemplates.industry.hospitalChart.when2": "仅辅助 — 由临床人员审核。",
  "integration.starterTemplates.industry.hospitalFollowUp.title": "医院复诊提醒（Batch）",
  "integration.starterTemplates.industry.hospitalFollowUp.when1": "批量短信/App 提醒草稿。",
  "integration.starterTemplates.industry.hospitalFollowUp.when2": "对外文本不含诊断。",
  "integration.starterTemplates.industry.hospitalImage.title": "医院影像/OCR 提示辅助",
  "integration.starterTemplates.industry.hospitalImage.when1": "结构化影像相关文字。",
  "integration.starterTemplates.industry.autoTicket.title": "车企售后工单摘要",
  "integration.starterTemplates.industry.autoTicket.when1": "售后工单分拣。",
  "integration.starterTemplates.industry.autoTicket.when2": "企业人员确认后进工单。",
  "integration.starterTemplates.industry.autoClassify.title": "车企工单分类（Batch）",
  "integration.starterTemplates.industry.autoClassify.when1": "批量分类工单模块。",
  "integration.starterTemplates.industry.autoImage.title": "车企车辆图像描述",
  "integration.starterTemplates.industry.autoImage.when1": "维修拍照文档化提示词。",
  "integration.starterTemplates.industry.ecommerceSku.title": "电商 SKU 文案批量",
  "integration.starterTemplates.industry.ecommerceSku.when1": "auto-cheap 批量 listing 文案。",
  "integration.starterTemplates.industry.ecommerceSku.when2": "发布前人工审核。",
  "integration.starterTemplates.industry.ecommerceImage.title": "电商商品图提示词",
  "integration.starterTemplates.industry.ecommerceImage.when1": "listing 风格商品图。",
  "integration.starterTemplates.industry.ecommerceFaq.title": "电商 FAQ 对话",
  "integration.starterTemplates.industry.ecommerceFaq.when1": "FAQ 草稿 — 不承诺退款。",
  "integration.starterTemplates.industry.supportClassify.title": "AI 客服工单分类",
  "integration.starterTemplates.industry.supportClassify.when1": "批量意图路由。",
  "integration.starterTemplates.industry.supportReply.title": "AI 客服回复草稿",
  "integration.starterTemplates.industry.supportReply.when1": "仅由客服编辑后发送。",
  "integration.starterTemplates.industry.supportSummary.title": "AI 客服对话摘要",
  "integration.starterTemplates.industry.supportSummary.when1": "对话结束后内部摘要。",
};
