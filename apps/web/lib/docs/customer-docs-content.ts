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
  buildImageApiReferenceCurlMultiline,
  buildImageApiReferenceCurlOneLine,
} from "@/lib/customer-image-api-chapter";
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
import {
  buildNodeBatchFetchExample,
  buildPythonBatchRequestsExample,
} from "@/lib/customer-openai-sdk-chapter";
import { CUSTOMER_DOC_ERROR_CODES } from "@/lib/customer-error-codes-chapter";

export type CustomerDocSnippetKey =
  | "chat-curl"
  | "models-curl"
  | "image-curl"
  | "image-curl-reference"
  | "batch-create-curl"
  | "batch-poll-curl"
  | "openai-sdk-config"
  | "openai-js"
  | "openai-python"
  | "openai-node-batch"
  | "openai-python-batch"
  | "cursor-config"
  | "cherry-config";

export const CUSTOMER_DOC_SNIPPET_DISPLAY: Record<CustomerDocSnippetKey, string> = {
  "chat-curl": chatCurlMultiline(),
  "models-curl": modelsCurlMultiline(),
  "image-curl": imageCurlMultiline(),
  "image-curl-reference": buildImageApiReferenceCurlMultiline(),
  "batch-create-curl": batchCreateCurlMultiline(),
  "batch-poll-curl": batchPollCurlMultiline(),
  "openai-sdk-config": OPENAI_SDK_CONFIG_SNIPPET,
  "openai-js": OPENAI_JS_SNIPPET,
  "openai-python": OPENAI_PYTHON_SNIPPET,
  "openai-node-batch": buildNodeBatchFetchExample(),
  "openai-python-batch": buildPythonBatchRequestsExample(),
  "cursor-config": CURSOR_CONFIG_SNIPPET,
  "cherry-config": CHERRY_STUDIO_CONFIG_SNIPPET,
};

export const CUSTOMER_DOC_SNIPPET_COPY: Record<CustomerDocSnippetKey, string> = {
  "chat-curl": chatCurlOneLine(),
  "models-curl": modelsCurlOneLine(),
  "image-curl": imageCurlOneLine(),
  "image-curl-reference": buildImageApiReferenceCurlOneLine(),
  "batch-create-curl": batchCreateCurlOneLine(),
  "batch-poll-curl": batchPollCurlOneLine(),
  "openai-sdk-config": OPENAI_SDK_CONFIG_SNIPPET,
  "openai-js": OPENAI_JS_SNIPPET,
  "openai-python": OPENAI_PYTHON_SNIPPET,
  "openai-node-batch": buildNodeBatchFetchExample(),
  "openai-python-batch": buildPythonBatchRequestsExample(),
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
  | { type: "chat-api-copy-panel"; id: string }
  | { type: "image-api-copy-panel"; id: string; showReference?: boolean }
  | { type: "batch-api-copy-panel"; id: string }
  | { type: "api-key-copy-panel"; id: string }
  | { type: "api-key-errors" }
  | { type: "copy-fields"; id: string; fields: CustomerDocCopyField[] }
  | { type: "openai-sdk-copy-panel"; id: string }
  | { type: "cursor-copy-panel"; id: string }
  | { type: "cherry-copy-panel"; id: string }
  | { type: "industry-copy-panel"; id: string }
  | { type: "industry-overview-table" }
  | { type: "error-table" }
  | { type: "error-examples-panel"; id: string }
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

const INTEGRATION_TOOL_DOC_LINKS: CustomerDocDashboardLink[] = [
  {
    id: "openai-sdk-docs",
    labelKey: "integration.navOpenAiSdk",
    href: "/dashboard/docs",
    hash: "openai-sdk",
  },
  {
    id: "cursor-docs",
    labelKey: "integration.navCursor",
    href: "/dashboard/docs",
    hash: "cursor",
  },
  {
    id: "cherry-docs",
    labelKey: "integration.navCherry",
    href: "/dashboard/docs",
    hash: "cherry-studio",
  },
  {
    id: "industry-docs",
    labelKey: "integration.navIndustry",
    href: "/dashboard/docs",
    hash: "industry-examples",
  },
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
    labelKey: "integration.cursorProviderTypeLabel",
    value: "OpenAI compatible / OpenAI-style",
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
    value: "auto-fast",
  },
  {
    id: "auth",
    labelKey: "integration.cursorAuthorizationLabel",
    value: `Authorization: Bearer ${INTEGRATION_KEY_PLACEHOLDER}`,
  },
];

