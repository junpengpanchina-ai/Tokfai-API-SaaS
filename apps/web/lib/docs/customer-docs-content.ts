/**
 * Customer-facing integration handbook structure.
 * Static content for now; future Supabase CMS / admin editor can replace this source.
 */
import {
  BATCH_POLL_CURL,
  BATCH_CHAT_CURL,
  CHERRY_STUDIO_CONFIG_SNIPPET,
  CUSTOMER_INTEGRATION_ERROR_CODES,
  CURSOR_CONFIG_SNIPPET,
  IMAGE_GENERATION_CURL,
  INTEGRATION_BASE_URL,
  INTEGRATION_DEFAULT_MODEL,
  INTEGRATION_KEY_PLACEHOLDER,
  OPENAI_JS_SNIPPET,
  OPENAI_PYTHON_SNIPPET,
  OPENAI_SDK_CONFIG_SNIPPET,
  chatCompletionsCurl,
  modelsListCurl,
} from "@/lib/customer-integration-snippets";

export type CustomerDocSnippetKey =
  | "chat-curl"
  | "models-curl"
  | "image-curl"
  | "batch-create-curl"
  | "batch-poll-curl"
  | "openai-sdk-config"
  | "openai-js"
  | "openai-python"
  | "cursor-config"
  | "cherry-config";

export const CUSTOMER_DOC_SNIPPETS: Record<CustomerDocSnippetKey, string> = {
  "chat-curl": chatCompletionsCurl(),
  "models-curl": modelsListCurl(),
  "image-curl": IMAGE_GENERATION_CURL,
  "batch-create-curl": BATCH_CHAT_CURL,
  "batch-poll-curl": BATCH_POLL_CURL,
  "openai-sdk-config": OPENAI_SDK_CONFIG_SNIPPET,
  "openai-js": OPENAI_JS_SNIPPET,
  "openai-python": OPENAI_PYTHON_SNIPPET,
  "cursor-config": CURSOR_CONFIG_SNIPPET,
  "cherry-config": CHERRY_STUDIO_CONFIG_SNIPPET,
};

export type CustomerDocChapterGuide = {
  purposeKey: string;
  copyKey: string;
  verifyKey: string;
  failureKey: string;
};

export type CustomerDocBlock =
  | { type: "paragraph"; textKey: string }
  | { type: "bullets"; items: string[] }
  | { type: "ordered"; items: string[] }
  | { type: "code"; id: string; label: string; snippetKey: CustomerDocSnippetKey }
  | { type: "copy-fields"; id: string; fields: CustomerDocCopyField[] }
  | { type: "error-table" }
  | { type: "model-list" }
  | { type: "dashboard-links"; links: CustomerDocDashboardLink[] }
  | { type: "industry-cards"; ids: CustomerDocIndustryId[] };

export type CustomerDocCopyField = {
  id: string;
  labelKey: string;
  value: string;
};

export type CustomerDocDashboardLink = {
  id: string;
  labelKey: string;
  href: string;
  hash?: string;
};

export type CustomerDocSection = {
  id: string;
  navKey: string;
  titleKey: string;
  descriptionKey?: string;
  highlight?: boolean;
  chapterGuide: CustomerDocChapterGuide;
  blocks: CustomerDocBlock[];
};

export const CUSTOMER_DOC_ESSENTIAL_KEYS = [
  "integration.essentialBaseUrl",
  "integration.essentialModel",
  "integration.essentialOneKey",
  "integration.essentialBilling",
  "integration.essentialRequestId",
] as const;

export const CUSTOMER_DOC_QUICK_START_FIELDS: CustomerDocCopyField[] = [
  {
    id: "base",
    labelKey: "integration.baseUrlLabel",
    value: INTEGRATION_BASE_URL,
  },
  {
    id: "model",
    labelKey: "integration.recommendedModelLabel",
    value: INTEGRATION_DEFAULT_MODEL,
  },
  {
    id: "auth",
    labelKey: "integration.authHeaderLabel",
    value: `Authorization: Bearer ${INTEGRATION_KEY_PLACEHOLDER}`,
  },
];

export const CUSTOMER_DOC_API_KEY_FIELDS: CustomerDocCopyField[] = [
  {
    id: "auth",
    labelKey: "integration.authHeaderLabel",
    value: `Authorization: Bearer ${INTEGRATION_KEY_PLACEHOLDER}`,
  },
  {
    id: "key-format",
    labelKey: "integration.apiKeyFormatLabel",
    value: INTEGRATION_KEY_PLACEHOLDER,
  },
];

