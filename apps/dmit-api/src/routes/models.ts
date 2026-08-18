import { Hono } from "hono";

import { listCatalogModels } from "../catalog/modelCatalog.js";
import { buildModelsListPayload } from "./modelsListCompat.js";

/**
 * /v1/models — OpenAI-compatible public model listing (no auth).
 *
 * Catalog is read from public.models (enabled + visible) when available;
 * falls back to pricing.ts.
 *
 * `data[]` is the OpenAI list (no Codex-only fields). `models[]` is a copy
 * with `slug` (= id), `supported_reasoning_levels` (= []),
 * `shell_type` (= "default"), and `visibility` (= "public") for Codex CLI.
 * Chat/completions and responses are unchanged.
 */
export const modelRoutes = new Hono();

modelRoutes.get("/v1/models", async (c) => {
  const data = await listCatalogModels();
  return c.json(buildModelsListPayload(data));
});
