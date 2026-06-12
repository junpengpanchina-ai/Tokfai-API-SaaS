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

  static badRequest(message: string, code = "bad_request") {
    return new ApiError({
      status: 400,
      message,
      code,
      type: "validation_error",
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
