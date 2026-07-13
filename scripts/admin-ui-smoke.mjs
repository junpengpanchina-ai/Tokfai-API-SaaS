#!/usr/bin/env node
/**
 * Admin UI leak / label smoke (offline, static).
 *
 * Scans Admin UI surfaces under apps/web for:
 * - upstream provider leak tokens (grsai, GRSAI, garsai, grsaiapi.com, 上游供应商)
 * - full secret-looking sk-tokfai_ keys (48+ hex after prefix) in source
 * - raw provider domain patterns that should not appear in admin labels
 *
 * Usage: node scripts/admin-ui-smoke.mjs
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const LEAK_RE =
  /grsai|garsai|grsaiapi\.com|上游供应商|upstream\s+provider|provider\s+name/i;

/** Full Tokfai secret pattern (not prefix truncation). */
const FULL_KEY_RE = /sk-tokfai_[0-9a-f]{40,}/i;

const SCAN_ROOTS = [
  "apps/web/app/admin",
  "apps/web/components/admin",
  "apps/web/lib/admin",
  "apps/web/lib/admin-nav.ts",
];

const SKIP_DIR_NAMES = new Set([
  "node_modules",
  ".next",
  "dist",
  "coverage",
  ".turbo",
]);

function pass(label) {
  console.log(`PASS  ${label}`);
  return true;
}

function fail(label, detail) {
  console.error(`FAIL  ${label}`);
  if (detail) console.error(`      ${detail}`);
  return false;
}

function walk(abs, out = []) {
  const st = statSync(abs);
  if (st.isFile()) {
    if (/\.(ts|tsx|js|jsx|md|mjs)$/.test(abs)) out.push(abs);
    return out;
  }
  for (const name of readdirSync(abs)) {
    if (SKIP_DIR_NAMES.has(name)) continue;
    walk(join(abs, name), out);
  }
  return out;
}

function collectFiles() {
  const files = new Set();
  for (const rel of SCAN_ROOTS) {
    const abs = join(ROOT, rel);
    try {
      for (const f of walk(abs)) files.add(f);
    } catch {
      // missing path
    }
  }
  return [...files];
}

function main() {
  let ok = true;
  const files = collectFiles();
  if (files.length === 0) {
    process.exit(fail("admin_ui_files", "No admin UI files found to scan") ? 0 : 1);
  }
  ok = pass(`admin_ui_files count=${files.length}`) && ok;

  const leakHits = [];
  const keyHits = [];

  for (const abs of files) {
    const rel = relative(ROOT, abs);
    let text;
    try {
      text = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    if (LEAK_RE.test(text)) {
      leakHits.push(rel);
    }
    if (FULL_KEY_RE.test(text)) {
      keyHits.push(rel);
    }
  }

  if (leakHits.length) {
    ok =
      fail(
        "admin_ui_no_provider_leak",
        leakHits.slice(0, 12).join(", ")
      ) && ok;
  } else {
    ok = pass("admin_ui_no_provider_leak") && ok;
  }

  if (keyHits.length) {
    ok =
      fail("admin_ui_no_raw_full_keys", keyHits.slice(0, 12).join(", ")) && ok;
  } else {
    ok = pass("admin_ui_no_raw_full_keys") && ok;
  }

  // Soft checks: key UI routes exist
  const required = [
    "apps/web/app/admin/overview/page.tsx",
    "apps/web/app/admin/users/page.tsx",
    "apps/web/app/admin/credits-adjust/page.tsx",
    "apps/web/app/admin/credits/page.tsx",
    "apps/web/app/admin/api-keys/page.tsx",
    "apps/web/app/admin/models/page.tsx",
    "apps/web/app/admin/pricing/page.tsx",
    "apps/web/app/admin/channels/page.tsx",
    "apps/web/app/admin/settings/page.tsx",
    "apps/web/app/admin/docs/page.tsx",
    "apps/web/app/admin/logs/page.tsx",
  ];
  for (const rel of required) {
    try {
      statSync(join(ROOT, rel));
      ok = pass(`admin_route_exists ${rel}`) && ok;
    } catch {
      ok = fail(`admin_route_exists ${rel}`, "missing") && ok;
    }
  }

  console.log(ok ? "\nadmin-ui-smoke: PASS" : "\nadmin-ui-smoke: FAIL");
  process.exit(ok ? 0 : 1);
}

main();
