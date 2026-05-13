import { randomBytes } from "node:crypto";
import type { MiddlewareHandler } from "hono";

/**
 * Generates a `req_xxxxxxxxxxxx` id per request, stashes it on the context
 * and echoes it back as `X-Request-Id`. Used as the foreign key into
 * `usage_logs.request_id` and as the human-visible reference in error logs.
 */
export function generateRequestId(): string {
  return `req_${randomBytes(12).toString("base64url")}`;
}

export const requestIdMiddleware: MiddlewareHandler = async (c, next) => {
  const incoming = c.req.header("x-request-id");
  const id =
    incoming && /^[A-Za-z0-9._-]{6,80}$/.test(incoming)
      ? incoming
      : generateRequestId();
  c.set("requestId", id);
  c.header("X-Request-Id", id);
  await next();
};
