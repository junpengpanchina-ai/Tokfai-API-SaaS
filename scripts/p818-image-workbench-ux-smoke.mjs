#!/usr/bin/env node
/**
 * P818 — Image workbench bilingual consumer UX smoke (offline, static).
 *
 * Checks:
 * 1) zh / en label key parity for image playground route-local copy
 * 2) consumer pages do not leak raw i18n keys (nav.* / dashboard.*)
 * 3) consumer-facing dashboard strings avoid hardcoded admin English
 * 4) reference-edit client guards require images / image_urls
 * 5) subject-preserve without reference image is blocked
 * 6) failure UI prefers friendly copy; raw technical errors stay in Details
 *
 * Usage: node scripts/p818-image-workbench-ux-smoke.mjs
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
    // Skip unexpected value forms
    const next = body.slice(i).match(/^[^,]*/);
    i += next ? next[0].length : 1;
  }
  return out;
}

function loadLabelTables() {
  const src = readFileSync(
    join(
      ROOT,
      "apps/web/app/dashboard/image-playground/image-playground-labels.ts"
    ),
    "utf8"
  );
  return { en: extractLabelMap(src, "EN"), zh: extractLabelMap(src, "ZH") };
}

function checkLabelParity(tables) {
  const enKeys = Object.keys(tables.en).sort();
  const zhKeys = Object.keys(tables.zh).sort();
  const missingInZh = enKeys.filter((k) => !(k in tables.zh));
  const missingInEn = zhKeys.filter((k) => !(k in tables.en));
  if (missingInZh.length || missingInEn.length) {
    return fail(
      "zh-CN / en-US key parity",
      `missingInZh=${missingInZh.join(", ") || "∅"}; missingInEn=${
        missingInEn.join(", ") || "∅"
      }`
    );
  }

  const empty = enKeys.filter((k) => {
    const en = (tables.en[k] ?? "").trim();
    const zh = (tables.zh[k] ?? "").trim();
    return !en || !zh;
  });
  if (empty.length) {
    return fail("no empty bilingual values", empty.slice(0, 12).join(", "));
  }

  const mixed = enKeys.filter((k) => /[\u4e00-\u9fff]/.test(tables.en[k] ?? ""));
  if (mixed.length) {
    return fail("EN values must not contain Chinese", mixed.join(", "));
  }

  return pass(`zh/en key parity (${enKeys.length} keys)`);
}

function checkNoLeakedKeys() {
  const files = [
    "apps/web/app/dashboard/image-playground/image-workbench-client.tsx",
    "apps/web/app/dashboard/image-playground/image-playground-client.tsx",
    "apps/web/app/dashboard/image-playground/image-playground-toolbench-client.tsx",
    "apps/web/app/dashboard/image-playground/ecommerce-vision-tab.tsx",
    "apps/web/app/dashboard/image-playground/workbench-progress.tsx",
  ];
  const bad = [];
  for (const rel of files) {
    const src = readFileSync(join(ROOT, rel), "utf8");
    if (/>\s*(nav|dashboard)\.[a-zA-Z0-9.]+\s*</.test(src)) {
      bad.push(rel);
    }
  }
  if (bad.length) {
    return fail("no leaked i18n keys in consumer UI", bad.join(", "));
  }
  return pass("consumer pages do not leak i18n keys");
}

function checkNoAdminEnglishHardcode() {
  const src = readFileSync(
    join(
      ROOT,
      "apps/web/app/dashboard/image-playground/image-playground-labels.ts"
    ),
    "utf8"
  );
  const banned = [
    '"Run settings"',
    '"Technical details"',
    '"Compute credits"',
    '"Reference edit result"',
    '"Ecommerce recognition"',
    '"Generate / edit image"',
    '"Top up"',
  ];
  const hits = banned.filter((phrase) => src.includes(phrase));
  if (hits.length) {
    return fail("no hardcoded admin English in labels", hits.join(", "));
  }

  const required = [
    '"Settings"',
    '"Details"',
    '"Edited image"',
    '"Image analysis"',
    '"Product copywriting"',
    '"Create or edit images"',
    '"Add credits"',
  ];
  const missing = required.filter((phrase) => !src.includes(phrase));
  if (missing.length) {
    return fail("required consumer English present", missing.join(", "));
  }
  return pass("consumer English replaces admin jargon");
}

function checkReferenceEditGuards() {
  const client = readFileSync(
    join(
      ROOT,
      "apps/web/app/dashboard/image-playground/image-playground-client.tsx"
    ),
    "utf8"
  );
  const promptLib = readFileSync(
    join(ROOT, "apps/web/lib/dashboard-safe/image-edit-prompt.ts"),
    "utf8"
  );

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
  if (!promptLib.includes("same\\s+person") || !promptLib.includes("change(?:\\s+the)?\\s+background")) {
    return fail("English subject-preserve intent patterns");
  }
  if (!client.includes("subjectPreserveExpectation")) {
    return fail("subject preserve expectation banner wired");
  }

  return pass("reference edit guards + images payload");
}

function checkFriendlyFailureDefault() {
  const resultUi = readFileSync(
    join(
      ROOT,
      "apps/web/app/dashboard/image-playground/image-playground-toolbench-client.tsx"
    ),
    "utf8"
  );
  if (!resultUi.includes("imageFailFriendly")) {
    return fail("friendly failure message used");
  }
  if (!resultUi.includes("<details")) {
    return fail("technical details collapsed by default");
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
  return pass("failures use friendly copy; technical info folded");
}

function checkProgressStages(tables) {
  const required = [
    "dashboard.imageWorkbench.imageStage1",
    "dashboard.imageWorkbench.imageStage2",
    "dashboard.imageWorkbench.imageStage3",
    "dashboard.imageWorkbench.imageStage4",
    "dashboard.imageWorkbench.imageStage5",
    "dashboard.imageWorkbench.imageStage6",
    "dashboard.imageWorkbench.imageStageStillRunning",
  ];
  const missing = required.filter((k) => !tables.en[k] || !tables.zh[k]);
  if (missing.length) {
    return fail("staged progress copy keys", missing.join(", "));
  }
  const en4 = tables.en["dashboard.imageWorkbench.imageStage4"] ?? "";
  const zh4 = tables.zh["dashboard.imageWorkbench.imageStage4"] ?? "";
  if (!/20.?60/.test(en4) || !/20.?60/.test(zh4)) {
    return fail("stage 4 mentions 20–60 seconds");
  }
  return pass("image generation has bilingual staged progress");
}

const tables = loadLabelTables();
let ok = true;
ok = checkLabelParity(tables) && ok;
ok = checkNoLeakedKeys() && ok;
ok = checkNoAdminEnglishHardcode() && ok;
ok = checkReferenceEditGuards() && ok;
ok = checkFriendlyFailureDefault() && ok;
ok = checkProgressStages(tables) && ok;

if (!ok) {
  process.exit(1);
}
console.log("\nP818 image workbench UX smoke: all checks passed.");
