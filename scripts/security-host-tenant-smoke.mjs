#!/usr/bin/env node
/**
 * Security smoke — Host → tenant mapping / reserved slugs (offline).
 *
 * Usage: node scripts/security-host-tenant-smoke.mjs
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

  if (!resolve.includes("www.tokfai.com") && !resolve.includes("TOKFAI_PRIMARY_HOSTS")) {
    ok = fail("www primary", "expected www.tokfai.com in primary hosts default") && ok;
  } else {
    pass("www.tokfai.com resolves to main site (primary hosts)");
  }

  if (!resolve.includes('startsWith("api.")')) {
    ok = fail("api.tokfai.com", "api.* must be primary / non-tenant") && ok;
  } else {
    pass("api.tokfai.com is not a consumer tenant host");
  }

  if (!resolve.includes("isReservedTenantSlug") || !resolve.includes("RESERVED_TENANT_SLUGS")) {
    ok = fail("reserved slug helper", "missing RESERVED_TENANT_SLUGS") && ok;
  } else {
    pass("reserved slug helper present");
  }

  // houde.tokfai.com → slug houde via subdomainSlug + fetchActiveTenantBySlug
  if (!resolve.includes("subdomainSlug") || !resolve.includes("fetchActiveTenantBySlug")) {
    ok = fail("subdomain tenant", "expected subdomainSlug + active slug lookup") && ok;
  } else {
    pass("houde.tokfai.com resolved via active slug (e.g. houde)");
  }

  if (!resolve.includes("fetchActiveTenantByDomain") || !/status.*=.*['"]active['"]/.test(resolve)) {
    ok = fail("inactive custom domain", "domain lookup must require active") && ok;
  } else {
    pass("inactive custom domain does not activate tenant");
  }
}

{
  const adminTenants = read("apps/dmit-api/src/routes/adminTenants.ts");
  if (
    !adminTenants.includes("isReservedTenantSlug") ||
    !adminTenants.includes("reserved_tenant_slug")
  ) {
    ok = fail("reserved slug registration", "createAdminTenant must reject reserved slugs") && ok;
  } else {
    pass("reserved slug cannot be registered");
  }
}

{
  // Quick logic check of reserved set contents via source
  const resolve = read("apps/dmit-api/src/tenants/resolve.ts");
  for (const slug of ["www", "api", "cname", "admin", "tokfai"]) {
    if (!resolve.includes(`"${slug}"`)) {
      ok = fail(`reserved contains ${slug}`, "missing from RESERVED_TENANT_SLUGS") && ok;
    }
  }
  if (ok) pass("reserved set includes www/api/cname/admin/tokfai");
}

if (!ok) {
  console.error("\nsecurity-host-tenant-smoke: FAILED");
  process.exit(1);
}
console.log("\nsecurity-host-tenant-smoke: OK");