export const CUSTOMER_DOC_CURSOR_FIELDS: CustomerDocCopyField[] = [
  {
    id: "provider",
    labelKey: "integration.cursorProviderLabel",
    value: "OpenAI-compatible",
  },
  {
    id: "base",
    labelKey: "integration.cursorBaseUrlLabel",
    value: INTEGRATION_BASE_URL,
  },
  {
    id: "key",
    labelKey: "integration.cursorApiKeyLabel",
    value: INTEGRATION_KEY_PLACEHOLDER,
  },
  {
    id: "model",
    labelKey: "integration.cursorModelLabel",
    value: "auto-fast / auto-pro",
  },
];

export const CUSTOMER_DOC_CHERRY_FIELDS: CustomerDocCopyField[] = [
  {
    id: "provider",
    labelKey: "integration.cherryProvider",
    value: "OpenAI Compatible",
  },
  {
    id: "host",
    labelKey: "integration.cherryApiHost",
    value: INTEGRATION_BASE_URL,
  },
  {
    id: "key",
    labelKey: "integration.cherryApiKey",
    value: INTEGRATION_KEY_PLACEHOLDER,
  },
  {
    id: "model",
    labelKey: "integration.cherryModel",
    value: INTEGRATION_DEFAULT_MODEL,
  },
];

export const CUSTOMER_DOC_INDUSTRY_IDS = [
  "hospital",
  "automotive",
  "ecommerce",
  "support",
] as const;

export type CustomerDocIndustryId = (typeof CUSTOMER_DOC_INDUSTRY_IDS)[number];

const chapter = (
  purposeKey: string,
  copyKey: string,
  verifyKey: string,
  failureKey: string
): CustomerDocChapterGuide => ({
  purposeKey,
  copyKey,
  verifyKey,
  failureKey,
});

