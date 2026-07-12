/** Route-local labels — dashboard-safe boundary. */

export type ImagePlaygroundLocale = "en" | "zh";

const LOCALE_STORAGE_KEY = "tokfai-locale";

const EN: Record<string, string> = {
  "dashboard.apiKeys.copied": "Copied",
  "dashboard.shell.lowCredits": "Low compute credits",

  "dashboard.imageWorkbench.title": "Image workbench",
  "dashboard.imageWorkbench.subtitle": "Upload a product, person, or ecommerce image. Tokfai identifies what is in the image, then drafts titles, selling points, ads, and optimization tips.",
  "dashboard.imageWorkbench.tabAnalysis": "Ecommerce image analysis",
  "dashboard.imageWorkbench.tabCopy": "Product copy",
  "dashboard.imageWorkbench.tabGenerate": "Generate / edit image",
  "dashboard.imageWorkbench.analysisTitle": "Analyze ecommerce image",
  "dashboard.imageWorkbench.analysisDesc": "Upload an image, pick a use case, then get structured selling points and copy.",
  "dashboard.imageWorkbench.copyTitle": "Generate product copy",
  "dashboard.imageWorkbench.copyDesc": "Upload a product image and get titles, bullets, seeding copy, and ad variants.",
  "dashboard.imageWorkbench.uploadLabel": "Upload image",
  "dashboard.imageWorkbench.uploadHint": "Drag and drop or click to upload a product / ecommerce image",
  "dashboard.imageWorkbench.removeImage": "Remove",
  "dashboard.imageWorkbench.useCaseLabel": "Use case",
  "dashboard.imageWorkbench.extraNeedLabel": "Extra needs (optional)",
  "dashboard.imageWorkbench.extraNeedPlaceholder": "e.g. emphasize gift set for Double 11, avoid medical claims",
  "dashboard.imageWorkbench.balanceLabel": "Compute credits balance",
  "dashboard.imageWorkbench.startAnalyze": "Analyze",
  "dashboard.imageWorkbench.startCopy": "Generate copy",
  "dashboard.imageWorkbench.analyzing": "Analyzing…",
  "dashboard.imageWorkbench.analyzingHint": "Reading the image and drafting ecommerce-ready results…",
  "dashboard.imageWorkbench.resultTitle": "Results",
  "dashboard.imageWorkbench.resultDesc": "Structured output for ecommerce operations.",
  "dashboard.imageWorkbench.resultEmpty": "Upload an image and click Analyze to see results here.",
  "dashboard.imageWorkbench.copyResult": "Copy results",
  "dashboard.imageWorkbench.copied": "Copied",
  "dashboard.imageWorkbench.viewUsage": "View usage / charges",
  "dashboard.imageWorkbench.advancedInfo": "Advanced info",
  "dashboard.imageWorkbench.modelLabel": "Model",
  "dashboard.imageWorkbench.chargedLabel": "Charged",
  "dashboard.imageWorkbench.needImage": "Please upload an image first.",
  "dashboard.imageWorkbench.uploadFailed": "Image upload failed. Try again.",
  "dashboard.imageWorkbench.analyzeFailed": "Analysis failed. Please try again.",
  "dashboard.imageWorkbench.noKeyBody": "Create an experience key to start analyzing.",
  "dashboard.imageWorkbench.createKey": "Create experience key",
  "dashboard.imageWorkbench.creatingKey": "Creating…",
  "dashboard.imageWorkbench.keyPrepareFailed": "Could not prepare API key. Please try again.",
  "dashboard.playground.selectKey": "Select key",
  "dashboard.playground.testKeyCreated":
    "Test key created. Copy the full secret — it won't be shown again after refresh.",
  "dashboard.playground.copySecret": "Copy secret",
  "dashboard.playground.copied": "Copied",
  "dashboard.playground.apiKeyLoadTimedOut":
    "Timed out loading the selected API key. Paste the full secret or try again.",
  "dashboard.imagePlayground.title": "Generate / edit image",
  "dashboard.imagePlayground.toolbenchSubtitle":
    "Text-to-image or reference-image edit. Best for draft creatives.",
  "dashboard.imagePlayground.toolbenchInputTitle": "Input",
  "dashboard.imagePlayground.textToImage": "Text to Image",
  "dashboard.imagePlayground.imageToImage": "Image to Image",
  "dashboard.imagePlayground.waitingForImages":
    "Waiting for input images to finish uploading or resolving…",
  "dashboard.imagePlayground.inputImagesTitle": "Input images",
  "dashboard.imagePlayground.inputImagesDesc":
    "Drag, upload, or paste URLs. Up to {max} images (PNG, JPG, WEBP). Leave empty for text-to-image.",
  "dashboard.imagePlayground.inputImagesDragTitle": "Drag images here or click to upload",
  "dashboard.imagePlayground.inputImagesDragHint": "PNG, JPG, WEBP · max 10 MB each",
  "dashboard.imagePlayground.inputImagesUrlPlaceholder":
    "Image or page URL — Tokfai extracts the image when possible",
  "dashboard.imagePlayground.addImageUrl": "Add URL",
  "dashboard.imagePlayground.modelComingSoon":
    "This model is coming soon and cannot be used in Playground yet.",
  "dashboard.imagePlayground.toolbenchApiKeyLabel": "API Key",
  "dashboard.imagePlayground.toolbenchNoKey":
    "Create an API Key to call the Image API from your account.",
  "dashboard.imagePlayground.createTestKey": "Create test key",
  "dashboard.imagePlayground.createApiKey": "Create an API key",
  "dashboard.imagePlayground.toolbenchPasteKeyShort": "Paste key",
  "dashboard.imagePlayground.toolbenchManageKeysShort": "Manage",
  "dashboard.imagePlayground.toolbenchCurrentKeyLine": "Current: {name} · {prefix}…",
  "dashboard.imagePlayground.toolbenchRunSettings": "Run settings",
  "dashboard.imagePlayground.toolbenchBalanceLabel": "Balance",
  "dashboard.imagePlayground.estimatedCost": "Estimated: {credits} compute credits",
  "dashboard.imagePlayground.toolbenchInsufficientCredits":
    "Insufficient compute credits — top up before generating.",
  "dashboard.imagePlayground.topUp": "Top up",
  "dashboard.imagePlayground.toolbenchModelLabel": "Model",
  "dashboard.imagePlayground.size": "Size",
  "dashboard.imagePlayground.toolbenchBillingNoteShort":
    "Successful generations are charged. Failed calls are usually not charged.",
  "dashboard.imagePlayground.toolbenchServiceDocs": "Service docs",
  "dashboard.imagePlayground.toolbenchViewImageApiDocs": "View Image API docs",
  "dashboard.imagePlayground.viewUsage": "View usage",
  "dashboard.imagePlayground.viewCredits": "View compute credits",
  "dashboard.imagePlayground.toolbenchOpenIntegrationDocs": "Open integration docs",
  "dashboard.imagePlayground.generating": "Generating…",
  "dashboard.imagePlayground.preparingImages": "Preparing input images…",
  "dashboard.imagePlayground.generate": "Generate",
  "dashboard.imagePlayground.copyApiRequest": "Copy API request",
  "dashboard.imagePlayground.toolbenchResultLoadingTitle": "Generating…",
  "dashboard.imagePlayground.toolbenchResultPanelTitle": "Result",
  "dashboard.imagePlayground.toolbenchResultLoadingHint":
    "Keep this panel visible. The result will appear here.",
  "dashboard.imagePlayground.errors.billingNotChargedHint":
    "Failed requests are usually not charged. See Usage / Credits for the official record.",
  "dashboard.imagePlayground.toolbenchRetry": "Retry",
  "dashboard.imagePlayground.toolbenchResultPlaceholder": "Generated image will appear here",
  "dashboard.imagePlayground.base64OnlyHint":
    "The API returned base64 image data (data[0].b64_json). Image Playground only previews URL responses — use the API directly or set response_format=url.",
  "dashboard.imagePlayground.successReconcileHint":
    "Copy request_id and search it in Usage and Credits to reconcile this generation.",
  "dashboard.imagePlayground.copiedRequestId": "Copied",
  "dashboard.imagePlayground.copyRequestId": "Copy request ID",
  "dashboard.imagePlayground.viewImageApiDocs": "Image API docs",
  "dashboard.imagePlayground.successCreditsCharged": "Charged {credits} compute credits.",
  "dashboard.imagePlayground.metaModel": "Model",
  "dashboard.imagePlayground.metaCreatedAt": "Created at",
  "dashboard.imagePlayground.modeText": "Text to image",
  "dashboard.imagePlayground.modeReference": "Reference edit",
  "dashboard.imagePlayground.modeTextHint": "Describe the image you want to generate.",
  "dashboard.imagePlayground.modeReferenceHint": "The system will keep the reference subject and only change what you specify.",
  "dashboard.imagePlayground.fastModelEditHint": "Fast models are better for drafts. For person consistency, prefer standard / pro models.",
  "dashboard.imagePlayground.createExperienceKey": "Create experience key",
  "dashboard.imagePlayground.creatingKey": "Creating…",
  "dashboard.imagePlayground.noKeyBody": "No active API key yet. Create one to start generating.",
  "dashboard.imagePlayground.continueGenerate": "Generate again",
  "dashboard.imagePlayground.technicalDetails": "Technical details",
  "dashboard.imagePlayground.presetProduct": "Product shot",
  "dashboard.imagePlayground.presetAvatar": "Avatar",
  "dashboard.imagePlayground.presetEcommerce": "E-commerce hero",
  "dashboard.imagePlayground.presetPoster": "Poster",
  "dashboard.imagePlayground.presetProductPrompt":
    "Create a clean product-style image of a futuristic API dashboard, soft lighting, minimal background.",
  "dashboard.imagePlayground.presetAvatarPrompt":
    "Create a friendly professional avatar portrait, soft lighting, neutral background, high detail.",
  "dashboard.imagePlayground.presetEcommercePrompt":
    "Create a polished e-commerce hero image with a product on a minimal studio background, commercial lighting.",
  "dashboard.imagePlayground.presetPosterPrompt":
    "Create a modern promotional poster with bold composition, clean typography space, premium commercial style.",
  "dashboard.imagePlayground.errors.missingToken":
    "Missing API key. Create and paste an active key first.",
  "dashboard.imagePlayground.errors.invalidToken":
    "API key is invalid or revoked. Create a new key.",
  "dashboard.imagePlayground.errors.invalidOrMissingToken":
    "API key is invalid or missing. Select or create an API key.",
  "dashboard.imagePlayground.errors.insufficientCredits":
    "Insufficient compute credits. Top up first.",
  "dashboard.imagePlayground.errors.upstreamTimeout":
    "The image model is temporarily unavailable or slow. Try again later or switch models.",
  "dashboard.imagePlayground.errors.upstreamError":
    "The image model is temporarily unavailable or slow. Try again later or switch models.",
  "dashboard.imagePlayground.errors.imageGenerationFailed":
    "The image model is temporarily unavailable or slow. Try again later or switch models.",
  "dashboard.imagePlayground.errors.missingPrompt": "Please enter a prompt.",
  "dashboard.imagePlayground.errors.keyNotRetrievable":
    "For security, full keys aren't stored long-term. Paste your key or create a new test key.",
  "dashboard.imagePlayground.errors.unknown": "Request failed. Please try again later.",
  "dashboard.imagePlayground.errors.pageImageNotFound":
    "Could not find a usable image on this page. Try another URL or upload the image directly.",
  "dashboard.imagePlayground.errors.tooManyImages": "Up to {max} input images are allowed.",
  "dashboard.imagePlayground.errors.invalidDrop": "Drop PNG, JPG, or WEBP image files.",
  "dashboard.imagePlayground.errors.modelNotFound": "Model not found.",
  "dashboard.imagePlayground.errors.modelNotAvailable":
    "This model is not available in Playground.",
};

