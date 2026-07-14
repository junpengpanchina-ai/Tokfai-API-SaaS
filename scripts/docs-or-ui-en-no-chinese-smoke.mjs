#!/usr/bin/env node
/**
 * Consumer EN UI — no Chinese smoke (offline, static).
 *
 * 1. English locale dictionaries must not contain CJK characters.
 * 2. Consumer dashboard formatters must not hardcode 「算力积分」 without locale.
 * 3. Does not scan zh docs / zh message trees.
 *
 * Usage: node scripts/docs-or-ui-en-no-chinese-smoke.mjs
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = join(ROOT, "apps", "web");
const CJK_RE = /[\u4e00-\u9fff]/;

function pass(label) {
  console.log(`PASS  ${label}`);
  return true;
}

function fail(label, detail) {
  console.error(`FAIL  ${label}`);
  if (detail) console.error(`      ${detail}`);
  return false;
}

function extractConstRecordBody(source, constName) {
  const startRe = new RegExp(
    `(?:export\\s+)?const\\s+${constName}\\s*:\\s*Record<string,\\s*string>\\s*=\\s*\\{`
  );
  const start = source.search(startRe);
  if (start < 0) return null;
  const brace = source.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return source.slice(brace + 1, i);
    }
  }
  return null;
}

/** Extract top-level `en: { ... }` object body from messages.ts (brace-balanced). */
function extractMessagesEnBody(source) {
  const marker = source.match(/(?:^|\n)\s*en:\s*\{/);
  if (!marker || marker.index == null) return null;
  const brace = source.indexOf("{", marker.index);
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return source.slice(brace + 1, i);
    }
  }
  return null;
}

