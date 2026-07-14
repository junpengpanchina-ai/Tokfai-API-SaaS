#!/usr/bin/env node
/**
 * Security smoke — Admin auth / credits-adjust / secret redaction (offline).
 *
 * Usage: node scripts/security-admin-auth-smoke.mjs
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
  const layout = read("apps/web/app/admin/layout.tsx");
  if (!layout.includes('redirect("/login') && !layout.includes("redirect('/login")) {
    ok = fail("unauthenticated /admin", "expected redirect to login") && ok;
  } else {
    pass("unauthenticated /admin → login redirect");
  }
  if (!layout.includes("isAdminEmail") || !layout.includes('redirect("/dashboard")')) {
    ok = fail("non-admin /admin", "expected isAdminEmail + dashboard redirect") && ok;
  } else {
    pass("non-admin /admin → dashboard redirect (403-equivalent)");
  }
}

{
  const admin = read("apps/dmit-api/src/routes/admin.ts");
  const guard = read("apps/dmit-api/src/middleware/requireAdminV1.ts");
  if (!admin.includes('protectedAdminRoutes.use("*", requireAdminV1)')) {
    ok = fail("DMIT admin gate", "protectedAdminRoutes missing requireAdminV1") && ok;
  } else {
    pass("DMIT /admin/* behind requireAdminV1");
  }
  if (!guard.includes("401") && !guard.includes("unauthorized") && !/status:\s*401|status:\s*403/.test(guard)) {
    // requireAdminV1 throws ApiError unauthorized/forbidden
    if (!/unauthorized|forbidden|not_admin|admin/i.test(guard)) {
      ok = fail("admin auth errors", "expected 401/403 style rejections") && ok;
    } else {
      pass("admin auth rejects non-admin");
    }
  } else {
    pass("admin auth rejects non-admin");
  }
}

{
  const admin = read("apps/dmit-api/src/routes/admin.ts");
  const adjust = read("apps/dmit-api/src/routes/adminCreditsAdjust.ts");
  if (!admin.includes('protectedAdminRoutes.post("/credits/adjust"')) {
    ok = fail("credits-adjust route", "missing protected POST /credits/adjust") && ok;
  } else if (!admin.includes("requireAdminV1")) {
    ok = fail("credits-adjust write gate", "not behind requireAdminV1") && ok;
  } else {
    pass("credits-adjust requires admin (no write without admin)");
  }

  if (!adjust.includes("missing_reason") || !/if\s*\(\s*!reason\s*\)/.test(adjust)) {
    ok = fail("credits-adjust reason", "missing_reason enforcement not found") && ok;
  } else {
    pass("credits-adjust requires reason");
  }

  if (!adjust.includes("recordAdminAuditLog") || !adjust.includes("credits.adjust")) {
    ok = fail("credits-adjust audit", "expected recordAdminAuditLog + credits.adjust") && ok;
  } else {
    pass("credits-adjust writes audit log");
  }
}

{
  const adminKeys = read("apps/dmit-api/src/routes/adminApiKeys.ts");
  const selectHasSecret =
    /\.select\([^)]*encrypted_secret/.test(adminKeys) &&
    /return[\s\S]{0,200}encrypted_secret/.test(adminKeys);
  if (selectHasSecret) {
    ok = fail("admin API key list redaction", "encrypted_secret returned to admin API") && ok;
  } else if (!adminKeys.includes("prefix")) {
    ok = fail("admin API key list", "expected prefix-only listing") && ok;
  } else {
    pass("Admin API does not return full secret");
  }
}

if (!ok) {
  console.error("\nsecurity-admin-auth-smoke: FAILED");
  process.exit(1);
}
console.log("\nsecurity-admin-auth-smoke: OK");