const ZH: Record<string, string> = {
  "dashboard.apiKeys.copied": "已复制",
  "dashboard.shell.lowCredits": "积分较低",

  "dashboard.imageWorkbench.title": "图片工作台",
  "dashboard.imageWorkbench.subtitle": "上传商品图、人物图或电商素材图，Tokfai 会先识别图片内容，再生成标题、卖点、投放文案和优化建议。",
  "dashboard.imageWorkbench.tabAnalysis": "电商图识别",
  "dashboard.imageWorkbench.tabCopy": "商品文案生成",
  "dashboard.imageWorkbench.tabGenerate": "图片生成 / 改图",
  "dashboard.imageWorkbench.analysisTitle": "分析电商图",
  "dashboard.imageWorkbench.analysisDesc": "上传图片、选择用途，即可得到结构化卖点与运营文案。",
  "dashboard.imageWorkbench.copyTitle": "生成商品文案",
  "dashboard.imageWorkbench.copyDesc": "上传商品图，生成标题、卖点、种草文案与广告文案。",
  "dashboard.imageWorkbench.uploadLabel": "上传图片",
  "dashboard.imageWorkbench.uploadHint": "拖拽或点击上传商品图 / 电商素材图",
  "dashboard.imageWorkbench.removeImage": "移除",
  "dashboard.imageWorkbench.useCaseLabel": "用途",
  "dashboard.imageWorkbench.extraNeedLabel": "补充需求（可选）",
  "dashboard.imageWorkbench.extraNeedPlaceholder": "例如：强调双十一礼盒装，避免医疗功效承诺",
  "dashboard.imageWorkbench.balanceLabel": "算力积分余额",
  "dashboard.imageWorkbench.startAnalyze": "开始分析",
  "dashboard.imageWorkbench.startCopy": "生成文案",
  "dashboard.imageWorkbench.analyzing": "分析中…",
  "dashboard.imageWorkbench.analyzingHint": "正在识别图片并生成运营可用结果…",
  "dashboard.imageWorkbench.resultTitle": "分析结果",
  "dashboard.imageWorkbench.resultDesc": "面向电商运营的结构化输出。",
  "dashboard.imageWorkbench.resultEmpty": "上传图片并点击开始分析，结果会显示在这里。",
  "dashboard.imageWorkbench.copyResult": "复制结果",
  "dashboard.imageWorkbench.copied": "已复制",
  "dashboard.imageWorkbench.viewUsage": "查看扣费记录",
  "dashboard.imageWorkbench.advancedInfo": "高级信息",
  "dashboard.imageWorkbench.modelLabel": "模型",
  "dashboard.imageWorkbench.chargedLabel": "本次扣费",
  "dashboard.imageWorkbench.needImage": "请先上传图片。",
  "dashboard.imageWorkbench.uploadFailed": "图片上传失败，请重试。",
  "dashboard.imageWorkbench.analyzeFailed": "分析失败，请稍后重试。",
  "dashboard.imageWorkbench.noKeyBody": "还没有体验 Key，创建后即可开始分析。",
  "dashboard.imageWorkbench.createKey": "一键创建体验 Key",
  "dashboard.imageWorkbench.creatingKey": "创建中…",
  "dashboard.imageWorkbench.keyPrepareFailed": "无法准备 API Key，请重试。",
  "dashboard.playground.selectKey": "选择密钥",
  "dashboard.playground.testKeyCreated":
    "测试 Key 已创建。请复制完整 secret — 刷新后将无法再次查看。",
  "dashboard.playground.copySecret": "复制 secret",
  "dashboard.playground.copied": "已复制",
  "dashboard.playground.apiKeyLoadTimedOut":
    "加载所选 API Key 超时。请粘贴完整 secret 或重试。",
  "dashboard.imagePlayground.title": "图片生成 / 改图",
  "dashboard.imagePlayground.toolbenchSubtitle":
    "文生图或上传参考图改图。适合出草稿图与素材图。",
  "dashboard.imagePlayground.toolbenchInputTitle": "输入",
  "dashboard.imagePlayground.textToImage": "文生图",
  "dashboard.imagePlayground.imageToImage": "图生图",
  "dashboard.imagePlayground.waitingForImages": "等待输入图上传或解析完成…",
  "dashboard.imagePlayground.inputImagesTitle": "输入图片",
  "dashboard.imagePlayground.inputImagesDesc":
    "拖拽、上传或粘贴 URL。最多 {max} 张（PNG、JPG、WEBP）。留空则为文生图。",
  "dashboard.imagePlayground.inputImagesDragTitle": "拖拽图片到此处或点击上传",
  "dashboard.imagePlayground.inputImagesDragHint": "PNG、JPG、WEBP · 单张最大 10 MB",
  "dashboard.imagePlayground.inputImagesUrlPlaceholder":
    "图片或网页 URL——Tokfai 会尝试自动提取图片",
  "dashboard.imagePlayground.addImageUrl": "添加 URL",
  "dashboard.imagePlayground.modelComingSoon":
    "该模型即将上线，暂不能在 Playground 中使用。",
  "dashboard.imagePlayground.toolbenchApiKeyLabel": "API Key",
  "dashboard.imagePlayground.toolbenchNoKey":
    "创建 API Key 后即可从你的账户调用 Image API。",
  "dashboard.imagePlayground.createTestKey": "创建测试 Key",
  "dashboard.imagePlayground.createApiKey": "创建 API 密钥",
  "dashboard.imagePlayground.toolbenchPasteKeyShort": "粘贴密钥",
  "dashboard.imagePlayground.toolbenchManageKeysShort": "管理",
  "dashboard.imagePlayground.toolbenchCurrentKeyLine": "当前：{name} · {prefix}…",
  "dashboard.imagePlayground.toolbenchRunSettings": "调用设置",
  "dashboard.imagePlayground.toolbenchBalanceLabel": "算力积分余额",
  "dashboard.imagePlayground.estimatedCost": "预计消耗：{credits} 算力积分",
  "dashboard.imagePlayground.toolbenchInsufficientCredits": "余额不足——请先充值再生成。",
  "dashboard.imagePlayground.topUp": "去充值",
  "dashboard.imagePlayground.toolbenchModelLabel": "模型",
  "dashboard.imagePlayground.size": "尺寸",
  "dashboard.imagePlayground.toolbenchBillingNoteShort": "成功生成会扣费，失败通常不扣费。",
  "dashboard.imagePlayground.toolbenchServiceDocs": "服务文档",
  "dashboard.imagePlayground.toolbenchViewImageApiDocs": "查看 Image API 文档",
  "dashboard.imagePlayground.viewUsage": "查看用量",
  "dashboard.imagePlayground.viewCredits": "查看算力积分",
  "dashboard.imagePlayground.toolbenchOpenIntegrationDocs": "打开接入文档",
  "dashboard.imagePlayground.generating": "生成中…",
  "dashboard.imagePlayground.preparingImages": "准备输入图…",
  "dashboard.imagePlayground.generate": "生成",
  "dashboard.imagePlayground.copyApiRequest": "复制 API 请求",
  "dashboard.imagePlayground.toolbenchResultLoadingTitle": "生成中…",
  "dashboard.imagePlayground.toolbenchResultPanelTitle": "结果",
  "dashboard.imagePlayground.toolbenchResultLoadingHint": "请保持此面板可见，结果将显示在这里。",
  "dashboard.imagePlayground.errors.billingNotChargedHint":
    "失败请求通常不会扣费，以用量 / 算力积分记录为准。",
  "dashboard.imagePlayground.toolbenchRetry": "重试",
  "dashboard.imagePlayground.toolbenchResultPlaceholder": "生成的图片将显示在这里",
  "dashboard.imagePlayground.base64OnlyHint":
    "API 返回了 base64 图像数据（data[0].b64_json）。Image Playground 仅预览 URL 响应 — 请直接调用 API 或设置 response_format=url。",
  "dashboard.imagePlayground.successReconcileHint":
    "复制 request_id，在 Usage 与 Credits 中搜索以核对本次生成。",
  "dashboard.imagePlayground.copiedRequestId": "已复制",
  "dashboard.imagePlayground.copyRequestId": "复制 request_id",
  "dashboard.imagePlayground.viewImageApiDocs": "Image API 文档",
  "dashboard.imagePlayground.successCreditsCharged": "本次扣费：{credits} 算力积分",
  "dashboard.imagePlayground.metaModel": "模型",
  "dashboard.imagePlayground.metaCreatedAt": "创建时间",
  "dashboard.imagePlayground.presetProduct": "产品图",
  "dashboard.imagePlayground.presetAvatar": "头像图",
  "dashboard.imagePlayground.presetEcommerce": "电商主图",
  "dashboard.imagePlayground.presetPoster": "海报图",
  "dashboard.imagePlayground.presetProductPrompt":
    "Create a clean product-style image of a futuristic API dashboard, soft lighting, minimal background.",
  "dashboard.imagePlayground.presetAvatarPrompt":
    "生成一张干净专业的头像肖像，柔和光线，中性背景，高细节。",
  "dashboard.imagePlayground.presetEcommercePrompt":
    "生成一张精致的电商主图，产品在极简棚拍背景上，商业级布光。",
  "dashboard.imagePlayground.presetPosterPrompt":
    "生成一张现代宣传海报，构图醒目，预留清晰排版空间，高级商业风格。",
  "dashboard.imagePlayground.errors.missingToken": "缺少 API Key，请先创建并选择可用密钥。",
  "dashboard.imagePlayground.errors.invalidToken": "API Key 无效或已吊销，请重新创建。",
  "dashboard.imagePlayground.errors.invalidOrMissingToken":
    "API Key 无效或缺失，请选择或创建 API Key。",
  "dashboard.imagePlayground.errors.insufficientCredits": "余额不足，请先充值算力积分。",
  "dashboard.imagePlayground.errors.upstreamTimeout":
    "图片模型暂时不可用或生成较慢，请稍后重试或切换模型。",
  "dashboard.imagePlayground.errors.upstreamError":
    "图片模型暂时不可用或生成较慢，请稍后重试或切换模型。",
  "dashboard.imagePlayground.errors.imageGenerationFailed":
    "图片模型暂时不可用或生成较慢，请稍后重试或切换模型。",
  "dashboard.imagePlayground.errors.missingPrompt": "请输入 prompt。",
  "dashboard.imagePlayground.errors.keyNotRetrievable":
    "出于安全考虑，完整 key 不会长期保存。请粘贴 key，或重新创建一个测试 Key。",
  "dashboard.imagePlayground.errors.unknown": "请求失败，请稍后重试。",
  "dashboard.imagePlayground.errors.pageImageNotFound":
    "无法从该页面解析可用图片。请换用其他 URL 或直接上传图片。",
  "dashboard.imagePlayground.errors.tooManyImages": "最多允许 {max} 张输入图。",
  "dashboard.imagePlayground.errors.invalidDrop": "请拖入 PNG、JPG 或 WEBP 图片文件。",
  "dashboard.imagePlayground.errors.modelNotFound": "模型未找到。",
  "dashboard.imagePlayground.errors.modelNotAvailable":
    "该模型在 Playground 中不可用。",
};

export function readImagePlaygroundLocale(): ImagePlaygroundLocale {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  return stored === "zh" ? "zh" : "en";
}

export function imagePlaygroundLabel(
  key: string,
  locale: ImagePlaygroundLocale = readImagePlaygroundLocale()
): string {
  const table = locale === "zh" ? ZH : EN;
  return table[key] ?? EN[key] ?? key;
}

export function formatImagePlaygroundLabel(
  template: string,
  vars: Record<string, string | number>
): string {
  return Object.entries(vars).reduce(
    (result, [k, value]) => result.replaceAll(`{${k}}`, String(value)),
    template
  );
}
