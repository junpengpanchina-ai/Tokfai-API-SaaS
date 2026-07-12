#!/usr/bin/env node
/**
 * P819 — Public-beta consumer path smoke (offline, static).
 *
 * Covers first-login → Chat / Image analysis / Product copy / Image generate+edit
 * without changing Stripe, Supabase schema, or DMIT API contracts.
 *
 * Checks:
 * 1) i18n keys do not leak (nav.* / dashboard.* / imageWorkbench.*)
 * 2) dashboard shell + chat playground copy exists (en + zh)
 * 3) image workbench three-tab copy exists (en + zh)
 * 4) tab API isolation (vision = chat; generate = images)
 * 5) reference edit: no image → blocked; with image → images / image_urls
 * 6) default API key auto-provision wired for Chat + Image workbench
 * 7) locale switch refreshes playground / image workbench labels
 * 8) failures prefer friendly copy; raw upstream stays in collapsed Details
 * 9) progress copy mentions 20–60 second wait
 * 10) Usage / Credits / Models pages fail-open (no bare throw on empty state)
 *
 * Usage: node scripts/p819-public-beta-smoke.mjs
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

function extractLabelMap(src, blockName) {
  const re = new RegExp(
    `const ${blockName}: Record<string, string> = \\{([\\s\\S]*?)\\n\\};`
  );
  const m = src.match(re);
  const out = {};
  if (!m) return out;
  let i = 0;
  const body = m[1];
  while (i < body.length) {
    const keyMatch = body.slice(i).match(/^[\s,]*"([^"]+)":\s*/);
    if (!keyMatch) break;
    i += keyMatch[0].length;
    const key = keyMatch[1];
    if (body[i] === '"') {
      i += 1;
      let value = "";
      while (i < body.length) {
        const ch = body[i];
        if (ch === "\\") {
          value += body[i + 1] ?? "";
          i += 2;
          continue;
        }
        if (ch === '"') {
          i += 1;
          break;
        }
        value += ch;
        i += 1;
      }
      out[key] = value;
      continue;
    }
    const next = body.slice(i).match(/^[^,]*/);
    i += next ? next[0].length : 1;
  }
  return out;
}

