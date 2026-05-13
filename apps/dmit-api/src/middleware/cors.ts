import { cors } from "hono/cors";

import { env } from "../env.js";

const allowed = new Set(env.CORS_ALLOWED_ORIGINS);

/**
 * CORS for browser callers (tokfai.com + dev). DMIT is also called by
 * server-to-server clients (Stripe, GRSAI doesn't call us back) for which
 * CORS doesn't apply.
 *
 * Stripe webhook does NOT need CORS — it's a server-to-server POST.
 */
export const corsMiddleware = cors({
  origin: (origin) => {
    if (!origin) return null;
    return allowed.has(origin) ? origin : null;
  },
  allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowHeaders: ["Authorization", "Content-Type", "Stripe-Signature"],
  exposeHeaders: ["X-Request-Id"],
  maxAge: 86400,
  credentials: false,
});
