#!/usr/bin/env node
/**
 * P820 — Admin / Docs / Model catalog public-beta smoke (offline, static).
 *
 * Checks:
 * 1) Admin nav groups + /admin/docs route exist
 * 2) Channels / Settings show readonly notices (no fake save buttons)
 * 3) Docs registry has required fields + real Tokfai API paths
 * 4) Consumer docs / models / pricing stay separated
 * 5) No consumer Base URL pointing at grsaiapi.com as the integration host
 * 6) No leaked nav.* / dashboard.* raw keys in key consumer surfaces
 *
 * Usage: node scripts/p820-admin-docs-catalog-smoke.mjs
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  findConsumerLeak,
  findGrsaiapiAsIntegrationHost,
} from "./lib/consumer-docs-leak.mjs";

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

function checkAdminNavGroups() {
  const nav = read("apps/web/lib/admin-nav.ts");
  const required = [
    'group: "ops"',
    'group: "catalog"',
    'group: "content"',
    'group: "system"',
    'href: "/admin/docs"',
    "adminNavItemsByGroup",
  ];
  const missing = required.filter((s) => !nav.includes(s));
  if (missing.length) {
    return fail("admin nav groups + docs entry", missing.join(", "));
  }
  if (!existsSync(join(ROOT, "apps/web/app/admin/docs/page.tsx"))) {
    return fail("admin docs page exists");
  }
  return pass("admin nav groups + /admin/docs");
}

function checkReadonlySurfaces() {
  const channels = read(
    "apps/web/components/admin/admin-channels-panel.tsx"
  );
  const settings = read(
    "apps/web/components/admin/admin-settings-panel.tsx"
  );
  if (!channels.includes("AdminReadonlyNotice")) {
    return fail("channels uses AdminReadonlyNotice");
  }
  if (channels.includes("AdminDisabledWriteActions")) {
    return fail("channels must not show fake disabled write buttons");
  }
  if (!settings.includes("AdminReadonlyNotice")) {
    return fail("settings uses AdminReadonlyNotice");
  }
  if (settings.includes("AdminDisabledWriteActions")) {
    return fail("settings must not show fake Save button");
  }
  return pass("channels/settings are explicit read-only");
}

function checkDocsRegistry() {
  const registry = read("apps/web/lib/docs/public-beta-docs-registry.ts");
  const requiredSlugs = [
    "quickstart",
    "authentication",
    "chat-completions",
    "responses-api",
    "image-api",
    "image-reference-edit",
    "cherry-studio",
    "models-and-pricing",
    "gemini-native",
    "billing",
    "error-codes",
    "faq",
    "troubleshooting",
  ];
  const missing = requiredSlugs.filter(
    (slug) => !registry.includes(`slug: "${slug}"`)
  );
  if (missing.length) {
    return fail("docs registry slugs", missing.join(", "));
  }
  for (const field of [
    "audience:",
    "category:",
    "language:",
    "markdown:",
    "updatedAt:",
    "apiPaths:",
  ]) {
    if (!registry.includes(field)) {
      return fail("docs registry fields", `missing ${field}`);
    }
  }
  if (
    !registry.includes("https://api.tokfai.com") &&
    !registry.includes("TOKFAI_API_ORIGIN")
  ) {
    return fail("docs registry uses api.tokfai.com");
  }
  if (!registry.includes("/v1/images/generations")) {
    return fail("image doc path is /v1/images/generations");
  }
  if (!registry.includes("/v1/chat/completions")) {
    return fail("chat doc path is /v1/chat/completions");
  }
  if (!registry.includes("/v1/responses")) {
    return fail("responses doc path is /v1/responses");
  }
  return pass("docs registry fields + production API paths");
}

function checkNoUpstreamBrandLeak() {
  const files = [
    "apps/web/lib/docs/public-beta-docs-registry.ts",
    "apps/web/components/consumer-docs-guide.tsx",
    "apps/web/components/pricing-content.tsx",
    "apps/web/app/dashboard/models/models-client.tsx",
    "apps/web/lib/i18n/troubleshooting-case-messages.ts",
    "apps/web/lib/model-catalog.ts",
    "apps/web/lib/docs/consumer-model-groups.ts",
  ];
  const bad = [];
  for (const rel of files) {
    const src = read(rel);
    const leak = findConsumerLeak(src);
    if (leak) bad.push(`${rel} → ${leak}`);
    const asHost = findGrsaiapiAsIntegrationHost(src);
    if (asHost) bad.push(`${rel} → ${asHost}`);
  }
  if (bad.length) {
    return fail(
      "consumer-facing sources must not recommend upstream hosts",
      bad.join(", ")
    );
  }
  return pass("no upstream brand leak in consumer docs/ui sources");
}

function checkSurfaceSeparation() {
  const models = read("apps/web/app/dashboard/models/models-client.tsx");
  const pricing = read("apps/web/components/pricing-content.tsx");
  const docs = read("apps/web/components/consumer-docs-guide.tsx");
  const groups = read("apps/web/lib/docs/consumer-model-groups.ts");

  if (!models.includes("CONSUMER_MODEL_GROUPS")) {
    return fail("models page uses capability groups");
  }
  if (models.includes("CHAT_COMPLETIONS_CURL") || models.includes("curl https://api.tokfai.com/v1/chat")) {
    return fail("models page must not dump curl API docs");
  }
  if (!pricing.includes("Related pages") && !pricing.includes("相关页面")) {
    return fail("pricing page links out to models/docs");
  }
  if (!docs.includes("PUBLIC_BETA_DOCS")) {
    return fail("consumer docs render from registry");
  }
  if (
    !groups.includes('"recommended"') ||
    !groups.includes('"image"') ||
    !groups.includes("CONSUMER_VISIBLE_IMAGE_MODEL_IDS")
  ) {
    return fail("consumer model groups cover recommended + image models");
  }
  return pass("models / pricing / docs surfaces are separated");
}

function checkNoRawI18nKeys() {
  const files = [
    "apps/web/components/consumer-docs-guide.tsx",
    "apps/web/app/dashboard/models/models-client.tsx",
    "apps/web/components/pricing-content.tsx",
    "apps/web/components/admin/admin-docs-panel.tsx",
    "apps/web/components/admin/admin-channels-panel.tsx",
    "apps/web/components/admin/admin-settings-panel.tsx",
  ];
  const bad = [];
  for (const rel of files) {
    const src = read(rel);
    if (/>\s*(nav|dashboard|admin)\.[a-zA-Z0-9.]+\s*</.test(src)) {
      bad.push(rel);
    }
  }
  if (bad.length) {
    return fail("no leaked i18n keys", bad.join(", "));
  }
  return pass("no leaked nav/dashboard/admin i18n keys");
}

function checkOverviewBetaCard() {
  const overview = read(
    "apps/web/components/admin/admin-overview-panel.tsx"
  );
  const page = read("apps/web/app/admin/overview/page.tsx");
  if (!overview.includes("betaStatusTitle")) {
    return fail("overview shows public beta status card");
  }
  if (!page.includes("availableModelsCount") || !page.includes("rechargePlansCount")) {
    return fail("overview page loads model + pack counts");
  }
  return pass("admin overview public-beta status card");
}

let ok = true;
ok = checkAdminNavGroups() && ok;
ok = checkReadonlySurfaces() && ok;
ok = checkDocsRegistry() && ok;
ok = checkNoUpstreamBrandLeak() && ok;
ok = checkSurfaceSeparation() && ok;
ok = checkNoRawI18nKeys() && ok;
ok = checkOverviewBetaCard() && ok;

if (!ok) process.exit(1);
console.log("\nP820 admin/docs/catalog smoke: all checks passed.");
