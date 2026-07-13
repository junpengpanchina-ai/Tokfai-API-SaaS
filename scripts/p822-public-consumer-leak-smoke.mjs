#!/usr/bin/env node
/**
 * P822 — Public consumer leak smoke (offline, static).
 *
 * Scans only public-facing consumer surfaces under apps/web.
 * Does NOT scan repo-root docs/ (ops reports / internal investigations).
 *
 * Forbidden tokens:
 * - grsai / GRSAI / garsai / grsaiapi.com
 * - 上游供应商
 * - upstream provider
 * - provider name
 * - https://v1/api/generate
 * - /v1/api/generate
 *
 * Usage: node scripts/p822-public-consumer-leak-smoke.mjs
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const LEAK_RE =
  /grsai|garsai|grsaiapi\.com|上游供应商|upstream\s+provider|provider\s+name|https?:\/\/v1\/api\/generate|(?<![\w/])\/v1\/api\/generate(?![\w/])/i;

/** Public-facing roots only (apps/web consumer / docs UI). */
const SCAN_ROOTS = [
  "apps/web",
  "apps/web/lib/docs",
  "apps/web/components/consumer-docs-guide.tsx",
  "apps/web/components/consumer-docs-generic.tsx",
  "apps/web/app/dashboard/docs",
  "apps/web/lib/docs/public-beta-docs-registry.ts",
  "apps/web/lib/customer-image-api-chapter.ts",
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
    if (/\.(ts|tsx|js|jsx|md|mjs|example)$/.test(abs)) out.push(abs);
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
      // missing path — ignore
    }
  }
  return [...files];
}

function main() {
  console.log("P822 public consumer leak smoke\n");
  console.log("Scan scope: apps/web public-facing only (not repo docs/)\n");

  const files = collectFiles();
  const bad = [];
  for (const abs of files) {
    const src = readFileSync(abs, "utf8");
    const m = src.match(LEAK_RE);
    if (m) {
      bad.push(`${relative(ROOT, abs)} → ${m[0]}`);
    }
  }

  let ok = true;
  if (bad.length) {
    ok = fail(
      "no upstream brand/path in public consumer scan",
      bad.slice(0, 40).join("\n      ")
    );
  } else {
    ok = pass(`no upstream brand/path (${files.length} files)`);
  }

  // Explicit Tokfai image examples should remain in the public docs registry.
  try {
    const registry = readFileSync(
      join(ROOT, "apps/web/lib/docs/public-beta-docs-registry.ts"),
      "utf8"
    );
    const required = [
      "https://api.tokfai.com/v1/images/generations",
      "POST /v1/images/generations",
      "Authorization: Bearer",
    ];
    const missing = required.filter((s) => !registry.includes(s));
    if (missing.length) {
      ok = fail("docs registry Tokfai image examples", missing.join(", ")) && ok;
    } else {
      ok = pass("docs registry Tokfai image examples") && ok;
    }
  } catch (err) {
    ok =
      fail(
        "docs registry readable",
        err instanceof Error ? err.message : String(err)
      ) && ok;
  }

  console.log(`\n${ok ? "OK" : "FAILED"}`);
  process.exit(ok ? 0 : 1);
}

main();
