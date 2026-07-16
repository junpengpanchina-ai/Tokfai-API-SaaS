#!/usr/bin/env node
/**
 * P821 — Consumer docs leak smoke (offline, static).
 *
 * Ensures apps/web consumer docs / marketing surfaces do not expose:
 * - grsai / GRSAI / garsai as brands to configure
 * - https://grsaiapi.com as an integration Base URL
 * - https://v1/api/generate / /v1/api/generate as consumer endpoints
 *
 * Bare `grsaiapi.com` is allowed only inside known wrong-provider diagnostics.
 *
 * Usage: node scripts/p821-docs-leak-smoke.mjs
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  findConsumerLeak,
  findGrsaiapiAsIntegrationHost,
} from "./lib/consumer-docs-leak.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = join(ROOT, "apps/web");

const SCAN_ROOTS = [
  "apps/web/lib/docs",
  "apps/web/components/consumer-docs-guide.tsx",
  "apps/web/components/pricing-content.tsx",
  "apps/web/app/dashboard/docs",
  "apps/web/app/dashboard/models",
  "apps/web/lib/customer-image-api-chapter.ts",
  "apps/web/lib/customer-curl-oneline.ts",
  "apps/web/lib/docs/public-beta-docs-registry.ts",
  "apps/web/lib/docs/consumer-model-groups.ts",
  "apps/web/lib/i18n/troubleshooting-case-messages.ts",
];

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
    if (name === "node_modules" || name === ".next" || name === "dist") continue;
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
  console.log("P821 docs leak smoke\n");
  const files = collectFiles();
  const bad = [];
  for (const abs of files) {
    const src = readFileSync(abs, "utf8");
    const leak = findConsumerLeak(src);
    if (leak) bad.push(`${relative(ROOT, abs)} → ${leak}`);
    const asHost = findGrsaiapiAsIntegrationHost(src);
    if (asHost) bad.push(`${relative(ROOT, abs)} → integration host: ${asHost}`);
  }

  // Explicit required Tokfai paths present in registry
  const registry = readFileSync(
    join(ROOT, "apps/web/lib/docs/public-beta-docs-registry.ts"),
    "utf8"
  );
  const required = [
    "https://api.tokfai.com/v1/images/generations",
    "POST /v1/images/generations",
    "Authorization: Bearer",
    "| tokfai",
    "如果出现 grsaiapi.com，说明没有走 Tokfai",
  ];
  const missing = required.filter((s) => !registry.includes(s));

  let ok = true;
  if (bad.length) {
    ok = fail("no upstream brand/path in consumer docs scan", bad.join("\n      "));
  } else {
    ok = pass(`no upstream brand/path (${files.length} files)`);
  }
  if (missing.length) {
    ok = fail("docs registry Tokfai client guidance", missing.join(", ")) && ok;
  } else {
    ok = pass("docs registry Tokfai client guidance") && ok;
  }

  // Broader apps/web brand scan (same tokens)
  const webFiles = walk(WEB).filter((f) =>
    /\.(ts|tsx|md)$/.test(f) &&
    !f.includes("/node_modules/") &&
    !f.includes("/.next/")
  );
  const webBad = [];
  for (const abs of webFiles) {
    const src = readFileSync(abs, "utf8");
    const leak = findConsumerLeak(src);
    if (leak) webBad.push(`${relative(ROOT, abs)} → ${leak}`);
    const asHost = findGrsaiapiAsIntegrationHost(src);
    if (asHost) webBad.push(`${relative(ROOT, abs)} → integration host: ${asHost}`);
  }
  if (webBad.length) {
    ok = fail("apps/web brand leak scan", webBad.slice(0, 20).join("\n      ")) && ok;
  } else {
    ok = pass(`apps/web brand leak scan (${webFiles.length} files)`) && ok;
  }

  console.log(`\n${ok ? "OK" : "FAILED"}`);
  process.exit(ok ? 0 : 1);
}

main();
