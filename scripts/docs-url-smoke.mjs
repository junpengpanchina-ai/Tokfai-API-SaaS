#!/usr/bin/env node
/**
 * Docs URL smoke (offline, static).
 *
 * Consumer docs must only advertise Tokfai public API URLs.
 *
 * Usage: node scripts/docs-url-smoke.mjs
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  findConsumerLeak,
  findGrsaiapiAsIntegrationHost,
} from "./lib/consumer-docs-leak.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const SCAN_ROOTS = [
  "apps/web/lib/docs",
  "apps/web/components/consumer-docs-guide.tsx",
  "apps/web/app/dashboard/docs",
];

const SKIP_DIR_NAMES = new Set([
  "node_modules",
  ".next",
  "dist",
  "coverage",
  ".turbo",
]);

const FORBIDDEN = [
  "https://v1/api/generate",
  "https://v1/",
  "upstream provider",
  "provider name",
];

const FORBIDDEN_RE = /provider[_ ]?id|real base_url/i;

const REQUIRED = [
  "https://api.tokfai.com/v1/chat/completions",
  "https://api.tokfai.com/v1/responses",
  "https://api.tokfai.com/v1/images/generations",
  "https://api.tokfai.com/v1beta/models",
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
    if (SKIP_DIR_NAMES.has(name)) continue;
    walk(join(abs, name), out);
  }
  return out;
}

function collectCorpus() {
  const files = [];
  for (const rel of SCAN_ROOTS) {
    const abs = join(ROOT, rel);
    try {
      for (const f of walk(abs)) files.push(f);
    } catch {
      // missing path — ignore
    }
  }
  return files;
}

function main() {
  console.log("Docs URL smoke\n");
  const files = collectCorpus();
  const corpus = files.map((f) => readFileSync(f, "utf8")).join("\n");
  let ok = true;

  const badHits = [];
  for (const abs of files) {
    const src = readFileSync(abs, "utf8");
    for (const needle of FORBIDDEN) {
      if (src.includes(needle)) {
        badHits.push(`${relative(ROOT, abs)} → ${needle}`);
      }
    }
    const m = src.match(FORBIDDEN_RE);
    if (m) badHits.push(`${relative(ROOT, abs)} → ${m[0]}`);
    const leak = findConsumerLeak(src);
    if (leak) badHits.push(`${relative(ROOT, abs)} → ${leak}`);
    const asHost = findGrsaiapiAsIntegrationHost(src);
    if (asHost) badHits.push(`${relative(ROOT, abs)} → ${asHost}`);
  }

  if (badHits.length) {
    ok = fail("no forbidden URLs / provider leaks", badHits.join("\n      "));
  } else {
    ok = pass("no forbidden URLs / provider leaks") && ok;
  }

  const missing = REQUIRED.filter((s) => !corpus.includes(s));
  if (missing.length) {
    ok = fail("required Tokfai API URLs present", missing.join(", "));
  } else {
    ok = pass("required Tokfai API URLs present") && ok;
  }

  console.log(ok ? "\nALL PASS" : "\nFAILED");
  process.exit(ok ? 0 : 1);
}

main();
