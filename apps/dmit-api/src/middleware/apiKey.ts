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
 * Use this for OpenAI-compatible customer-facing endpoints:
 * /v1/chat/completions, /v1/models, /v1/embeddings, etc.
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
