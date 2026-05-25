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
      signedInAs: "Signed in as",
      logIn: "Log in",
      signUp: "Sign up",
      language: "Language",
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
      signedInAs: "已登录",
      logIn: "登录",
      signUp: "注册",
      language: "语言",
    },
  },
} as const;

export type MessageTree = (typeof messages)["en"];
