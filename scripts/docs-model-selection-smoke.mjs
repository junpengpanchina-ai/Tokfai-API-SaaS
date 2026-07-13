#!/usr/bin/env node
/**
 * Docs model-selection smoke (offline, static).
 *
 * Scans consumer docs sources for API-key / model-selection guidance.
 *
 * Usage: node scripts/docs-model-selection-smoke.mjs
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

/** Each group passes if ANY alternative matches the combined corpus. */
const REQUIRED_GROUPS = [
  {
    label: "API key not bound to model",
    anyOf: [
      "API Key 不绑定模型",
      "not bound to a model",
      "does not bind",
    ],
  },
  {
    label: "model parameter guidance",
    anyOf: ['model 参数', "model parameter", '"model"'],
  },
  {
    label: "gpt-5.5 reference",
    anyOf: ["gpt-5.5"],
  },
  {
    label: "/v1/responses endpoint",
    anyOf: ["/v1/responses"],
  },
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
  const files = new Set();
  for (const rel of SCAN_ROOTS) {
    const abs = join(ROOT, rel);
    try {
      for (const f of walk(abs)) files.add(f);
    } catch {
      // missing path — ignore
    }
  }
  const parts = [];
  for (const abs of files) {
    parts.push(readFileSync(abs, "utf8"));
  }
  return { corpus: parts.join("\n"), fileCount: files.size };
}

function main() {
  console.log("Docs model-selection smoke\n");

  const { corpus, fileCount } = collectCorpus();
  let ok = pass(`scanned ${fileCount} files under apps/web/lib/docs + consumer docs`);

  for (const group of REQUIRED_GROUPS) {
    const hit = group.anyOf.some((needle) => corpus.includes(needle));
    if (hit) {
      ok = pass(group.label) && ok;
    } else {
      ok =
        fail(
          group.label,
          `missing any of: ${group.anyOf.map((s) => JSON.stringify(s)).join(", ")}`
        ) && ok;
    }
  }

  console.log(`\n${ok ? "OK" : "FAILED"}`);
  process.exit(ok ? 0 : 1);
}

main();
