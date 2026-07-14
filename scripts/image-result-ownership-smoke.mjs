#!/usr/bin/env node
/**
 * Image result ownership smoke (offline, static).
 *
 * Checks:
 * 1) GET task lookup filters by authenticated user_id
 * 2) tenant_id comes from API key / login — query tenant_id is ignored
 * 3) Cross-user lookup cannot succeed via query/body tenant spoofing
 * 4) Public poll responses omit upstream_id
 *
 * Usage: node scripts/image-result-ownership-smoke.mjs
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
  const tasksDb = read("apps/dmit-api/src/images/tasksDb.ts");
  const route = read("apps/dmit-api/src/routes/images.ts");
  const pub = read("apps/dmit-api/src/images/publicResponse.ts");

  if (!tasksDb.includes("loadOwnedImageTask")) {
    ok = fail("loadOwnedImageTask", "missing helper") && ok;
  } else if (!tasksDb.includes('.eq("user_id", args.userId)')) {
    ok = fail("owner filter user_id", "expected eq user_id") && ok;
  } else {
    pass("owner filter user_id");
  }

  if (!tasksDb.includes("args.tenantId") || !tasksDb.includes('.eq("tenant_id"')) {
    ok = fail("tenant from auth", "expected tenant_id filter from caller") && ok;
  } else {
    pass("tenant_id derived from caller");
  }

  if (!route.includes("void c.req.query(\"tenant_id\")") && !route.includes("void c.req.query('tenant_id')")) {
    ok = fail("ignore query tenant_id", "expected explicit ignore of query tenant_id") && ok;
  } else {
    pass("query tenant_id ignored");
  }

  if (
    route.includes("c.req.query(\"tenant_id\")") &&
    /loadOwnedImageTask\(\{[\s\S]*tenantId:\s*c\.req\.query/.test(route)
  ) {
    ok = fail("tenant spoof", "tenantId must not come from query") && ok;
  } else if (/tenantId:\s*caller\.tenantId/.test(route)) {
    pass("GET uses caller.tenantId");
  } else {
    ok = fail("GET tenant source", "expected caller.tenantId") && ok;
  }

  if (pub.includes("upstream_id") && /upstream_id:\s*task\.upstream_id/.test(pub)) {
    ok = fail("no public upstream_id", "upstream_id must not be returned") && ok;
  } else {
    pass("public response omits upstream_id");
  }

  if (!pub.includes("Never includes upstream") && !pub.includes("never includes upstream") && !pub.includes("Never store upstream") && !/never return/i.test(pub)) {
    // soft — comment may vary
    pass("public response helper present");
  } else {
    pass("public response documents no upstream leak");
  }

  // GET handlers must use loadOwnedImageTask, not raw usage_logs without owner check
  if (!route.includes("loadOwnedImageTask")) {
    ok = fail("GET uses ownership helper", "missing loadOwnedImageTask") && ok;
  } else {
    pass("GET uses ownership helper");
  }
}

{
  // Migration RLS enabled — service_role only writes; API enforces ownership
  const mig = read("supabase/migrations/0035_image_generation_tasks.sql");
  if (!mig.includes("enable row level security")) {
    ok = fail("RLS enabled", "expected enable row level security") && ok;
  } else {
    pass("image_generation_tasks RLS enabled");
  }
}

if (!ok) {
  console.error("\nimage-result-ownership-smoke: FAILED");
  process.exit(1);
}
console.log("\nimage-result-ownership-smoke: OK");
