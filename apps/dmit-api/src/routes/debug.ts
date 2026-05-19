import type { Hono } from "hono";

/** Routes the dashboard API Keys page depends on (full paths). */
export const CRITICAL_ME_API_KEY_ROUTES = [
  "GET /v1/me/api-keys",
  "POST /v1/me/api-keys",
  "POST /v1/me/api-keys/:id/revoke",
] as const;

function formatRegisteredRoute(method: string, path: string): string {
  return `${method} ${path}`;
}

/**
 * Temporary read-only route table for production debugging (no secrets).
 * Register after all other routes on the root app.
 */
export function registerDebugRoutes(app: Hono): void {
  app.get("/v1/debug/routes", (c) => {
    const registered = app.routes.map((r) =>
      formatRegisteredRoute(r.method, r.path)
    );

    const meApiKeyRoutes = registered.filter(
      (line) =>
        line.includes("/v1/me/api-keys") ||
        (line.includes("api-keys") && line.includes("/v1/me"))
    );

    const revokeRouteRegistered = registered.some(
      (line) =>
        line.startsWith("POST ") &&
        line.includes("/v1/me/api-keys") &&
        line.endsWith("/revoke")
    );

    return c.json({
      service: "tokfai-dmit-api",
      critical_routes: [...CRITICAL_ME_API_KEY_ROUTES],
      revoke_route_registered: revokeRouteRegistered,
      me_api_key_routes: meApiKeyRoutes,
      registered_route_count: registered.length,
      buildTime: process.env.BUILD_TIME ?? null,
      commitSha: process.env.COMMIT_SHA ?? null,
      time: new Date().toISOString(),
    });
  });
}
