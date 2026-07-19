#!/usr/bin/env node
/**
 * P929 — Cherry Studio guidance smoke (offline, static).
 *
 * Ensures docs / dashboard guidance tell users to configure Tokfai as a custom
 * OpenAI Compatible provider, and diagnose wrong built-in OpenAI / Gemini
 * provider selection. Does not hit network or DMIT.
 *
 * Usage: node scripts/p929-cherry-studio-guidance-smoke.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findGrsaiapiAsIntegrationHost } from "./lib/consumer-docs-leak.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const DOC_FILES = [
  "docs/tokfai-third-party-clients.zh.md",
  "docs/tokfai-integration-docs.zh.md",
  "apps/web/lib/docs/public-beta-docs-registry.ts",
  "apps/web/lib/i18n/messages.ts",
  "apps/web/lib/i18n/troubleshooting-case-messages.ts",
];

/** Phrases that must appear somewhere in the Cherry guidance corpus. */
const REQUIRED_PHRASES = [
  "Cherry Studio",
  "OpenAI Compatible",
  "https://api.tokfai.com/v1",
  "不要选择 OpenAI / Gemini 内置供应商",
  "如果请求路径不是 api.tokfai.com，说明没有走 Tokfai",
  "Tokfai GPT-5.4 Pro | Tokfai",
  "GPT 5.4 Pro | OpenAI",
  "Gemini 3.1 Pro Preview | Gemini",
];

/** Third-party guide must not list upstream hosts (even as diagnostics). */
const THIRD_PARTY_GUIDE = "docs/tokfai-third-party-clients.zh.md";
const FORBIDDEN_IN_THIRD_PARTY_GUIDE = [
  /grsaiapi\.com/i,
  /https?:\/\/openai\.com/i,
  /generativelanguage\.googleapis\.com/i,
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

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

console.log("=== P929 Cherry Studio guidance smoke ===\n");
let ok = true;

const corpus = DOC_FILES.map((rel) => {
  try {
    return read(rel);
  } catch {
    return "";
  }
}).join("\n");

for (const phrase of REQUIRED_PHRASES) {
  if (!corpus.includes(phrase)) {
    ok = fail(`guidance contains ${JSON.stringify(phrase)}`, "missing") && ok;
  } else {
    ok = pass(`guidance contains ${JSON.stringify(phrase)}`) && ok;
  }
}

{
  const asHost = findGrsaiapiAsIntegrationHost(corpus);
  if (asHost) {
    ok =
      fail(
        "grsaiapi.com is not used as a user config Base URL",
        asHost
      ) && ok;
  } else {
    ok =
      pass("grsaiapi.com is not used as a user config Base URL") && ok;
  }
}

{
  // https://grsaiapi.com must never appear as an integration URL form.
  if (/https?:\/\/grsaiapi\.com/i.test(corpus)) {
    ok =
      fail(
        "docs never expose https://grsaiapi.com as config URL",
        "found https://grsaiapi.com"
      ) && ok;
  } else {
    ok =
      pass("docs never expose https://grsaiapi.com as config URL") && ok;
  }
}

{
  const guide = read(THIRD_PARTY_GUIDE);
  let leak = null;
  for (const re of FORBIDDEN_IN_THIRD_PARTY_GUIDE) {
    if (re.test(guide)) {
      leak = String(re);
      break;
    }
  }
  if (leak) {
    ok =
      fail(
        "third-party guide does not list upstream hosts as config",
        leak
      ) && ok;
  } else {
    ok =
      pass("third-party guide does not list upstream hosts as config") &&
      ok;
  }

  if (!guide.includes("不要选择 OpenAI / Gemini 内置供应商")) {
    ok =
      fail(
        "third-party Cherry section warns against built-in providers",
        "missing"
      ) && ok;
  } else {
    ok =
      pass("third-party Cherry section warns against built-in providers") &&
      ok;
  }

  if (!guide.includes("如果请求路径不是 api.tokfai.com，说明没有走 Tokfai")) {
    ok =
      fail(
        "third-party Cherry section has wrong-path diagnostic",
        "missing"
      ) && ok;
  } else {
    ok =
      pass("third-party Cherry section has wrong-path diagnostic") && ok;
  }
}

console.log(
  ok
    ? "\nTOKFAI_P929_CHERRY_STUDIO_GUIDANCE_PASS"
    : "\nTOKFAI_P929_CHERRY_STUDIO_GUIDANCE_FAIL"
);
process.exit(ok ? 0 : 1);
