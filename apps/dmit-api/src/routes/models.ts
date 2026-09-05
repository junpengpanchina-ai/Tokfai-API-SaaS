import { Hono } from "hono";

import { listCatalogModels } from "../catalog/modelCatalog.js";
import { scrubPublicModelsPayload } from "../catalog/publicModelsListFilter.js";
import { buildModelsListPayload } from "./modelsListCompat.js";

/**
 * /v1/models — OpenAI-compatible public model listing (no auth).
 *
 * Compatibility aliases remain callable on chat routes but are never
 * advertised here. Final JSON is hard-scrubbed immediately before send.
 */
export const modelRoutes = new Hono();

modelRoutes.get("/v1/models", async (c) => {
  const payload = buildModelsListPayload(await listCatalogModels());
  // Last-mile scrub — final step before the response body is sent.
  return c.json(scrubPublicModelsPayload(payload));
});
