#!/usr/bin/env node
/**
 * Docs OpenAI-compat smoke (offline, static).
 *
 * Ensures consumer docs advertise Tokfai OpenAI-compatible chat/images shapes
 * without leaking upstream brands or broken host URLs.
 *
 * Usage: node scripts/docs-openai-compat-smoke.mjs
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
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

const REQUIRED = [
  "https://api.tokfai.com/v1/chat/completions",
  "https://api.tokfai.com/v1/images/generations",
  "response_format",
  "stream=true",
  '"image"',
];

const REQUIRED_GROUPS = [
  {
    label: "image field compat note",
    anyOf: [
      "都会合并为参考图列表",
      "merge into one reference list",
      "都会归一化为参考图列表",
      "all normalized to one list",
    ],
  },
  {
    label: "image field aliases listed",
    anyOf: [
      "reference_images",
      "input_images",
    ],
  },
  {
    label: "stream=true guidance",
    anyOf: ['"stream": true', "stream=true", "stream: true"],
  },
];

const FORBIDDEN = [
  "https://v1/chat/completions",
  "https://v1/images/generations",
  "https://v1/api/generate",
  "https://v1/",
  "上游供应商",
  "provider name",
];

const FORBIDDEN_RE =
  /grsai|GRSAI|grsaiapi|dakka|aitohumanize|gemini-3\.1-pro/i;

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
  console.log("Docs OpenAI-compat smoke\n");
  const files = collectFiles();
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
  }

  if (badHits.length) {
    ok = fail("no upstream / broken URL leaks", badHits.join("\n      "));
  } else {
    ok = pass("no upstream / broken URL leaks") && ok;
  }

  const missing = REQUIRED.filter((s) => !corpus.includes(s));
  if (missing.length) {
    ok = fail("required OpenAI-compat markers", missing.join(", "));
  } else {
    ok = pass("required OpenAI-compat markers") && ok;
  }

  for (const group of REQUIRED_GROUPS) {
    if (group.anyOf.some((s) => corpus.includes(s))) {
      ok = pass(group.label) && ok;
    } else {
      ok = fail(group.label, `expected one of: ${group.anyOf.join(" | ")}`);
    }
  }

  // Registry-specific hard checks
  const registry = readFileSync(
    join(ROOT, "apps/web/lib/docs/public-beta-docs-registry.ts"),
    "utf8"
  );
  const registryRequired = [
    "https://api.tokfai.com/v1/chat/completions",
    "https://api.tokfai.com/v1/images/generations",
    "https://api.tokfai.com/v1/api/result",
    '"image": []',
    "response_format",
    "stream\": true",
  ];
  const registryMissing = registryRequired.filter((s) => !registry.includes(s));
  if (registryMissing.length) {
    ok = fail("registry OpenAI-compat fields", registryMissing.join(", "));
  } else {
    ok = pass("registry OpenAI-compat fields") && ok;
  }

  console.log(ok ? "\nALL PASS" : "\nFAILED");
  process.exit(ok ? 0 : 1);
}

main();
