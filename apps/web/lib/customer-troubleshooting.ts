import { buildCherryConfigSnippet } from "@/lib/customer-cherry-chapter";
import { buildCursorConfigSnippet } from "@/lib/customer-cursor-chapter";
import {
  chatCurlOneLine,
  chatCurlPowerShellOneLine,
} from "@/lib/customer-curl-oneline";
import { authorizationHeader } from "@/lib/customer-integration-snippets";
import { buildOpenAiSdkConfigSnippet } from "@/lib/customer-openai-sdk-chapter";
import { TOKFAI_API_BASE_URL } from "@/lib/tokfai-api";

export type TroubleshootingChargedRule =
  | "usually_no"
  | "success_only"
  | "check_usage_credits";

export type TroubleshootingCategory =
  | "api_key"
  | "request_format"
  | "model"
  | "rate_limits"
  | "image"
  | "batch"
  | "cursor_cherry"
  | "sdk"
  | "usage_credits";

export type TroubleshootingCopySnippetId =
  | "chat-curl-oneline"
  | "powershell-curl-oneline"
  | "cursor-config"
  | "cherry-config"
  | "openai-sdk-node"
  | "authorization-header"
  | "base-url";

export type TroubleshootingCase = {
  id: string;
  category: TroubleshootingCategory;
  httpStatus: number | string;
  errorCode: string;
  titleKey: string;
  likelyCauseKey: string;
  customerActionKeys: string[];
  shouldRetry: boolean;
  charged: TroubleshootingChargedRule;
  relatedDocs: string[];
  copySnippetId?: TroubleshootingCopySnippetId;
};

export const TROUBLESHOOTING_CATEGORIES: TroubleshootingCategory[] = [
  "api_key",
  "request_format",
  "model",
  "rate_limits",
  "image",
  "batch",
  "cursor_cherry",
  "sdk",
  "usage_credits",
];

const caseKey = (id: string) => `integration.troubleshooting.case.${id}`;

function mkCase(
  id: string,
  category: TroubleshootingCategory,
  httpStatus: number | string,
  errorCode: string,
  actionCount: number,
  shouldRetry: boolean,
  charged: TroubleshootingChargedRule,
  relatedDocs: string[],
  copySnippetId?: TroubleshootingCopySnippetId
): TroubleshootingCase {
  const base = caseKey(id);
  return {
    id,
    category,
    httpStatus,
    errorCode,
    titleKey: `${base}.title`,
    likelyCauseKey: `${base}.likelyCause`,
    customerActionKeys: Array.from(
      { length: actionCount },
      (_, i) => `${base}.action${i + 1}`
    ),
    shouldRetry,
    charged,
    relatedDocs,
    copySnippetId,
  };
}

