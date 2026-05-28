import { Hono } from "hono";

import { listCatalogModels } from "../catalog/modelCatalog.js";

/**
 * /v1/models — OpenAI-compatible public model listing (no auth).
 *
 * Catalog is read from public.models (enabled + visible) when available;
 * falls back to pricing.ts.
 */
export const modelRoutes = new Hono();

modelRoutes.get("/v1/models", async (c) => {
  const data = await listCatalogModels();

  return c.json({
    object: "list",
    data,
  });
});
