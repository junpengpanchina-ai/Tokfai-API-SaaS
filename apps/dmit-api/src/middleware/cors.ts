import { cors } from "hono/cors";

import { env } from "../env.js";

const BASELINE_ORIGINS = [
  "https://tokfai.com",
  "https://www.tokfai.com",
  "http://localhost:3000",
];

function allowedOrigins(): Set<string> {
  const fromEnv = Array.isArray(env.CORS_ALLOWED_ORIGINS)
    ? env.CORS_ALLOWED_ORIGINS
        .map((origin: string) => origin.trim())
        .filter(Boolean)
    : [];

  return new Set([...BASELINE_ORIGINS, ...fromEnv]);
}

export const corsMiddleware = cors({
  origin: (origin) => {
    if (!origin) return null;

    const allowed = allowedOrigins();
    return allowed.has(origin) ? origin : null;
  },
  allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: [
    "Authorization",
    "Content-Type",
    "X-Request-Id",
    "Stripe-Signature",
  ],
  exposeHeaders: ["X-Request-Id"],
  credentials: false,
  maxAge: 86400,
});