export const CUSTOMER_DOC_SECTIONS: CustomerDocSection[] = [
  {
    id: "product-positioning",
    navKey: "integration.navPositioning",
    titleKey: "integration.positioningTitle",
    descriptionKey: "integration.positioningDesc",
    highlight: true,
    chapterGuide: chapter(
      "integration.positioningChapterPurpose",
      "integration.positioningChapterCopy",
      "integration.positioningChapterVerify",
      "integration.positioningChapterFailure"
    ),
    blocks: [
      { type: "paragraph", textKey: "integration.positioningGateway" },
      { type: "paragraph", textKey: "integration.positioningYourKey" },
      { type: "paragraph", textKey: "integration.positioningNotAgency" },
      { type: "paragraph", textKey: "integration.positioningYourStack" },
    ],
  },
  {
    id: "production-demo-flow",
    navKey: "integration.navDemoFlow",
    titleKey: "integration.demoFlowTitle",
    descriptionKey: "integration.demoFlowDesc",
    chapterGuide: chapter(
      "integration.onboardingChapterPurpose",
      "integration.onboardingChapterCopy",
      "integration.onboardingChapterVerify",
      "integration.onboardingChapterFailure"
    ),
    blocks: [
      {
        type: "ordered",
        items: [
          "integration.demoFlowStep1",
          "integration.demoFlowStep2",
          "integration.demoFlowStep3",
          "integration.demoFlowStep4",
          "integration.demoFlowStep5",
        ],
      },
      {
        type: "dashboard-links",
        links: [
          { id: "keys", labelKey: "integration.demoFlowLinkKeys", href: "/dashboard/api-keys" },
          {
            id: "playground",
            labelKey: "integration.demoFlowLinkPlayground",
            href: "/dashboard/playground",
          },
          {
            id: "batch",
            labelKey: "integration.demoFlowLinkBatch",
            href: "/dashboard/docs",
            hash: "batch-api",
          },
          { id: "usage", labelKey: "integration.demoFlowLinkUsage", href: "/dashboard/usage" },
          {
            id: "credits",
            labelKey: "integration.demoFlowLinkCredits",
            href: "/dashboard/credits",
          },
        ],
      },
      { type: "paragraph", textKey: "integration.demoFlowReconcileNote" },
    ],
  },
  {
    id: "quick-start",
    navKey: "integration.navQuickStart",
    titleKey: "integration.quickStartTitle",
    descriptionKey: "integration.quickStartDesc",
    chapterGuide: chapter(
      "integration.quickStartChapterPurpose",
      "integration.quickStartChapterCopy",
      "integration.quickStartChapterVerify",
      "integration.quickStartChapterFailure"
    ),
    blocks: [
      {
        type: "ordered",
        items: [
          "integration.quickStep1",
          "integration.quickStep2",
          "integration.quickStep3",
          "integration.quickStep4",
        ],
      },
      { type: "copy-fields", id: "quick-start", fields: CUSTOMER_DOC_QUICK_START_FIELDS },
    ],
  },
  {
    id: "api-key",
    navKey: "integration.navApiKey",
    titleKey: "integration.apiKeyTitle",
    descriptionKey: "integration.apiKeyDesc",
    chapterGuide: chapter(
      "integration.apiKeyChapterPurpose",
      "integration.apiKeyChapterCopy",
      "integration.apiKeyChapterVerify",
      "integration.apiKeyChapterFailure"
    ),
    blocks: [
      { type: "paragraph", textKey: "integration.apiKeyBody" },
      { type: "copy-fields", id: "api-key", fields: CUSTOMER_DOC_API_KEY_FIELDS },
      {
        type: "dashboard-links",
        links: [
          { id: "keys", labelKey: "integration.ctaCreateKey", href: "/dashboard/api-keys" },
        ],
      },
    ],
  },
  {
    id: "chat-api",
    navKey: "integration.navChatApi",
    titleKey: "integration.chatApiTitle",
    descriptionKey: "integration.chatApiDesc",
    chapterGuide: chapter(
      "integration.chatApiChapterPurpose",
      "integration.chatApiChapterCopy",
      "integration.chatApiChapterVerify",
      "integration.chatApiChapterFailure"
    ),
    blocks: [
      { type: "model-list" },
      { type: "paragraph", textKey: "integration.modelsExplicitNote" },
      {
        type: "code",
        id: "chat-curl",
        label: "chat",
        snippetKey: "chat-curl",
      },
      {
        type: "code",
        id: "models-curl",
        label: "models",
        snippetKey: "models-curl",
      },
      {
        type: "dashboard-links",
        links: [
          {
            id: "playground",
            labelKey: "integration.demoFlowLinkPlayground",
            href: "/dashboard/playground",
          },
          { id: "models", labelKey: "integration.browseModels", href: "/dashboard/models" },
        ],
      },
    ],
  },
  {
    id: "image-api",
    navKey: "integration.navImageApi",
    titleKey: "integration.imageApiTitle",
    descriptionKey: "integration.imageApiDesc",
    chapterGuide: chapter(
      "integration.imageApiChapterPurpose",
      "integration.imageApiChapterCopy",
      "integration.imageApiChapterVerify",
      "integration.imageApiChapterFailure"
    ),
    blocks: [
      { type: "paragraph", textKey: "integration.imageApiBody" },
      {
        type: "code",
        id: "image-curl",
        label: "images",
        snippetKey: "image-curl",
      },
      {
        type: "dashboard-links",
        links: [
          {
            id: "image-playground",
            labelKey: "integration.imagePlaygroundLink",
            href: "/dashboard/image-playground",
          },
        ],
      },
    ],
  },
  {
    id: "batch-api",
    navKey: "integration.navBatch",
    titleKey: "integration.batchTitle",
    descriptionKey: "integration.batchDesc",
    chapterGuide: chapter(
      "integration.batchChapterPurpose",
      "integration.batchChapterCopy",
      "integration.batchChapterVerify",
      "integration.batchChapterFailure"
    ),
    blocks: [
      {
        type: "bullets",
        items: [
          "integration.batchScenario1",
          "integration.batchScenario2",
          "integration.batchScenario3",
        ],
      },
      { type: "paragraph", textKey: "integration.batchGatewayNote" },
      { type: "paragraph", textKey: "integration.batchNote" },
      {
        type: "code",
        id: "batch-create",
        label: "create batch",
        snippetKey: "batch-create-curl",
      },
      {
        type: "code",
        id: "batch-poll",
        label: "poll batch",
        snippetKey: "batch-poll-curl",
      },
    ],
  },
  {
    id: "usage-credits",
    navKey: "integration.navUsageCredits",
    titleKey: "integration.billingTitle",
    descriptionKey: "integration.billingDesc",
    chapterGuide: chapter(
      "integration.usageChapterPurpose",
      "integration.usageChapterCopy",
      "integration.usageChapterVerify",
      "integration.usageChapterFailure"
    ),
    blocks: [
      { type: "paragraph", textKey: "integration.billingSuccessNote" },
      { type: "paragraph", textKey: "integration.billingFailedNote" },
      { type: "paragraph", textKey: "integration.billingRequestIdNote" },
      { type: "paragraph", textKey: "integration.billingLedgerNote" },
      {
        type: "dashboard-links",
        links: [
          { id: "usage", labelKey: "integration.linkUsage", href: "/dashboard/usage" },
          { id: "credits", labelKey: "integration.linkCredits", href: "/dashboard/credits" },
        ],
      },
    ],
  },
  {
    id: "error-codes",
    navKey: "integration.navErrors",
    titleKey: "integration.errorsTitle",
    descriptionKey: "integration.errorsDesc",
    chapterGuide: chapter(
      "integration.errorsChapterPurpose",
      "integration.errorsChapterCopy",
      "integration.errorsChapterVerify",
      "integration.errorsChapterFailure"
    ),
    blocks: [{ type: "error-table" }],
  },
  {
    id: "openai-sdk",
    navKey: "integration.navOpenAiSdk",
    titleKey: "integration.sdkTitle",
    descriptionKey: "integration.sdkDesc",
    chapterGuide: chapter(
      "integration.sdkChapterPurpose",
      "integration.sdkChapterCopy",
      "integration.sdkChapterVerify",
      "integration.sdkChapterFailure"
    ),
    blocks: [
      {
        type: "code",
        id: "sdk-config",
        label: "config",
        snippetKey: "openai-sdk-config",
      },
      {
        type: "code",
        id: "openai-js",
        label: "javascript",
        snippetKey: "openai-js",
      },
      {
        type: "code",
        id: "openai-python",
        label: "python",
        snippetKey: "openai-python",
      },
    ],
  },
  {
    id: "cursor-integration",
    navKey: "integration.navCursor",
    titleKey: "integration.cursorTitle",
    descriptionKey: "integration.cursorDesc",
    chapterGuide: chapter(
      "integration.cursorChapterPurpose",
      "integration.cursorChapterCopy",
      "integration.cursorChapterVerify",
      "integration.cursorChapterFailure"
    ),
    blocks: [
      { type: "copy-fields", id: "cursor", fields: CUSTOMER_DOC_CURSOR_FIELDS },
      {
        type: "code",
        id: "cursor-config",
        label: "config",
        snippetKey: "cursor-config",
      },
    ],
  },
  {
    id: "cherry-studio",
    navKey: "integration.navCherry",
    titleKey: "integration.cherryTitle",
    descriptionKey: "integration.cherryDesc",
    chapterGuide: chapter(
      "integration.cherryChapterPurpose",
      "integration.cherryChapterCopy",
      "integration.cherryChapterVerify",
      "integration.cherryChapterFailure"
    ),
    blocks: [
      { type: "copy-fields", id: "cherry", fields: CUSTOMER_DOC_CHERRY_FIELDS },
      {
        type: "code",
        id: "cherry-config",
        label: "config",
        snippetKey: "cherry-config",
      },
    ],
  },
  {
    id: "industry-examples",
    navKey: "integration.navIndustry",
    titleKey: "integration.industryTitle",
    descriptionKey: "integration.industryDesc",
    chapterGuide: chapter(
      "integration.industryChapterPurpose",
      "integration.industryChapterCopy",
      "integration.industryChapterVerify",
      "integration.industryChapterFailure"
    ),
    blocks: [
      { type: "paragraph", textKey: "integration.industryNotAgency" },
      { type: "industry-cards", ids: [...CUSTOMER_DOC_INDUSTRY_IDS] },
    ],
  },
];

export const CUSTOMER_DOC_MODEL_ROWS = [
  { id: "auto-fast", labelKey: "integration.modelAutoFast" },
  { id: "auto-pro", labelKey: "integration.modelAutoPro" },
  { id: "auto-cheap", labelKey: "integration.modelAutoCheap" },
] as const;

export { CUSTOMER_INTEGRATION_ERROR_CODES };
