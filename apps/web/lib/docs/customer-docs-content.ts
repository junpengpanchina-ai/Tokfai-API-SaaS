/**
 * Customer-facing integration handbook structure.
 * Static content for now; future Supabase CMS / admin editor can replace this source.
 */
import {
  batchCreateCurlMultiline,
  batchCreateCurlOneLine,
  batchPollCurlMultiline,
  batchPollCurlOneLine,
  chatCurlMultiline,
  chatCurlOneLine,
  imageCurlMultiline,
  imageCurlOneLine,
  modelsCurlMultiline,
  modelsCurlOneLine,
} from "@/lib/customer-curl-oneline";
import {
  CHERRY_STUDIO_CONFIG_SNIPPET,
  CUSTOMER_INTEGRATION_ERROR_CODES,
  CURSOR_CONFIG_SNIPPET,
  INTEGRATION_BASE_URL,
  INTEGRATION_DEFAULT_MODEL,
  INTEGRATION_KEY_PLACEHOLDER,
  OPENAI_JS_SNIPPET,
  OPENAI_PYTHON_SNIPPET,
  OPENAI_SDK_CONFIG_SNIPPET,
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

export const CUSTOMER_DOC_SNIPPET_DISPLAY: Record<CustomerDocSnippetKey, string> = {
  "chat-curl": chatCurlMultiline(),
  "models-curl": modelsCurlMultiline(),
  "image-curl": imageCurlMultiline(),
  "batch-create-curl": batchCreateCurlMultiline(),
  "batch-poll-curl": batchPollCurlMultiline(),
  "openai-sdk-config": OPENAI_SDK_CONFIG_SNIPPET,
  "openai-js": OPENAI_JS_SNIPPET,
  "openai-python": OPENAI_PYTHON_SNIPPET,
  "cursor-config": CURSOR_CONFIG_SNIPPET,
  "cherry-config": CHERRY_STUDIO_CONFIG_SNIPPET,
};

export const CUSTOMER_DOC_SNIPPET_COPY: Record<CustomerDocSnippetKey, string> = {
  "chat-curl": chatCurlOneLine(),
  "models-curl": modelsCurlOneLine(),
  "image-curl": imageCurlOneLine(),
  "batch-create-curl": batchCreateCurlOneLine(),
  "batch-poll-curl": batchPollCurlOneLine(),
  "openai-sdk-config": OPENAI_SDK_CONFIG_SNIPPET,
  "openai-js": OPENAI_JS_SNIPPET,
  "openai-python": OPENAI_PYTHON_SNIPPET,
  "cursor-config": CURSOR_CONFIG_SNIPPET,
  "cherry-config": CHERRY_STUDIO_CONFIG_SNIPPET,
};

/** Readable display snippets (multiline curl where applicable). */
export const CUSTOMER_DOC_SNIPPETS = CUSTOMER_DOC_SNIPPET_DISPLAY;

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
  | { type: "one-line-curl"; id: string; titleKey: string; snippetKey?: CustomerDocSnippetKey }
  | { type: "api-key-copy-panel"; id: string }
  | { type: "api-key-errors" }
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

export type CustomerDocChapterNow = {
  try?: CustomerDocDashboardLink;
  copySnippetKey?: CustomerDocSnippetKey;
  verify?: CustomerDocDashboardLink[];
};

export type CustomerDocSection = {
  id: string;
  navKey: string;
  titleKey: string;
  descriptionKey?: string;
  highlight?: boolean;
  chapterGuide: CustomerDocChapterGuide;
  chapterNow: CustomerDocChapterNow;
  blocks: CustomerDocBlock[];
};

const VERIFY_USAGE_CREDITS: CustomerDocDashboardLink[] = [
  { id: "usage", labelKey: "integration.linkUsage", href: "/dashboard/usage" },
  { id: "credits", labelKey: "integration.linkCredits", href: "/dashboard/credits" },
];

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

export const CUSTOMER_DOC_INDUSTRY_SCENARIO_KEYS: Record<
  CustomerDocIndustryId,
  string[]
> = {
  hospital: [
    "integration.industry.hospital.scenario1",
    "integration.industry.hospital.scenario2",
    "integration.industry.hospital.scenario3",
  ],
  automotive: [
    "integration.industry.automotive.scenario1",
    "integration.industry.automotive.scenario2",
    "integration.industry.automotive.scenario3",
  ],
  ecommerce: [
    "integration.industry.ecommerce.scenario1",
    "integration.industry.ecommerce.scenario2",
    "integration.industry.ecommerce.scenario3",
  ],
  support: [
    "integration.industry.support.scenario1",
    "integration.industry.support.scenario2",
    "integration.industry.support.scenario3",
  ],
};

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
    chapterNow: {
      try: {
        id: "keys",
        labelKey: "integration.ctaCreateKey",
        href: "/dashboard/api-keys",
      },
      verify: VERIFY_USAGE_CREDITS,
    },
    blocks: [
      { type: "paragraph", textKey: "integration.positioningGateway" },
      { type: "paragraph", textKey: "integration.positioningYourKey" },
      { type: "paragraph", textKey: "integration.positioningNotAgency" },
      { type: "paragraph", textKey: "integration.positioningYourStack" },
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
    chapterNow: {
      try: {
        id: "keys",
        labelKey: "integration.ctaCreateKey",
        href: "/dashboard/api-keys",
      },
      copySnippetKey: "chat-curl",
      verify: VERIFY_USAGE_CREDITS,
    },
    blocks: [
      {
        type: "ordered",
        items: [
          "integration.quickStartStep1",
          "integration.quickStartStep2",
          "integration.quickStartStep3",
          "integration.quickStartStep4",
          "integration.quickStartStep5",
          "integration.quickStartStep6",
        ],
      },
      { type: "paragraph", textKey: "integration.quickStartTerminalNote" },
      { type: "one-line-curl", id: "quick-start-live-curl", titleKey: "integration.quickStartCopyNowTitle" },
      { type: "paragraph", textKey: "integration.quickStartExpectedResponse" },
      { type: "paragraph", textKey: "integration.quickStartReconcileNote" },
      { type: "paragraph", textKey: "integration.placeholderKeyNote" },
      { type: "copy-fields", id: "quick-start", fields: CUSTOMER_DOC_QUICK_START_FIELDS },
      {
        type: "code",
        id: "quick-start-chat-curl-readable",
        label: "readable multi-line",
        snippetKey: "chat-curl",
      },
      {
        type: "dashboard-links",
        links: [
          { id: "keys", labelKey: "integration.ctaCreateKey", href: "/dashboard/api-keys" },
          { id: "usage", labelKey: "integration.linkUsage", href: "/dashboard/usage" },
          { id: "credits", labelKey: "integration.linkCredits", href: "/dashboard/credits" },
        ],
      },
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
    chapterNow: {
      try: {
        id: "keys",
        labelKey: "integration.ctaCreateKey",
        href: "/dashboard/api-keys",
      },
      copySnippetKey: "models-curl",
      verify: VERIFY_USAGE_CREDITS,
    },
    blocks: [
      { type: "paragraph", textKey: "integration.apiKeyCredential" },
      {
        type: "bullets",
        items: [
          "integration.apiKeyBulletAuthHeader",
          "integration.apiKeyBulletOneTime",
          "integration.apiKeyBulletReveal",
          "integration.apiKeyBulletRevoke",
          "integration.apiKeyBulletOneKeyAllApis",
          "integration.apiKeyBulletServerSide",
        ],
      },
      { type: "api-key-copy-panel", id: "api-key-copy" },
      { type: "paragraph", textKey: "integration.apiKeyVerifyNote" },
      { type: "api-key-errors" },
      {
        type: "code",
        id: "api-key-models-readable",
        label: "models (readable)",
        snippetKey: "models-curl",
      },
      {
        type: "dashboard-links",
        links: [
          { id: "keys", labelKey: "integration.ctaCreateKey", href: "/dashboard/api-keys" },
          { id: "usage", labelKey: "integration.linkUsage", href: "/dashboard/usage" },
          { id: "credits", labelKey: "integration.linkCredits", href: "/dashboard/credits" },
          {
            id: "quick-start",
            labelKey: "integration.ctaQuickStart",
            href: "/dashboard/docs",
            hash: "quick-start",
          },
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
    chapterNow: {
      try: {
        id: "playground",
        labelKey: "integration.demoFlowLinkPlayground",
        href: "/dashboard/playground",
      },
      copySnippetKey: "chat-curl",
      verify: VERIFY_USAGE_CREDITS,
    },
    blocks: [
      { type: "model-list" },
      { type: "paragraph", textKey: "integration.modelsExplicitNote" },
      { type: "paragraph", textKey: "integration.placeholderKeyNote" },
      {
        type: "code",
        id: "chat-curl",
        label: "chat (readable)",
        snippetKey: "chat-curl",
      },
      {
        type: "code",
        id: "models-curl",
        label: "models (readable)",
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
    chapterNow: {
      try: {
        id: "image-playground",
        labelKey: "integration.imagePlaygroundLink",
        href: "/dashboard/image-playground",
      },
      copySnippetKey: "image-curl",
      verify: VERIFY_USAGE_CREDITS,
    },
    blocks: [
      { type: "paragraph", textKey: "integration.imageApiBody" },
      { type: "paragraph", textKey: "integration.placeholderKeyNote" },
      {
        type: "code",
        id: "image-curl",
        label: "images (readable)",
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
    chapterNow: {
      try: {
        id: "usage",
        labelKey: "integration.linkUsage",
        href: "/dashboard/usage",
      },
      copySnippetKey: "batch-create-curl",
      verify: VERIFY_USAGE_CREDITS,
    },
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
      { type: "paragraph", textKey: "integration.placeholderKeyNote" },
      {
        type: "code",
        id: "batch-create",
        label: "create batch (readable)",
        snippetKey: "batch-create-curl",
      },
      {
        type: "code",
        id: "batch-poll",
        label: "poll batch (readable)",
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
    chapterNow: {
      try: {
        id: "usage",
        labelKey: "integration.linkUsage",
        href: "/dashboard/usage",
      },
      verify: VERIFY_USAGE_CREDITS,
    },
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
    chapterNow: {
      try: {
        id: "usage",
        labelKey: "integration.linkUsage",
        href: "/dashboard/usage",
      },
      verify: VERIFY_USAGE_CREDITS,
    },
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
    chapterNow: {
      try: {
        id: "playground",
        labelKey: "integration.demoFlowLinkPlayground",
        href: "/dashboard/playground",
      },
      copySnippetKey: "openai-sdk-config",
      verify: VERIFY_USAGE_CREDITS,
    },
    blocks: [
      { type: "paragraph", textKey: "integration.placeholderKeyNote" },
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
    chapterNow: {
      try: {
        id: "playground",
        labelKey: "integration.demoFlowLinkPlayground",
        href: "/dashboard/playground",
      },
      copySnippetKey: "cursor-config",
      verify: VERIFY_USAGE_CREDITS,
    },
    blocks: [
      { type: "paragraph", textKey: "integration.placeholderKeyNote" },
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
    chapterNow: {
      try: {
        id: "playground",
        labelKey: "integration.demoFlowLinkPlayground",
        href: "/dashboard/playground",
      },
      copySnippetKey: "cherry-config",
      verify: VERIFY_USAGE_CREDITS,
    },
    blocks: [
      { type: "paragraph", textKey: "integration.placeholderKeyNote" },
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
    chapterNow: {
      try: {
        id: "playground",
        labelKey: "integration.demoFlowLinkPlayground",
        href: "/dashboard/playground",
      },
      verify: VERIFY_USAGE_CREDITS,
    },
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
