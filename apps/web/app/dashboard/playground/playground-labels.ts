/** Route-local labels — dashboard-safe boundary. */

export type PlaygroundLocale = "en" | "zh";

const LOCALE_STORAGE_KEY = "tokfai-locale";

const EN: Record<string, string> = {
  "common.imagePlayground": "Image Playground",
  "dashboard.usage.copyRequestId": "Copy request ID",
  "dashboard.usage.copiedRequestId": "Copied",
  "dashboard.playground.title": "Playground",
  "dashboard.playground.subtitle":
    "Choose a model, send a test request, and verify the Tokfai API works.",
  "dashboard.playground.forImageModels": "For image models, use",
  "dashboard.playground.request": "Test request",
  "dashboard.playground.requestDesc":
    "Select or create an API key, pick a chat model, and send one non-streaming message.",
  "dashboard.playground.model": "Model",
  "dashboard.playground.prompt": "Prompt",
  "dashboard.playground.promptPlaceholder":
    "Enter test content, e.g. introduce Tokfai API in one sentence.",
  "dashboard.playground.presetShort": "Quick test",
  "dashboard.playground.presetCode": "Explain code",
  "dashboard.playground.presetBusiness": "Marketing copy",
  "dashboard.playground.presetSummary": "Chinese summary",
  "dashboard.playground.presetShortPrompt": "Introduce Tokfai API in one sentence.",
  "dashboard.playground.presetCodePrompt":
    "Explain what a REST API is in simple terms and give a curl example.",
  "dashboard.playground.presetBusinessPrompt":
    "Write SaaS marketing copy under 100 words highlighting ease of use and pay-as-you-go billing.",
  "dashboard.playground.presetSummaryPrompt":
    "Summarize in Chinese: what value does an OpenAI-compatible API bring to developers?",
  "dashboard.playground.running": "Sending…",
  "dashboard.playground.run": "Send test",
  "dashboard.playground.costHint":
    "Playground calls consume credits. Check your balance first. Actual charges are recorded in the credits ledger.",
  "dashboard.playground.viewCreditsLedger": "View credits ledger",
  "dashboard.playground.productionKeyHint":
    "For production, create and copy your sk-tokfai key on the API Keys page.",
  "dashboard.playground.apiKey": "API key",
  "dashboard.playground.currentKeySelection": "Current selection: {name} ({prefix}…)",
  "dashboard.playground.pasteOtherKey": "Paste another key",
  "dashboard.playground.manageApiKeys": "Manage API Keys",
  "dashboard.playground.manageApiKeysHint":
    "To revoke or delete keys, go to the API Keys page.",
  "dashboard.playground.noKeyTitle": "No active API Key yet",
  "dashboard.playground.noKeyBody":
    "Create a test key to run your first real Playground call.",
  "dashboard.playground.createTestKey": "Create test key",
  "dashboard.playground.creatingTestKey": "Creating…",
  "dashboard.playground.goToApiKeys": "Go to API Keys",
  "dashboard.playground.testKeyCreated":
    "Test key created. Copy the full secret — it won't be shown again after refresh.",
  "dashboard.playground.copySecret": "Copy secret",
  "dashboard.playground.copied": "Copied",
  "dashboard.playground.testNow": "Test now",
  "dashboard.playground.secretOnceHint":
    "Full secret is shown only once at creation. After refresh it cannot be viewed again — create a new key if lost.",
  "dashboard.playground.selectKey": "Select key",
  "dashboard.playground.pasteKey": "Paste key",
  "dashboard.playground.secretNotStored":
    "The full secret is loaded only for this request and is not stored in the browser.",
  "dashboard.playground.fullApiKey": "Full API key",
  "dashboard.playground.showKey": "Show",
  "dashboard.playground.hideKey": "Hide",
  "dashboard.playground.pasteKeySecurityHint":
    "The key is kept in this page only and is not saved. Do not use on shared devices.",
  "dashboard.playground.apiKeyLoadTimedOut":
    "Timed out loading the selected API key. Paste the full secret or try again.",
  "dashboard.playground.waitingForModel": "Waiting for the model…",
  "dashboard.playground.resultTitle": "Result",
  "dashboard.playground.requestStatus": "Status",
  "dashboard.playground.statusSuccess": "Success",
  "dashboard.playground.statusFailed": "Failed",
  "dashboard.playground.requestedModel": "Requested model",
  "dashboard.playground.resolvedModel": "Resolved model",
  "dashboard.playground.smartAlias.auto-fast": "auto-fast (recommended)",
  "dashboard.playground.smartAlias.auto-pro": "auto-pro (high quality)",
  "dashboard.playground.smartAlias.auto-cheap": "auto-cheap (low cost batch)",
  "dashboard.playground.smartAliasDesc.auto-fast":
    "Smart routing — tries gemini-3-flash → gemini-2.5-flash → gemini-3-pro.",
  "dashboard.playground.smartAliasDesc.auto-pro":
    "Smart routing — tries gpt-5.5 → gpt-5.4 → gemini-3.1-pro → gemini-3-pro.",
  "dashboard.playground.smartAliasDesc.auto-cheap":
    "Smart routing — tries gemini-2.5-flash → gemini-3-flash.",
  "dashboard.playground.responseContent": "Response",
  "dashboard.playground.requestId": "request_id",
  "dashboard.playground.createdAt": "created_at",
  "dashboard.playground.inputTokens": "input tokens",
  "dashboard.playground.outputTokens": "output tokens",
  "dashboard.playground.totalTokens": "total tokens",
  "dashboard.playground.creditsCharged": "credits charged",
  "dashboard.playground.usageFallback":
    "Usage for this call is recorded in the credits ledger at /dashboard/credits.",
  "dashboard.playground.responsePlaceholder":
    "The model response will appear here after you send.",
  "dashboard.playground.viewModels": "View models",
  "dashboard.playground.viewDocs": "View docs",
  "dashboard.playground.successBalanceHint": "Recorded in",
  "dashboard.playground.successReconcileHint":
    "Copy request_id and search it in Usage and Credits to reconcile this call.",
  "dashboard.playground.copyRequestId": "Copy request_id",
  "dashboard.playground.viewChatApiDocs": "Chat API docs",
  "dashboard.playground.viewOpenAiSdkDocs": "OpenAI SDK docs",
  "dashboard.playground.viewUsage": "View Usage",
  "dashboard.playground.viewCredits": "View Credits",
  "dashboard.playground.tokensNotReturned": "—",
  "dashboard.playground.errors.missingToken":
    "Missing API key. Create and paste an active key first.",
  "dashboard.playground.errors.invalidToken":
    "API key is invalid or revoked. Create a new key.",
  "dashboard.playground.errors.invalidOrMissingToken":
    "API key is invalid or missing. Select or create an API key.",
  "dashboard.playground.errors.insufficientCredits":
    "Insufficient credits. Top up credits first.",
  "dashboard.playground.errors.modelNotFound":
    "Model not found or not available. Try another model.",
  "dashboard.playground.errors.upstreamError":
    "The selected model is temporarily unavailable or under high load.",
  "dashboard.playground.errors.upstreamTimeout":
    "The selected model is temporarily unavailable or under high load.",
  "dashboard.playground.errors.upstreamModelBusy":
    "This model is under high load. Retry shortly or switch to auto-fast.",
  "dashboard.playground.errors.modelNotAvailable":
    "This model is not available for API calls. Switch to a recommended model.",
  "dashboard.playground.errors.allUpstreamsUnavailable":
    "Available models are busy right now. Retry shortly or lower concurrency.",
  "dashboard.playground.errors.allUpstreamsHint":
    "Try auto-fast, reduce concurrency, or retry in a few minutes.",
  "dashboard.playground.errors.switchModelHint":
    "Try auto-fast for stable routing. gpt-5.4 / gpt-5.5 are high-quality models that may be busy under load.",
  "dashboard.playground.errors.rateLimited": "Too many requests. Please try again later.",
  "dashboard.playground.errors.unknown": "Request failed. Please try again later.",
  "dashboard.playground.errors.missingPrompt": "Please enter a prompt.",
  "dashboard.playground.errors.keyNotRetrievable":
    "For security, full keys aren't stored long-term. Paste your key or create a new test key.",
};

