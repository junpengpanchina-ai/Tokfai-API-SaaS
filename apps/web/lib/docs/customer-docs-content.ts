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
  "batch-create-curl": BATCH_CHAT_CURL,
  "batch-poll-curl": BATCH_POLL_CURL,
  "openai-sdk-config": OPENAI_SDK_CONFIG_SNIPPET,
  "openai-js": OPENAI_JS_SNIPPET,
  "openai-python": OPENAI_PYTHON_SNIPPET,
  "cursor-config": CURSOR_CONFIG_SNIPPET,
  "cherry-config": CHERRY_STUDIO_CONFIG_SNIPPET,
};

export type CustomerDocBlock =
  | { type: "paragraph"; textKey: string }
  | { type: "bullets"; items: string[] }
  | { type: "ordered"; items: string[] }
  | { type: "code"; id: string; label: string; snippetKey: CustomerDocSnippetKey }
  | { type: "copy-fields"; id: string; fields: CustomerDocCopyField[] }
  | { type: "error-table" }
  | { type: "model-list" }
  | { type: "dashboard-links"; links: CustomerDocDashboardLink[] };

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
  titleKey: string;
  descriptionKey?: string;
  highlight?: boolean;
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

export const CUSTOMER_DOC_SECTIONS: CustomerDocSection[] = [
  {
    id: "product-positioning",
    titleKey: "integration.positioningTitle",
    descriptionKey: "integration.positioningDesc",
    highlight: true,
    blocks: [
      { type: "paragraph", textKey: "integration.positioningGateway" },
      { type: "paragraph", textKey: "integration.positioningYourKey" },
      { type: "paragraph", textKey: "integration.positioningNotAgency" },
      { type: "paragraph", textKey: "integration.positioningYourStack" },
    ],
  },
  {
    id: "production-demo-flow",
    titleKey: "integration.demoFlowTitle",
    descriptionKey: "integration.demoFlowDesc",
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
    titleKey: "integration.quickStartTitle",
    descriptionKey: "integration.quickStartDesc",
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
    id: "curl-examples",
    titleKey: "integration.curlTitle",
    descriptionKey: "integration.curlDesc",
    blocks: [
      {
        type: "code",
        id: "curl-chat",
        label: "chat",
        snippetKey: "chat-curl",
      },
      {
        type: "code",
        id: "curl-models",
        label: "models",
        snippetKey: "models-curl",
      },
      {
        type: "code",
        id: "curl-batch-create",
        label: "batch create",
        snippetKey: "batch-create-curl",
      },
      {
        type: "code",
        id: "curl-batch-poll",
        label: "batch poll",
        snippetKey: "batch-poll-curl",
      },
    ],
  },
  {
    id: "openai-sdk",
    titleKey: "integration.sdkTitle",
    descriptionKey: "integration.sdkDesc",
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
    titleKey: "integration.cursorTitle",
    descriptionKey: "integration.cursorDesc",
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
    titleKey: "integration.cherryTitle",
    descriptionKey: "integration.cherryDesc",
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
    id: "models-guide",
    titleKey: "integration.modelsTitle",
    descriptionKey: "integration.modelsDesc",
    blocks: [
      { type: "model-list" },
      { type: "paragraph", textKey: "integration.modelsExplicitNote" },
    ],
  },
  {
    id: "error-codes",
    titleKey: "integration.errorsTitle",
    descriptionKey: "integration.errorsDesc",
    blocks: [{ type: "error-table" }],
  },
  {
    id: "billing-usage",
    titleKey: "integration.billingTitle",
    descriptionKey: "integration.billingDesc",
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
    id: "batch-api",
    titleKey: "integration.batchTitle",
    descriptionKey: "integration.batchDesc",
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
];

export const CUSTOMER_DOC_MODEL_ROWS = [
  { id: "auto-fast", labelKey: "integration.modelAutoFast" },
  { id: "auto-pro", labelKey: "integration.modelAutoPro" },
  { id: "auto-cheap", labelKey: "integration.modelAutoCheap" },
] as const;

export { CUSTOMER_INTEGRATION_ERROR_CODES };