export const CUSTOMER_DOC_CHERRY_FIELDS: CustomerDocCopyField[] = [
  {
    id: "name",
    labelKey: "integration.cherryProviderNameLabel",
    value: "Tokfai",
  },
  {
    id: "type",
    labelKey: "integration.cherryProviderTypeLabel",
    value: "OpenAI compatible / OpenAI-style / Custom OpenAI",
  },
  {
    id: "base",
    labelKey: "integration.cherryBaseUrlLabel",
    value: INTEGRATION_BASE_URL,
  },
  {
    id: "key",
    labelKey: "integration.cherryApiKeyLabel",
    value: INTEGRATION_KEY_PLACEHOLDER,
  },
  {
    id: "model",
    labelKey: "integration.cherryModelLabel",
    value: "auto-fast",
  },
  {
    id: "auth",
    labelKey: "integration.cherryAuthorizationLabel",
    value: `Authorization: Bearer ${INTEGRATION_KEY_PLACEHOLDER}`,
  },
  {
    id: "stream",
    labelKey: "integration.cherryStreamLabel",
    value: "Client default; disable stream if the test fails",
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
    "integration.industry.hospital.scenario4",
    "integration.industry.hospital.scenario5",
  ],
  automotive: [
    "integration.industry.automotive.scenario1",
    "integration.industry.automotive.scenario2",
    "integration.industry.automotive.scenario3",
    "integration.industry.automotive.scenario4",
    "integration.industry.automotive.scenario5",
  ],
  ecommerce: [
    "integration.industry.ecommerce.scenario1",
    "integration.industry.ecommerce.scenario2",
    "integration.industry.ecommerce.scenario3",
    "integration.industry.ecommerce.scenario4",
    "integration.industry.ecommerce.scenario5",
  ],
  support: [
    "integration.industry.support.scenario1",
    "integration.industry.support.scenario2",
    "integration.industry.support.scenario3",
    "integration.industry.support.scenario4",
    "integration.industry.support.scenario5",
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
      {
        type: "dashboard-links",
        links: [
          { id: "keys", labelKey: "integration.ctaCreateKey", href: "/dashboard/api-keys" },
          {
            id: "production-flow",
            labelKey: "integration.navProductionFlow",
            href: "/dashboard/docs",
            hash: "production-integration-flow",
          },
          {
            id: "quick-start",
            labelKey: "integration.navQuickStart",
            href: "/dashboard/docs",
            hash: "quick-start",
          },
          ...INTEGRATION_TOOL_DOC_LINKS,
        ],
      },
    ],
  },
  {
    id: "production-integration-flow",
    navKey: "integration.navProductionFlow",
    titleKey: "integration.demoFlowTitle",
    descriptionKey: "integration.demoFlowDesc",
    highlight: true,
    chapterGuide: chapter(
      "integration.onboardingChapterPurpose",
      "integration.onboardingChapterCopy",
      "integration.onboardingChapterVerify",
      "integration.onboardingChapterFailure"
    ),
    chapterNow: {
      try: {
        id: "keys",
        labelKey: "integration.demoFlowLinkKeys",
        href: "/dashboard/api-keys",
      },
      copySnippetKey: "chat-curl",
      verify: VERIFY_USAGE_CREDITS,
    },
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
      { type: "paragraph", textKey: "integration.demoFlowReconcileNote" },
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
            id: "batch-docs",
            labelKey: "integration.demoFlowLinkBatch",
            href: "/dashboard/docs",
            hash: "batch-api",
          },
          { id: "usage", labelKey: "integration.demoFlowLinkUsage", href: "/dashboard/usage" },
          { id: "credits", labelKey: "integration.demoFlowLinkCredits", href: "/dashboard/credits" },
          {
            id: "usage-credits-docs",
            labelKey: "integration.linkUsageCreditsGuide",
            href: "/dashboard/docs",
            hash: "usage-credits",
          },
          {
            id: "quick-start",
            labelKey: "integration.navQuickStart",
            href: "/dashboard/docs",
            hash: "quick-start",
          },
        ],
      },
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
      { type: "one-line-curl", id: "quick-start-live-curl", titleKey: "integration.quickStartCopyNowTitle" },
      { type: "paragraph", textKey: "integration.quickStartTerminalNote" },
      { type: "paragraph", textKey: "integration.shellCompatNote" },
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
      { type: "paragraph", textKey: "integration.quickStartExpectedResponse" },
      { type: "paragraph", textKey: "integration.quickStartFailureResponse" },
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
          {
            id: "api-key-docs",
            labelKey: "integration.navApiKey",
            href: "/dashboard/docs",
            hash: "api-key",
          },
          {
            id: "chat-api-docs",
            labelKey: "integration.navChatApi",
            href: "/dashboard/docs",
            hash: "chat-api",
          },
          {
            id: "production-flow",
            labelKey: "integration.navProductionFlow",
            href: "/dashboard/docs",
            hash: "production-integration-flow",
          },
          {
            id: "usage-credits-docs",
            labelKey: "integration.linkUsageCreditsGuide",
            href: "/dashboard/docs",
            hash: "usage-credits",
          },
          {
            id: "error-codes-docs",
            labelKey: "integration.linkErrorCodesGuide",
            href: "/dashboard/docs",
            hash: "error-codes",
          },
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
      { type: "paragraph", textKey: "integration.chatApiEndpoint" },
      { type: "paragraph", textKey: "integration.chatApiOpenAiFormat" },
      { type: "paragraph", textKey: "integration.chatApiAutoFastNote" },
      { type: "paragraph", textKey: "integration.chatApiTerminalNote" },
      { type: "chat-api-copy-panel", id: "chat-api-copy" },
      { type: "paragraph", textKey: "integration.chatApiResponseTitle" },
      {
        type: "bullets",
        items: [
          "integration.chatApiFieldContent",
          "integration.chatApiFieldRequestId",
          "integration.chatApiFieldCreditsCharged",
          "integration.chatApiFieldUsage",
          "integration.chatApiFieldRequestedModel",
          "integration.chatApiFieldResolvedModel",
        ],
      },
      { type: "paragraph", textKey: "integration.chatApiReconcileTitle" },
      {
        type: "ordered",
        items: [
          "integration.chatApiReconcileStep1",
          "integration.chatApiReconcileStep2",
          "integration.chatApiReconcileStep3",
        ],
      },
      { type: "paragraph", textKey: "integration.chatApiErrorsTitle" },
      {
        type: "bullets",
        items: [
          "integration.chatApiErrorMissingToken",
          "integration.chatApiErrorInvalidToken",
          "integration.chatApiErrorInsufficientCredits",
          "integration.chatApiErrorModelNotAvailable",
          "integration.chatApiErrorUpstreamBusy",
        ],
      },
      {
        type: "code",
        id: "chat-curl-readable",
        label: "readable multi-line",
        snippetKey: "chat-curl",
      },
      {
        type: "dashboard-links",
        links: [
          {
            id: "playground",
            labelKey: "integration.demoFlowLinkPlayground",
            href: "/dashboard/playground",
          },
          { id: "usage", labelKey: "integration.linkUsage", href: "/dashboard/usage" },
          { id: "credits", labelKey: "integration.linkCredits", href: "/dashboard/credits" },
          { id: "models", labelKey: "integration.browseModels", href: "/dashboard/models" },
          {
            id: "usage-credits-docs",
            labelKey: "integration.linkUsageCreditsGuide",
            href: "/dashboard/docs",
            hash: "usage-credits",
          },
          {
            id: "error-codes-docs",
            labelKey: "integration.linkErrorCodesGuide",
            href: "/dashboard/docs",
            hash: "error-codes",
          },
          {
            id: "batch-api",
            labelKey: "integration.demoFlowLinkBatch",
            href: "/dashboard/docs",
            hash: "batch-api",
          },
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
      { type: "paragraph", textKey: "integration.imageApiEndpoint" },
      { type: "paragraph", textKey: "integration.imageApiSameKeyNote" },
      { type: "paragraph", textKey: "integration.imageApiTerminalNote" },
      { type: "image-api-copy-panel", id: "image-api-copy", showReference: true },
      { type: "paragraph", textKey: "integration.imageApiBillingTitle" },
      {
        type: "bullets",
        items: [
          "integration.imageApiBillingSuccessOnly",
          "integration.imageApiBillingFailures",
          "integration.imageApiBillingInsufficient",
          "integration.imageApiBillingMoreExpensive",
        ],
      },
      { type: "paragraph", textKey: "integration.imageApiResponseTitle" },
      {
        type: "bullets",
        items: [
          "integration.imageApiFieldImageUrl",
          "integration.imageApiFieldRequestId",
          "integration.imageApiFieldCreditsCharged",
          "integration.imageApiFieldModel",
          "integration.imageApiFieldInputImages",
        ],
      },
      { type: "paragraph", textKey: "integration.imageApiReconcileTitle" },
      {
        type: "ordered",
        items: [
          "integration.imageApiReconcileStep1",
          "integration.imageApiReconcileStep2",
          "integration.imageApiReconcileStep3",
        ],
      },
      { type: "paragraph", textKey: "integration.imageApiErrorsTitle" },
      {
        type: "bullets",
        items: [
          "integration.imageApiErrorMissingToken",
          "integration.imageApiErrorInvalidToken",
          "integration.imageApiErrorInsufficientCredits",
          "integration.imageApiErrorInvalidPrompt",
          "integration.imageApiErrorModelNotFound",
          "integration.imageApiErrorInvalidImageUrl",
          "integration.imageApiErrorUpstreamTimeout",
          "integration.imageApiErrorRequestTooLarge",
          "integration.imageApiErrorUpstreamError",
        ],
      },
      {
        type: "code",
        id: "image-curl-readable",
        label: "readable multi-line",
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
          { id: "usage", labelKey: "integration.linkUsage", href: "/dashboard/usage" },
          { id: "credits", labelKey: "integration.linkCredits", href: "/dashboard/credits" },
          { id: "models", labelKey: "integration.browseModels", href: "/dashboard/models" },
          {
            id: "usage-credits-docs",
            labelKey: "integration.linkUsageCreditsGuide",
            href: "/dashboard/docs",
            hash: "usage-credits",
          },
          {
            id: "error-codes-docs",
            labelKey: "integration.linkErrorCodesGuide",
            href: "/dashboard/docs",
            hash: "error-codes",
          },
          {
            id: "batch-api",
            labelKey: "integration.demoFlowLinkBatch",
            href: "/dashboard/docs",
            hash: "batch-api",
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
      { type: "paragraph", textKey: "integration.batchSameKeyNote" },
      { type: "paragraph", textKey: "integration.batchNotManagedNote" },
      { type: "paragraph", textKey: "integration.batchEndpoints" },
      { type: "paragraph", textKey: "integration.batchTerminalNote" },
      { type: "batch-api-copy-panel", id: "batch-api-copy" },
      {
        type: "bullets",
        items: [
          "integration.batchScenario1",
          "integration.batchScenario2",
          "integration.batchScenario3",
          "integration.batchScenario4",
          "integration.batchScenario5",
        ],
      },
      { type: "paragraph", textKey: "integration.batchCreateResponseTitle" },
      {
        type: "bullets",
        items: [
          "integration.batchFieldId",
          "integration.batchFieldStatus",
          "integration.batchFieldRequestedModel",
          "integration.batchFieldTotalItems",
          "integration.batchFieldCreatedAt",
        ],
      },
      { type: "paragraph", textKey: "integration.batchPollResponseTitle" },
      {
        type: "bullets",
        items: [
          "integration.batchPollStatusPending",
          "integration.batchPollStatusRunning",
          "integration.batchPollStatusCompleted",
          "integration.batchPollStatusPartialFailed",
          "integration.batchPollStatusFailed",
          "integration.batchPollStatusCancelled",
          "integration.batchPollFieldSucceededItems",
          "integration.batchPollFieldFailedItems",
          "integration.batchPollFieldCreditsCharged",
        ],
      },
      { type: "paragraph", textKey: "integration.batchItemsTitle" },
      {
        type: "bullets",
        items: [
          "integration.batchItemFieldStatus",
          "integration.batchItemFieldRequestId",
          "integration.batchItemFieldCreditsCharged",
          "integration.batchItemFieldErrorCode",
          "integration.batchItemFieldErrorMessage",
          "integration.batchItemsEndpointNote",
        ],
      },
      { type: "paragraph", textKey: "integration.batchBillingTitle" },
      {
        type: "bullets",
        items: [
          "integration.batchBillingSuccessOnly",
          "integration.batchBillingFailedCancelled",
          "integration.batchBillingReconcile",
        ],
      },
      { type: "paragraph", textKey: "integration.batchReconcileTitle" },
      {
        type: "ordered",
        items: [
          "integration.batchReconcileStep1",
          "integration.batchReconcileStep2",
          "integration.batchReconcileStep3",
        ],
      },
      { type: "paragraph", textKey: "integration.batchErrorsTitle" },
      {
        type: "bullets",
        items: [
          "integration.batchErrorMissingToken",
          "integration.batchErrorInvalidToken",
          "integration.batchErrorInsufficientCredits",
          "integration.batchErrorInvalidPrompt",
          "integration.batchErrorModelNotFound",
          "integration.batchErrorUpstreamTimeout",
          "integration.batchErrorBatchCancelled",
          "integration.batchErrorRequestTooLarge",
          "integration.batchErrorTooManyRequests",
        ],
      },
      { type: "paragraph", textKey: "integration.batchCustomerPathTitle" },
      {
        type: "ordered",
        items: [
          "integration.batchCustomerPathStep1",
          "integration.batchCustomerPathStep2",
          "integration.batchCustomerPathStep3",
          "integration.batchCustomerPathStep4",
        ],
      },
      {
        type: "code",
        id: "batch-create-readable",
        label: "create batch (readable)",
        snippetKey: "batch-create-curl",
      },
      {
        type: "code",
        id: "batch-poll-readable",
        label: "poll batch (readable)",
        snippetKey: "batch-poll-curl",
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
          { id: "usage", labelKey: "integration.linkUsage", href: "/dashboard/usage" },
          { id: "credits", labelKey: "integration.linkCredits", href: "/dashboard/credits" },
          {
            id: "usage-credits-docs",
            labelKey: "integration.linkUsageCreditsGuide",
            href: "/dashboard/docs",
            hash: "usage-credits",
          },
          {
            id: "error-codes-docs",
            labelKey: "integration.linkErrorCodesGuide",
            href: "/dashboard/docs",
            hash: "error-codes",
          },
        ],
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
      { type: "paragraph", textKey: "integration.usageCreditsDifferenceTitle" },
      {
        type: "bullets",
        items: [
          "integration.usageWhatIs",
          "integration.creditsWhatIs",
        ],
      },
      { type: "paragraph", textKey: "integration.requestIdCoreNote" },
      { type: "paragraph", textKey: "integration.usageCreditsWhatChargesTitle" },
      {
        type: "bullets",
        items: [
          "integration.usageCreditsChatCharge",
          "integration.usageCreditsImageCharge",
          "integration.usageCreditsBatchCharge",
          "integration.usageCreditsFailedNote",
        ],
      },
      { type: "paragraph", textKey: "integration.usageCreditsCustomerPathTitle" },
      {
        type: "ordered",
        items: [
          "integration.usageCreditsPathStep1",
          "integration.usageCreditsPathStep2",
          "integration.usageCreditsPathStep3",
          "integration.usageCreditsPathStep4",
        ],
      },
      { type: "paragraph", textKey: "integration.usagePageFieldsTitle" },
      {
        type: "bullets",
        items: [
          "integration.usageFieldRequestId",
          "integration.usageFieldModel",
          "integration.usageFieldStatus",
          "integration.usageFieldPromptTokens",
          "integration.usageFieldCompletionTokens",
          "integration.usageFieldTotalTokens",
          "integration.usageFieldCreditsCharged",
          "integration.usageFieldCreatedAt",
          "integration.usageFieldErrorCode",
          "integration.usageFieldErrorMessage",
        ],
      },
      { type: "paragraph", textKey: "integration.creditsPageFieldsTitle" },
      {
        type: "bullets",
        items: [
          "integration.creditsFieldBalance",
          "integration.creditsFieldLedgerEntry",
          "integration.creditsFieldAmount",
          "integration.creditsFieldBalanceAfter",
          "integration.creditsFieldReason",
          "integration.creditsFieldReference",
          "integration.creditsFieldCreatedAt",
        ],
      },
      { type: "paragraph", textKey: "integration.failedRequestTitle" },
      {
        type: "bullets",
        items: [
          "integration.failedRequestStep1",
          "integration.failedRequestStep2",
          "integration.failedRequestStep3",
        ],
      },
      { type: "paragraph", textKey: "integration.insufficientCreditsTitle" },
      {
        type: "bullets",
        items: [
          "integration.insufficientCreditsStep1",
          "integration.insufficientCreditsStep2",
          "integration.insufficientCreditsStep3",
        ],
      },
      { type: "paragraph", textKey: "integration.batchReconcileDocsTitle" },
      {
        type: "bullets",
        items: [
          "integration.batchReconcileDocsSum",
          "integration.batchReconcileDocsFailed",
          "integration.batchReconcileDocsRequestId",
        ],
      },
      { type: "paragraph", textKey: "integration.reconcileExampleTitle" },
      {
        type: "ordered",
        items: [
          "integration.reconcileExampleStep1",
          "integration.reconcileExampleStep2",
          "integration.reconcileExampleStep3",
        ],
      },
      {
        type: "dashboard-links",
        links: [
          { id: "usage", labelKey: "integration.linkUsage", href: "/dashboard/usage" },
          { id: "credits", labelKey: "integration.linkCredits", href: "/dashboard/credits" },
          {
            id: "pricing",
            labelKey: "integration.linkTopUp",
            href: "/pricing",
          },
          {
            id: "error-codes-docs",
            labelKey: "integration.linkErrorCodesGuide",
            href: "/dashboard/docs",
            hash: "error-codes",
          },
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
    blocks: [
      { type: "paragraph", textKey: "integration.errorsIntroCode" },
      { type: "paragraph", textKey: "integration.errorsIntroRequestId" },
      { type: "paragraph", textKey: "integration.errorsIntroTrio" },
      { type: "paragraph", textKey: "integration.errorsChargedTitle" },
      {
        type: "bullets",
        items: [
          "integration.errorsChargedSuccess",
          "integration.errorsChargedFailed",
          "integration.errorsChargedVerify",
        ],
      },
      { type: "paragraph", textKey: "integration.errorsRequestIdTitle" },
      {
        type: "bullets",
        items: [
          "integration.errorsRequestIdHas",
          "integration.errorsRequestIdMissing",
        ],
      },
      { type: "paragraph", textKey: "integration.errorsFlowKeyTitle" },
      {
        type: "ordered",
        items: [
          "integration.errorsFlowKeyStep1",
          "integration.errorsFlowKeyStep2",
          "integration.errorsFlowKeyStep3",
        ],
      },
      { type: "paragraph", textKey: "integration.errorsFlowCreditsTitle" },
      {
        type: "ordered",
        items: [
          "integration.errorsFlowCreditsStep1",
          "integration.errorsFlowCreditsStep2",
          "integration.errorsFlowCreditsStep3",
        ],
      },
      { type: "paragraph", textKey: "integration.errorsFlowUpstreamTitle" },
      {
        type: "ordered",
        items: [
          "integration.errorsFlowUpstreamStep1",
          "integration.errorsFlowUpstreamStep2",
          "integration.errorsFlowUpstreamStep3",
        ],
      },
      { type: "paragraph", textKey: "integration.errorsTableTitle" },
      { type: "error-table" },
      { type: "paragraph", textKey: "integration.errorsExamplesTitle" },
      { type: "error-examples-panel", id: "error-examples" },
      {
        type: "dashboard-links",
        links: [
          { id: "keys", labelKey: "integration.demoFlowLinkKeys", href: "/dashboard/api-keys" },
          { id: "usage", labelKey: "integration.linkUsage", href: "/dashboard/usage" },
          { id: "credits", labelKey: "integration.linkCredits", href: "/dashboard/credits" },
          {
            id: "usage-credits-docs",
            labelKey: "integration.linkUsageCreditsGuide",
            href: "/dashboard/docs",
            hash: "usage-credits",
          },
          {
            id: "error-codes-docs",
            labelKey: "integration.linkErrorCodesGuide",
            href: "/dashboard/docs",
            hash: "error-codes",
          },
        ],
      },
    ],
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
      { type: "paragraph", textKey: "integration.sdkGatewayNote" },
      { type: "paragraph", textKey: "integration.sdkYourProjectNote" },
      { type: "openai-sdk-copy-panel", id: "openai-sdk-copy" },
      { type: "paragraph", textKey: "integration.sdkNodeTitle" },
      {
        type: "code",
        id: "openai-js",
        label: "Node.js / TypeScript",
        snippetKey: "openai-js",
      },
      { type: "paragraph", textKey: "integration.sdkPythonTitle" },
      {
        type: "code",
        id: "openai-python",
        label: "Python",
        snippetKey: "openai-python",
      },
      { type: "paragraph", textKey: "integration.sdkImageTitle" },
      {
        type: "bullets",
        items: [
          "integration.sdkImageSdkNote",
          "integration.sdkImageCurlNote",
          "integration.sdkImageResponseNote",
        ],
      },
      { type: "paragraph", textKey: "integration.sdkBatchTitle" },
      { type: "paragraph", textKey: "integration.sdkBatchExtensionNote" },
      {
        type: "code",
        id: "openai-node-batch",
        label: "Node fetch batch",
        snippetKey: "openai-node-batch",
      },
      {
        type: "code",
        id: "openai-python-batch",
        label: "Python requests batch",
        snippetKey: "openai-python-batch",
      },
      { type: "paragraph", textKey: "integration.sdkReconcileTitle" },
      {
        type: "bullets",
        items: [
          "integration.sdkReconcileRequestId",
          "integration.sdkReconcileCredits",
          "integration.sdkReconcileResolvedModel",
        ],
      },
      { type: "paragraph", textKey: "integration.sdkBillingTitle" },
      {
        type: "bullets",
        items: [
          "integration.sdkBillingSuccess",
          "integration.sdkBillingFailed",
          "integration.sdkBillingVerify",
        ],
      },
      { type: "paragraph", textKey: "integration.sdkErrorsTitle" },
      {
        type: "bullets",
        items: [
          "integration.sdkErrorAuth",
          "integration.sdkErrorCredits",
          "integration.sdkErrorModel",
          "integration.sdkErrorUpstreamBusy",
          "integration.sdkErrorTimeout",
          "integration.sdkErrorRateLimit",
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
          { id: "usage", labelKey: "integration.linkUsage", href: "/dashboard/usage" },
          { id: "credits", labelKey: "integration.linkCredits", href: "/dashboard/credits" },
          {
            id: "error-codes-docs",
            labelKey: "integration.linkErrorCodesGuide",
            href: "/dashboard/docs",
            hash: "error-codes",
          },
          {
            id: "usage-credits-docs",
            labelKey: "integration.linkUsageCreditsGuide",
            href: "/dashboard/docs",
            hash: "usage-credits",
          },
          ...INTEGRATION_TOOL_DOC_LINKS,
        ],
      },
    ],
  },
  {
    id: "cursor",
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
        id: "keys",
        labelKey: "integration.ctaCreateKey",
        href: "/dashboard/api-keys",
      },
      copySnippetKey: "cursor-config",
      verify: VERIFY_USAGE_CREDITS,
    },
    blocks: [
      { type: "paragraph", textKey: "integration.cursorGatewayNote" },
      { type: "paragraph", textKey: "integration.cursorNotAgencyNote" },
      { type: "paragraph", textKey: "integration.cursorUiVersionNote" },
      { type: "cursor-copy-panel", id: "cursor-copy" },
      { type: "paragraph", textKey: "integration.cursorPathTitle" },
      {
        type: "ordered",
        items: [
          "integration.cursorPathStep1",
          "integration.cursorPathStep2",
          "integration.cursorPathStep3",
          "integration.cursorPathStep4",
          "integration.cursorPathStep5",
          "integration.cursorPathStep6",
          "integration.cursorPathStep7",
          "integration.cursorPathStep8",
        ],
      },
      { type: "paragraph", textKey: "integration.cursorVerifyTitle" },
      {
        type: "bullets",
        items: [
          "integration.cursorVerifyInCursor",
          "integration.cursorVerifyCurl",
          "integration.cursorVerifyResponseContent",
          "integration.cursorVerifyResponseRequestId",
          "integration.cursorVerifyResponseCredits",
          "integration.cursorVerifyResponseResolvedModel",
        ],
      },
      { type: "paragraph", textKey: "integration.cursorReconcileTitle" },
      {
        type: "bullets",
        items: [
          "integration.cursorReconcileRequestId",
          "integration.cursorReconcileCredits",
          "integration.cursorReconcileResolvedModel",
        ],
      },
      { type: "paragraph", textKey: "integration.cursorBillingTitle" },
      {
        type: "bullets",
        items: [
          "integration.cursorBillingSuccess",
          "integration.cursorBillingFailed",
          "integration.cursorBillingVerify",
        ],
      },
      { type: "paragraph", textKey: "integration.cursorErrorsTitle" },
      {
        type: "bullets",
        items: [
          "integration.cursorErrorMissingToken",
          "integration.cursorErrorInvalidToken",
          "integration.cursorErrorInsufficientCredits",
          "integration.cursorErrorModel",
          "integration.cursorErrorUpstreamBusy",
          "integration.cursorErrorTimeout",
          "integration.cursorErrorRateLimit",
        ],
      },
      {
        type: "code",
        id: "cursor-config",
        label: "Cursor config",
        snippetKey: "cursor-config",
      },
      {
        type: "dashboard-links",
        links: [
          { id: "keys", labelKey: "integration.ctaCreateKey", href: "/dashboard/api-keys" },
          {
            id: "playground",
            labelKey: "integration.demoFlowLinkPlayground",
            href: "/dashboard/playground",
          },
          { id: "usage", labelKey: "integration.linkUsage", href: "/dashboard/usage" },
          { id: "credits", labelKey: "integration.linkCredits", href: "/dashboard/credits" },
          { id: "pricing", labelKey: "integration.linkTopUp", href: "/pricing" },
          {
            id: "error-codes-docs",
            labelKey: "integration.linkErrorCodesGuide",
            href: "/dashboard/docs",
            hash: "error-codes",
          },
          {
            id: "usage-credits-docs",
            labelKey: "integration.linkUsageCreditsGuide",
            href: "/dashboard/docs",
            hash: "usage-credits",
          },
          {
            id: "openai-sdk-docs",
            labelKey: "integration.navOpenAiSdk",
            href: "/dashboard/docs",
            hash: "openai-sdk",
          },
          {
            id: "cherry-docs",
            labelKey: "integration.navCherry",
            href: "/dashboard/docs",
            hash: "cherry-studio",
          },
          {
            id: "industry-docs",
            labelKey: "integration.navIndustry",
            href: "/dashboard/docs",
            hash: "industry-examples",
          },
        ],
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
        id: "keys",
        labelKey: "integration.ctaCreateKey",
        href: "/dashboard/api-keys",
      },
      copySnippetKey: "cherry-config",
      verify: VERIFY_USAGE_CREDITS,
    },
    blocks: [
      { type: "paragraph", textKey: "integration.cherryGatewayNote" },
      { type: "paragraph", textKey: "integration.cherryNotAgencyNote" },
      { type: "paragraph", textKey: "integration.cherryUiVersionNote" },
      { type: "paragraph", textKey: "integration.cherryModelsNote" },
      { type: "cherry-copy-panel", id: "cherry-copy" },
      { type: "paragraph", textKey: "integration.cherryPathTitle" },
      {
        type: "ordered",
        items: [
          "integration.cherryPathStep1",
          "integration.cherryPathStep2",
          "integration.cherryPathStep3",
          "integration.cherryPathStep4",
          "integration.cherryPathStep5",
          "integration.cherryPathStep6",
          "integration.cherryPathStep7",
          "integration.cherryPathStep8",
          "integration.cherryPathStep9",
        ],
      },
      { type: "paragraph", textKey: "integration.cherryVerifyTitle" },
      {
        type: "bullets",
        items: [
          "integration.cherryVerifyInClient",
          "integration.cherryVerifyCurl",
          "integration.cherryVerifyResponseContent",
          "integration.cherryVerifyResponseRequestId",
          "integration.cherryVerifyResponseCredits",
          "integration.cherryVerifyResponseUsage",
          "integration.cherryVerifyResponseRequestedModel",
          "integration.cherryVerifyResponseResolvedModel",
        ],
      },
      { type: "paragraph", textKey: "integration.cherryReconcileTitle" },
      {
        type: "bullets",
        items: [
          "integration.cherryReconcileUiNote",
          "integration.cherryReconcileRequestId",
          "integration.cherryReconcileRecentUsage",
          "integration.cherryReconcileCredits",
        ],
      },
      { type: "paragraph", textKey: "integration.cherryBillingTitle" },
      {
        type: "bullets",
        items: [
          "integration.cherryBillingSuccess",
          "integration.cherryBillingFailed",
          "integration.cherryBillingVerify",
        ],
      },
      { type: "paragraph", textKey: "integration.cherryErrorsTitle" },
      {
        type: "bullets",
        items: [
          "integration.cherryErrorMissingToken",
          "integration.cherryErrorInvalidToken",
          "integration.cherryErrorInsufficientCredits",
          "integration.cherryErrorModel",
          "integration.cherryErrorUpstreamBusy",
          "integration.cherryErrorTimeout",
          "integration.cherryErrorRateLimit",
          "integration.cherryErrorGatewayOverloaded",
        ],
      },
      {
        type: "code",
        id: "cherry-config",
        label: "Cherry Studio config",
        snippetKey: "cherry-config",
      },
      {
        type: "dashboard-links",
        links: [
          { id: "keys", labelKey: "integration.ctaCreateKey", href: "/dashboard/api-keys" },
          {
            id: "playground",
            labelKey: "integration.demoFlowLinkPlayground",
            href: "/dashboard/playground",
          },
          { id: "usage", labelKey: "integration.linkUsage", href: "/dashboard/usage" },
          { id: "credits", labelKey: "integration.linkCredits", href: "/dashboard/credits" },
          { id: "pricing", labelKey: "integration.linkTopUp", href: "/pricing" },
          {
            id: "error-codes-docs",
            labelKey: "integration.linkErrorCodesGuide",
            href: "/dashboard/docs",
            hash: "error-codes",
          },
          {
            id: "usage-credits-docs",
            labelKey: "integration.linkUsageCreditsGuide",
            href: "/dashboard/docs",
            hash: "usage-credits",
          },
          {
            id: "cursor-docs",
            labelKey: "integration.navCursor",
            href: "/dashboard/docs",
            hash: "cursor",
          },
          {
            id: "industry-docs",
            labelKey: "integration.navIndustry",
            href: "/dashboard/docs",
            hash: "industry-examples",
          },
        ],
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
        id: "keys",
        labelKey: "integration.ctaCreateKey",
        href: "/dashboard/api-keys",
      },
      verify: VERIFY_USAGE_CREDITS,
    },
    blocks: [
      { type: "paragraph", textKey: "integration.industryGatewayNote" },
      { type: "paragraph", textKey: "integration.industryNotAgency" },
      { type: "industry-cards", ids: [...CUSTOMER_DOC_INDUSTRY_IDS] },
      { type: "paragraph", textKey: "integration.industryOverviewTitle" },
      { type: "industry-overview-table" },
      { type: "industry-copy-panel", id: "industry-copy" },
      { type: "paragraph", textKey: "integration.industryTokfaiProvidesTitle" },
      {
        type: "bullets",
        items: [
          "integration.industryTokfaiProvides1",
          "integration.industryTokfaiProvides2",
          "integration.industryTokfaiProvides3",
          "integration.industryTokfaiProvides4",
        ],
      },
      { type: "paragraph", textKey: "integration.industryOnboardingTitle" },
      {
        type: "ordered",
        items: [
          "integration.industryOnboardingStep1",
          "integration.industryOnboardingStep2",
          "integration.industryOnboardingStep3",
          "integration.industryOnboardingStep4",
          "integration.industryOnboardingStep5",
        ],
      },
      {
        type: "dashboard-links",
        links: [
          { id: "keys", labelKey: "integration.ctaCreateKey", href: "/dashboard/api-keys" },
          {
            id: "chat-api",
            labelKey: "integration.navChatApi",
            href: "/dashboard/docs",
            hash: "chat-api",
          },
          {
            id: "image-api",
            labelKey: "integration.navImageApi",
            href: "/dashboard/docs",
            hash: "image-api",
          },
          {
            id: "batch-api",
            labelKey: "integration.navBatch",
            href: "/dashboard/docs",
            hash: "batch-api",
          },
          {
            id: "usage-credits-docs",
            labelKey: "integration.linkUsageCreditsGuide",
            href: "/dashboard/docs",
            hash: "usage-credits",
          },
          {
            id: "error-codes-docs",
            labelKey: "integration.linkErrorCodesGuide",
            href: "/dashboard/docs",
            hash: "error-codes",
          },
          { id: "usage", labelKey: "integration.linkUsage", href: "/dashboard/usage" },
          { id: "credits", labelKey: "integration.linkCredits", href: "/dashboard/credits" },
          ...INTEGRATION_TOOL_DOC_LINKS,
        ],
      },
    ],
  },
];

export const CUSTOMER_DOC_MODEL_ROWS = [
  { id: "auto-fast", labelKey: "integration.modelAutoFast" },
  { id: "auto-pro", labelKey: "integration.modelAutoPro" },
  { id: "auto-cheap", labelKey: "integration.modelAutoCheap" },
] as const;

export { CUSTOMER_INTEGRATION_ERROR_CODES, CUSTOMER_DOC_ERROR_CODES };