const ZH: Record<string, string> = {
  "common.imagePlayground": "图像 Playground",
  "dashboard.usage.copyRequestId": "复制 request_id",
  "dashboard.usage.copiedRequestId": "已复制",
  "dashboard.playground.title": "Playground",
  "dashboard.playground.subtitle":
    "选择模型，发送一次测试请求，验证 Tokfai API 是否正常工作。",
  "dashboard.playground.forImageModels": "图像模型请使用",
  "dashboard.playground.request": "测试请求",
  "dashboard.playground.requestDesc":
    "选择或创建 API Key，选择对话模型，发送一条非流式消息进行测试。",
  "dashboard.playground.model": "模型",
  "dashboard.playground.prompt": "Prompt",
  "dashboard.playground.promptPlaceholder":
    "请输入测试内容，例如：用一句话介绍 Tokfai API。",
  "dashboard.playground.presetShort": "简短测试",
  "dashboard.playground.presetCode": "代码解释",
  "dashboard.playground.presetBusiness": "商业文案",
  "dashboard.playground.presetSummary": "中文总结",
  "dashboard.playground.presetShortPrompt": "用一句话介绍 Tokfai API。",
  "dashboard.playground.presetCodePrompt":
    "用简单的语言解释什么是 REST API，并给一个 curl 示例。",
  "dashboard.playground.presetBusinessPrompt":
    "写一段 100 字以内的 SaaS 产品推广文案，强调易用与按量计费。",
  "dashboard.playground.presetSummaryPrompt":
    "请用中文总结：OpenAI 兼容 API 对开发者有什么价值。",
  "dashboard.playground.running": "发送中…",
  "dashboard.playground.run": "发送测试",
  "dashboard.playground.costHint":
    "Playground 会消耗 credits，请先确认余额。实际扣费以积分账本为准。",
  "dashboard.playground.viewCreditsLedger": "查看积分账本",
  "dashboard.playground.productionKeyHint":
    "用于生产接入时，请在 API Keys 页面创建并复制 sk-tokfai 密钥。",
  "dashboard.playground.apiKey": "API Key",
  "dashboard.playground.currentKeySelection": "当前选择：{name}（{prefix}…）",
  "dashboard.playground.pasteOtherKey": "粘贴其他 Key",
  "dashboard.playground.manageApiKeys": "管理 API Keys",
  "dashboard.playground.manageApiKeysHint": "如需吊销或删除密钥，请前往 API Keys 页面管理。",
  "dashboard.playground.noKeyTitle": "还没有可用 API Key",
  "dashboard.playground.noKeyBody": "创建一个测试 Key 后，即可在 Playground 里完成第一次真实调用。",
  "dashboard.playground.createTestKey": "创建测试 Key",
  "dashboard.playground.creatingTestKey": "创建中…",
  "dashboard.playground.goToApiKeys": "前往 API Keys",
  "dashboard.playground.testKeyCreated":
    "测试 Key 已创建。请复制完整 secret；刷新页面后不会再次显示。",
  "dashboard.playground.copySecret": "复制 secret",
  "dashboard.playground.copied": "已复制",
  "dashboard.playground.testNow": "立即测试",
  "dashboard.playground.secretOnceHint":
    "完整 secret 只在创建时展示一次。刷新页面后将无法再次查看，如遗失请重新创建。",
  "dashboard.playground.selectKey": "选择密钥",
  "dashboard.playground.pasteKey": "粘贴密钥",
  "dashboard.playground.secretNotStored": "完整 secret 仅用于本次请求，不会保存在浏览器中。",
  "dashboard.playground.fullApiKey": "完整 API Key",
  "dashboard.playground.showKey": "显示",
  "dashboard.playground.hideKey": "隐藏",
  "dashboard.playground.pasteKeySecurityHint":
    "密钥仅保存在当前页面 state，不会写入数据库。请勿在公共设备保存密钥。",
  "dashboard.playground.apiKeyLoadTimedOut":
    "加载所选 API Key 超时。请粘贴完整 secret 或稍后重试。",
  "dashboard.playground.waitingForModel": "等待模型响应…",
  "dashboard.playground.resultTitle": "结果",
  "dashboard.playground.requestStatus": "请求状态",
  "dashboard.playground.statusSuccess": "成功",
  "dashboard.playground.statusFailed": "失败",
  "dashboard.playground.requestedModel": "请求 model",
  "dashboard.playground.resolvedModel": "实际 model",
  "dashboard.playground.smartAlias.auto-fast": "auto-fast（推荐）",
  "dashboard.playground.smartAlias.auto-pro": "auto-pro（高质量）",
  "dashboard.playground.smartAlias.auto-cheap": "auto-cheap（低成本批量）",
  "dashboard.playground.smartAliasDesc.auto-fast":
    "智能路由 — 依次尝试 gemini-3-flash → gemini-2.5-flash → gemini-3-pro。",
  "dashboard.playground.smartAliasDesc.auto-pro":
    "智能路由 — 依次尝试 gpt-5.5 → gpt-5.4 → gemini-3.1-pro → gemini-3-pro。",
  "dashboard.playground.smartAliasDesc.auto-cheap":
    "智能路由 — 依次尝试 gemini-2.5-flash → gemini-3-flash。",
  "dashboard.playground.responseContent": "响应内容",
  "dashboard.playground.requestId": "request_id",
  "dashboard.playground.createdAt": "created_at",
  "dashboard.playground.inputTokens": "input tokens",
  "dashboard.playground.outputTokens": "output tokens",
  "dashboard.playground.totalTokens": "total tokens",
  "dashboard.playground.creditsCharged": "credits charged",
  "dashboard.playground.usageFallback":
    "本次调用的用量记录在 /dashboard/credits 积分账本中。",
  "dashboard.playground.responsePlaceholder": "发送后模型响应将显示在这里。",
  "dashboard.playground.viewModels": "查看模型",
  "dashboard.playground.viewDocs": "查看文档",
  "dashboard.playground.successBalanceHint": "已记录到",
  "dashboard.playground.successReconcileHint":
    "复制 request_id 并在 Usage / Credits 中搜索以对账本次调用。",
  "dashboard.playground.copyRequestId": "复制 request_id",
  "dashboard.playground.viewChatApiDocs": "Chat API 文档",
  "dashboard.playground.viewOpenAiSdkDocs": "OpenAI SDK 文档",
  "dashboard.playground.viewUsage": "查看 Usage",
  "dashboard.playground.viewCredits": "查看 Credits",
  "dashboard.playground.tokensNotReturned": "—",
  "dashboard.playground.errors.missingToken": "缺少 API Key。请先创建并粘贴可用密钥。",
  "dashboard.playground.errors.invalidToken": "API Key 无效或已吊销。请创建新密钥。",
  "dashboard.playground.errors.invalidOrMissingToken":
    "API Key 无效或缺失。请选择或创建 API Key。",
  "dashboard.playground.errors.insufficientCredits": "积分不足。请先充值。",
  "dashboard.playground.errors.modelNotFound": "模型不存在或不可用。请换用其他模型。",
  "dashboard.playground.errors.upstreamError": "所选模型暂时不可用或负载较高。",
  "dashboard.playground.errors.upstreamTimeout": "所选模型暂时不可用或负载较高。",
  "dashboard.playground.errors.upstreamModelBusy":
    "该模型负载较高。请稍后重试或改用 auto-fast。",
  "dashboard.playground.errors.modelNotAvailable":
    "该模型不可用于 API 调用。请改用推荐模型。",
  "dashboard.playground.errors.allUpstreamsUnavailable":
    "可用模型当前繁忙。请稍后重试或降低并发。",
  "dashboard.playground.errors.allUpstreamsHint":
    "尝试 auto-fast、降低并发，或几分钟后重试。",
  "dashboard.playground.errors.switchModelHint":
    "建议使用 auto-fast 获得稳定路由。gpt-5.4 / gpt-5.5 高质量模型在高峰可能繁忙。",
  "dashboard.playground.errors.rateLimited": "请求过于频繁，请稍后再试。",
  "dashboard.playground.errors.unknown": "请求失败，请稍后重试。",
  "dashboard.playground.errors.missingPrompt": "请输入 prompt。",
  "dashboard.playground.errors.keyNotRetrievable":
    "出于安全，完整密钥不会长期保存。请粘贴密钥或创建新的测试 Key。",
};

export function readPlaygroundLocale(): PlaygroundLocale {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  return stored === "zh" ? "zh" : "en";
}

export function playgroundLabel(
  key: string,
  locale: PlaygroundLocale = readPlaygroundLocale()
): string {
  const table = locale === "zh" ? ZH : EN;
  return table[key] ?? EN[key] ?? key;
}

export function formatPlaygroundLabel(
  template: string,
  vars: Record<string, string | number>
): string {
  return Object.entries(vars).reduce(
    (result, [k, value]) => result.replaceAll(`{${k}}`, String(value)),
    template
  );
}
