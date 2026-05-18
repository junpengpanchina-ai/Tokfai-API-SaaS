import type { Context, ErrorHandler } from "hono";

import { ApiError } from "../errors.js";
import { log } from "../logger.js";

function getRequestId(c: Context): string | undefined {
  return c.get("requestId" as never);
}

function getRoute(c: Context): string {
  return `${c.req.method} ${c.req.path}`;
}

/**
 * Hono catch-all error handler. Converts thrown `ApiError`s into the
 * standard envelope. Anything else becomes a 500 with a generic message —
 * we never leak internal error details to the client.
 */
export const errorHandler: ErrorHandler = (err, c) => {
  const requestId = getRequestId(c);
  const route = getRoute(c);

  if (err instanceof ApiError) {
    if (err.status >= 500) {
      log.error("api_error_500", {
        requestId,
        route,
        status: err.status,
        code: err.code,
        message: err.publicMessage,
      });
    } else {
      log.warn("api_error", {
        requestId,
        route,
        status: err.status,
        code: err.code,
        message: err.publicMessage,
      });
    }
    return c.json(err.toJSON(), err.status as never);
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
