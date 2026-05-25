/**
 * UI copy only — translate labels, headings, and prose here.
 *
 * NEVER translate (keep verbatim in all locales):
 * - API / JSON field names: model, messages, prompt, image_urls, response_format,
 *   Authorization, Bearer, credits_charged, request_id, usage_logs, credit_ledger
 * - HTTP paths and curl/code blocks (leave in source components, not in messages)
 * - Model IDs: gemini-3.1-pro, nano-banana, nano-banana-fast, gpt-image-2, …
 *
 * Priority: P1 framework ✓ · P2 nav/home/dashboard header ✓ · P3 full Docs · P4 /en /zh routes
 */
export type Locale = "en" | "zh";

export const messages = {
  en: {
    nav: {
      overview: "Overview",
      apiKeys: "API Keys",
      playground: "Playground",
      imagePlayground: "Image Playground",
      models: "Models",
      usage: "Usage",
      credits: "Credits",
      docs: "Docs",
      home: "Home",
      pricing: "Pricing",
      dashboard: "Dashboard",
    },
    home: {
      headline: "OpenAI-compatible image & chat API",
      description:
        "One API for chat, image, and AI apps. Works with OpenAI SDK, Cursor, Cherry Studio, and your own products. Try image generation in the Image Playground.",
      startWithCredits: "Start with credits",
      tryImagePlayground: "Try Image Playground",
      viewPricing: "View pricing",
      readDocs: "Read docs",
    },
    common: {
      signOut: "Sign out",
      signingOut: "Signing out…",
      signedInAs: "Signed in as",
      logIn: "Log in",
      signUp: "Sign up",
      language: "Language",
      open: "Open",
      unavailable: "Unavailable",
      chatPlayground: "Chat Playground",
      imagePlayground: "Image Playground",
    },
    dashboard: {
      overview: {
        title: "Overview",
        subtitle:
          "Welcome to Tokfai. Follow the steps below to create a key, test chat and image generation, review usage, and top up credits.",
        v1Preview: "V1 preview",
        getStarted: "Get started",
        getStartedDesc:
          "Complete this checklist to validate your account end-to-end.",
        createApiKey: "Create API key",
        createApiKeyBody:
          "Generate a {format} key. The full secret is shown once at creation and can be copied again from the list.",
        openChatPlayground: "Open Chat Playground",
        tryChatPlayground: "Try Chat Playground",
        tryChatPlaygroundBody:
          "Send a chat completion with your API key and verify the response before integrating.",
        openImagePlayground: "Open Image Playground",
        tryImagePlayground: "Try Image Playground",
        tryImagePlaygroundBody:
          "Test text-to-image and image-to-image with uploads, URLs, or prompt-only requests.",
        reviewUsage: "Review Usage",
        reviewUsageBody:
          "Confirm chat and image requests appear with model, credits charged, and request ID.",
        viewUsage: "View Usage",
        topUpCredits: "Top up Credits",
        topUpCreditsBody: "{plan}. {policy}",
        creditsRemaining: "Credits remaining",
        profileMissing: "Profile not found yet; showing 0 credits.",
        topUpToStart: "Top up to start calling the API.",
        requestsLast24h: "Requests (last 24h)",
        recentTraffic: "Recent API traffic.",
        noTrafficYet: "No traffic yet.",
        activeApiKeys: "Active API keys",
        keysReady: "Ready to use with the API.",
        createFirstKey: "Create your first key.",
        devQuickRef: "Developer quick reference",
        devQuickRefDesc:
          "Swap your base URL and Authorization header — keep the rest of your OpenAI-compatible code unchanged.",
        baseUrl: "Base URL",
        apiKeyFormat: "API key format",
        starter: "Starter",
        billing: "Billing",
      },
      apiKeys: {
        title: "API Keys",
        subtitleMeta: "View API key metadata for your Tokfai account.",
        subtitleCreate:
          "Create keys to authenticate requests to {baseUrl}. The full secret is shown once when created. Active keys can be revealed and copied again with Copy key.",
        loadError: "Could not load API keys",
        quickStart: "Quick start",
        quickStartDesc: "Send your key on every request to the Tokfai API.",
        quickStartItem1: "Full secret is shown once when created.",
        quickStartItem2:
          "Active keys can be revealed and copied again from the list.",
        quickStartItem3:
          "Use this key in Cursor, Cherry Studio, OpenAI SDK, or curl.",
        quickStartItem4:
          "Legacy keys that cannot be revealed: create a new key to copy the full secret.",
        viewApiDocs: "View API docs",
        tryImagePlayground: "Try Image Playground",
        createApiKey: "Create API key",
        createApiKeyDesc:
          "Optional name for your reference. Leave blank to use the default name.",
        keyName: "Key name",
        keyNamePlaceholder: "e.g. production",
        creating: "Creating...",
        yourApiKeys: "Your API keys",
        yourApiKeysDesc:
          "Prefixes are shown for identification. Use Copy key to copy the full secret for active keys.",
        apiKeyCreated: "API key created",
        apiKeyCreatedNamed: "API key created: {name}",
        oneTimeSecretDesc:
          "Copy and store this key now. The full secret is shown once at creation. You can also copy it later from the list with Copy key.",
        yourApiKey: "Your API key",
        authorizationHeader: "Authorization header",
        copyFullKey: "Copy full key",
        copied: "Copied",
        savedMyKey: "I've saved my key",
        readDocs: "Read the docs",
        revokeConfirm:
          "Revoke this API key? Existing apps using this key will stop working.",
        colName: "Name",
        colPrefix: "Prefix",
        colStatus: "Status",
        colCreated: "Created",
        colLastUsed: "Last used",
        colActions: "Actions",
        copying: "Copying...",
        copyKey: "Copy key",
        neverUsed: "Never used",
        revoking: "Revoking...",
        revoke: "Revoke",
        revoked: "Revoked",
        active: "Active",
        legacyKeyMessage:
          "Create a new key to copy the full secret. Legacy keys that cannot be revealed must be replaced.",
        emptyTitle:
          "No API keys yet. Create your first key above — the full secret is shown once, so copy it immediately.",
        viewDocs: "View docs",
      },
      playground: {
        title: "Chat Playground",
        subtitle:
          "Chat Playground only supports chat models. Send a single-turn completion through the Tokfai API using your own sk-tokfai_ key — the same path external clients use, so normal billing applies.",
        forImageModels: "For image models, use",
        request: "Request",
        requestDesc:
          "One user message, non-streaming. Successful calls are recorded in Usage and debited from Credits.",
        settings: "Settings",
        settingsDesc:
          "Chat models only. The selected model is passed in the JSON body to api.tokfai.com.",
        running: "Running…",
        run: "Run",
        needKey: "Need a key?",
        createApiKey: "Create an API key",
        needCredits: "Need more credits?",
        topUp: "Top up",
        apiKey: "API key",
        selectKey: "Select key",
        pasteKey: "Paste key",
        yourActiveKeys: "Your active keys",
        secretNotStored:
          "The full secret is loaded only for this request and is not stored in the browser.",
        noRevealableKeys: "No revealable keys found.",
        pasteYourKey: "Paste your key",
        orCreateOne: "create one",
        fullApiKey: "Full API key",
        sentAsBearer:
          "Sent as Authorization: Bearer sk-tokfai_…. Never logged or persisted by this page.",
        waitingForModel: "Waiting for the model…",
        requestFailed: "Request failed",
        errorCode: "Error code:",
        errorMessage: "Error message:",
        addCredits: "Add credits",
        responsePlaceholder: "Response will appear here.",
        recordedInUsage:
          "This request has been recorded. View it in Usage and Credits.",
      },
      imagePlayground: {
        title: "Image Playground",
        subtitle:
          "Test text-to-image and image-to-image through {endpoint}. Drag images, paste URLs, or use prompt-only for text-to-image. Successful generations debit credits. Failed calls are not charged.",
        usesOwnKey:
          "Uses your own sk-tokfai_ key — the same path external clients use.",
        request: "Request",
        requestDesc:
          "Text-to-image works with prompt only. Add input images for image-to-image via upload or URL. Successful calls are recorded in Usage and debited from Credits.",
        textToImage: "Text to Image",
        imageToImage: "Image to Image",
        inputImagesReference:
          "Input images added — generation will use them as visual reference.",
        imageToImageHint:
          "Image-to-image mode: Tokfai will preserve the uploaded subject and apply your prompt as style/edit instructions.",
        waitingForImages:
          "Waiting for input images to finish uploading or resolving…",
        copyApiRequest: "Copy API request",
        generating: "Generating…",
        preparingImages: "Preparing input images…",
        generate: "Generate",
        curlCopied: "curl copied — replace {placeholder} with your API key.",
        inputImagesCount: "Input images: {count}",
        visualReferenceNote:
          "Tokfai will use your uploaded or linked image as visual reference. Results may vary depending on upstream model behavior.",
        settings: "Settings",
        settingsDesc:
          "Image models only. Values are sent in the JSON body to api.tokfai.com.",
        size: "Size",
        generatingImage: "Generating image…",
        generatedImagePlaceholder: "Generated image will appear here.",
        needKey: "Need a key?",
        createApiKey: "Create an API key",
        needCredits: "Need more credits?",
        topUp: "Top up",
      },
      credits: {
        title: "Credits",
        subtitle:
          "Prepaid balance used by every API call. Data is loaded through DMIT with your Supabase session.",
        currentBalance: "Current balance",
        totalPurchased: "Total purchased:",
        totalUsed: "Total used:",
        lastUpdated: "Last updated:",
        recentLedger: "Recent ledger entries",
        recentLedgerDesc:
          "Last 50 top-ups, debits, and adjustments. Written exclusively by DMIT.",
        colType: "Type",
        colAmount: "Amount",
        colBalanceAfter: "Balance after",
        colReason: "Reason",
        colReference: "Reference",
        colCreated: "Created",
        rechargeCredits: "Recharge credits",
        rechargeDesc:
          "Choose a fixed one-time package. Payments are handled by Stripe, and credits are added only after DMIT receives the signed webhook.",
        creditsUnit: "credits",
        buyStarter: "Buy starter",
        comingSoon: "Coming soon",
        billingNote:
          "The frontend never writes profiles.credits_balance. Checkout success only shows a pending confirmation message until the Stripe webhook credits the account.",
        paymentReceived: "Payment received",
        paymentReceivedDesc: "Payment received. Credits have been added.",
        checkoutCancelled: "Checkout was cancelled",
        checkoutCancelledDesc:
          "No credits were added. You can pick another amount below.",
        emptyLedger:
          "No credit activity yet. Recharge above to add credits, or view plans on the pricing page.",
        viewPricing: "View pricing",
        loadErrorAuth: "Session expired — please sign in again",
        loadErrorAuthDesc: "Your session has expired. Please sign in again.",
        loadErrorTemp: "Credits unavailable",
        loadErrorTempDesc:
          "Credits could not be loaded right now. Please try again later.",
        reasonStripeCheckout: "Stripe top-up",
        reasonChatUsage: "API usage charge",
        reasonAdminAdjustment: "Admin adjustment",
        reasonSystemFix: "System correction",
      },
      usage: {
        title: "Usage",
        subtitle:
          "Recent API activity for your account. Data is loaded from Tokfai API and scoped to your login.",
        subtitleDetail:
          "Chat calls show token usage. Image calls show credits charged.",
        billingPolicy:
          "Successful calls debit credits. Failed calls are not charged.",
        recentRequests: "Recent requests",
        recentRequestsDesc:
          "Last 50 entries, newest first. Run a request in the Chat Playground or Image Playground to generate more.",
        loadError: "Could not load usage",
        colWhen: "When",
        colType: "Type",
        colModel: "Model",
        colStatus: "Status",
        colPrompt: "Prompt",
        colCompletion: "Completion",
        colTotal: "Total",
        colCredits: "Credits charged",
        colRequestId: "Request ID",
        colError: "Error",
        kindChat: "Chat",
        kindImage: "Image",
        statusSucceeded: "succeeded",
        statusFailed: "failed",
        imageGeneration: "image generation",
        emptyTitle:
          "No API usage yet. Send your first chat completion or image generation from the Playgrounds to see requests here.",
      },
    },
  },
  zh: {
    nav: {
      overview: "概览",
      apiKeys: "API 密钥",
      playground: "Playground",
      imagePlayground: "图像 Playground",
      models: "模型",
      usage: "用量",
      credits: "积分",
      docs: "文档",
      home: "首页",
      pricing: "定价",
      dashboard: "控制台",
    },
    home: {
      headline: "OpenAI 兼容的图像与对话 API",
      description:
        "一个 API 覆盖对话、图像与 AI 应用。兼容 OpenAI SDK、Cursor、Cherry Studio 及自研产品。可在 Image Playground 中体验图像生成。",
      startWithCredits: "从积分开始",
      tryImagePlayground: "体验 Image Playground",
      viewPricing: "查看定价",
      readDocs: "阅读文档",
    },
    common: {
      signOut: "退出登录",
      signingOut: "正在退出…",
      signedInAs: "已登录",
      logIn: "登录",
      signUp: "注册",
      language: "语言",
      open: "打开",
      unavailable: "不可用",
      chatPlayground: "Chat Playground",
      imagePlayground: "Image Playground",
    },
    dashboard: {
      overview: {
        title: "概览",
        subtitle:
          "欢迎使用 Tokfai。按以下步骤创建密钥、测试对话与图像生成、查看用量并充值积分。",
        v1Preview: "V1 预览",
        getStarted: "快速开始",
        getStartedDesc: "完成以下清单，端到端验证你的账户。",
        createApiKey: "创建 API 密钥",
        createApiKeyBody:
          "生成 {format} 格式的密钥。创建时会完整展示一次，之后可在列表中再次复制。",
        openChatPlayground: "打开 Chat Playground",
        tryChatPlayground: "体验对话 Playground",
        tryChatPlaygroundBody:
          "使用 API 密钥发送对话请求，在接入前先验证响应是否正常。",
        openImagePlayground: "打开 Image Playground",
        tryImagePlayground: "体验图像 Playground",
        tryImagePlaygroundBody:
          "测试文生图与图生图，支持上传、URL 或仅 prompt 请求。",
        reviewUsage: "查看用量",
        reviewUsageBody:
          "确认对话与图像请求已记录，包含 model、credits_charged 与 request ID。",
        viewUsage: "查看用量",
        topUpCredits: "充值积分",
        topUpCreditsBody: "{plan}。{policy}",
        creditsRemaining: "剩余积分",
        profileMissing: "尚未找到账户资料，暂显示 0 积分。",
        topUpToStart: "充值后即可开始调用 API。",
        requestsLast24h: "近 24 小时请求",
        recentTraffic: "近期 API 调用。",
        noTrafficYet: "暂无调用记录。",
        activeApiKeys: "活跃 API 密钥",
        keysReady: "可用于 API 调用。",
        createFirstKey: "创建你的第一把密钥。",
        devQuickRef: "开发者速查",
        devQuickRefDesc:
          "替换 Base URL 与 Authorization 请求头，其余 OpenAI 兼容代码无需改动。",
        baseUrl: "Base URL",
        apiKeyFormat: "API 密钥格式",
        starter: "Starter",
        billing: "计费说明",
      },
      apiKeys: {
        title: "API 密钥",
        subtitleMeta: "查看 Tokfai 账户的 API 密钥元数据。",
        subtitleCreate:
          "创建密钥以向 {baseUrl} 发起认证请求。完整密钥仅在创建时展示一次；活跃密钥可通过「复制密钥」再次获取。",
        loadError: "无法加载 API 密钥",
        quickStart: "快速上手",
        quickStartDesc: "每次请求 Tokfai API 时都需要携带密钥。",
        quickStartItem1: "完整密钥仅在创建时展示一次。",
        quickStartItem2: "活跃密钥可在列表中再次揭示并复制。",
        quickStartItem3:
          "可在 Cursor、Cherry Studio、OpenAI SDK 或 curl 中使用。",
        quickStartItem4:
          "无法揭示的旧密钥：请创建新密钥以复制完整 secret。",
        viewApiDocs: "查看 API 文档",
        tryImagePlayground: "体验 Image Playground",
        createApiKey: "创建 API 密钥",
        createApiKeyDesc: "可选名称，便于区分。留空则使用默认名称。",
        keyName: "密钥名称",
        keyNamePlaceholder: "例如 production",
        creating: "创建中…",
        yourApiKeys: "你的 API 密钥",
        yourApiKeysDesc:
          "列表展示 prefix 便于识别。活跃密钥可通过「复制密钥」获取完整 secret。",
        apiKeyCreated: "API 密钥已创建",
        apiKeyCreatedNamed: "API 密钥已创建：{name}",
        oneTimeSecretDesc:
          "请立即复制并妥善保存。完整密钥仅在创建时展示一次，之后仍可通过列表中的「复制密钥」获取。",
        yourApiKey: "你的 API 密钥",
        authorizationHeader: "Authorization header",
        copyFullKey: "复制完整密钥",
        copied: "已复制",
        savedMyKey: "我已保存密钥",
        readDocs: "阅读文档",
        revokeConfirm: "确定吊销此 API 密钥？使用该密钥的应用将无法继续工作。",
        colName: "名称",
        colPrefix: "Prefix",
        colStatus: "状态",
        colCreated: "创建时间",
        colLastUsed: "最近使用",
        colActions: "操作",
        copying: "复制中…",
        copyKey: "复制密钥",
        neverUsed: "从未使用",
        revoking: "吊销中…",
        revoke: "吊销",
        revoked: "已吊销",
        active: "活跃",
        legacyKeyMessage:
          "请创建新密钥以复制完整 secret。无法揭示的旧密钥需替换。",
        emptyTitle:
          "还没有 API 密钥。在上方创建第一把密钥——完整 secret 仅展示一次，请立即复制。",
        viewDocs: "查看文档",
      },
      playground: {
        title: "Chat Playground",
        subtitle:
          "Chat Playground 仅支持对话模型。使用你的 sk-tokfai_ 密钥发送单轮对话——与外部客户端相同路径，按正常计费规则扣费。",
        forImageModels: "图像模型请使用",
        request: "请求",
        requestDesc:
          "单条 user 消息，非流式。成功调用会记入 Usage 并从 Credits 扣费。",
        settings: "设置",
        settingsDesc:
          "仅对话模型。所选 model 通过 JSON body 发送至 api.tokfai.com。",
        running: "运行中…",
        run: "运行",
        needKey: "还没有密钥？",
        createApiKey: "创建 API 密钥",
        needCredits: "积分不足？",
        topUp: "去充值",
        apiKey: "API 密钥",
        selectKey: "选择密钥",
        pasteKey: "粘贴密钥",
        yourActiveKeys: "你的活跃密钥",
        secretNotStored: "完整 secret 仅用于本次请求，不会保存在浏览器中。",
        noRevealableKeys: "没有可自动加载的密钥。",
        pasteYourKey: "粘贴密钥",
        orCreateOne: "创建一个",
        fullApiKey: "完整 API 密钥",
        sentAsBearer:
          "以 Authorization: Bearer sk-tokfai_… 发送。本页不会记录或持久化。",
        waitingForModel: "等待模型响应…",
        requestFailed: "请求失败",
        errorCode: "错误码：",
        errorMessage: "错误信息：",
        addCredits: "充值积分",
        responsePlaceholder: "响应将显示在这里。",
        recordedInUsage: "本次请求已记录，可在 Usage 与 Credits 中查看。",
      },
      imagePlayground: {
        title: "Image Playground",
        subtitle:
          "通过 {endpoint} 测试文生图与图生图。可拖拽图片、粘贴 URL，或仅用 prompt 文生图。成功生成会扣费，失败不扣费。",
        usesOwnKey: "使用你的 sk-tokfai_ 密钥——与外部客户端相同路径。",
        request: "请求",
        requestDesc:
          "文生图仅需 prompt；图生图可通过上传或 URL 添加输入图。成功调用记入 Usage 并从 Credits 扣费。",
        textToImage: "文生图",
        imageToImage: "图生图",
        inputImagesReference: "已添加输入图——生成时将作为视觉参考。",
        imageToImageHint:
          "图生图模式：Tokfai 会保留上传主体，并按 prompt 进行风格/编辑。",
        waitingForImages: "等待输入图上传或解析完成…",
        copyApiRequest: "复制 API 请求",
        generating: "生成中…",
        preparingImages: "准备输入图…",
        generate: "生成",
        curlCopied: "curl 已复制——将 {placeholder} 替换为你的 API 密钥。",
        inputImagesCount: "输入图：{count}",
        visualReferenceNote:
          "Tokfai 会使用你上传或链接的图片作为视觉参考，效果因上游模型而异。",
        settings: "设置",
        settingsDesc:
          "仅图像模型。参数通过 JSON body 发送至 api.tokfai.com。",
        size: "尺寸",
        generatingImage: "生成图像中…",
        generatedImagePlaceholder: "生成的图像将显示在这里。",
        needKey: "还没有密钥？",
        createApiKey: "创建 API 密钥",
        needCredits: "积分不足？",
        topUp: "去充值",
      },
      credits: {
        title: "积分",
        subtitle:
          "预付余额用于每次 API 调用。数据通过 DMIT 加载，使用你的 Supabase 会话。",
        currentBalance: "当前余额",
        totalPurchased: "累计购买：",
        totalUsed: "累计使用：",
        lastUpdated: "最近更新：",
        recentLedger: "最近账本记录",
        recentLedgerDesc:
          "最近 50 条充值、扣费与调账记录，仅由 DMIT 写入。",
        colType: "类型",
        colAmount: "金额",
        colBalanceAfter: "变更后余额",
        colReason: "原因",
        colReference: "Reference",
        colCreated: "时间",
        rechargeCredits: "充值积分",
        rechargeDesc:
          "选择固定一次性套餐。支付由 Stripe 处理，积分在 DMIT 收到签名 webhook 后入账。",
        creditsUnit: "积分",
        buyStarter: "购买 Starter",
        comingSoon: "即将开放",
        billingNote:
          "前端不会写入 profiles.credits_balance。Checkout 成功仅表示待确认，需等 Stripe webhook 入账。",
        paymentReceived: "支付成功",
        paymentReceivedDesc: "支付成功，积分已入账。",
        checkoutCancelled: "Checkout 已取消",
        checkoutCancelledDesc: "未增加积分。可在下方选择其他套餐。",
        emptyLedger: "暂无积分记录。在上方充值，或前往定价页查看套餐。",
        viewPricing: "查看定价",
        loadErrorAuth: "登录状态异常",
        loadErrorAuthDesc: "登录状态异常，请重新登录。",
        loadErrorTemp: "积分暂时无法加载",
        loadErrorTempDesc: "积分暂时无法加载，请稍后重试。",
        reasonStripeCheckout: "Stripe 充值到账",
        reasonChatUsage: "API 调用扣费",
        reasonAdminAdjustment: "管理员调账",
        reasonSystemFix: "系统修正",
      },
      usage: {
        title: "用量",
        subtitle: "你账户的近期 API 活动。数据来自 Tokfai API，仅限当前登录用户。",
        subtitleDetail: "对话调用展示 token 用量，图像调用展示扣除积分。",
        billingPolicy: "成功调用扣费，失败调用不扣费。",
        recentRequests: "最近请求",
        recentRequestsDesc:
          "最近 50 条，按时间倒序。在 Chat Playground 或 Image Playground 发起请求以产生更多记录。",
        loadError: "无法加载用量",
        colWhen: "时间",
        colType: "类型",
        colModel: "Model",
        colStatus: "状态",
        colPrompt: "Prompt",
        colCompletion: "Completion",
        colTotal: "Total",
        colCredits: "扣除积分",
        colRequestId: "请求 ID",
        colError: "Error",
        kindChat: "对话",
        kindImage: "图像",
        statusSucceeded: "成功",
        statusFailed: "失败",
        imageGeneration: "image generation",
        emptyTitle:
          "暂无 API 用量。在 Playground 发送第一次对话或图像生成后，记录会显示在这里。",
      },
    },
  },
} as const;

export type MessageTree = (typeof messages)["en"];

export function formatMessage(
  template: string,
  vars: Record<string, string | number>
): string {
  return Object.entries(vars).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template
  );
}