function extractGeneratedTables(src) {
  const enMatch = src.match(
    /export const EN: Record<string, string> = \{([\s\S]*?)\n\};/
  );
  const zhMatch = src.match(
    /export const ZH: Record<string, string> = \{([\s\S]*?)\n\};/
  );
  const parse = (body) => {
    const out = {};
    if (!body) return out;
    const re = /"([^"]+)":\s*"((?:\\.|[^"\\])*)"/g;
    let m;
    while ((m = re.exec(body))) {
      out[m[1]] = m[2].replace(/\\"/g, '"').replace(/\\n/g, "\n");
    }
    return out;
  };
  return { en: parse(enMatch?.[1]), zh: parse(zhMatch?.[1]) };
}

function loadImageWorkbenchLabels() {
  const src = read(
    "apps/web/app/dashboard/image-playground/image-playground-labels.ts"
  );
  return { en: extractLabelMap(src, "EN"), zh: extractLabelMap(src, "ZH") };
}

function loadPlaygroundLabels() {
  const src = read("apps/web/app/dashboard/playground/playground-labels.ts");
  return { en: extractLabelMap(src, "EN"), zh: extractLabelMap(src, "ZH") };
}

function loadDashboardLabels() {
  return extractGeneratedTables(
    read("apps/web/lib/dashboard-safe/labels.generated.ts")
  );
}

function requireKeys(tables, keys, label) {
  const missing = [];
  for (const key of keys) {
    const en = (tables.en[key] ?? "").trim();
    const zh = (tables.zh[key] ?? "").trim();
    if (!en || !zh) missing.push(key);
  }
  if (missing.length) {
    return fail(label, missing.slice(0, 20).join(", "));
  }
  return pass(label);
}

function checkNoLeakedKeys() {
  const files = [
    "apps/web/lib/dashboard-safe/language-switcher.tsx",
    "apps/web/components/dashboard-shell-nav.tsx",
    "apps/web/components/dashboard-shell-static-fallback.tsx",
    "apps/web/app/dashboard/image-playground/image-workbench-client.tsx",
    "apps/web/app/dashboard/image-playground/image-playground-client.tsx",
    "apps/web/app/dashboard/image-playground/image-playground-toolbench-client.tsx",
    "apps/web/app/dashboard/image-playground/ecommerce-vision-tab.tsx",
    "apps/web/app/dashboard/image-playground/workbench-progress.tsx",
    "apps/web/app/dashboard/playground/playground-client.tsx",
  ];
  const bad = [];
  for (const rel of files) {
    const src = read(rel);
    if (/>\s*(nav|dashboard|imageWorkbench)\.[a-zA-Z0-9.]+\s*</.test(src)) {
      bad.push(rel);
    }
  }
  if (bad.length) {
    return fail("no leaked i18n keys in consumer UI", bad.join(", "));
  }
  return pass("consumer pages do not leak i18n keys");
}

function checkNavLanguageKey(dashboard) {
  const messages = read("apps/web/lib/i18n/messages.ts");
  if (!/language:\s*"Language"/.test(messages) || !/language:\s*"语言"/.test(messages)) {
    return fail("messages.ts defines nav.language en+zh");
  }
  if (!dashboard.en["nav.language"] || !dashboard.zh["nav.language"]) {
    return fail("labels.generated includes nav.language en+zh");
  }
  const switcher = read("apps/web/lib/dashboard-safe/language-switcher.tsx");
  if (!switcher.includes('t("nav.language")')) {
    return fail("language switcher uses nav.language");
  }
  return pass("nav.language present for language switcher");
}

function checkDashboardShellCopy(dashboard) {
  return requireKeys(
    dashboard,
    [
      "nav.overview",
      "nav.playground",
      "nav.imagePlayground",
      "nav.models",
      "nav.usage",
      "nav.credits",
      "nav.apiKeys",
      "nav.docs",
      "nav.language",
      "nav.sectionWorkspace",
      "nav.sectionMetering",
      "nav.sectionService",
      "common.language",
      "common.signedInAs",
    ],
    "dashboard shell nav copy en+zh"
  );
}

function checkChatPlaygroundCopy(playground) {
  return requireKeys(
    playground,
    [
      "dashboard.playground.title",
      "dashboard.playground.subtitle",
      "dashboard.playground.autoKeyHint",
      "dashboard.playground.createExperienceKey",
      "dashboard.playground.run",
    ],
    "chat playground copy en+zh"
  );
}

function checkImageWorkbenchTabs(tables) {
  return requireKeys(
    tables,
    [
      "dashboard.imageWorkbench.title",
      "dashboard.imageWorkbench.subtitle",
      "dashboard.imageWorkbench.tabAnalysis",
      "dashboard.imageWorkbench.tabCopy",
      "dashboard.imageWorkbench.tabGenerate",
      "dashboard.imageWorkbench.tabAnalysisDesc",
      "dashboard.imageWorkbench.tabCopyDesc",
      "dashboard.imageWorkbench.tabGenerateDesc",
      "dashboard.imageWorkbench.analysisTitle",
      "dashboard.imageWorkbench.copyTitle",
    ],
    "image workbench three-tab copy en+zh"
  );
}

function checkTabApiIsolation() {
  const vision = read(
    "apps/web/app/dashboard/image-playground/ecommerce-vision-tab.tsx"
  );
  const generate = read(
    "apps/web/app/dashboard/image-playground/image-playground-client.tsx"
  );
  const workbench = read(
    "apps/web/app/dashboard/image-playground/image-workbench-client.tsx"
  );

  if (!vision.includes("chatCompletions")) {
    return fail("analysis/copy tabs call chatCompletions");
  }
  if (vision.includes("imageGenerations")) {
    return fail(
      "analysis/copy must not call imageGenerations",
      "ecommerce-vision-tab imports/calls imageGenerations"
    );
  }
  if (!generate.includes("imageGenerations")) {
    return fail("generate tab calls imageGenerations");
  }
  if (
    !workbench.includes('mode="ecommerce_image_analysis"') ||
    !workbench.includes('mode="product_copy"') ||
    !workbench.includes("ImageGeneratePanel")
  ) {
    return fail("workbench wires three independent tabs");
  }

  const tables = imageTablesCache ?? loadImageWorkbenchLabels();
  const analysisEn = tables.en["dashboard.imageWorkbench.tabAnalysisDesc"] ?? "";
  const analysisZh = tables.zh["dashboard.imageWorkbench.tabAnalysisDesc"] ?? "";
  const copyEn = tables.en["dashboard.imageWorkbench.tabCopyDesc"] ?? "";
  const copyZh = tables.zh["dashboard.imageWorkbench.tabCopyDesc"] ?? "";
  if (
    !analysisEn.toLowerCase().includes("does not generate") ||
    !analysisZh.includes("不生成") ||
    !copyEn.toLowerCase().includes("does not generate") ||
    !copyZh.includes("不生成")
  ) {
    return fail(
      "analysis/copy tab copy says no image generation",
      `analysisEn=${JSON.stringify(analysisEn).slice(0, 80)} analysisZh=${JSON.stringify(analysisZh).slice(0, 40)}`
    );
  }

  return pass("three workbench tabs stay API-isolated");
}

function checkReferenceEditGuards() {
  const client = read(
    "apps/web/app/dashboard/image-playground/image-playground-client.tsx"
  );
  const promptLib = read("apps/web/lib/dashboard-safe/image-edit-prompt.ts");

  if (!client.includes("promptImpliesReferenceEdit")) {
    return fail("reference edit uses promptImpliesReferenceEdit");
  }
  if (!client.includes("reference_image_required")) {
    return fail("blocks subject preserve without reference image");
  }
  if (!client.includes("referenceImageRequired")) {
    return fail("shows referenceImageRequired copy when blocked");
  }
  if (!/images:\s*/.test(client) || !client.includes("image_urls")) {
    return fail("reference edit request includes images / image_urls");
  }
  if (!promptLib.includes("保留主体") || !promptLib.includes("换背景")) {
    return fail("Chinese subject-preserve intent patterns");
  }
  if (
    !promptLib.includes("same\\s+person") ||
    !promptLib.includes("change(?:\\s+the)?\\s+background")
  ) {
    return fail("English subject-preserve intent patterns");
  }
  return pass("reference edit guards + images payload");
}

function checkDefaultApiKeyProvisioning() {
  const shared = read("apps/web/lib/dashboard-safe/playground-default-key.ts");
  const chat = read("apps/web/app/dashboard/playground/playground-client.tsx");
  const vision = read(
    "apps/web/app/dashboard/image-playground/ecommerce-vision-tab.tsx"
  );
  const generate = read(
    "apps/web/app/dashboard/image-playground/image-playground-client.tsx"
  );

  if (
    !shared.includes("DEFAULT_PLAYGROUND_KEY_NAME") ||
    !shared.includes("createApiKey")
  ) {
    return fail("default key helper can auto-create a key");
  }
  if (!chat.includes("prepareDefaultKey") || !chat.includes("playground-default-key")) {
    return fail("chat playground auto-provisions default key");
  }
  if (!vision.includes("playground-default-key")) {
    return fail("vision tabs auto-provision default key");
  }
  if (!generate.includes("prepareDefaultKey") || !generate.includes("playground-default-key")) {
    return fail("image generate tab auto-provisions default key");
  }
  return pass("default API key auto-provision wired");
}

function checkLocaleSync() {
  const imageHook = read(
    "apps/web/app/dashboard/image-playground/use-image-playground-labels.ts"
  );
  const chatHook = read(
    "apps/web/app/dashboard/playground/use-playground-labels.ts"
  );
  if (!imageHook.includes("DASHBOARD_LOCALE_EVENT")) {
    return fail("image workbench listens for locale changes");
  }
  if (!chatHook.includes("DASHBOARD_LOCALE_EVENT")) {
    return fail("chat playground listens for locale changes");
  }
  return pass("chat + image workbench refresh on locale switch");
}

function checkFriendlyFailureDefault() {
  const resultUi = read(
    "apps/web/app/dashboard/image-playground/image-playground-toolbench-client.tsx"
  );
  const vision = read(
    "apps/web/app/dashboard/image-playground/ecommerce-vision-tab.tsx"
  );

  if (!resultUi.includes("imageFailFriendly")) {
    return fail("friendly failure message used on generate tab");
  }
  if (!resultUi.includes("isClientValidation")) {
    return fail(
      "client validation shows specific message",
      "expected isClientValidation branch so reference_image_required is not buried"
    );
  }
  if (!resultUi.includes("<details")) {
    return fail("technical details collapsed by default (generate)");
  }
  if (/<details[^>]*\sopen[\s>]/.test(resultUi)) {
    return fail("generate Details must not use open attribute");
  }
  if (!vision.includes("<details") || !vision.includes("advancedInfo")) {
    return fail("technical details collapsed by default (vision)");
  }
  if (/<details[^>]*\sopen[\s>]/.test(vision)) {
    return fail("vision Details must not use open attribute");
  }

  const errorBlock = resultUi.slice(
    resultUi.indexOf('state === "error"'),
    resultUi.indexOf('state === "empty"')
  );
  const detailsIdx = errorBlock.indexOf("<details");
  const copyIdBeforeDetails =
    detailsIdx >= 0 &&
    errorBlock.slice(0, detailsIdx).includes("copyRequestId");
  if (copyIdBeforeDetails) {
    return fail(
      "request_id not in primary error actions",
      "Copy request_id appears outside Details"
    );
  }

  // Primary API failure path must not dump raw upstream as the only headline
  // when status !== 0 — raw message stays inside Details.
  if (
    !errorBlock.includes("!isClientValidation && error?.message") &&
    !errorBlock.includes("!isClientValidation&&error?.message")
  ) {
    return fail(
      "raw upstream message only inside Details for API errors",
      "expected !isClientValidation && error?.message gate"
    );
  }

  return pass("failures use friendly copy; technical info folded");
}

function checkProgressWaitHint(tables) {
  const required = [
    "dashboard.imageWorkbench.imageStage1",
    "dashboard.imageWorkbench.imageStage2",
    "dashboard.imageWorkbench.imageStage3",
    "dashboard.imageWorkbench.imageStage4",
    "dashboard.imageWorkbench.imageStage5",
    "dashboard.imageWorkbench.imageStage6",
    "dashboard.imageWorkbench.imageStageStillRunning",
    "dashboard.imageWorkbench.progressPatienceImage",
  ];
  const missing = required.filter((k) => !tables.en[k] || !tables.zh[k]);
  if (missing.length) {
    return fail("staged progress copy keys", missing.join(", "));
  }
  const samples = [
    tables.en["dashboard.imageWorkbench.imageStage4"],
    tables.zh["dashboard.imageWorkbench.imageStage4"],
    tables.en["dashboard.imageWorkbench.progressPatienceImage"],
    tables.zh["dashboard.imageWorkbench.progressPatienceImage"],
  ];
  const bad = samples.filter((s) => !/20.?60/.test(s ?? ""));
  if (bad.length) {
    return fail("progress copy mentions 20–60 second wait");
  }

  const progressUi = read(
    "apps/web/app/dashboard/image-playground/workbench-progress.tsx"
  );
  const toolbench = read(
    "apps/web/app/dashboard/image-playground/image-playground-toolbench-client.tsx"
  );
  if (!progressUi.includes("imageStage") || !toolbench.includes("WorkbenchProgressPanel")) {
    return fail("image generation uses staged WorkbenchProgressPanel");
  }
  return pass("image generation has bilingual staged progress + wait hint");
}

function checkMeteringPagesFailOpen() {
  const usage = read("apps/web/app/dashboard/usage/page.tsx");
  const credits = read("apps/web/app/dashboard/credits/page.tsx");
  const models = read("apps/web/app/dashboard/models/page.tsx");

  if (!usage.includes("EMPTY_USAGE_PAGE_STATE") && !usage.includes("normalizeUsagePageState")) {
    return fail("usage page fail-open empty state");
  }
  if (
    !credits.includes("EMPTY_CREDITS_PAGE_DATA") &&
    !credits.includes("normalizeCreditsPageData")
  ) {
    return fail("credits page fail-open empty state");
  }
  if (!models.includes("buildFallbackModelsClientData") && !models.includes("fallback")) {
    return fail("models page fail-open fallback");
  }
  return pass("Usage / Credits / Models fail-open");
}

function checkMobileLayoutGuards() {
  const shell = read("apps/web/components/dashboard-shell-client.tsx");
  const workbench = read(
    "apps/web/app/dashboard/image-playground/image-workbench-client.tsx"
  );
  if (!shell.includes("overflow-x-hidden") || !shell.includes("min-w-0")) {
    return fail("dashboard shell guards horizontal overflow");
  }
  if (!workbench.includes("overflow-x-hidden") || !workbench.includes("min-w-0")) {
    return fail("image workbench guards horizontal overflow");
  }
  return pass("mobile/desktop overflow guards present");
}

const dashboard = loadDashboardLabels();
const playground = loadPlaygroundLabels();
const imageTables = loadImageWorkbenchLabels();
const imageTablesCache = imageTables;

let ok = true;
ok = checkNoLeakedKeys() && ok;
ok = checkNavLanguageKey(dashboard) && ok;
ok = checkDashboardShellCopy(dashboard) && ok;
ok = checkChatPlaygroundCopy(playground) && ok;
ok = checkImageWorkbenchTabs(imageTables) && ok;
ok = checkTabApiIsolation() && ok;
ok = checkReferenceEditGuards() && ok;
ok = checkDefaultApiKeyProvisioning() && ok;
ok = checkLocaleSync() && ok;
ok = checkFriendlyFailureDefault() && ok;
ok = checkProgressWaitHint(imageTables) && ok;
ok = checkMeteringPagesFailOpen() && ok;
ok = checkMobileLayoutGuards() && ok;

if (!ok) {
  process.exit(1);
}
console.log("\nP819 public beta consumer smoke: all checks passed.");
