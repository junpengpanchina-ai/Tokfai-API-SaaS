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
