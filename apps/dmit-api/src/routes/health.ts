import { Hono } from "hono";

import { env } from "../env.js";

export const healthRoutes = new Hono();

function healthCheckPayload() {
  return {
    ok: true as const,
    service: "dmit-api",
    env: env.NODE_ENV || "unknown",
    timestamp: new Date().toISOString(),
  };
}

/** Production load-balancer / uptime probe — no auth. */
healthRoutes.get("/health", (c) => c.json(healthCheckPayload()));

healthRoutes.get("/v1/health", (c) =>
  c.json({
    ok: true,
    service: "dmit",
    version: "0.1.0",
    now: new Date().toISOString(),
  })
);

healthRoutes.get("/debug/routes", (c) =>
  c.json({
    service: "tokfai-dmit-api",
    cwd: process.cwd(),
    adminCreditsAdjustRoute: true,
    routes: [
      "GET /admin/credits",
      "POST /admin/credits/adjust",
      "GET /admin/recharge-plans",
      "PATCH /admin/recharge-plans/:id",
      "GET /v1/billing/plans",
      "POST /v1/billing/checkout",
      "POST /v1/webhooks/stripe",
      "GET /debug/routes",
    ],
    time: new Date().toISOString(),
  })
);

healthRoutes.get("/__version", (c) =>
  c.json({
    service: "tokfai-dmit-api",
    adminCreditsAdjustRoute: true,
    routes: [
      "GET /v1/models",
      "POST /v1/chat/completions",
      "GET /v1/billing/plans",
      "POST /v1/billing/checkout",
      "GET /api/system/health",
      "GET /admin/health",
      "POST /billing/create-checkout-session",
      "POST /v1/webhooks/stripe",
      "POST /stripe/webhook",
      "GET /admin/credits",
      "POST /admin/credits/adjust",
      "GET /admin/recharge-plans",
      "PATCH /admin/recharge-plans/:id",
    ],
    buildTime: process.env.BUILD_TIME || null,
    commitSha: process.env.COMMIT_SHA || null,
  })
);
