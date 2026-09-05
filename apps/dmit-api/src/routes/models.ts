import { Hono } from "hono";

import { listCatalogModels } from "../catalog/modelCatalog.js";
import { scrubModelsListPayload } from "../catalog/publicModelsListFilter.js";
import { buildModelsListPayload } from "./modelsListCompat.js";

/**
 * /v1/models — OpenAI-compatible public model listing (no auth).
 *
 * Catalog is read from public.models (enabled + visible) when available;
 * falls back to pricing.ts. Compatibility aliases are callable on chat
 * routes but are not advertised here. Payload is hard-scrubbed immediately
 * before JSON leaves this handler.
 *
 * `data[]` is the OpenAI list (no Codex-only fields). `models[]` is a copy
 * with `slug` (= id), `supported_reasoning_levels` (= []),
 * `shell_type` (= "default"), and `visibility` for Codex CLI.
 * Chat/completions and responses are unchanged.
 */
export const modelRoutes = new Hono();

modelRoutes.get("/v1/models", async (c) => {
  const payload = buildModelsListPayload(await listCatalogModels());
  // Final hard filter — last step before the response body is sent.
  return c.json(scrubModelsListPayload(payload));
});
