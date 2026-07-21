/**
 * Error envelope for DMIT. Every non-2xx response body looks like:
 *
 *   { "error": { "message": "...", "code": "...", "type": "..." } }
 *
 * `code` and `type` are stable enums the frontend reads to render hints.
 */

export type ErrorType =
  | "auth_error"
  | "validation_error"
  | "invalid_request_error"
  | "rate_limit_error"
  | "billing_error"
  | "not_found"
  | "upstream_error"
  | "server_error"
  | "not_implemented";

export interface ApiErrorPayload {
  message: string;
  code?: string;
  type?: ErrorType;
  request_id?: string;
}

/** Stable gateway guard codes — must not be remapped to generic 502. */
export const GATEWAY_GUARD_ERROR_CODES = new Set([
  "too_many_requests",
  "too_many_concurrent_requests",
  "rate_limited",
  "gateway_overloaded",
  "request_body_too_large",
  "upstream_timeout",
]);

/** Canonical HTTP status for known gateway / upstream guard codes. */
export const STATUS_BY_ERROR_CODE: Record<string, number> = {
  too_many_requests: 429,
  too_many_concurrent_requests: 429,
  rate_limited: 429,
  gateway_overloaded: 503,
  request_body_too_large: 413,
  upstream_timeout: 504,
  image_generation_timeout: 504,
};

export function shouldIncludeRequestIdInError(status: number): boolean {
  return status === 429 || status === 503 || status === 504;
}

export function buildClientErrorBody(
  err: ApiError,
  requestId?: string
): { error: ApiErrorPayload; request_id?: string } {
  const body = err.toJSON();
  // Never allow null/empty code or message on error envelopes.
  const rawMessage =
    typeof body.error.message === "string" ? body.error.message.trim() : "";
  // Never leak empty / literal "undefined" / "null" — Cherry Studio shows these.
  body.error.message =
    !rawMessage || rawMessage === "undefined" || rawMessage === "null"
      ? "Invalid request."
      : rawMessage;

  if (!body.error.code || !String(body.error.code).trim()) {
    body.error.code =
      err.status >= 500
        ? "server_error"
        : err.status === 401 || err.status === 403
          ? "unauthorized"
          : "invalid_request_error";
  }
  if (!body.error.type) {
    body.error.type =
      err.status >= 500
        ? "server_error"
        : err.status === 401 || err.status === 403
          ? "auth_error"
          : "invalid_request_error";
  }
  if (requestId) {
    body.error.request_id = requestId;
  }
  // Top-level request_id for all 4xx/5xx so clients never see request_id:null.
  if (requestId && (shouldIncludeRequestIdInError(err.status) || err.status >= 400)) {
    return { ...body, request_id: requestId };
  }
  return body;
}

function isErrorType(value: unknown): value is ErrorType {
  return (
    value === "auth_error" ||
    value === "validation_error" ||
    value === "invalid_request_error" ||
    value === "rate_limit_error" ||
    value === "billing_error" ||
    value === "not_found" ||
    value === "upstream_error" ||
    value === "server_error" ||
    value === "not_implemented"
  );
}

/**
 * Preserve structured errors that already carry status/statusCode/code/message
 * instead of treating them as unhandled 500s.
 */
