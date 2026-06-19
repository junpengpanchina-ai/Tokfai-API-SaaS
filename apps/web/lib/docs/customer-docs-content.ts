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
import type { SafeClientSnippetId } from "@/lib/customer-safe-client-snippets";
import type { TrafficGovernorSnippetId } from "@/lib/customer-traffic-governor-snippets";
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
  OPENAI_NODE_FETCH_SNIPPET,
  OPENAI_PYTHON_SNIPPET,
  OPENAI_SDK_CONFIG_SNIPPET,
} from "@/lib/customer-integration-snippets";
import {
  buildNodeBatchFetchExample,
  buildNodeChatFetchExample,
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
  | "openai-node-fetch"
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
  "openai-node-fetch": OPENAI_NODE_FETCH_SNIPPET,
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
  "openai-node-fetch": OPENAI_NODE_FETCH_SNIPPET,
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
  runAnywhereKey: string;
  verifyKey: string;
  failureKey: string;
};

export type CustomerDocBlock =
  | { type: "paragraph"; textKey: string }
  | { type: "bullets"; items: string[] }
  | { type: "ordered"; items: string[] }
  | {
      type: "code";
      id: string;
      label?: string;
      labelKey?: string;
      snippetKey: CustomerDocSnippetKey;
      readableOnly?: boolean;
    }
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
  | { type: "client-software-copy-panel"; id: string }
  | { type: "industry-copy-panel"; id: string }
  | { type: "safe-retry-copy-panel"; id: string; snippetIds?: SafeClientSnippetId[] }
  | {
      type: "traffic-governor-copy-panel";
      id: string;
      snippetIds?: TrafficGovernorSnippetId[];
    }
  | { type: "capacity-planner-panel"; id: string }
  | { type: "go-live-tracker-panel"; id: string }
  | { type: "integration-handoff-panel"; id: string }
  | { type: "customer-api-path-panel"; id: string }
  | { type: "integration-workbench-panel"; id: string }
  | { type: "integration-command-center-panel"; id: string }
  | { type: "troubleshooting-center-panel"; id: string; compact?: boolean }
  | { type: "industry-template-pack"; id: string }
  | { type: "capacity-model-panel"; id: string; showReadiness?: boolean }
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

const CHAPTER_RUN_ANYWHERE = "integration.chapterGuideRunAnywhere";

const chapter = (
  purposeKey: string,
  copyKey: string,
  verifyKey: string,
  failureKey: string
): CustomerDocChapterGuide => ({
  purposeKey,
  copyKey,
  runAnywhereKey: CHAPTER_RUN_ANYWHERE,
  verifyKey,
  failureKey,
});

