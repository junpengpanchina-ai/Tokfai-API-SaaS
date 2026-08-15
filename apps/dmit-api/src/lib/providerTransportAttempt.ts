/**
 * P1100 — Provider transport attempt classification + retry eligibility.
 *
 * Safe fields only (hash/count/status/code/ms/boolean). Never prompt, tools,
 * Authorization, API keys, schema, or arguments.
 */

import type { ApiError } from "../errors.js";

/** Structured attempt result for logs / failover decisions. */
export type ProviderTransportAttemptResult = {
  providerId: string;
  attemptedModel: string;
  route: string;
  attemptIndex: number;
  hasHttpResponse: boolean;
  upstreamStatus: number | null;
  errorCode: string | null;
  errorClass: TransportErrorClass | null;
  latencyMs: number;
  retryable: boolean;
  billable: boolean;
  selectedForResponse: boolean;
  retryReason: string | null;
};

export type TransportErrorClass =
  | "connect_timeout"
  | "long_silence_or_headers_timeout"
  | "socket_reset"
  | "tls_or_socket_closed"
  | "fetch_failed"
  | "body_idle_timeout"
  | "client_abort"
  | "unknown_transport";

const NO_RETRY_CODES = new Set([
  "invalid_request_error",
  "upstream_auth_error",
  "insufficient_credits",
  "client_aborted",
  "previous_response_not_found",
  "tool_call_id_mismatch",
  "tool_call_not_generated",
  "provider_tool_call_not_supported",
]);

/**
 * Classify undici / Node fetch transport cause codes into stable enums.
 * Numbers/codes only — never raw bodies.
 */
export function classifyTransportErrorClass(info: {
  errorName: string;
  errorCode: string | null;
  errorCauseCode: string | null;
  diagnosticSnippet: string;
}): TransportErrorClass {
  const hay = [
    info.errorName,
    info.errorCode ?? "",
    info.errorCauseCode ?? "",
    info.diagnosticSnippet,
  ]
    .join(" ")
    .toLowerCase();

  if (hay.includes("und_err_connect_timeout") || hay.includes("connect timeout")) {
    return "connect_timeout";
  }
  if (
    hay.includes("und_err_headers_timeout") ||
    hay.includes("headers timeout")
  ) {
    return "long_silence_or_headers_timeout";
  }
  if (hay.includes("und_err_body_timeout") || hay.includes("body timeout")) {
    return "body_idle_timeout";
  }
  if (/\beconnreset\b/.test(hay) || hay.includes("und_err_socket")) {
    return "socket_reset";
  }
  if (
    (hay.includes("tls") && (hay.includes("fail") || hay.includes("closed"))) ||
    hay.includes("other side closed") ||
    hay.includes("socket closed") ||
    hay.includes("socket hang up")
  ) {
    return "tls_or_socket_closed";
  }
  if (hay.includes("fetch failed")) {
    return "fetch_failed";
  }
  return "unknown_transport";
}

/**
 * No-HTTP-response transport errors may same-provider retry / secondary fallback.
 * HTTP status responses (400/401/429/…) are never transport-retryable here.
 */
export function isNoHttpResponseTransportError(err: ApiError): boolean {
  if (err.code !== "upstream_transport_error") return false;
  if (err.upstreamStatus != null) return false;
  if (err.code && NO_RETRY_CODES.has(err.code)) return false;
  return true;
}

/** Same-provider transport retry / secondary provider transport failover. */
export function isTransportRetryEligible(err: ApiError): boolean {
  if (err.code === "client_aborted") return false;
  if (err.code && NO_RETRY_CODES.has(err.code)) return false;
  return isNoHttpResponseTransportError(err);
}

export function transportRetryReason(err: ApiError): string {
  const cls =
    (typeof err.transportErrorClass === "string" &&
      err.transportErrorClass.trim()) ||
    classifyTransportErrorClass({
      errorName: "ApiError",
      errorCode: err.code ?? null,
      errorCauseCode: null,
      diagnosticSnippet: err.upstreamErrorSnippet ?? err.message ?? "",
    });
  return `transport_${cls}`;
}

export function buildProviderTransportAttemptResult(
  args: Partial<ProviderTransportAttemptResult> & {
    providerId: string;
    attemptedModel: string;
    route: string;
    attemptIndex: number;
    latencyMs: number;
  }
): ProviderTransportAttemptResult {
  return {
    providerId: args.providerId,
    attemptedModel: args.attemptedModel,
    route: args.route,
    attemptIndex: args.attemptIndex,
    hasHttpResponse: args.hasHttpResponse ?? false,
    upstreamStatus: args.upstreamStatus ?? null,
    errorCode: args.errorCode ?? null,
    errorClass: args.errorClass ?? null,
    latencyMs: args.latencyMs,
    retryable: args.retryable ?? false,
    billable: args.billable ?? false,
    selectedForResponse: args.selectedForResponse ?? false,
    retryReason: args.retryReason ?? null,
  };
}

/** Public SSE / JSON message after transport attempts are exhausted. */
export const TRANSPORT_RETRIES_EXHAUSTED_PUBLIC_MESSAGE =
  "Provider connection failed. Retried upstream transport attempts failed.";
