import { Hono } from "hono";

import { ApiError } from "../errors.js";
import { requireSupabaseJwt } from "../middleware/supabaseJwt.js";

/**
 * /v1/billing/* — dashboard-initiated billing actions. Currently only
 * Stripe Checkout session creation. Implementation lands in D4.
 */
export const billingRoutes = new Hono();

billingRoutes.use("/v1/billing/*", requireSupabaseJwt);

billingRoutes.post("/v1/billing/checkout", () => {
  throw ApiError.notImplemented(
    "POST /v1/billing/checkout lands in D4.",
    "not_implemented"
  );
});
