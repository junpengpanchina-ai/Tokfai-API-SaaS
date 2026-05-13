import { Hono } from "hono";

import { ApiError } from "../errors.js";
import { requireSupabaseJwt } from "../middleware/supabaseJwt.js";

/**
 * /v1/keys — managed by the dashboard. All three actions require a valid
 * Supabase JWT. user_id is resolved from the JWT — never from request body.
 *
 * Implementation lands in D3.
 */
export const keyRoutes = new Hono();

keyRoutes.use("/v1/keys", requireSupabaseJwt);
keyRoutes.use("/v1/keys/*", requireSupabaseJwt);

keyRoutes.get("/v1/keys", () => {
  throw ApiError.notImplemented(
    "GET /v1/keys lands in D3.",
    "not_implemented"
  );
});

keyRoutes.post("/v1/keys", () => {
  throw ApiError.notImplemented(
    "POST /v1/keys lands in D3.",
    "not_implemented"
  );
});

keyRoutes.delete("/v1/keys/:id", () => {
  throw ApiError.notImplemented(
    "DELETE /v1/keys/:id lands in D3.",
    "not_implemented"
  );
});
