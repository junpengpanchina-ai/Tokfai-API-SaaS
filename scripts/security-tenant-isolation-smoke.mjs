#!/usr/bin/env node
/**
 * Security smoke — Tenant isolation (offline).
 *
 * Usage: node scripts/security-tenant-isolation-smoke.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function pass(label) {
  console.log(`PASS  ${label}`);
  return true;
}

function fail(label, detail) {
  console.error(`FAIL  ${label}`);
  if (detail) console.error(`      ${detail}`);
  return false;
}

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

let ok = true;

{
  const resolve = read("apps/dmit-api/src/tenants/resolve.ts");
  if (!resolve.includes("resolveTenantByHost") || !resolve.includes("isPrimaryHost")) {
    ok = fail("host resolve helpers", "missing resolveTenantByHost / isPrimaryHost") && ok;
  } else {
    pass("Host → tenant resolution helpers exist");
  }

  if (!resolve.includes('startsWith("api.")') && !resolve.includes("startsWith('api.')")) {
    ok = fail("api host primary", "api.* must be primary host") && ok;
  } else {
    pass("api.* Host not treated as consumer tenant");
  }

  // Unknown / inactive host falls back to main site — never another tenant
  if (!resolve.includes("mainSitePublic") || !/status.*=.*['"]active['"]/.test(resolve)) {
    ok = fail("inactive/unknown host", "expected active-only domain lookup + main fallback") && ok;
  } else {
    pass("unknown/inactive Host does not fall into another tenant");
  }
}

{
  const tasks = read("apps/dmit-api/src/images/tasksDb.ts");
  const images = read("apps/dmit-api/src/routes/images.ts");
  if (!tasks.includes('.eq("user_id", args.userId)')) {
    ok = fail("usage ownership", "image task lookup missing user_id filter") && ok;
  } else {
    pass("tenant A cannot read tenant B task via user mismatch (user_id filter)");
  }
  if (!tasks.includes('.eq("tenant_id"') || !tasks.includes("args.tenantId")) {
    ok = fail("tenant filter on tasks", "expected tenant_id from caller") && ok;
  } else {
    pass("image/usage poll filters by auth tenant_id");
  }
  if (
    /loadOwnedImageTask\(\{[\s\S]*tenantId:\s*c\.req\.(query|param)/.test(images)
  ) {
    ok = fail("body/query tenant_id", "tenantId must not come from query") && ok;
  } else if (!images.includes('void c.req.query("tenant_id")')) {
    ok = fail("ignore query tenant_id", "expected explicit ignore") && ok;
  } else {
    pass("body/query tenant_id is ignored");
  }
}

{
  const chatAuth = read("apps/dmit-api/src/middleware/chatAuth.ts");
  if (!chatAuth.includes("apiKey.tenantId") || !chatAuth.includes("resolveTenantByHost")) {
    ok = fail("tenant from key/host", "expected tenant from API key or Host") && ok;
  } else {
    pass("tenant_id derived from API Key or Host (not client body)");
  }
}

{
  const adminTenants = read("apps/dmit-api/src/routes/adminTenants.ts");
  if (
    !adminTenants.includes('.eq("tenant_id", tenantId)') &&
    !adminTenants.includes('.eq("tenant_id", tenant.id)')
  ) {
    ok = fail("admin tenant usage scope", "expected tenant_id filter on tenant usage") && ok;
  } else {
    pass("tenant-scoped admin usage/ledger queries filter tenant_id");
  }
}

if (!ok) {
  console.error("\nsecurity-tenant-isolation-smoke: FAILED");
  process.exit(1);
}
console.log("\nsecurity-tenant-isolation-smoke: OK");
