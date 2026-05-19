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
        apiKeysRevokeBody: "POST /v1/me/api-keys/revoke",
        apiKeysRevokeLegacy: "POST /v1/me/api-keys/:id/revoke",
      },
      now: new Date().toISOString(),
    })
  );
}
