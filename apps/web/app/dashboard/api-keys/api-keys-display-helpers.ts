import { TOKFAI_API_BASE_URL, TOKFAI_API_KEY_PLACEHOLDER } from "@/lib/dashboard-safe/constants";

export type ApiKeyStatusTone = "success" | "outline";

export type ApiKeyActionErrorState = {
  message: string;
  status: number;
  code?: string;
  requestId?: string;
  method?: string;
  url?: string;
};

type DmitApiErrorLike = {
  name: string;
  message: string;
  status: number;
  code?: string;
  body?: unknown;
  requestMethod?: string;
  requestUrl?: string;
};

function isDmitApiError(err: unknown): err is DmitApiErrorLike {
  return (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    (err as DmitApiErrorLike).name === "DmitApiError" &&
    typeof (err as DmitApiErrorLike).status === "number"
  );
}

function extractRequestIdFromBody(body: unknown): string | undefined {
  if (!body || typeof body !== "object") {
    return undefined;
  }

  const record = body as Record<string, unknown>;
  if (typeof record.request_id === "string" && record.request_id.trim()) {
    return record.request_id.trim();
  }

  const error = record.error;
  if (error && typeof error === "object") {
    const nested = error as Record<string, unknown>;
    if (typeof nested.request_id === "string" && nested.request_id.trim()) {
      return nested.request_id.trim();
    }
  }

  return undefined;
}

import { formatIsoDateTimeUtc } from "@/lib/dashboard-safe/format-helpers";

export function formatApiKeyDateTime(iso: string): string {
  return formatIsoDateTimeUtc(iso, iso);
}

export function maskApiKeyPrefix(prefix: string): string {
  return prefix.trim() || "—";
}

export function getApiKeyStatusLabel(
  status: string,
  t: (key: string) => string
): string {
  if (status === "active") return t("dashboard.apiKeys.active");
  if (status === "revoked") return t("dashboard.apiKeys.revoked");
  return status;
}

export function getApiKeyStatusTone(status: string): ApiKeyStatusTone {
  if (status === "active") return "success";
  return "outline";
}

export function getApiKeyErrorMessage(
  status: number,
  code?: string | null,
  fallback?: string
): string {
  const normalized = code?.toLowerCase() ?? "";

  if (status === 401 || status === 403) {
    return "Please sign in again";
  }

  if (status === 409 && normalized === "api_key_name_exists") {
    return "Active key with this name already exists.";
  }

  if (
    status >= 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  ) {
    return "Unable to process right now. Please try again later.";
  }

  if (status === 401 || normalized === "invalid_token") {
    return "Invalid token";
  }

  if (status === 402 || normalized === "insufficient_credits") {
    return "Not enough credits";
  }

  if (
    status >= 500 ||
    normalized === "upstream_error" ||
    normalized === "upstream_auth_error" ||
    normalized === "upstream_rate_limited"
  ) {
    return "Model temporarily unavailable";
  }

  if (fallback?.trim()) {
    return fallback.trim();
  }

  return "Something went wrong. Please try again.";
}

export function authorizationHeader(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER
): string {
  return `Authorization: Bearer ${apiKey}`;
}

export function buildCursorConfigSnippet(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER
): string {
  return `Provider type: OpenAI compatible / Custom OpenAI
Base URL: ${TOKFAI_API_BASE_URL}
API Key: ${apiKey}
Model: auto-fast
Authorization: Bearer ${apiKey}`;
}

export function buildCherryConfigSnippet(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER
): string {
  return `Provider name: Tokfai
Provider type: OpenAI compatible / Custom OpenAI
Base URL: ${TOKFAI_API_BASE_URL}
API Key: ${apiKey}
Model: auto-fast
Authorization: Bearer ${apiKey}
Stream: Client default; disable stream if the test fails`;
}

export function toApiKeyActionError(
  err: unknown,
  fallback?: { method: string; url: string }
): ApiKeyActionErrorState {
  if (isDmitApiError(err)) {
    const requestId = extractRequestIdFromBody(err.body);
    const detail =
      err.code && err.message
        ? `${err.message} (${err.code})`
        : err.message;
    return {
      message: getApiKeyErrorMessage(err.status, err.code, detail),
      status: err.status,
      code: err.code,
      requestId,
      method: err.requestMethod ?? fallback?.method,
      url: err.requestUrl ?? fallback?.url,
    };
  }
  if (err instanceof Error) {
    return {
      message: getApiKeyErrorMessage(0, undefined, err.message),
      status: 0,
      method: fallback?.method,
      url: fallback?.url,
    };
  }
  return {
    message: getApiKeyErrorMessage(500),
    status: 500,
    method: fallback?.method,
    url: fallback?.url,
  };
}