function cjkHitsInText(text, limit = 12) {
  const hits = [];
  for (const line of text.split("\n")) {
    if (!CJK_RE.test(line)) continue;
    if (/^\s*\/\//.test(line) || /^\s*\*/.test(line)) continue;
    hits.push(line.trim().slice(0, 160));
    if (hits.length >= limit) break;
  }
  return hits;
}

function walk(abs, out = [], exts = /\.(ts|tsx)$/) {
  const st = statSync(abs);
  if (st.isFile()) {
    if (exts.test(abs)) out.push(abs);
    return out;
  }
  for (const name of readdirSync(abs)) {
    if (
      name === "node_modules" ||
      name === ".next" ||
      name === "dist" ||
      name === "coverage"
    ) {
      continue;
    }
    walk(join(abs, name), out, exts);
  }
  return out;
}

let ok = true;

// --- 1) EN dictionaries: no CJK ---
{
  const messagesPath = join(WEB, "lib", "i18n", "messages.ts");
  const messages = readFileSync(messagesPath, "utf8");
  const enBody = extractMessagesEnBody(messages);
  if (!enBody) {
    ok = fail("messages.ts en block", "could not extract en: { ... }") && ok;
  } else {
    const hits = cjkHitsInText(enBody);
    if (hits.length) {
      ok =
        fail("messages.ts en has no Chinese", hits.join("\n      ")) && ok;
    } else {
      pass("messages.ts en has no Chinese");
    }
  }
}

{
  const labelsPath = join(WEB, "lib", "dashboard-safe", "labels.generated.ts");
  const labels = readFileSync(labelsPath, "utf8");
  const enBody = extractConstRecordBody(labels, "EN");
  if (!enBody) {
    ok = fail("labels.generated.ts EN", "could not extract EN record") && ok;
  } else {
    const hits = cjkHitsInText(enBody);
    if (hits.length) {
      ok =
        fail("labels.generated.ts EN has no Chinese", hits.join("\n      ")) &&
        ok;
    } else {
      pass("labels.generated.ts EN has no Chinese");
    }
  }
}

for (const rel of [
  "app/dashboard/playground/playground-labels.ts",
  "app/dashboard/image-playground/image-playground-labels.ts",
]) {
  const abs = join(WEB, rel);
  const src = readFileSync(abs, "utf8");
  const enBody = extractConstRecordBody(src, "EN");
  if (!enBody) {
    ok = fail(`${rel} EN`, "could not extract EN record") && ok;
    continue;
  }
  const hits = cjkHitsInText(enBody);
  if (hits.length) {
    ok = fail(`${rel} EN has no Chinese`, hits.join("\n      ")) && ok;
  } else {
    pass(`${rel} EN has no Chinese`);
  }
}

// --- 2) No unconditional 「算力积分」 hardcoding in formatters ---
{
  const displayHelpers = readFileSync(
    join(WEB, "lib", "dashboard-safe", "display-helpers.ts"),
    "utf8"
  );
  if (/void locale[\s\S]{0,80}算力积分|return `\$\{amount\} 算力积分`/.test(displayHelpers)) {
    ok = fail(
      "display-helpers locale-aware unit",
      "found unconditional 算力积分 suffix (locale ignored)"
    );
  } else if (
    !/creditsUnitForLocale|compute credits/.test(displayHelpers) ||
    !/算力积分/.test(displayHelpers)
  ) {
    ok = fail(
      "display-helpers locale-aware unit",
      "expected locale branch with compute credits / 算力积分"
    );
  } else {
    pass("display-helpers locale-aware credit unit");
  }
}

// --- 3) Consumer dashboard/components: no bare 算力积分 outside allowlist ---
{
  const allowExact = new Set([
    "lib/dashboard-safe/display-helpers.ts",
    "lib/dashboard-safe/format-helpers.ts",
    "lib/credits-units.ts",
    "lib/model-pricing-display.ts",
    "lib/model-cost-estimate.ts",
    "components/consumer-docs-guide.tsx",
    "app/dashboard/image-playground/image-playground-model-options.ts",
    "app/dashboard/playground/playground-labels.ts",
    "app/dashboard/image-playground/image-playground-labels.ts",
  ]);

  const roots = [
    join(WEB, "app", "dashboard"),
    join(WEB, "components"),
    join(WEB, "lib", "dashboard-safe"),
  ];
  const offenders = [];
  for (const root of roots) {
    for (const abs of walk(root)) {
      const rel = relative(WEB, abs).replaceAll("\\", "/");
      if (allowExact.has(rel)) continue;
      if (rel.endsWith("labels.generated.ts")) continue;
      if (rel.includes("/docs/")) continue;
      const src = readFileSync(abs, "utf8");
      if (!src.includes("算力积分")) continue;
      // Allow zh-only label maps and locale ternaries in allowlist only;
      // anything else with the unit string is a hardcode risk.
      const lines = src.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (!lines[i].includes("算力积分")) continue;
        if (/^\s*\/\//.test(lines[i]) || /^\s*\*/.test(lines[i])) continue;
        offenders.push(`${rel}:${i + 1}: ${lines[i].trim().slice(0, 120)}`);
      }
    }
  }

  if (offenders.length) {
    ok =
      fail(
        "no hardcoded 算力积分 in consumer UI (outside allowlist)",
        offenders.slice(0, 20).join("\n      ")
      ) && ok;
  } else {
    pass("no hardcoded 算力积分 in consumer UI (outside allowlist)");
  }
}

// --- 4) Quick pattern: English select label must not use Chinese unit ---
{
  const modelOpts = readFileSync(
    join(
      WEB,
      "app/dashboard/image-playground/image-playground-model-options.ts"
    ),
    "utf8"
  );
  if (
    /locale === "zh"[\s\S]*?算力积分[\s\S]*?return `\$\{entry\.displayName\}[\s\S]*?算力积分 \/ generation`/.test(
      modelOpts
    ) ||
    /return `\$\{entry\.displayName\} \(\$\{modelId\}\) · \$\{price\} 算力积分 \/ generation`/.test(
      modelOpts
    )
  ) {
    ok = fail(
      "image model select EN unit",
      "English branch still uses 算力积分"
    );
  } else {
    pass("image model select EN uses compute credits");
  }
}

// --- 5) Image progress bar EN status copy ---
{
  const labels = readFileSync(
    join(WEB, "app/dashboard/image-playground/image-playground-labels.ts"),
    "utf8"
  );
  const progressUi = readFileSync(
    join(WEB, "app/dashboard/image-playground/workbench-progress.tsx"),
    "utf8"
  );

  const enStart = labels.indexOf("const EN");
  const zhStart = labels.indexOf("const ZH");
  const enBody = labels.slice(enStart, zhStart > 0 ? zhStart : undefined);

  const requiredEn = [
    ["Validating request", /statusValidating[^:]*:\s*"Validating request"/],
    ["Checking credits", /statusBillingCheck[^:]*:\s*"Checking credits"/],
    ["Sending request", /statusRequestingModel[^:]*:\s*"Sending request"/],
    ["Generating image", /statusGenerating[^:]*:\s*"Generating image"/],
    ["Saving result", /statusSavingResult[^:]*:\s*"Saving result"/],
    ["Completed", /statusCompleted[^:]*:\s*"Completed"/],
    ["Failed", /statusFailed[^:]*:\s*"Failed"/],
  ];

  for (const [name, re] of requiredEn) {
    if (!re.test(enBody)) {
      ok = fail(`image progress EN: ${name}`, "missing or wrong EN status copy") && ok;
    }
  }

  if (CJK_RE.test(enBody.match(/statusBillingCheck[^:]*:\s*"[^"]*"/)?.[0] ?? "")) {
    ok = fail("image progress EN billing_check", "CJK in EN statusBillingCheck") && ok;
  }

  if (!progressUi.includes('role="progressbar"')) {
    ok = fail("image progress bar markup", "expected role=progressbar") && ok;
  } else if (!progressUi.includes("statusValidating") && !progressUi.includes("statusBillingCheck")) {
    ok = fail("image progress status map", "expected status label keys") && ok;
  } else {
    pass("image progress bar + EN status copy");
  }
}

if (!ok) {
  console.error("\ndocs-or-ui-en-no-chinese-smoke: FAILED");
  process.exit(1);
}
console.log("\ndocs-or-ui-en-no-chinese-smoke: OK");
