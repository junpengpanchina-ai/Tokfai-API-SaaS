import { Hono } from "hono";

import { requireApiKey } from "../middleware/apiKey.js";
import { listAllowedModels } from "../upstream/pricing.js";

/**
 * /v1/models — OpenAI-compatible model listing. Customer-facing (sk-tokfai auth).
 *
 * Already returns real data so frontend Playground / docs can stop hardcoding.
 */
export const modelRoutes = new Hono();

modelRoutes.use("/v1/models", requireApiKey);

modelRoutes.get("/v1/models", (c) => {
  const now = Math.floor(Date.now() / 1000);
  return c.json({
    object: "list",
    data: listAllowedModels().map((id) => ({
      id,
      object: "model",
      created: now,
      owned_by: "tokfai",
    })),
  });
});
