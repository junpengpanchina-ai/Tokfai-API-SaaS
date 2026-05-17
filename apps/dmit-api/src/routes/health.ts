import { Hono } from "hono";

export const healthRoutes = new Hono();

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
      "POST /admin/credits/adjust",
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
      "POST /v1/billing/checkout",
      "GET /api/system/health",
      "GET /admin/health",
      "POST /billing/create-checkout-session",
      "POST /v1/webhooks/stripe",
      "POST /stripe/webhook",
      "POST /admin/credits/adjust",
    ],
    buildTime: process.env.BUILD_TIME || null,
    commitSha: process.env.COMMIT_SHA || null,
  })
);
