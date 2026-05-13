import type { Context, ErrorHandler } from "hono";

import { ApiError } from "../errors.js";
import { log } from "../logger.js";

function getRequestId(c: Context): string | undefined {
  return c.get("requestId" as never);
}

/**
 * Hono catch-all error handler. Converts thrown `ApiError`s into the
 * standard envelope. Anything else becomes a 500 with a generic message —
 * we never leak internal error details to the client.
 */
export const errorHandler: ErrorHandler = (err, c) => {
  const requestId = getRequestId(c);

  if (err instanceof ApiError) {
    if (err.status >= 500) {
      log.error("api_error_500", {
        requestId,
        message: err.message,
        code: err.code,
      });
    } else {
      log.warn("api_error", {
        requestId,
        status: err.status,
        code: err.code,
      });
    }
    return c.json(err.toJSON(), err.status as never);
  }

  log.error("unhandled", {
    requestId,
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });

  return c.json(
    {
      error: {
        message: "Internal error.",
        code: "server_error",
        type: "server_error",
      },
    },
    500
  );
};

/** 404 handler when no route matches. */
export function notFoundHandler(c: Context) {
  return c.json(
    {
      error: {
        message: `No route for ${c.req.method} ${c.req.path}.`,
        code: "route_not_found",
        type: "not_found",
      },
    },
    404
  );
}
