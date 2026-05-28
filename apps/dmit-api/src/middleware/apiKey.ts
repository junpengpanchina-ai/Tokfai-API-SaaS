import type { MiddlewareHandler } from "hono";

import { ApiError } from "../errors.js";
import { extractBearer } from "../auth/jwt.js";
import {
  verifyApiKeyToken,
  type VerifiedApiKey,
} from "../auth/apiKey.js";

/**
 * Requires a sk-tokfai_... Bearer token. Resolves the api_keys row in
 * constant time and stashes it on the context as `c.get('apiKey')`.
 *
 * Use this for OpenAI-compatible customer-facing endpoints that require a key:
 * /v1/embeddings, etc. Public catalog: GET /v1/models (no auth).
 */
export const requireApiKey: MiddlewareHandler = async (c, next) => {
  const token = extractBearer(c.req.header("authorization"));
  if (!token) {
    throw ApiError.unauthorized(
      "Missing Bearer API key.",
      "missing_token"
    );
  }
  const apiKey = await verifyApiKeyToken(token);
  c.set("apiKey" as never, apiKey satisfies VerifiedApiKey);
  await next();
};
