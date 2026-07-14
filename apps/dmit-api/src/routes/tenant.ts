import { Hono } from "hono";

import {
  resolveTenantByHost,
  tenantCnameTarget,
  type ResolvedTenantPublic,
} from "../tenants/resolve.js";

/**
 * Public tenant bootstrap for the consumer frontend.
 * Never exposes upstream providers, keys, or cost notes.
 */
export const tenantRoutes = new Hono();

tenantRoutes.get("/v1/tenant/resolve", async (c) => {
  const hostParam = c.req.query("host")?.trim() || null;
  const headerHost =
    c.req.header("x-tokfai-host")?.trim() ||
    c.req.header("x-forwarded-host")?.trim() ||
    c.req.header("host")?.trim() ||
    null;
  const host = hostParam || headerHost;

  const { public: pub } = await resolveTenantByHost(host);

  return c.json({
    tenant: pub satisfies ResolvedTenantPublic,
    host: host ?? null,
    dns: {
      cname_target: tenantCnameTarget(),
      note: "V1: configure Cloudflare/DNS manually; mark domain active in admin after SSL is ready.",
    },
  });
});
