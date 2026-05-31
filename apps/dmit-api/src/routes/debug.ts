import type { Hono } from "hono";

export function registerDebugRoutes(app: Hono): void {
  app.get("/v1/debug/routes", (c) =>
    c.json({
      ok: true,
      service: "dmit",
      routes: {
        meMountedAt: "/v1/me",
        apiKeysList: "GET /v1/me/api-keys",
        apiKeysCreate: "POST /v1/me/api-keys",
        apiKeysReveal: "POST /v1/me/api-keys/reveal",
        apiKeysRevoke: "POST /v1/me/api-keys/revoke",
        credits: "GET /v1/me/credits",
        creditsLedger: "GET /v1/me/credits/ledger",
        usage: "GET /v1/me/usage",
        usageSummary: "GET /v1/me/usage/summary",
      },
      now: new Date().toISOString(),
    })
  );
}
