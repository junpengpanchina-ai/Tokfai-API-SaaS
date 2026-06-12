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
}
