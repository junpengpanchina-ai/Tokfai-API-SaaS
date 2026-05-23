import { Hono } from "hono";

import { listCatalogModels } from "../catalog/modelCatalog.js";
import { requireApiKey } from "../middleware/apiKey.js";

/**
 * /v1/models — OpenAI-compatible model listing. Customer-facing (sk-tokfai auth).
 *
 * Catalog is read from public.models when available; falls back to pricing.ts.
 */
export const modelRoutes = new Hono();

modelRoutes.use("/v1/models", requireApiKey);

modelRoutes.get("/v1/models", async (c) => {
  const data = await listCatalogModels();
  return c.json({
    object: "list",
    data,
  });
});
