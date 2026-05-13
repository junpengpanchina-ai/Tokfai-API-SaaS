import { Hono } from "hono";

import { ApiError } from "../errors.js";

/**
 * /v1/webhooks/stripe — Stripe-signed POST. Auth is the `Stripe-Signature`
 * header, verified with STRIPE_WEBHOOK_SECRET. Never JWT or sk-tokfai.
 *
 * Implementation lands in D4. Note: the real handler must read the raw
 * request body (not parsed JSON) to compute the signature — the wiring
 * for that lives here, not in app.ts.
 */
export const webhookRoutes = new Hono();

webhookRoutes.post("/v1/webhooks/stripe", () => {
  throw ApiError.notImplemented(
    "POST /v1/webhooks/stripe lands in D4.",
    "not_implemented"
  );
});
