import type { Context, ErrorHandler } from "hono";

import {
  ApiError,
  buildClientErrorBody,
  coerceToApiError,
} from "../errors.js";
import { log } from "../logger.js";

function getRequestId(c: Context): string | undefined {
  return c.get("requestId" as never);
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
  if (err.status >= 500) {
    log.error("api_error_500", logFields);
  } else {
    log.warn("api_error", logFields);
  }
}

/** Send a standard API error envelope without going through onError. */
export function respondApiError(
  c: Context,
  err: ApiError,
  requestId?: string
) {
  return c.json(buildClientErrorBody(err, requestId), err.status as never);
}

/**
 * Hono catch-all error handler. Converts thrown `ApiError`s (and structured
 * errors with status/statusCode/code/message) into the standard envelope.
 * Gateway guard codes keep their HTTP status — never remapped to generic 502.
 */
export const errorHandler: ErrorHandler = (err, c) => {
  const requestId = getRequestId(c);
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

  return c.json(
    {
      error: {
        message: "Internal error.",
        code: "server_error",
        type: "server_error",
        ...(requestId ? { request_id: requestId } : {}),
      },
      ...(requestId ? { request_id: requestId } : {}),
    },
    500
  );
};

/** 404 handler when no route matches. */
export function notFoundHandler(c: Context) {
  const requestId = getRequestId(c);
  return c.json(
    {
      error: {
        message: `No route for ${c.req.method} ${c.req.path}.`,
        code: "route_not_found",
        type: "not_found",
        ...(requestId ? { request_id: requestId } : {}),
      },
      ...(requestId ? { request_id: requestId } : {}),
    },
    404
  );
}
