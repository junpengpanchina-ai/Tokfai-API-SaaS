import type { Context, ErrorHandler } from "hono";

import {
  ApiError,
  buildClientErrorBody,
  coerceToApiError,
} from "../errors.js";
import { log } from "../logger.js";
import { generateRequestId } from "./requestId.js";

function getRequestId(c: Context): string | undefined {
  const raw = c.get("requestId" as never);
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

function resolveRequestId(c: Context, requestId?: string): string {
  if (typeof requestId === "string" && requestId.trim()) {
    return requestId.trim();
  }
  return getRequestId(c) ?? generateRequestId();
}

function getRoute(c: Context): string {
  return `${c.req.method} ${c.req.path}`;
}

function logApiError(
  err: ApiError,
  requestId: string | undefined,
  route: string
): void {
  const logFields = {
    requestId,
    route,
    status: err.status,
    code: err.code,
    message: err.publicMessage,
    upstreamStatus: err.upstreamStatus,
    upstreamErrorMessage: err.upstreamErrorSnippet,
  };
  // Always status-specific (api_error_400, api_error_504, …) — never a bare
  // "api_error" msg, and never api_error_500 when status is 504 / other 5xx.
  const msg = `api_error_${err.status}`;
  if (err.status >= 500) {
    log.error(msg, logFields);
  } else {
    log.warn(msg, logFields);
  }
}

/**
 * Send a standard API error envelope without going through onError.
 * Always writes a non-empty JSON body (never Content-Length 0).
 *
 * Uses `new Response` (not c.json / c.body) so stream=true / Cherry clients
 * never observe an empty 400 body from Hono context races.
 */
export function respondApiError(
  c: Context,
  err: ApiError,
  requestId?: string
) {
  const resolvedId = resolveRequestId(c, requestId);
  // Best-effort: keep X-Request-Id on the Hono context for downstream middleware.
  try {
    c.header("X-Request-Id", resolvedId);
  } catch {
    // Context may already be finalized; Response headers below still carry the id.
  }

  const payload = buildClientErrorBody(err, resolvedId);
  let text = JSON.stringify(payload);
  if (
    !text ||
    text === "{}" ||
    !payload?.error?.message ||
    !payload?.error?.code ||
    !payload?.error?.type
  ) {
    text = JSON.stringify({
      error: {
        message: "Invalid request.",
        type: "invalid_request_error",
        code: "invalid_request_error",
        request_id: resolvedId,
      },
      request_id: resolvedId,
    });
  }

  return new Response(text, {
    status: err.status || 400,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Request-Id": resolvedId,
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Hono catch-all error handler. Converts thrown `ApiError`s (and structured
 * errors with status/statusCode/code/message) into the standard envelope.
 * Gateway guard codes keep their HTTP status — never remapped to generic 502.
 */
export const errorHandler: ErrorHandler = (err, c) => {
  const requestId = resolveRequestId(c);
  const route = getRoute(c);
  const apiErr = coerceToApiError(err);

  if (apiErr) {
    logApiError(apiErr, requestId, route);
    return respondApiError(c, apiErr, requestId);
  }

  log.error("unhandled", {
    requestId,
    route,
    status: 500,
    code: "server_error",
    message: "Internal error.",
  });

  return respondApiError(
    c,
    ApiError.internal("Internal error.", "server_error"),
    requestId
  );
};

/** 404 handler when no route matches. */
export function notFoundHandler(c: Context) {
  const requestId = resolveRequestId(c);
  return respondApiError(
    c,
    ApiError.notFound(
      `No route for ${c.req.method} ${c.req.path}.`,
      "route_not_found"
    ),
    requestId
  );
}
