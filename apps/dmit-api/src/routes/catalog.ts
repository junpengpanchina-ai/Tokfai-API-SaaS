import { Hono } from "hono";

import { listPublicModelPricing } from "../catalog/modelPricing.js";
import { requireSupabaseJwt } from "../middleware/supabaseJwt.js";

/**
 * Dashboard-facing catalog pricing (authenticated Supabase JWT).
 * Exposes retail credits only — no upstream cost notes or provider secrets.
 */
export const catalogRoutes = new Hono();

catalogRoutes.use("/v1/catalog/*", requireSupabaseJwt);

catalogRoutes.get("/v1/catalog/model-pricing", async (c) => {
  const data = await listPublicModelPricing();
  return c.json({ data });
});