export function coerceToApiError(err: unknown): ApiError | null {
  if (err instanceof ApiError) {
    return err;
  }

  if (!err || typeof err !== "object") {
    return null;
  }

  const candidate = err as {
    status?: unknown;
    statusCode?: unknown;
    code?: unknown;
    message?: unknown;
    type?: unknown;
    publicMessage?: unknown;
  };

  const code =
    typeof candidate.code === "string" ? candidate.code : undefined;

  const rawStatus = candidate.status ?? candidate.statusCode;
  let status =
    typeof rawStatus === "number" && rawStatus >= 400 && rawStatus < 600
      ? rawStatus
      : undefined;

  if (code && code in STATUS_BY_ERROR_CODE) {
    status = STATUS_BY_ERROR_CODE[code]!;
  }

  if (!status) {
    return null;
  }

  const message =
    typeof candidate.message === "string"
      ? candidate.message
      : err instanceof Error
        ? err.message
        : "Request failed.";
  const publicMessage =
    typeof candidate.publicMessage === "string"
      ? candidate.publicMessage
      : message;

  return new ApiError({
    status,
    message,
    publicMessage,
    code,
    type: isErrorType(candidate.type) ? candidate.type : undefined,
  });
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly type?: ErrorType;
  readonly publicMessage: string;
  /** Actual upstream HTTP status (server logs / usage_logs only). */
  readonly upstreamStatus?: number;
  /** Truncated upstream body snippet (server logs only). */
  readonly upstreamErrorSnippet?: string;

  constructor(args: {
    status: number;
    message: string;
    code?: string;
    type?: ErrorType;
    /** Optional override; defaults to `message`. */
    publicMessage?: string;
    upstreamStatus?: number;
    upstreamErrorSnippet?: string;
  }) {
    super(args.message);
    this.name = "ApiError";
    this.status = args.status;
    this.code = args.code;
    this.type = args.type;
    this.publicMessage = args.publicMessage ?? args.message;
    this.upstreamStatus = args.upstreamStatus;
    this.upstreamErrorSnippet = args.upstreamErrorSnippet;
  }

  toJSON(): { error: ApiErrorPayload } {
    return {
      error: {
        message: this.publicMessage,
        ...(this.code ? { code: this.code } : {}),
        ...(this.type ? { type: this.type } : {}),
      },
    };
  }

  static unauthorized(message = "Authentication required.", code = "unauthorized") {
    return new ApiError({ status: 401, message, code, type: "auth_error" });
  }

  static forbidden(message = "Forbidden.", code = "forbidden") {
    return new ApiError({ status: 403, message, code, type: "auth_error" });
  }

  static notFound(message = "Not found.", code = "not_found") {
    return new ApiError({ status: 404, message, code, type: "not_found" });
  }

  static badRequest(message: string, code = "invalid_request_error") {
    return new ApiError({
      status: 400,
      message,
      code,
      type: "invalid_request_error",
    });
  }

  static notImplemented(message = "Not implemented yet.", code = "not_implemented") {
    return new ApiError({
      status: 501,
      message,
      code,
      type: "not_implemented",
    });
  }

  static internal(message = "Internal error.", code = "server_error") {
    // Public response is ALWAYS generic. Detailed `message` only shows up in
    // server logs (see middleware/error.ts), never in the JSON response.
    return new ApiError({
      status: 500,
      message,
      publicMessage: "Internal error.",
      code,
      type: "server_error",
    });
  }

  static tooManyRequests(
    message = "Too many requests.",
    publicMessage = "请求过于频繁，请降低并发或稍后重试。"
  ) {
    return new ApiError({
      status: 429,
      message,
      publicMessage,
      code: "too_many_requests",
      type: "rate_limit_error",
    });
  }

  static tooManyConcurrentRequests(
    message = "Too many concurrent requests.",
    publicMessage = "当前并发请求过多，请降低并发。"
  ) {
    return new ApiError({
      status: 429,
      message,
      publicMessage,
      code: "too_many_concurrent_requests",
      type: "rate_limit_error",
    });
  }

  /** Heavy /v1/responses concurrency cap — client vocabulary: rate_limited. */
  static heavyResponsesRateLimited(
    message = "Too many concurrent heavy responses.",
    publicMessage = "当前长任务并发过多，请稍后重试。"
  ) {
    return new ApiError({
      status: 429,
      message,
      publicMessage,
      code: "rate_limited",
      type: "rate_limit_error",
    });
  }

  static gatewayOverloaded(
    message = "Gateway overloaded.",
    publicMessage = "网关繁忙，请稍后重试。"
  ) {
    return new ApiError({
      status: 503,
      message,
      publicMessage,
      code: "gateway_overloaded",
      type: "upstream_error",
    });
  }

  static payloadTooLarge(
    message = "Request body too large.",
    publicMessage = "Request body exceeds the maximum allowed size."
  ) {
    return new ApiError({
      status: 413,
      message,
      publicMessage,
      code: "request_body_too_large",
      type: "validation_error",
    });
  }

  static requestTimeout(
    message = "Total request timeout exceeded.",
    publicMessage = "上游模型响应超时，请稍后重试或切换模型。"
  ) {
    return new ApiError({
      status: 504,
      message,
      publicMessage,
      code: "upstream_timeout",
      type: "upstream_error",
      upstreamStatus: 504,
      upstreamErrorSnippet: "total_request_timeout",
    });
  }
}