export const CUSTOMER_DOC_SECTIONS: CustomerDocSection[] = [
  {
    id: "live-verification-vs-preparation",
    navKey: "integration.navLiveVerification",
    titleKey: "integration.liveVerificationTitle",
    descriptionKey: "integration.liveVerificationDesc",
    highlight: true,
    chapterGuide: chapter(
      "integration.liveVerificationTitle",
      "integration.liveVerificationIntro",
      "integration.liveVerificationStep4",
      "integration.liveVerificationStep5"
    ),
    chapterNow: {
      try: {
        id: "workbench-dashboard",
        labelKey: "integration.navIntegrationWorkbench",
        href: "/dashboard/integration-workbench",
      },
      copySnippetKey: "chat-curl",
      verify: VERIFY_USAGE_CREDITS,
    },
    blocks: [
      { type: "paragraph", textKey: "integration.liveVerificationIntro" },
      {
        type: "ordered",
        items: [
          "integration.liveVerificationStep1",
          "integration.liveVerificationStep2",
          "integration.liveVerificationStep3",
          "integration.liveVerificationStep4",
          "integration.liveVerificationStep5",
          "integration.liveVerificationStep6",
        ],
      },
      {
        type: "dashboard-links",
        links: [
          { id: "keys", labelKey: "integration.ctaCreateKey", href: "/dashboard/api-keys" },
          {
            id: "workbench-dashboard",
            labelKey: "integration.navIntegrationWorkbench",
            href: "/dashboard/integration-workbench",
          },
          { id: "usage", labelKey: "integration.linkUsage", href: "/dashboard/usage" },
          { id: "credits", labelKey: "integration.linkCredits", href: "/dashboard/credits" },
        ],
      },
    ],
  },
  {
    id: "customer-integration-path",
    navKey: "integration.navCustomerPath",
    titleKey: "integration.customerPathTitle",
    descriptionKey: "integration.customerPathDesc",
    highlight: true,
    chapterGuide: chapter(
      "integration.customerPathTitle",
      "integration.customerPathIntro",
      "integration.customerPathStep5",
      "integration.quickStartChapterFailure"
    ),
    chapterNow: {
      try: {
        id: "workbench-dashboard",
        labelKey: "integration.navIntegrationWorkbench",
        href: "/dashboard/integration-workbench",
      },
      copySnippetKey: "chat-curl",
      verify: VERIFY_USAGE_CREDITS,
    },
    blocks: [
      { type: "paragraph", textKey: "integration.customerPathIntro" },
      {
        type: "ordered",
        items: [
          "integration.customerPathStep1",
          "integration.customerPathStep2",
          "integration.customerPathStep3",
          "integration.customerPathStep4",
          "integration.customerPathStep5",
          "integration.customerPathStep6",
        ],
      },
      { type: "paragraph", textKey: "integration.customerPathThenConnect" },
      {
        type: "dashboard-links",
        links: [
          { id: "keys", labelKey: "integration.ctaCreateKey", href: "/dashboard/api-keys" },
          {
            id: "workbench-dashboard",
            labelKey: "integration.navIntegrationWorkbench",
            href: "/dashboard/integration-workbench",
          },
          { id: "usage", labelKey: "integration.linkUsage", href: "/dashboard/usage" },
          { id: "credits", labelKey: "integration.linkCredits", href: "/dashboard/credits" },
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
            id: "client-connector",
            labelKey: "integration.navClientConnector",
            href: "/dashboard/docs",
            hash: "client-connector-flow",
          },
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
      { type: "paragraph", textKey: "integration.quickStartCustomerOnlyNote" },
      {
        type: "bullets",
        items: [
          "integration.quickStartNoInstall",
          "integration.quickStartNoRepo",
          "integration.quickStartNoCd",
          "integration.quickStartAnyTerminal",
        ],
      },
      { type: "paragraph", textKey: "integration.quickStartPasteAndRun" },
      {
        type: "ordered",
        items: [
          "integration.quickStartStep1",
          "integration.quickStartStep2",
          "integration.quickStartStep3",
          "integration.quickStartStep4",
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
        labelKey: "integration.readableCurlLabel",
        snippetKey: "chat-curl",
        readableOnly: true,
      },
      {
        type: "dashboard-links",
        links: [
          { id: "keys", labelKey: "integration.ctaCreateKey", href: "/dashboard/api-keys" },
          {
            id: "workbench-dashboard",
            labelKey: "integration.navIntegrationWorkbench",
            href: "/dashboard/integration-workbench",
          },
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
    id: "integration-workbench",
    navKey: "integration.navIntegrationWorkbench",
    titleKey: "integration.workbenchTitle",
    descriptionKey: "integration.workbenchDesc",
    highlight: true,
    chapterGuide: chapter(
      "integration.workbenchChapterPurpose",
      "integration.workbenchChapterCopy",
      "integration.workbenchChapterVerify",
      "integration.workbenchChapterFailure"
    ),
    chapterNow: {
      try: {
        id: "workbench-dashboard",
        labelKey: "integration.navIntegrationWorkbench",
        href: "/dashboard/integration-workbench",
      },
      copySnippetKey: "chat-curl",
      verify: VERIFY_USAGE_CREDITS,
    },
    blocks: [
      { type: "paragraph", textKey: "integration.commandCenter.chapter.whatTitle" },
      { type: "paragraph", textKey: "integration.commandCenter.chapter.whatBody" },
      { type: "paragraph", textKey: "integration.commandCenter.chapter.step1Title" },
      { type: "paragraph", textKey: "integration.commandCenter.chapter.step1Body" },
      { type: "paragraph", textKey: "integration.commandCenter.chapter.step2Title" },
      { type: "paragraph", textKey: "integration.commandCenter.chapter.step2Body" },
      { type: "paragraph", textKey: "integration.commandCenter.chapter.step3Title" },
      { type: "paragraph", textKey: "integration.commandCenter.chapter.step3Body" },
      { type: "paragraph", textKey: "integration.commandCenter.chapter.step4Title" },
      { type: "paragraph", textKey: "integration.commandCenter.chapter.step4Body" },
      { type: "paragraph", textKey: "integration.commandCenter.chapter.step5Title" },
      { type: "paragraph", textKey: "integration.commandCenter.chapter.step5Body" },
      { type: "paragraph", textKey: "integration.commandCenter.chapter.step6Title" },
      { type: "paragraph", textKey: "integration.commandCenter.chapter.step6Body" },
      { type: "paragraph", textKey: "integration.commandCenter.chapter.step7Title" },
      { type: "paragraph", textKey: "integration.commandCenter.chapter.step7Body" },
      { type: "paragraph", textKey: "integration.commandCenter.chapter.step8Title" },
      { type: "paragraph", textKey: "integration.commandCenter.chapter.step8Body" },
      { type: "paragraph", textKey: "integration.commandCenter.chapter.exportTitle" },
      { type: "paragraph", textKey: "integration.commandCenter.chapter.exportBody" },
      { type: "integration-command-center-panel", id: "docs-command-center" },
      { type: "integration-workbench-panel", id: "workbench" },
      {
        type: "dashboard-links",
        links: [
          { id: "keys", labelKey: "integration.ctaCreateKey", href: "/dashboard/api-keys" },
          {
            id: "workbench-dashboard",
            labelKey: "integration.navIntegrationWorkbench",
            href: "/dashboard/integration-workbench",
          },
          {
            id: "quick-start",
            labelKey: "integration.navQuickStart",
            href: "/dashboard/docs",
            hash: "quick-start",
          },
          { id: "usage", labelKey: "integration.linkUsage", href: "/dashboard/usage" },
          { id: "credits", labelKey: "integration.linkCredits", href: "/dashboard/credits" },
          {
            id: "error-codes",
            labelKey: "integration.navErrors",
            href: "/dashboard/docs",
            hash: "error-codes",
          },
        ],
      },
    ],
  },
  {
    id: "client-connector-flow",
    navKey: "integration.navClientConnector",
    titleKey: "integration.clientConnectorTitle",
    descriptionKey: "integration.clientConnectorDesc",
    highlight: true,
    chapterGuide: chapter(
      "integration.clientConnectorChapterPurpose",
      "integration.clientConnectorChapterCopy",
      "integration.clientConnectorChapterVerify",
      "integration.clientConnectorChapterFailure"
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
      { type: "paragraph", textKey: "integration.clientConnectorIntro" },
      {
        type: "ordered",
        items: [
          "integration.clientConnectorStep1",
          "integration.clientConnectorStep2",
          "integration.clientConnectorStep3",
          "integration.clientConnectorStep4",
          "integration.clientConnectorStep5",
        ],
      },
      {
        type: "bullets",
        items: [
          "integration.clientConnectorNoInstall",
          "integration.clientConnectorNoRepo",
          "integration.clientConnectorNoCd",
        ],
      },
      { type: "paragraph", textKey: "integration.clientConnectorReconcileNote" },
      {
        type: "dashboard-links",
        links: [
          { id: "keys", labelKey: "integration.ctaCreateKey", href: "/dashboard/api-keys" },
          {
            id: "quick-start",
            labelKey: "integration.navQuickStart",
            href: "/dashboard/docs",
            hash: "quick-start",
          },
          ...INTEGRATION_TOOL_DOC_LINKS,
          { id: "usage", labelKey: "integration.linkUsage", href: "/dashboard/usage" },
          { id: "credits", labelKey: "integration.linkCredits", href: "/dashboard/credits" },
        ],
      },
    ],
  },
  {
    id: "client-software-acceptance",
    navKey: "integration.navClientSoftware",
    titleKey: "integration.clientSoftwareTitle",
    descriptionKey: "integration.clientSoftwareDesc",
    highlight: true,
    chapterGuide: chapter(
      "integration.clientSoftwareChapterPurpose",
      "integration.clientSoftwareChapterCopy",
      "integration.clientSoftwareChapterVerify",
      "integration.clientSoftwareChapterFailure"
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
      { type: "paragraph", textKey: "integration.clientSoftwareIntro" },
      { type: "client-software-copy-panel", id: "client-software-copy" },
      { type: "paragraph", textKey: "integration.clientSoftwareMacTitle" },
      {
        type: "bullets",
        items: [
          "integration.clientSoftwareMacStep1",
          "integration.clientSoftwareMacStep2",
          "integration.clientSoftwareMacStep3",
          "integration.clientSoftwareMacSuccess",
        ],
      },
      { type: "paragraph", textKey: "integration.clientSoftwarePowerShellTitle" },
      {
        type: "bullets",
        items: [
          "integration.clientSoftwarePowerShellStep1",
          "integration.clientSoftwarePowerShellStep2",
          "integration.clientSoftwarePowerShellStep3",
          "integration.clientSoftwarePowerShellSuccess",
        ],
      },
      { type: "paragraph", textKey: "integration.clientSoftwareLinuxTitle" },
      {
        type: "bullets",
        items: [
          "integration.clientSoftwareLinuxStep1",
          "integration.clientSoftwareLinuxStep2",
          "integration.clientSoftwareLinuxSuccess",
        ],
      },
      { type: "paragraph", textKey: "integration.clientSoftwareNodeTitle" },
      {
        type: "bullets",
        items: [
          "integration.clientSoftwareNodeStep1",
          "integration.clientSoftwareNodeStep2",
          "integration.clientSoftwareNodeStep3",
          "integration.clientSoftwareNodeSuccess",
        ],
      },
      { type: "paragraph", textKey: "integration.clientSoftwarePythonTitle" },
      {
        type: "bullets",
        items: [
          "integration.clientSoftwarePythonStep1",
          "integration.clientSoftwarePythonStep2",
          "integration.clientSoftwarePythonStep3",
          "integration.clientSoftwarePythonSuccess",
        ],
      },
      { type: "paragraph", textKey: "integration.clientSoftwareCursorTitle" },
      {
        type: "bullets",
        items: [
          "integration.clientSoftwareCursorStep1",
          "integration.clientSoftwareCursorStep2",
          "integration.clientSoftwareCursorStep3",
          "integration.clientSoftwareCursorSuccess",
        ],
      },
      { type: "paragraph", textKey: "integration.clientSoftwareCherryTitle" },
      {
        type: "bullets",
        items: [
          "integration.clientSoftwareCherryStep1",
          "integration.clientSoftwareCherryStep2",
          "integration.clientSoftwareCherryStep3",
          "integration.clientSoftwareCherrySuccess",
        ],
      },
      { type: "paragraph", textKey: "integration.clientSoftwareImageTitle" },
      {
        type: "bullets",
        items: [
          "integration.clientSoftwareImageStep1",
          "integration.clientSoftwareImageStep2",
          "integration.clientSoftwareImageSuccess",
        ],
      },
      { type: "paragraph", textKey: "integration.clientSoftwareBatchTitle" },
      {
        type: "bullets",
        items: [
          "integration.clientSoftwareBatchStep1",
          "integration.clientSoftwareBatchStep2",
          "integration.clientSoftwareBatchStep3",
          "integration.clientSoftwareBatchSuccess",
        ],
      },
      { type: "paragraph", textKey: "integration.clientSoftwareUsageTitle" },
      {
        type: "bullets",
        items: [
          "integration.clientSoftwareUsageStep1",
          "integration.clientSoftwareUsageStep2",
          "integration.clientSoftwareUsageStep3",
        ],
      },
      {
        type: "dashboard-links",
        links: [
          { id: "keys", labelKey: "integration.ctaCreateKey", href: "/dashboard/api-keys" },
          {
            id: "quick-start",
            labelKey: "integration.navQuickStart",
            href: "/dashboard/docs",
            hash: "quick-start",
          },
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
            id: "image-api-docs",
            labelKey: "integration.navImageApi",
            href: "/dashboard/docs",
            hash: "image-api",
          },
          {
            id: "batch-api-docs",
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
      { type: "paragraph", textKey: "integration.apiKeyModelsCatalogNote" },
      { type: "api-key-errors" },
      {
        type: "code",
        id: "api-key-models-readable",
        labelKey: "integration.readableCurlLabel",
        snippetKey: "models-curl",
        readableOnly: true,
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
        labelKey: "integration.readableCurlLabel",
        snippetKey: "chat-curl",
        readableOnly: true,
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
        labelKey: "integration.readableCurlLabel",
        snippetKey: "image-curl",
        readableOnly: true,
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
        labelKey: "integration.readableCurlLabel",
        snippetKey: "batch-create-curl",
        readableOnly: true,
      },
      {
        type: "code",
        id: "batch-poll-readable",
        labelKey: "integration.readableCurlLabel",
        snippetKey: "batch-poll-curl",
        readableOnly: true,
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
    id: "production-use",
    navKey: "integration.navProductionUse",
    titleKey: "integration.productionUseTitle",
    descriptionKey: "integration.productionUseDesc",
    highlight: true,
    chapterGuide: chapter(
      "integration.productionUseChapterPurpose",
      "integration.productionUseChapterCopy",
      "integration.productionUseChapterVerify",
      "integration.productionUseChapterFailure"
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
      { type: "paragraph", textKey: "integration.productionUseGatewayNote" },
      { type: "paragraph", textKey: "integration.productionUseKeysTitle" },
      {
        type: "bullets",
        items: [
          "integration.productionUseKeyTest",
          "integration.productionUseKeyProd",
          "integration.productionUseKeyRevoke",
          "integration.productionUseKeyPerSystem",
        ],
      },
      { type: "paragraph", textKey: "integration.productionUsePathTitle" },
      {
        type: "ordered",
        items: [
          "integration.productionUsePathStep1",
          "integration.productionUsePathStep2",
          "integration.productionUsePathStep3",
          "integration.productionUsePathStep4",
        ],
      },
      { type: "paragraph", textKey: "integration.productionUseServerTitle" },
      {
        type: "bullets",
        items: [
          "integration.productionUseServerEnv",
          "integration.productionUseServerNoClient",
          "integration.productionUseServerLeak",
        ],
      },
      { type: "paragraph", textKey: "integration.productionUseModelsTitle" },
      {
        type: "bullets",
        items: [
          "integration.productionUseModelAutoFast",
          "integration.productionUseModelAutoPro",
          "integration.productionUseModelAutoCheap",
          "integration.productionUseModelExplicit",
        ],
      },
      { type: "paragraph", textKey: "integration.productionUseBillingTitle" },
      {
        type: "bullets",
        items: [
          "integration.productionUseBillingSuccess",
          "integration.productionUseBillingFailed",
          "integration.productionUseBillingSource",
        ],
      },
      {
        type: "dashboard-links",
        links: [
          { id: "keys", labelKey: "integration.ctaCreateKey", href: "/dashboard/api-keys" },
          {
            id: "quick-start",
            labelKey: "integration.navQuickStart",
            href: "/dashboard/docs",
            hash: "quick-start",
          },
          {
            id: "client-connector",
            labelKey: "integration.navClientConnector",
            href: "/dashboard/docs",
            hash: "client-connector-flow",
          },
          { id: "usage", labelKey: "integration.linkUsage", href: "/dashboard/usage" },
          { id: "credits", labelKey: "integration.linkCredits", href: "/dashboard/credits" },
          {
            id: "capacity-docs",
            labelKey: "integration.navCapacity",
            href: "/dashboard/docs",
            hash: "capacity-and-rate-limits",
          },
          {
            id: "rate-limits-docs",
            labelKey: "integration.navRateLimits",
            href: "/dashboard/docs",
            hash: "rate-limits-large-volume",
          },
        ],
      },
    ],
  },
  {
    id: "capacity-and-rate-limits",
    navKey: "integration.navCapacity",
    titleKey: "integration.capacity.title",
    descriptionKey: "integration.capacity.desc",
    highlight: true,
    chapterGuide: chapter(
      "integration.capacity.chapterPurpose",
      "integration.capacity.chapterCopy",
      "integration.capacity.chapterVerify",
      "integration.capacity.chapterFailure"
    ),
    chapterNow: {
      try: {
        id: "batch-docs",
        labelKey: "integration.navBatch",
        href: "/dashboard/docs",
        hash: "batch-api",
      },
      verify: VERIFY_USAGE_CREDITS,
    },
    blocks: [
      { type: "paragraph", textKey: "integration.capacity.whatOnlineMeans" },
      { type: "paragraph", textKey: "integration.capacity.immediateHandling" },
      { type: "paragraph", textKey: "integration.capacity.queuedLimited" },
      { type: "paragraph", textKey: "integration.capacity.clientBehavior" },
      { type: "paragraph", textKey: "integration.capacity.slowUpstreamTitle" },
      { type: "paragraph", textKey: "integration.capacity.slowUpstreamBody" },
      { type: "paragraph", textKey: "integration.capacity.whyRateLimitsProtectTitle" },
      {
        type: "bullets",
        items: [
          "integration.capacity.whyRateLimitsProtectBalance",
          "integration.capacity.whyRateLimitsProtectUpstream",
          "integration.capacity.whyRateLimitsProtectGateway",
        ],
      },
      { type: "paragraph", textKey: "integration.capacity.whenYouSee429Title" },
      {
        type: "bullets",
        items: [
          "integration.capacity.whenYouSee429SlowDown",
          "integration.capacity.whenYouSee429Backoff",
          "integration.capacity.whenYouSee429Batch",
        ],
      },
      { type: "paragraph", textKey: "integration.capacity.whenYouSee503504Title" },
      {
        type: "bullets",
        items: [
          "integration.capacity.whenYouSee503Retry",
          "integration.capacity.whenYouSee504Retry",
          "integration.capacity.whenYouSee503504NotCharged",
        ],
      },
      { type: "paragraph", textKey: "integration.capacity.whyImageLowerConcurrency" },
      { type: "paragraph", textKey: "integration.capacity.whyBatchForVolume" },
      { type: "paragraph", textKey: "integration.capacity.customerRetryTitle" },
      {
        type: "ordered",
        items: [
          "integration.capacity.customerRetryStep1",
          "integration.capacity.customerRetryStep2",
          "integration.capacity.customerRetryStep3",
          "integration.capacity.customerRetryStep4",
          "integration.capacity.customerRetryStep5",
        ],
      },
      { type: "paragraph", textKey: "integration.capacity.readinessChecklistTitle" },
      {
        type: "bullets",
        items: [
          "integration.capacity.readiness.item1",
          "integration.capacity.readiness.item2",
          "integration.capacity.readiness.item3",
          "integration.capacity.readiness.item4",
          "integration.capacity.readiness.item5",
          "integration.capacity.readiness.item6",
          "integration.capacity.readiness.item7",
          "integration.capacity.readiness.item8",
        ],
      },
      { type: "capacity-model-panel", id: "capacity-model", showReadiness: true },
      { type: "paragraph", textKey: "integration.capacity.higherLimitsTitle" },
      { type: "paragraph", textKey: "integration.capacity.higherLimitsBody" },
      {
        type: "dashboard-links",
        links: [
          {
            id: "batch-api",
            labelKey: "integration.navBatch",
            href: "/dashboard/docs",
            hash: "batch-api",
          },
          {
            id: "rate-limits",
            labelKey: "integration.navRateLimits",
            href: "/dashboard/docs",
            hash: "rate-limits-large-volume",
          },
          {
            id: "industry-examples",
            labelKey: "integration.navIndustry",
            href: "/dashboard/docs",
            hash: "industry-examples",
          },
          { id: "usage", labelKey: "integration.linkUsage", href: "/dashboard/usage" },
          { id: "credits", labelKey: "integration.linkCredits", href: "/dashboard/credits" },
          {
            id: "service-unavailable",
            labelKey: "integration.navServiceUnavailable",
            href: "/dashboard/docs",
            hash: "service-unavailable",
          },
        ],
      },
    ],
  },
  {
    id: "rate-limits-large-volume",
    navKey: "integration.navRateLimits",
    titleKey: "integration.rateLimitsTitle",
    descriptionKey: "integration.rateLimitsDesc",
    chapterGuide: chapter(
      "integration.rateLimitsChapterPurpose",
      "integration.rateLimitsChapterCopy",
      "integration.rateLimitsChapterVerify",
      "integration.rateLimitsChapterFailure"
    ),
    chapterNow: {
      try: {
        id: "batch-docs",
        labelKey: "integration.navBatch",
        href: "/dashboard/docs",
        hash: "batch-api",
      },
      verify: VERIFY_USAGE_CREDITS,
    },
    blocks: [
      { type: "paragraph", textKey: "integration.rateLimitsWhyTitle" },
      {
        type: "bullets",
        items: [
          "integration.rateLimitsWhyBalance",
          "integration.rateLimitsWhyUpstream",
          "integration.rateLimitsWhyGateway",
        ],
      },
      { type: "paragraph", textKey: "integration.rateLimitsRampTitle" },
      {
        type: "ordered",
        items: [
          "integration.rateLimitsRampStep1",
          "integration.rateLimitsRampStep2",
          "integration.rateLimitsRampStep3",
          "integration.rateLimitsRampStep4",
          "integration.rateLimitsRampStep5",
        ],
      },
      { type: "paragraph", textKey: "integration.rateLimitsBatchTitle" },
      {
        type: "bullets",
        items: [
          "integration.rateLimitsBatchPrefer",
          "integration.rateLimitsBatchRequestId",
          "integration.rateLimitsBatchSucceeded",
          "integration.rateLimitsBatchFailed",
          "integration.rateLimitsBatchItemsEndpoint",
        ],
      },
      { type: "paragraph", textKey: "integration.rateLimitsConcurrencyTitle" },
      {
        type: "bullets",
        items: [
          "integration.rateLimitsRetryBackoff",
          "integration.rateLimitsTooManyRequests",
          "integration.rateLimitsUpstreamTimeout",
          "integration.rateLimitsGatewayOverloaded",
        ],
      },
      { type: "paragraph", textKey: "integration.rateLimitsCustomerNote" },
      {
        type: "dashboard-links",
        links: [
          {
            id: "batch-api",
            labelKey: "integration.navBatch",
            href: "/dashboard/docs",
            hash: "batch-api",
          },
          { id: "usage", labelKey: "integration.linkUsage", href: "/dashboard/usage" },
          { id: "credits", labelKey: "integration.linkCredits", href: "/dashboard/credits" },
          {
            id: "production-use-docs",
            labelKey: "integration.navProductionUse",
            href: "/dashboard/docs",
            hash: "production-use",
          },
        ],
      },
    ],
  },
  {
    id: "large-volume-batch-queue",
    navKey: "integration.navLargeVolumeBatch",
    titleKey: "integration.largeVolumeBatch.title",
    descriptionKey: "integration.largeVolumeBatch.desc",
    highlight: true,
    chapterGuide: chapter(
      "integration.largeVolumeBatch.chapterPurpose",
      "integration.largeVolumeBatch.chapterCopy",
      "integration.largeVolumeBatch.chapterVerify",
      "integration.largeVolumeBatch.chapterFailure"
    ),
    chapterNow: {
      try: {
        id: "batch-docs",
        labelKey: "integration.navBatch",
        href: "/dashboard/docs",
        hash: "batch-api",
      },
      copySnippetKey: "batch-create-curl",
      verify: VERIFY_USAGE_CREDITS,
    },
    blocks: [
      { type: "paragraph", textKey: "integration.largeVolumeBatch.whenChatTitle" },
      {
        type: "bullets",
        items: [
          "integration.largeVolumeBatch.whenChat1",
          "integration.largeVolumeBatch.whenChat2",
          "integration.largeVolumeBatch.whenChat3",
        ],
      },
      { type: "paragraph", textKey: "integration.largeVolumeBatch.whenImageTitle" },
      {
        type: "bullets",
        items: [
          "integration.largeVolumeBatch.whenImage1",
          "integration.largeVolumeBatch.whenImage2",
          "integration.largeVolumeBatch.whenImage3",
          "integration.largeVolumeBatch.whenImage4",
        ],
      },
      { type: "paragraph", textKey: "integration.largeVolumeBatch.whenBatchTitle" },
      {
        type: "bullets",
        items: [
          "integration.largeVolumeBatch.whenBatch1",
          "integration.largeVolumeBatch.whenBatch2",
          "integration.largeVolumeBatch.whenBatch3",
          "integration.largeVolumeBatch.whenBatch4",
          "integration.largeVolumeBatch.whenBatch5",
          "integration.largeVolumeBatch.whenBatch6",
        ],
      },
      { type: "customer-api-path-panel", id: "large-volume-path" },
      { type: "batch-api-copy-panel", id: "large-volume-batch-copy" },
      { type: "paragraph", textKey: "integration.largeVolumeBatch.billingTitle" },
      {
        type: "bullets",
        items: [
          "integration.largeVolumeBatch.billing1",
          "integration.largeVolumeBatch.billing2",
          "integration.largeVolumeBatch.billing3",
          "integration.largeVolumeBatch.billing4",
          "integration.largeVolumeBatch.billing5",
        ],
      },
      {
        type: "dashboard-links",
        links: [
          {
            id: "retry-docs",
            labelKey: "integration.navRetryBackoff",
            href: "/dashboard/docs",
            hash: "retry-and-backoff",
          },
          {
            id: "online-readiness",
            labelKey: "integration.nav500OnlineReadiness",
            href: "/dashboard/docs",
            hash: "500-online-readiness",
          },
          { id: "usage", labelKey: "integration.linkUsage", href: "/dashboard/usage" },
          { id: "credits", labelKey: "integration.linkCredits", href: "/dashboard/credits" },
        ],
      },
    ],
  },
  {
    id: "retry-and-backoff",
    navKey: "integration.navRetryBackoff",
    titleKey: "integration.retryBackoff.title",
    descriptionKey: "integration.retryBackoff.desc",
    chapterGuide: chapter(
      "integration.retryBackoff.chapterPurpose",
      "integration.retryBackoff.chapterCopy",
      "integration.retryBackoff.chapterVerify",
      "integration.retryBackoff.chapterFailure"
    ),
    chapterNow: {
      try: {
        id: "error-codes-docs",
        labelKey: "integration.navErrors",
        href: "/dashboard/docs",
        hash: "error-codes",
      },
      verify: VERIFY_USAGE_CREDITS,
    },
    blocks: [
      { type: "paragraph", textKey: "integration.safeRetry.whyLimitsTitle" },
      { type: "paragraph", textKey: "integration.safeRetry.whyLimitsBody" },
      { type: "paragraph", textKey: "integration.safeRetry.retryableTitle" },
      {
        type: "bullets",
        items: [
          "integration.safeRetry.retryable1",
          "integration.safeRetry.retryable2",
          "integration.safeRetry.retryable3",
        ],
      },
      { type: "paragraph", textKey: "integration.safeRetry.nonRetryableTitle" },
      {
        type: "bullets",
        items: [
          "integration.safeRetry.nonRetryable1",
          "integration.safeRetry.nonRetryable2",
          "integration.safeRetry.nonRetryable3",
        ],
      },
      { type: "paragraph", textKey: "integration.safeRetry.chatTitle" },
      { type: "paragraph", textKey: "integration.safeRetry.chatBody" },
      { type: "paragraph", textKey: "integration.safeRetry.imageTitle" },
      { type: "paragraph", textKey: "integration.safeRetry.imageBody" },
      { type: "paragraph", textKey: "integration.safeRetry.batchPollTitle" },
      { type: "paragraph", textKey: "integration.safeRetry.batchPollBody" },
      { type: "paragraph", textKey: "integration.retryBackoff.when429Title" },
      {
        type: "bullets",
        items: [
          "integration.retryBackoff.when4291",
          "integration.retryBackoff.when4292",
          "integration.retryBackoff.when4293",
          "integration.retryBackoff.when4294",
        ],
      },
      { type: "paragraph", textKey: "integration.retryBackoff.when503Title" },
      {
        type: "bullets",
        items: [
          "integration.retryBackoff.when5031",
          "integration.retryBackoff.when5032",
          "integration.retryBackoff.when5033",
          "integration.retryBackoff.when5034",
        ],
      },
      { type: "paragraph", textKey: "integration.retryBackoff.when504Title" },
      {
        type: "bullets",
        items: [
          "integration.retryBackoff.when5041",
          "integration.retryBackoff.when5042",
          "integration.retryBackoff.when5043",
          "integration.retryBackoff.when5044",
        ],
      },
      { type: "paragraph", textKey: "integration.retryBackoff.backoffTitle" },
      {
        type: "ordered",
        items: [
          "integration.retryBackoff.backoffStep1",
          "integration.retryBackoff.backoffStep2",
          "integration.retryBackoff.backoffStep3",
          "integration.retryBackoff.backoffStep4",
        ],
      },
      { type: "paragraph", textKey: "integration.safeRetry.reconcileTitle" },
      {
        type: "bullets",
        items: [
          "integration.safeRetry.reconcile1",
          "integration.safeRetry.reconcile2",
          "integration.safeRetry.reconcile3",
        ],
      },
      {
        type: "safe-retry-copy-panel",
        id: "retry-safe-clients",
        snippetIds: [
          "bash-safe-retry",
          "powershell-safe-retry",
          "node-safe-retry",
          "python-safe-retry",
          "node-safe-batch-poll",
        ],
      },
      {
        type: "dashboard-links",
        links: [
          {
            id: "large-volume-batch",
            labelKey: "integration.navLargeVolumeBatch",
            href: "/dashboard/docs",
            hash: "large-volume-batch-queue",
          },
          {
            id: "batch-api",
            labelKey: "integration.navBatch",
            href: "/dashboard/docs",
            hash: "batch-api",
          },
        ],
      },
    ],
  },
  {
    id: "traffic-governor",
    navKey: "integration.navTrafficGovernor",
    titleKey: "integration.trafficGovernor.title",
    descriptionKey: "integration.trafficGovernor.desc",
    chapterGuide: chapter(
      "integration.trafficGovernor.chapterPurpose",
      "integration.trafficGovernor.chapterCopy",
      "integration.trafficGovernor.chapterVerify",
      "integration.trafficGovernor.chapterFailure"
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
      { type: "paragraph", textKey: "integration.trafficGovernor.whyTitle" },
      { type: "paragraph", textKey: "integration.trafficGovernor.whyBody" },
      { type: "paragraph", textKey: "integration.trafficGovernor.concurrencyTableTitle" },
      {
        type: "bullets",
        items: [
          "integration.trafficGovernor.tableChatRow",
          "integration.trafficGovernor.tableResponsesRow",
          "integration.trafficGovernor.tableImageRow",
          "integration.trafficGovernor.tableBatchRow",
        ],
      },
      { type: "paragraph", textKey: "integration.trafficGovernor.nodeChatTitle" },
      { type: "paragraph", textKey: "integration.trafficGovernor.nodeChatBody" },
      { type: "paragraph", textKey: "integration.trafficGovernor.pythonChatTitle" },
      { type: "paragraph", textKey: "integration.trafficGovernor.pythonChatBody" },
      { type: "paragraph", textKey: "integration.trafficGovernor.imageLowTitle" },
      { type: "paragraph", textKey: "integration.trafficGovernor.imageLowBody" },
      { type: "paragraph", textKey: "integration.trafficGovernor.browserTitle" },
      { type: "paragraph", textKey: "integration.trafficGovernor.browserBody" },
      { type: "paragraph", textKey: "integration.trafficGovernor.reconcileTitle" },
      {
        type: "bullets",
        items: [
          "integration.trafficGovernor.reconcile1",
          "integration.trafficGovernor.reconcile2",
          "integration.trafficGovernor.reconcile3",
        ],
      },
      { type: "paragraph", textKey: "integration.trafficGovernor.troubleshoot429Title" },
      {
        type: "bullets",
        items: [
          "integration.trafficGovernor.troubleshoot4291",
          "integration.trafficGovernor.troubleshoot4292",
        ],
      },
      { type: "paragraph", textKey: "integration.trafficGovernor.troubleshoot503Title" },
      {
        type: "bullets",
        items: [
          "integration.trafficGovernor.troubleshoot5031",
          "integration.trafficGovernor.troubleshoot5032",
        ],
      },
      { type: "paragraph", textKey: "integration.trafficGovernor.troubleshoot504Title" },
      {
        type: "bullets",
        items: [
          "integration.trafficGovernor.troubleshoot5041",
          "integration.trafficGovernor.troubleshoot5042",
        ],
      },
      {
        type: "traffic-governor-copy-panel",
        id: "traffic-governor-clients",
        snippetIds: [
          "node-traffic-governor",
          "python-traffic-governor",
          "node-image-governor",
          "browser-key-caution",
        ],
      },
      {
        type: "dashboard-links",
        links: [
          {
            id: "batch-worker-docs",
            labelKey: "integration.navBatchWorker",
            href: "/dashboard/docs",
            hash: "batch-worker",
          },
          {
            id: "retry-docs",
            labelKey: "integration.navRetryBackoff",
            href: "/dashboard/docs",
            hash: "retry-and-backoff",
          },
          { id: "usage", labelKey: "integration.linkUsage", href: "/dashboard/usage" },
          { id: "credits", labelKey: "integration.linkCredits", href: "/dashboard/credits" },
        ],
      },
    ],
  },
  {
    id: "batch-worker",
    navKey: "integration.navBatchWorker",
    titleKey: "integration.batchWorker.title",
    descriptionKey: "integration.batchWorker.desc",
    chapterGuide: chapter(
      "integration.batchWorker.chapterPurpose",
      "integration.batchWorker.chapterCopy",
      "integration.batchWorker.chapterVerify",
      "integration.batchWorker.chapterFailure"
    ),
    chapterNow: {
      try: {
        id: "batch-api",
        labelKey: "integration.navBatch",
        href: "/dashboard/docs",
        hash: "batch-api",
      },
      verify: VERIFY_USAGE_CREDITS,
    },
    blocks: [
      { type: "paragraph", textKey: "integration.batchWorker.patternTitle" },
      { type: "paragraph", textKey: "integration.batchWorker.patternBody" },
      { type: "paragraph", textKey: "integration.batchWorker.pollTitle" },
      {
        type: "ordered",
        items: [
          "integration.batchWorker.pollStep1",
          "integration.batchWorker.pollStep2",
          "integration.batchWorker.pollStep3",
          "integration.batchWorker.pollStep4",
        ],
      },
      { type: "paragraph", textKey: "integration.batchWorker.summaryTitle" },
      {
        type: "bullets",
        items: [
          "integration.batchWorker.summary1",
          "integration.batchWorker.summary2",
          "integration.batchWorker.summary3",
        ],
      },
      {
        type: "traffic-governor-copy-panel",
        id: "batch-worker-clients",
        snippetIds: ["node-batch-worker", "python-batch-worker"],
      },
      {
        type: "dashboard-links",
        links: [
          {
            id: "large-volume-batch",
            labelKey: "integration.navLargeVolumeBatch",
            href: "/dashboard/docs",
            hash: "large-volume-batch-queue",
          },
          {
            id: "traffic-governor",
            labelKey: "integration.navTrafficGovernor",
            href: "/dashboard/docs",
            hash: "traffic-governor",
          },
        ],
      },
    ],
  },
  {
    id: "client-side-concurrency",
    navKey: "integration.navClientConcurrency",
    titleKey: "integration.clientConcurrency.title",
    descriptionKey: "integration.clientConcurrency.desc",
    chapterGuide: chapter(
      "integration.clientConcurrency.chapterPurpose",
      "integration.clientConcurrency.chapterCopy",
      "integration.clientConcurrency.chapterVerify",
      "integration.clientConcurrency.chapterFailure"
    ),
    chapterNow: {
      try: {
        id: "models",
        labelKey: "integration.linkModels",
        href: "/dashboard/models",
      },
      verify: VERIFY_USAGE_CREDITS,
    },
    blocks: [
      { type: "paragraph", textKey: "integration.clientConcurrency.whyTitle" },
      { type: "paragraph", textKey: "integration.clientConcurrency.whyBody" },
      { type: "paragraph", textKey: "integration.clientConcurrency.chatTitle" },
      {
        type: "bullets",
        items: [
          "integration.clientConcurrency.chat1",
          "integration.clientConcurrency.chat2",
          "integration.clientConcurrency.chat3",
        ],
      },
      { type: "paragraph", textKey: "integration.clientConcurrency.imageTitle" },
      {
        type: "bullets",
        items: [
          "integration.clientConcurrency.image1",
          "integration.clientConcurrency.image2",
          "integration.clientConcurrency.image3",
        ],
      },
      { type: "paragraph", textKey: "integration.clientConcurrency.batchTitle" },
      {
        type: "bullets",
        items: [
          "integration.clientConcurrency.batch1",
          "integration.clientConcurrency.batch2",
          "integration.clientConcurrency.batch3",
        ],
      },
      { type: "paragraph", textKey: "integration.clientConcurrency.online500Title" },
      { type: "paragraph", textKey: "integration.clientConcurrency.online500Body" },
      {
        type: "dashboard-links",
        links: [
          {
            id: "traffic-governor",
            labelKey: "integration.navTrafficGovernor",
            href: "/dashboard/docs",
            hash: "traffic-governor",
          },
          {
            id: "500-online",
            labelKey: "integration.nav500OnlineReadiness",
            href: "/dashboard/docs",
            hash: "500-online-readiness",
          },
        ],
      },
    ],
  },
  {
    id: "capacity-planner",
    navKey: "integration.navCapacityPlanner",
    titleKey: "integration.capacityPlanner.title",
    descriptionKey: "integration.capacityPlanner.desc",
    chapterGuide: chapter(
      "integration.capacityPlanner.chapterPurpose",
      "integration.capacityPlanner.chapterCopy",
      "integration.capacityPlanner.chapterVerify",
      "integration.capacityPlanner.chapterFailure"
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
      { type: "paragraph", textKey: "integration.capacityPlanner.docsChooseWorkload" },
      { type: "paragraph", textKey: "integration.capacityPlanner.docsEstimateUsers" },
      { type: "paragraph", textKey: "integration.capacityPlanner.docsConcurrency" },
      { type: "paragraph", textKey: "integration.capacityPlanner.docsModel" },
      { type: "paragraph", textKey: "integration.capacityPlanner.docsSplitTitle" },
      {
        type: "bullets",
        items: [
          "integration.capacityPlanner.docsSplitChat",
          "integration.capacityPlanner.docsSplitImage",
          "integration.capacityPlanner.docsSplitBatch",
        ],
      },
      { type: "paragraph", textKey: "integration.capacityPlanner.docsIndustryTitle" },
      {
        type: "bullets",
        items: [
          "integration.industryWorkerPatterns.hospital",
          "integration.industryWorkerPatterns.automotive",
          "integration.industryWorkerPatterns.ecommerce",
          "integration.industryWorkerPatterns.support",
        ],
      },
      { type: "capacity-planner-panel", id: "docs-capacity-planner" },
      { type: "paragraph", textKey: "integration.capacityPlanner.docsReconcile" },
      { type: "paragraph", textKey: "integration.capacityPlanner.docsErrorsTitle" },
      {
        type: "bullets",
        items: [
          "integration.trafficGovernor.troubleshoot4291",
          "integration.trafficGovernor.troubleshoot5032",
          "integration.trafficGovernor.troubleshoot5041",
        ],
      },
      {
        type: "dashboard-links",
        links: [
          {
            id: "traffic-governor",
            labelKey: "integration.navTrafficGovernor",
            href: "/dashboard/docs",
            hash: "traffic-governor",
          },
          {
            id: "batch-worker",
            labelKey: "integration.navBatchWorker",
            href: "/dashboard/docs",
            hash: "batch-worker",
          },
          { id: "usage", labelKey: "integration.linkUsage", href: "/dashboard/usage" },
          { id: "credits", labelKey: "integration.linkCredits", href: "/dashboard/credits" },
        ],
      },
    ],
  },
  {
    id: "integration-plan",
    navKey: "integration.navIntegrationPlan",
    titleKey: "integration.integrationPlan.title",
    descriptionKey: "integration.integrationPlan.desc",
    chapterGuide: chapter(
      "integration.integrationPlan.chapterPurpose",
      "integration.integrationPlan.chapterCopy",
      "integration.integrationPlan.chapterVerify",
      "integration.integrationPlan.chapterFailure"
    ),
    chapterNow: {
      try: {
        id: "capacity-planner",
        labelKey: "integration.navCapacityPlanner",
        href: "/dashboard/docs",
        hash: "capacity-planner",
      },
      verify: VERIFY_USAGE_CREDITS,
    },
    blocks: [
      { type: "paragraph", textKey: "integration.integrationPlan.whatTitle" },
      { type: "paragraph", textKey: "integration.integrationPlan.whatBody" },
      { type: "paragraph", textKey: "integration.integrationPlan.chooseTitle" },
      { type: "paragraph", textKey: "integration.integrationPlan.architectureTitle" },
      { type: "paragraph", textKey: "integration.integrationPlan.endpointTitle" },
      { type: "paragraph", textKey: "integration.integrationPlan.concurrencyTitle" },
      { type: "paragraph", textKey: "integration.integrationPlan.retryTitle" },
      { type: "paragraph", textKey: "integration.integrationPlan.securityTitle" },
      { type: "paragraph", textKey: "integration.integrationPlan.reconcileTitle" },
      { type: "paragraph", textKey: "integration.integrationPlan.goLiveTitle" },
      { type: "capacity-planner-panel", id: "docs-integration-plan-planner" },
      {
        type: "dashboard-links",
        links: [
          {
            id: "retry-docs",
            labelKey: "integration.navRetryBackoff",
            href: "/dashboard/docs",
            hash: "retry-and-backoff",
          },
          {
            id: "batch-worker",
            labelKey: "integration.navBatchWorker",
            href: "/dashboard/docs",
            hash: "batch-worker",
          },
          { id: "usage", labelKey: "integration.linkUsage", href: "/dashboard/usage" },
          { id: "credits", labelKey: "integration.linkCredits", href: "/dashboard/credits" },
        ],
      },
    ],
  },
  {
    id: "go-live-tracker",
    navKey: "integration.navGoLiveTracker",
    titleKey: "integration.goLiveTrackerChapter.title",
    descriptionKey: "integration.goLiveTrackerChapter.desc",
    chapterGuide: chapter(
      "integration.goLiveTrackerChapter.chapterPurpose",
      "integration.goLiveTrackerChapter.chapterCopy",
      "integration.goLiveTrackerChapter.chapterVerify",
      "integration.goLiveTrackerChapter.chapterFailure"
    ),
    chapterNow: {
      try: {
        id: "integration-plan",
        labelKey: "integration.navIntegrationPlan",
        href: "/dashboard/docs",
        hash: "integration-plan",
      },
      verify: VERIFY_USAGE_CREDITS,
    },
    blocks: [
      { type: "paragraph", textKey: "integration.goLiveTrackerChapter.whatTitle" },
      { type: "paragraph", textKey: "integration.goLiveTrackerChapter.whatBody" },
      { type: "paragraph", textKey: "integration.goLiveTrackerChapter.prepareTitle" },
      { type: "paragraph", textKey: "integration.goLiveTrackerChapter.prepareBody" },
      { type: "paragraph", textKey: "integration.goLiveTrackerChapter.connectTitle" },
      { type: "paragraph", textKey: "integration.goLiveTrackerChapter.connectBody" },
      { type: "paragraph", textKey: "integration.goLiveTrackerChapter.validateTitle" },
      { type: "paragraph", textKey: "integration.goLiveTrackerChapter.validateBody" },
      { type: "paragraph", textKey: "integration.goLiveTrackerChapter.scaleTitle" },
      { type: "paragraph", textKey: "integration.goLiveTrackerChapter.scaleBody" },
      { type: "paragraph", textKey: "integration.goLiveTrackerChapter.handoffTitle" },
      { type: "paragraph", textKey: "integration.goLiveTrackerChapter.handoffBody" },
      { type: "paragraph", textKey: "integration.goLiveTrackerChapter.evidenceTitle" },
      { type: "paragraph", textKey: "integration.goLiveTrackerChapter.evidenceBody" },
      { type: "paragraph", textKey: "integration.goLiveTrackerChapter.reconcileTitle" },
      { type: "paragraph", textKey: "integration.goLiveTrackerChapter.reconcileBody" },
      { type: "paragraph", textKey: "integration.goLiveTrackerChapter.finalReportTitle" },
      { type: "paragraph", textKey: "integration.goLiveTrackerChapter.finalReportBody" },
      { type: "go-live-tracker-panel", id: "docs-go-live-tracker" },
      {
        type: "dashboard-links",
        links: [
          {
            id: "usage",
            labelKey: "integration.linkUsage",
            href: "/dashboard/usage",
          },
          {
            id: "credits",
            labelKey: "integration.linkCredits",
            href: "/dashboard/credits",
          },
          {
            id: "integration-workbench",
            labelKey: "integration.navIntegrationWorkbench",
            href: "/dashboard/docs",
            hash: "integration-workbench",
          },
        ],
      },
    ],
  },
  {
    id: "slow-upstream-behavior",
    navKey: "integration.navSlowUpstream",
    titleKey: "integration.slowUpstreamChapter.title",
    descriptionKey: "integration.slowUpstreamChapter.desc",
    chapterGuide: chapter(
      "integration.slowUpstreamChapter.chapterPurpose",
      "integration.slowUpstreamChapter.chapterCopy",
      "integration.slowUpstreamChapter.chapterVerify",
      "integration.slowUpstreamChapter.chapterFailure"
    ),
    chapterNow: {
      try: {
        id: "capacity-docs",
        labelKey: "integration.navCapacity",
        href: "/dashboard/docs",
        hash: "capacity-and-rate-limits",
      },
      verify: VERIFY_USAGE_CREDITS,
    },
    blocks: [
      { type: "paragraph", textKey: "integration.slowUpstreamChapter.body" },
      { type: "paragraph", textKey: "integration.slowUpstreamChapter.imageNote" },
      { type: "paragraph", textKey: "integration.slowUpstreamChapter.queueNote" },
      { type: "paragraph", textKey: "integration.slowUpstreamChapter.billingTitle" },
      {
        type: "bullets",
        items: [
          "integration.slowUpstreamChapter.billing1",
          "integration.slowUpstreamChapter.billing2",
          "integration.slowUpstreamChapter.billing3",
          "integration.slowUpstreamChapter.billing4",
        ],
      },
      {
        type: "dashboard-links",
        links: [
          {
            id: "retry-docs",
            labelKey: "integration.navRetryBackoff",
            href: "/dashboard/docs",
            hash: "retry-and-backoff",
          },
          {
            id: "large-volume-batch",
            labelKey: "integration.navLargeVolumeBatch",
            href: "/dashboard/docs",
            hash: "large-volume-batch-queue",
          },
        ],
      },
    ],
  },
  {
    id: "500-online-readiness",
    navKey: "integration.nav500OnlineReadiness",
    titleKey: "integration.online500Readiness.title",
    descriptionKey: "integration.online500Readiness.desc",
    highlight: true,
    chapterGuide: chapter(
      "integration.online500Readiness.chapterPurpose",
      "integration.online500Readiness.chapterCopy",
      "integration.online500Readiness.chapterVerify",
      "integration.online500Readiness.chapterFailure"
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
      { type: "paragraph", textKey: "integration.online500Readiness.intro" },
      {
        type: "bullets",
        items: [
          "integration.capacity.readiness.item1",
          "integration.capacity.readiness.item2",
          "integration.capacity.readiness.item3",
          "integration.capacity.readiness.item4",
          "integration.capacity.readiness.item5",
          "integration.capacity.readiness.item6",
          "integration.capacity.readiness.item7",
          "integration.capacity.readiness.item8",
        ],
      },
      { type: "customer-api-path-panel", id: "online-500-path" },
      { type: "capacity-model-panel", id: "online-500-capacity", showReadiness: true },
      {
        type: "dashboard-links",
        links: [
          {
            id: "large-volume-batch",
            labelKey: "integration.navLargeVolumeBatch",
            href: "/dashboard/docs",
            hash: "large-volume-batch-queue",
          },
          {
            id: "workbench",
            labelKey: "integration.navIntegrationWorkbench",
            href: "/dashboard/docs",
            hash: "integration-workbench",
          },
          { id: "usage", labelKey: "integration.linkUsage", href: "/dashboard/usage" },
          { id: "credits", labelKey: "integration.linkCredits", href: "/dashboard/credits" },
        ],
      },
    ],
  },
  {
    id: "commercial-faq",
    navKey: "integration.navCommercialFaq",
    titleKey: "integration.commercialFaqTitle",
    descriptionKey: "integration.commercialFaqDesc",
    highlight: true,
    chapterGuide: chapter(
      "integration.commercialFaqChapterPurpose",
      "integration.commercialFaqChapterCopy",
      "integration.commercialFaqChapterVerify",
      "integration.commercialFaqChapterFailure"
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
      { type: "paragraph", textKey: "integration.commercialFaqWhatTitle" },
      {
        type: "bullets",
        items: [
          "integration.commercialFaqWhatApiKey",
          "integration.commercialFaqWhatGateway",
          "integration.commercialFaqWhatRouting",
          "integration.commercialFaqWhatMetering",
        ],
      },
      { type: "paragraph", textKey: "integration.commercialFaqAgencyTitle" },
      {
        type: "bullets",
        items: [
          "integration.commercialFaqAgencyNot",
          "integration.commercialFaqAgencyCustomer",
          "integration.commercialFaqAgencyTokfaiOnly",
        ],
      },
      { type: "paragraph", textKey: "integration.commercialFaqHospitalTitle" },
      {
        type: "bullets",
        items: [
          "integration.commercialFaqHospitalUse",
          "integration.commercialFaqHospitalBoundary",
        ],
      },
      { type: "paragraph", textKey: "integration.commercialFaqAutomotiveTitle" },
      {
        type: "bullets",
        items: [
          "integration.commercialFaqAutomotiveUse",
          "integration.commercialFaqAutomotiveBoundary",
        ],
      },
      { type: "paragraph", textKey: "integration.commercialFaqEcommerceTitle" },
      {
        type: "bullets",
        items: [
          "integration.commercialFaqEcommerceUse",
          "integration.commercialFaqEcommerceBoundary",
        ],
      },
      { type: "paragraph", textKey: "integration.commercialFaqAiSupportTitle" },
      {
        type: "bullets",
        items: [
          "integration.commercialFaqAiSupportYes",
          "integration.commercialFaqAiSupportCrm",
          "integration.commercialFaqAiSupportTokfaiOnly",
        ],
      },
      { type: "paragraph", textKey: "integration.commercialFaqReconcileTitle" },
      {
        type: "bullets",
        items: [
          "integration.commercialFaqReconcileRequestId",
          "integration.commercialFaqReconcileUsage",
          "integration.commercialFaqReconcileCredits",
          "integration.commercialFaqReconcileBatch",
        ],
      },
      {
        type: "dashboard-links",
        links: [
          { id: "keys", labelKey: "integration.ctaCreateKey", href: "/dashboard/api-keys" },
          {
            id: "production-use-docs",
            labelKey: "integration.navProductionUse",
            href: "/dashboard/docs",
            hash: "production-use",
          },
          {
            id: "usage-credits-docs",
            labelKey: "integration.linkUsageCreditsGuide",
            href: "/dashboard/docs",
            hash: "usage-credits",
          },
          { id: "usage", labelKey: "integration.linkUsage", href: "/dashboard/usage" },
          { id: "credits", labelKey: "integration.linkCredits", href: "/dashboard/credits" },
        ],
      },
    ],
  },
  {
    id: "service-unavailable",
    navKey: "integration.navServiceUnavailable",
    titleKey: "integration.serviceUnavailableTitle",
    descriptionKey: "integration.serviceUnavailableDesc",
    chapterGuide: chapter(
      "integration.serviceUnavailableChapterPurpose",
      "integration.serviceUnavailableChapterCopy",
      "integration.serviceUnavailableChapterVerify",
      "integration.serviceUnavailableChapterFailure"
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
      { type: "paragraph", textKey: "integration.serviceUnavailableIntro" },
      { type: "paragraph", textKey: "integration.serviceUnavailableStepKey" },
      { type: "paragraph", textKey: "integration.serviceUnavailableStepCurl" },
      {
        type: "ordered",
        items: [
          "integration.serviceUnavailableMissingToken",
          "integration.serviceUnavailableInvalidToken",
          "integration.serviceUnavailableRouteNotFound",
          "integration.serviceUnavailableUpstream",
          "integration.serviceUnavailableCredits",
        ],
      },
      { type: "paragraph", textKey: "integration.serviceUnavailableRetry" },
      { type: "paragraph", textKey: "integration.customerAcceptancePathTitle" },
      { type: "paragraph", textKey: "integration.customerAcceptancePathSteps" },
      { type: "paragraph", textKey: "integration.customerNeverOperatorScripts" },
      { type: "one-line-curl", id: "service-chat", titleKey: "integration.copyOneLineChatCurl", snippetKey: "chat-curl" },
      {
        type: "dashboard-links",
        links: [
          { id: "keys", labelKey: "integration.demoFlowLinkKeys", href: "/dashboard/api-keys" },
          { id: "usage", labelKey: "integration.linkUsage", href: "/dashboard/usage" },
          { id: "credits", labelKey: "integration.linkCredits", href: "/dashboard/credits" },
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
    id: "troubleshooting",
    navKey: "integration.navTroubleshooting",
    titleKey: "integration.troubleshooting.title",
    descriptionKey: "integration.troubleshooting.subtitle",
    highlight: true,
    chapterGuide: chapter(
      "integration.troubleshooting.title",
      "integration.troubleshooting.docs.howToRead",
      "integration.troubleshooting.docs.reconcileBody",
      "integration.troubleshooting.verifyCurlTroubleshoot"
    ),
    chapterNow: {
      try: {
        id: "troubleshooting-dashboard",
        labelKey: "integration.troubleshooting.openTroubleshooting",
        href: "/dashboard/troubleshooting",
      },
      verify: VERIFY_USAGE_CREDITS,
    },
    blocks: [
      { type: "troubleshooting-center-panel", id: "troubleshooting-panel" },
      { type: "paragraph", textKey: "integration.troubleshooting.docs.howToRead" },
      { type: "paragraph", textKey: "integration.troubleshooting.docs.httpStatusTitle" },
      {
        type: "bullets",
        items: [
          "integration.errorsFlowKeyStep1",
          "integration.errorsFlowCreditsStep1",
          "integration.errorsFlowUpstreamStep1",
          "integration.trafficGovernor.troubleshoot4291",
          "integration.trafficGovernor.troubleshoot5031",
          "integration.trafficGovernor.troubleshoot5041",
        ],
      },
      { type: "paragraph", textKey: "integration.troubleshooting.docs.errorCodeTitle" },
      { type: "error-table" },
      { type: "paragraph", textKey: "integration.troubleshooting.docs.apiKeyErrorsTitle" },
      {
        type: "bullets",
        items: [
          "integration.apiKeyErrorMissingToken",
          "integration.apiKeyErrorInvalidToken",
          "integration.troubleshooting.case.insufficient_credits.title",
        ],
      },
      { type: "paragraph", textKey: "integration.troubleshooting.docs.requestFormatTitle" },
      {
        type: "bullets",
        items: [
          "integration.troubleshooting.case.route_not_found.title",
          "integration.troubleshooting.case.invalid_request_error.title",
          "integration.troubleshooting.case.stream_not_supported.title",
        ],
      },
      { type: "paragraph", textKey: "integration.troubleshooting.docs.modelUpstreamTitle" },
      {
        type: "bullets",
        items: [
          "integration.troubleshooting.case.model_not_found.title",
          "integration.troubleshooting.case.upstream_model_busy.title",
          "integration.troubleshooting.case.upstream_timeout.title",
        ],
      },
      { type: "paragraph", textKey: "integration.troubleshooting.docs.rateLimitTitle" },
      {
        type: "bullets",
        items: [
          "integration.troubleshooting.case.too_many_requests.title",
          "integration.troubleshooting.case.too_many_concurrent_requests.title",
        ],
      },
      { type: "paragraph", textKey: "integration.troubleshooting.docs.imageErrorsTitle" },
      {
        type: "bullets",
        items: [
          "integration.troubleshooting.case.invalid_image_url.title",
          "integration.troubleshooting.case.image_generation_failed.title",
        ],
      },
      { type: "paragraph", textKey: "integration.troubleshooting.docs.batchErrorsTitle" },
      {
        type: "bullets",
        items: [
          "integration.troubleshooting.case.batch_cancelled.title",
          "integration.troubleshooting.case.batch_item_failed.title",
          "integration.troubleshooting.case.batch_pending_too_long.title",
        ],
      },
      { type: "paragraph", textKey: "integration.troubleshooting.docs.clientErrorsTitle" },
      {
        type: "bullets",
        items: [
          "integration.troubleshooting.case.powershell_line_break.title",
          "integration.troubleshooting.case.cursor_connection_failed.title",
          "integration.troubleshooting.case.cherry_connection_failed.title",
          "integration.troubleshooting.case.sdk_base_url_wrong.title",
          "integration.troubleshooting.case.sdk_streaming_enabled.title",
        ],
      },
      { type: "paragraph", textKey: "integration.troubleshooting.docs.reconcileTitle" },
      { type: "paragraph", textKey: "integration.troubleshooting.docs.reconcileBody" },
      { type: "error-examples-panel", id: "troubleshooting-error-examples" },
      {
        type: "dashboard-links",
        links: [
          {
            id: "troubleshooting-dashboard",
            labelKey: "integration.troubleshooting.openTroubleshooting",
            href: "/dashboard/troubleshooting",
          },
          { id: "usage", labelKey: "integration.linkUsage", href: "/dashboard/usage" },
          { id: "credits", labelKey: "integration.linkCredits", href: "/dashboard/credits" },
          {
            id: "workbench",
            labelKey: "integration.navIntegrationWorkbench",
            href: "/dashboard/integration-workbench",
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
      { type: "paragraph", textKey: "integration.sdkCompatibilityNote" },
      { type: "paragraph", textKey: "integration.sdkYourProjectNote" },
      { type: "openai-sdk-copy-panel", id: "openai-sdk-copy" },
      { type: "paragraph", textKey: "integration.sdkNodeTitle" },
      {
        type: "code",
        id: "openai-js",
        label: "Node.js / TypeScript",
        snippetKey: "openai-js",
      },
      { type: "paragraph", textKey: "integration.sdkFetchTitle" },
      {
        type: "code",
        id: "openai-node-fetch",
        label: "Node fetch chat",
        snippetKey: "openai-node-fetch",
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
          "integration.sdkErrorInvalidToken",
          "integration.sdkErrorCredits",
          "integration.sdkErrorModel",
          "integration.sdkErrorTimeout",
        ],
      },
      {
        type: "bullets",
        items: [
          "integration.sdkErrorAuth",
          "integration.sdkErrorUpstreamBusy",
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
      { type: "paragraph", textKey: "integration.cursorCurlFirstNote" },
      { type: "paragraph", textKey: "integration.cursorNotAgencyNote" },
      { type: "paragraph", textKey: "integration.cursorUiVersionNote" },
      { type: "paragraph", textKey: "integration.cursorModelAliasesNote" },
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
          "integration.cursorVerifyResponseRequestedModel",
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
      { type: "paragraph", textKey: "integration.cursorTroubleshootTitle" },
      {
        type: "ordered",
        items: [
          "integration.cursorTroubleshootStep1",
          "integration.cursorTroubleshootStep2",
          "integration.cursorTroubleshootStep3",
          "integration.cursorTroubleshootStep4",
          "integration.cursorTroubleshootStep5",
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
      { type: "paragraph", textKey: "integration.cherryCurlFirstNote" },
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
          "integration.cherryPathStepStream",
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
      { type: "paragraph", textKey: "integration.cherryTroubleshootTitle" },
      {
        type: "bullets",
        items: [
          "integration.cherryTroubleshootInvalidToken",
          "integration.cherryTroubleshootModel",
          "integration.cherryTroubleshootTimeout",
          "integration.cherryTroubleshootCredits",
        ],
      },
      {
        type: "bullets",
        items: [
          "integration.cherryErrorMissingToken",
          "integration.cherryErrorUpstreamBusy",
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
      { type: "paragraph", textKey: "integration.industryTemplates.batchFirstNote" },
      { type: "paragraph", textKey: "integration.industryWorkerPatternsTitle" },
      {
        type: "bullets",
        items: [
          "integration.industryWorkerPatterns.hospital",
          "integration.industryWorkerPatterns.automotive",
          "integration.industryWorkerPatterns.ecommerce",
          "integration.industryWorkerPatterns.support",
        ],
      },
      { type: "paragraph", textKey: "integration.industryTemplates.packIntro" },
      { type: "industry-template-pack", id: "industry-templates" },
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