export const TROUBLESHOOTING_CASES: TroubleshootingCase[] = [
  mkCase("missing_token", "api_key", 401, "missing_token", 3, false, "usually_no", [
    "troubleshooting",
    "error-codes",
    "quick-start",
  ], "authorization-header"),
  mkCase("invalid_token", "api_key", 401, "invalid_token", 3, false, "usually_no", [
    "troubleshooting",
    "error-codes",
    "api-keys",
  ], "chat-curl-oneline"),
  mkCase(
    "insufficient_credits",
    "api_key",
    402,
    "insufficient_credits",
    3,
    false,
    "usually_no",
    ["troubleshooting", "usage-credits", "credits"]
  ),
  mkCase("route_not_found", "request_format", 404, "route_not_found", 3, false, "usually_no", [
    "troubleshooting",
    "chat-api",
    "error-codes",
  ], "base-url"),
  mkCase(
    "invalid_request_error",
    "request_format",
    400,
    "invalid_request_error",
    3,
    false,
    "usually_no",
    ["troubleshooting", "error-codes", "chat-api"]
  ),
  mkCase("invalid_prompt", "request_format", 400, "invalid_prompt", 3, false, "usually_no", [
    "troubleshooting",
    "chat-api",
    "error-codes",
  ]),
  mkCase(
    "request_body_too_large",
    "request_format",
    413,
    "request_body_too_large",
    3,
    false,
    "usually_no",
    ["troubleshooting", "error-codes", "batch-api"]
  ),
  mkCase(
    "stream_not_supported",
    "request_format",
    400,
    "stream_not_supported",
    3,
    false,
    "usually_no",
    ["troubleshooting", "chat-api", "openai-sdk"]
  ),
  mkCase("model_not_found", "model", 404, "model_not_found", 3, false, "usually_no", [
    "troubleshooting",
    "models",
    "error-codes",
  ]),
  mkCase(
    "model_not_available",
    "model",
    503,
    "model_not_available",
    3,
    true,
    "usually_no",
    ["troubleshooting", "models", "error-codes"]
  ),
  mkCase(
    "upstream_model_busy",
    "model",
    503,
    "upstream_model_busy",
    3,
    true,
    "usually_no",
    ["troubleshooting", "retry-and-backoff", "error-codes"]
  ),
  mkCase(
    "upstream_timeout",
    "model",
    504,
    "upstream_timeout",
    3,
    true,
    "check_usage_credits",
    ["troubleshooting", "usage-credits", "retry-and-backoff"]
  ),
  mkCase(
    "gateway_overloaded",
    "model",
    503,
    "gateway_overloaded",
    3,
    true,
    "usually_no",
    ["troubleshooting", "traffic-governor", "retry-and-backoff"]
  ),
  mkCase(
    "upstream_rate_limited",
    "rate_limits",
    429,
    "upstream_rate_limited",
    3,
    true,
    "usually_no",
    ["troubleshooting", "retry-and-backoff", "rate-limits-large-volume"]
  ),
  mkCase("upstream_error", "model", 502, "upstream_error", 3, true, "check_usage_credits", [
    "troubleshooting",
    "error-codes",
    "usage-credits",
  ]),
  mkCase(
    "too_many_requests",
    "rate_limits",
    429,
    "too_many_requests",
    3,
    true,
    "usually_no",
    ["troubleshooting", "traffic-governor", "rate-limits-large-volume"]
  ),
  mkCase(
    "too_many_concurrent_requests",
    "rate_limits",
    429,
    "too_many_concurrent_requests",
    3,
    true,
    "usually_no",
    ["troubleshooting", "traffic-governor", "capacity-planner"]
  ),
  mkCase("invalid_image_url", "image", 400, "invalid_image_url", 3, false, "usually_no", [
    "troubleshooting",
    "image-api",
    "error-codes",
  ]),
  mkCase(
    "image_generation_failed",
    "image",
    502,
    "image_generation_failed",
    3,
    true,
    "check_usage_credits",
    ["troubleshooting", "image-api", "usage-credits"]
  ),
  mkCase("batch_cancelled", "batch", "—", "batch_cancelled", 3, false, "success_only", [
    "troubleshooting",
    "batch-api",
    "usage-credits",
  ]),
  mkCase("batch_item_failed", "batch", "—", "batch_item_failed", 3, false, "check_usage_credits", [
    "troubleshooting",
    "batch-api",
    "usage-credits",
  ]),
  mkCase(
    "batch_pending_too_long",
    "batch",
    "—",
    "batch_pending_too_long",
    3,
    true,
    "usually_no",
    ["troubleshooting", "batch-api", "retry-and-backoff"]
  ),
  mkCase(
    "powershell_line_break",
    "sdk",
    "client",
    "powershell_line_break",
    3,
    true,
    "usually_no",
    ["troubleshooting", "quick-start", "client-software"],
    "powershell-curl-oneline"
  ),
  mkCase(
    "zsh_header_split",
    "sdk",
    "client",
    "zsh_header_split",
    3,
    true,
    "usually_no",
    ["troubleshooting", "quick-start"],
    "chat-curl-oneline"
  ),
  mkCase(
    "cursor_connection_failed",
    "cursor_cherry",
    "client",
    "cursor_connection_failed",
    3,
    false,
    "usually_no",
    ["troubleshooting", "cursor", "error-codes"],
    "cursor-config"
  ),
  mkCase(
    "cherry_connection_failed",
    "cursor_cherry",
    "client",
    "cherry_connection_failed",
    3,
    false,
    "usually_no",
    ["troubleshooting", "cherry-studio", "error-codes"],
    "cherry-config"
  ),
  mkCase(
    "sdk_base_url_wrong",
    "sdk",
    "client",
    "sdk_base_url_wrong",
    3,
    false,
    "usually_no",
    ["troubleshooting", "openai-sdk", "quick-start"],
    "base-url"
  ),
  mkCase(
    "sdk_streaming_enabled",
    "sdk",
    "client",
    "sdk_streaming_enabled",
    3,
    false,
    "usually_no",
    ["troubleshooting", "openai-sdk", "chat-api"],
    "openai-sdk-node"
  ),
];

