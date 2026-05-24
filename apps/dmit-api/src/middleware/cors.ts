import { cors } from "hono/cors";

import { env } from "../env.js";

const BASELINE_ORIGINS = [
  "https://tokfai.com",
  "https://www.tokfai.com",
  "http://localhost:3000",
] as const;

const allowed = new Set([...BASELINE_ORIGINS, ...env.CORS_ALLOWED_ORIGINS]);

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
  allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Authorization", "Content-Type", "X-Request-Id"],
  exposeHeaders: ["X-Request-Id"],
  maxAge: 86400,
  credentials: false,
});
