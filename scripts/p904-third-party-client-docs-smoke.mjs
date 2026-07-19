#!/usr/bin/env node
/**
 * P904 — Third-party client docs smoke (offline).
 *
 * Ensures Cherry Studio / Chatbox / Codex docs tell users to pick Tokfai
 * provider, not OpenAI / Google / grsaiapi, and do not teach upstream hosts
 * as Base URL.
 *
 * Usage: node scripts/p904-third-party-client-docs-smoke.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  findConsumerLeak,
  findGrsaiapiAsIntegrationHost,
} from "./lib/consumer-docs-leak.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const DOC_FILES = [
  "apps/web/lib/docs/public-beta-docs-registry.ts",
  "docs/tokfai-integration-docs.zh.md",
  "docs/tokfai-customer-api-reference.zh.md",
  "docs/tokfai-third-party-clients.zh.md",
];

const REQUIRED_PHRASES = [
  "| tokfai",
  "Cherry Studio",
  "Chatbox",
  "NextChat",
  "OpenWebUI",
  "Dify",
  "FastGPT",
  "Continue",
  "Cline",
  "Roo Code",
  "https://api.tokfai.com/v1",
  "gpt-5.4",
  "gpt-5.4-pro",
  "model_not_available",
  "insufficient_credits",
  "rate_limited",
  "upstream_busy",
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

console.log("=== P904 third-party client docs smoke ===\n");
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
    ok = fail(`docs contain ${JSON.stringify(phrase)}`, "missing") && ok;
  } else {
    ok = pass(`docs contain ${JSON.stringify(phrase)}`) && ok;
  }
}

// Must not instruct users to use OpenAI / Google / grsai as the provider name.
{
  const badProvider =
    /Base URL[^\n]{0,80}openai\.com/i.test(corpus) ||
    /provider[^\n]{0,40}\bOpenAI\b[^\n]{0,40}(选|choose|select)/i.test(corpus);
  if (badProvider) {
    ok =
      fail(
        "docs do not instruct OpenAI.com as Tokfai Base URL",
        "found OpenAI base/provider instruction"
      ) && ok;
  } else {
    ok = pass("docs do not use openai.com as Tokfai Base URL") && ok;
  }
}

{
  const asHost = findGrsaiapiAsIntegrationHost(corpus);
  if (asHost) {
    ok = fail("no grsaiapi.com as integration host", asHost) && ok;
  } else {
    ok = pass("docs do not use grsaiapi.com as integration Base URL") && ok;
  }
}

for (const rel of [
  "apps/web/lib/docs/public-beta-docs-registry.ts",
  "apps/web/lib/i18n/troubleshooting-case-messages.ts",
]) {
  try {
    const leak = findConsumerLeak(read(rel));
    if (leak) {
      ok = fail(`no upstream leak in ${rel}`, leak) && ok;
    } else {
      ok = pass(`no upstream leak in ${rel}`) && ok;
    }
  } catch (err) {
    ok = fail(`read ${rel}`, String(err)) && ok;
  }
}

{
  const aliases = read("apps/dmit-api/src/upstream/modelAliases.ts");
  const display = read("apps/dmit-api/src/catalog/clientModelDisplayName.ts");
  if (
    !display.includes("Tokfai") ||
    !aliases.includes('owned_by: "tokfai"') ||
    !aliases.includes("gpt-5.4-pro")
  ) {
    ok =
      fail(
        "catalog Tokfai branding",
        "display_name / owned_by tokfai missing"
      ) && ok;
  } else {
    ok = pass("catalog owned_by=tokfai + Tokfai display names") && ok;
  }
}

if (!ok) {
  console.error("\nTOKFAI_P904_THIRD_PARTY_DOCS_FAIL");
  process.exit(1);
}
console.log("\nTOKFAI_P904_THIRD_PARTY_DOCS_PASS");
process.exit(0);
