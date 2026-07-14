#!/usr/bin/env node
/**
 * P829 — Image workbench session/balance consumer smoke (offline, static).
 *
 * Checks:
 * 1) image workbench does not request api key reveal on load
 * 2) image workbench does not require api key UI / ensurePlaygroundApiKey
 * 3) image workbench uses account balance / session gating
 * 4) consumer browser fetches do not attach X-Tokfai-Host
 * 5) API key page still uses reveal/list correctly
 *
 * Usage: node scripts/p829-image-workbench-session-smoke.mjs
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

function checkWorkbenchNoRevealOnLoad() {
  const page = read("apps/web/app/dashboard/image-playground/page.tsx");
  const vision = read(
    "apps/web/app/dashboard/image-playground/ecommerce-vision-tab.tsx"
  );
  const generate = read(
    "apps/web/app/dashboard/image-playground/image-playground-client.tsx"
  );
  const workbench = read(
    "apps/web/app/dashboard/image-playground/image-workbench-client.tsx"
  );

  const surface = [page, vision, generate, workbench].join("\n");

  if (surface.includes("/v1/me/api-keys/reveal")) {
    return fail("image workbench does not request api key reveal");
  }
  if (surface.includes("ensurePlaygroundApiKey")) {
    return fail("image workbench does not call ensurePlaygroundApiKey");
  }
  if (surface.includes("revealMeApiKey")) {
    return fail("image workbench does not call revealMeApiKey");
  }
  if (/loadActiveKeys|activeKeys/.test(page)) {
    return fail(
      "image workbench page does not list /v1/me/api-keys on load",
      "page still references activeKeys / loadActiveKeys"
    );
  }
  if (page.includes("/v1/me/api-keys")) {
    return fail("image workbench page does not request /v1/me/api-keys");
  }

  return pass("image workbench does not request api key reveal");
}

function checkWorkbenchNoApiKeyRequirement() {
  const vision = read(
    "apps/web/app/dashboard/image-playground/ecommerce-vision-tab.tsx"
  );
  const generate = read(
    "apps/web/app/dashboard/image-playground/image-playground-client.tsx"
  );
  const labels = read(
    "apps/web/app/dashboard/image-playground/image-playground-labels.ts"
  );

  if (vision.includes("resolvedSecret") || generate.includes("resolvedSecret")) {
    return fail("image workbench does not require api key", "resolvedSecret still present");
  }
  if (/体验密钥/.test(labels)) {
    return fail("image workbench copy avoids experience-key wording", "ZH still mentions 体验密钥");
  }
  if (!vision.includes("consumerChatCompletions")) {
    return fail("vision tab uses session consumer chat API");
  }
  if (!generate.includes("consumerImageGenerationsWithProgress")) {
    return fail("generate panel uses session consumer image API");
  }

  return pass("image workbench does not require api key");
}

function checkBalanceDriven() {
  const vision = read(
    "apps/web/app/dashboard/image-playground/ecommerce-vision-tab.tsx"
  );
  const generate = read(
    "apps/web/app/dashboard/image-playground/image-playground-client.tsx"
  );
  const toolbench = read(
    "apps/web/app/dashboard/image-playground/image-playground-toolbench-client.tsx"
  );
  const labels = read(
    "apps/web/app/dashboard/image-playground/image-playground-labels.ts"
  );

  const requiredKeys = [
    "dashboard.imageWorkbench.checkingAccount",
    "dashboard.imageWorkbench.insufficientCredits",
    "dashboard.imageWorkbench.serviceBusy",
    "dashboard.imageWorkbench.initFailed",
    "dashboard.imageWorkbench.loginRequired",
  ];
  for (const key of requiredKeys) {
    if (!labels.includes(`"${key}"`)) {
      return fail("image workbench uses account balance state", `missing label ${key}`);
    }
  }

  if (!vision.includes("insufficientCredits") || !vision.includes("creditsLoaded")) {
    return fail("vision tab gates on balance/login");
  }
  if (!generate.includes("accountBlocked") || !generate.includes("initialCreditsBalance")) {
    return fail("generate panel gates on balance/login");
  }
  if (!toolbench.includes("accountBlocked")) {
    return fail("generate button accepts accountBlocked");
  }
  if (!toolbench.includes("toolbenchBalanceLabel") && !toolbench.includes("balanceDisplay")) {
    return fail("settings panel shows balance");
  }

  return pass("image workbench uses account balance state");
}

function checkNoBrowserTokfaiHost() {
  const dmitFetch = read("apps/web/lib/dashboard-safe/dmit-fetch.ts");
  const dmitClient = read("apps/web/lib/dmit/client.ts");
  const consumerApi = read(
    "apps/web/lib/dashboard-safe/consumer-workbench-api.ts"
  );
  const server = read("apps/web/lib/dmit/server.ts");

  if (dmitFetch.includes("tokfaiHostHeaders")) {
    return fail(
      "consumer browser requests do not include x-tokfai-host",
      "dashboard-safe/dmit-fetch still imports tokfaiHostHeaders"
    );
  }
  if (dmitClient.includes("tokfaiHostHeaders")) {
    return fail(
      "consumer browser requests do not include x-tokfai-host",
      "lib/dmit/client still imports tokfaiHostHeaders"
    );
  }
  if (!dmitFetch.includes("consumerDmitFetch") || !dmitFetch.includes("developerDmitFetch")) {
    return fail("consumer vs developer fetch aliases exist");
  }
  if (!consumerApi.includes("consumer-workbench-actions")) {
    return fail("consumer workbench API uses server actions");
  }
  if (!server.includes("tokfaiHostHeaders")) {
    return fail("server→DMIT still may derive host headers");
  }

  return pass("consumer browser requests do not include x-tokfai-host");
}

function checkApiKeysPageStillUsesReveal() {
  const apiKeysClient = read("apps/web/app/dashboard/api-keys/api-keys-client.tsx");
  const apiKeysSafe = read("apps/web/lib/dashboard-safe/api-keys-client.ts");
  const apiKeysPage = read("apps/web/app/dashboard/api-keys/page.tsx");

  if (!apiKeysClient.includes("revealMeApiKey")) {
    return fail("API key page still uses reveal/list correctly", "missing revealMeApiKey");
  }
  if (!apiKeysSafe.includes("ME_API_KEYS_REVEAL_PATH") || !apiKeysSafe.includes("developerDmitFetch")) {
    return fail(
      "API key page still uses reveal/list correctly",
      "developer client / reveal path missing"
    );
  }
  if (!apiKeysPage.includes("/v1/me/api-keys")) {
    return fail("API key page still uses reveal/list correctly", "SSR list path missing");
  }
  if (!apiKeysSafe.includes("createApiKey") || !apiKeysSafe.includes("revokeApiKey")) {
    return fail("API key page still uses reveal/list correctly", "create/revoke missing");
  }

  return pass("API key page still uses reveal/list correctly");
}

let ok = true;
ok = checkWorkbenchNoRevealOnLoad() && ok;
ok = checkWorkbenchNoApiKeyRequirement() && ok;
ok = checkBalanceDriven() && ok;
ok = checkNoBrowserTokfaiHost() && ok;
ok = checkApiKeysPageStillUsesReveal() && ok;

if (!ok) {
  process.exit(1);
}
console.log("\nP829 image workbench session smoke: all checks passed.");
