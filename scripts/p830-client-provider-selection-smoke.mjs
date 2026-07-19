#!/usr/bin/env node
/**
 * P830 — Third-party client provider-selection smoke (offline).
 *
 * 1) Consumer docs require "| tokfai" and wrong-provider diagnostic for grsaiapi.com
 * 2) Docs must not use https://grsaiapi.com as an integration Base URL
 * 3) Offline /v1/models exposes Tokfai-prefixed display names; ids unchanged
 * 4) /v1/models includes at least one gpt* and one gemini* chat model
 *
 * Usage: node scripts/p830-client-provider-selection-smoke.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isLiveMode,
  resolveAcceptanceApiKey,
  resolveApiBaseUrl,
  printOfflineDefaultHint,
} from "./lib/acceptance-config.mjs";
import { acceptanceFetch } from "./lib/acceptance-http.mjs";
import {
  findConsumerLeak,
  findGrsaiapiAsIntegrationHost,
} from "./lib/consumer-docs-leak.mjs";
import { ensureMockGateway } from "./lib/ensure-mock-gateway.mjs";

const SCRIPT = "scripts/p830-client-provider-selection-smoke.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LIVE = isLiveMode();
let mockChild = null;

const REQUIRED_DOC_PHRASES = [
  "| tokfai",
  "如果出现 grsaiapi.com，说明没有走 Tokfai",
  "TOKFAI_READY",
];

const DOC_FILES = [
  "apps/web/lib/docs/public-beta-docs-registry.ts",
  "docs/tokfai-integration-docs.zh.md",
  "docs/tokfai-customer-api-reference.zh.md",
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

async function main() {
  console.log("P830 client provider-selection smoke\n");
  let ok = true;

  const corpus = DOC_FILES.map((rel) => {
    try {
      return read(rel);
    } catch {
      return "";
    }
  }).join("\n");

  for (const phrase of REQUIRED_DOC_PHRASES) {
    if (!corpus.includes(phrase)) {
      ok = fail(`docs contain ${JSON.stringify(phrase)}`, "missing") && ok;
    } else {
      ok = pass(`docs contain ${JSON.stringify(phrase)}`) && ok;
    }
  }

  const asHost = findGrsaiapiAsIntegrationHost(corpus);
  if (asHost) {
    ok = fail("docs do not use grsaiapi.com as integration host", asHost) && ok;
  } else {
    ok = pass("docs do not use grsaiapi.com as integration host") && ok;
  }

  for (const rel of [
    "apps/web/lib/docs/public-beta-docs-registry.ts",
    "apps/web/lib/i18n/troubleshooting-case-messages.ts",
  ]) {
    const leak = findConsumerLeak(read(rel));
    if (leak) {
      ok = fail(`no upstream integration leak in ${rel}`, leak) && ok;
    } else {
      ok = pass(`no upstream integration leak in ${rel}`) && ok;
    }
  }

  let BASE;
  let API_KEY;
  if (!LIVE) {
    printOfflineDefaultHint(SCRIPT);
    const mock = await ensureMockGateway();
    mockChild = mock.child ?? null;
    BASE = mock.baseUrl.replace(/\/v1$/, "");
    API_KEY = resolveAcceptanceApiKey(false, mock.apiKey);
  } else {
    BASE = resolveApiBaseUrl(true).replace(/\/v1$/, "");
    API_KEY = resolveAcceptanceApiKey(true);
  }

  const { res, body } = await acceptanceFetch(`${BASE}/v1/models`, {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    timeoutMs: 30_000,
  });

  if (res.status !== 200 || !Array.isArray(body?.data)) {
    ok = fail("GET /v1/models", `HTTP ${res.status}`) && ok;
  } else {
    const rows = body.data;
    const ids = rows.map((r) => r.id).filter(Boolean);
    const hasGpt = ids.some((id) => /^gpt/i.test(id));
    const hasGemini = ids.some((id) => /^gemini/i.test(id));
    const required = ["gpt-5", "gpt-5-pro", "gpt-5.4-pro", "gemini-3-pro"];
    const missing = required.filter((id) => !ids.includes(id));
    if (!hasGpt || !hasGemini || missing.length) {
      ok =
        fail(
          "GET /v1/models exposes gpt + gemini + compat aliases",
          `missing=${missing.join(",") || "none"} ids=${ids.slice(0, 16).join(",")}`
        ) && ok;
    } else {
      ok = pass("GET /v1/models exposes gpt + gemini + compat aliases") && ok;
    }

    const prefixed = rows.filter((r) => {
      const label = r.display_name || r.name || r.title;
      return typeof label === "string" && /^Tokfai\s+/i.test(label);
    });
    if (prefixed.length < 1) {
      ok =
        fail(
          "GET /v1/models Tokfai display_name/name prefix",
          "no Tokfai-prefixed display labels"
        ) && ok;
    } else {
      ok =
        pass(
          `GET /v1/models Tokfai display labels (${prefixed.length}/${rows.length})`
        ) && ok;
    }

    // Ids must stay raw (no Tokfai- prefix on id itself).
    const badIds = ids.filter((id) => /^Tokfai\s+/i.test(id));
    if (badIds.length) {
      ok = fail("model ids stay unprefixed", badIds.join(", ")) && ok;
    } else {
      ok = pass("model ids stay unprefixed") && ok;
    }
  }

  if (mockChild) mockChild.kill();
  console.log(ok ? "\nALL PASS" : "\nFAILED");
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  if (mockChild) mockChild.kill();
  console.error(err);
  process.exit(1);
});