export const TROUBLESHOOTING_DOC_HASH = "troubleshooting";

export const TROUBLESHOOTING_DASHBOARD_PATH = "/dashboard/troubleshooting";

export function troubleshootingCaseById(id: string): TroubleshootingCase | undefined {
  return TROUBLESHOOTING_CASES.find((c) => c.id === id);
}

export function troubleshootingCaseByErrorCode(code: string): TroubleshootingCase | undefined {
  const normalized = code.trim().toLowerCase();
  return TROUBLESHOOTING_CASES.find((c) => c.errorCode.toLowerCase() === normalized);
}

export function searchTroubleshootingCases(
  query: string,
  t: (key: string) => string
): TroubleshootingCase[] {
  const q = query.trim().toLowerCase();
  if (!q) return TROUBLESHOOTING_CASES;
  return TROUBLESHOOTING_CASES.filter((c) => {
    if (c.id.includes(q)) return true;
    if (c.errorCode.toLowerCase().includes(q)) return true;
    if (String(c.httpStatus).includes(q)) return true;
    if (t(c.titleKey).toLowerCase().includes(q)) return true;
    if (t(c.likelyCauseKey).toLowerCase().includes(q)) return true;
    return false;
  });
}

export function filterTroubleshootingByCategory(
  cases: TroubleshootingCase[],
  category: TroubleshootingCategory | "all"
): TroubleshootingCase[] {
  if (category === "all") return cases;
  return cases.filter((c) => c.category === category);
}

export function getTroubleshootingCopySnippet(
  snippetId: TroubleshootingCopySnippetId,
  apiKey: string
): string {
  switch (snippetId) {
    case "chat-curl-oneline":
      return chatCurlOneLine(apiKey);
    case "powershell-curl-oneline":
      return chatCurlPowerShellOneLine(apiKey);
    case "cursor-config":
      return buildCursorConfigSnippet(apiKey);
    case "cherry-config":
      return buildCherryConfigSnippet(apiKey);
    case "openai-sdk-node":
      return buildOpenAiSdkConfigSnippet(apiKey);
    case "authorization-header":
      return authorizationHeader(apiKey);
    case "base-url":
      return TOKFAI_API_BASE_URL;
    default:
      return "";
  }
}

export const TROUBLESHOOTING_DOC_LABEL_KEYS: Record<string, string> = {
  troubleshooting: "integration.troubleshooting.openGuide",
  "error-codes": "integration.navErrors",
  "quick-start": "integration.navQuickStart",
  "api-keys": "integration.ctaCreateKey",
  "usage-credits": "integration.navUsageCredits",
  credits: "integration.linkCredits",
  "chat-api": "integration.navChatApi",
  "image-api": "integration.navImageApi",
  "batch-api": "integration.navBatch",
  models: "dashboard.models.title",
  cursor: "integration.navCursor",
  "cherry-studio": "integration.navCherry",
  "openai-sdk": "integration.navOpenAiSdk",
  "client-software": "integration.navClientSoftware",
  "retry-and-backoff": "integration.navRetryBackoff",
  "traffic-governor": "integration.navTrafficGovernor",
  "rate-limits-large-volume": "integration.navLargeVolumeBatch",
  "capacity-planner": "integration.navCapacityPlanner",
};

export function troubleshootingDocHref(hash: string): string {
  if (hash === "troubleshooting") return TROUBLESHOOTING_DASHBOARD_PATH;
  if (hash === "api-keys") return "/dashboard/api-keys";
  if (hash === "credits") return "/dashboard/credits";
  if (hash === "models") return "/dashboard/models";
  return `/dashboard/docs#${hash}`;
}
