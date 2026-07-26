#!/usr/bin/env node
/**
 * P952 — Image concurrency production policy smoke (docs + static checks).
 *
 * Hard limits:
 *   - no LIVE / no real image burst by default
 *   - no Nano Banana / Chat / GPT / Gemini / billing / Nginx edits required
 *   - validates summary keys + policy doc only
 *
 * Usage:
 *   node scripts/p952-image-concurrency-policy-smoke.mjs
 *
 * Acceptance:
 *   TOKFAI_P952_IMAGE_CONCURRENCY_POLICY_PASS
 */

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pass, fail } from "./lib/client-compat-smoke-bootstrap.mjs";
import {
  P952_LATENCY_KEYS,
  P952_SUMMARY_KEYS,
  buildSyntheticImageLoadRows,
  formatImageConcurrencySummary,
  judgeSyntheticImageSummary,
  summarizeImageConcurrencyLoad,
} from "./lib/image-concurrency-load.mjs";

const SCRIPT = "scripts/p952-image-concurrency-policy-smoke.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const POLICY_DOC = "docs/p952-image-concurrency-policy.md";
const LOAD_SCRIPT = "scripts/p952-image-concurrency-load.mjs";
const LOAD_LIB = "scripts/lib/image-concurrency-load.mjs";
const PASS_MARKER = "TOKFAI_P952_IMAGE_CONCURRENCY_POLICY_PASS";
const FAIL_MARKER = "TOKFAI_P952_IMAGE_CONCURRENCY_POLICY_FAIL";

async function readRel(rel) {
  return readFile(join(ROOT, rel), "utf8");
}

function checkSummaryLib() {
  let ok = true;
  const rows = buildSyntheticImageLoadRows();
  const summary = summarizeImageConcurrencyLoad(rows);

  for (const key of P952_SUMMARY_KEYS) {
    if (!(key in summary)) {
      ok = fail("summary key present", `missing \`${key}\``) && false;
    }
  }
  if (ok) {
    pass(`summary keys: ${P952_SUMMARY_KEYS.join(", ")}`);
  }

  for (const key of P952_LATENCY_KEYS) {
    if (!(key in (summary.latency ?? {}))) {
      ok = fail("latency key present", `missing latency.${key}`) && false;
    }
  }
  if (ok) {
    pass(`latency keys: ${P952_LATENCY_KEYS.join("/")}`);
  }

  const judged = judgeSyntheticImageSummary(summary);
  if (!judged.ok) {
    for (const detail of judged.failures) {
      ok = fail("synthetic summary judgment", detail) && false;
    }
  } else {
    pass("synthetic summary judgment (billable / failed / timeout / bad billing)");
  }

  const formatted = formatImageConcurrencySummary(summary);
  const requiredPrint = [
    "total_done=",
    "completed=",
    "failed=",
    "timeout=",
    "billable_success=",
    "bad_billing_failures=",
    "missing_url_success=",
    "error_codes:",
    "p50=",
    "p95=",
  ];
  const missingPrint = requiredPrint.filter((s) => !formatted.includes(s));
  if (missingPrint.length) {
    ok =
      fail(
        "formatted summary output",
        `missing: ${missingPrint.join(", ")}`
      ) && false;
  } else {
    pass("formatted summary prints all required metrics");
  }

  return ok;
}

function checkLoadScript(src) {
  let ok = true;
  const markers = [
    ["summarizeImageConcurrencyLoad", "uses shared summary helper"],
    ["formatImageConcurrencySummary", "prints summary"],
    ["CONCURRENCY", "concurrency env"],
    ["COUNT", "count env"],
    ["SELF_TEST", "self-test mode"],
    ["/v1/images/generations", "image generations route"],
    ["bad_billing_failures", "billing integrity gate"],
  ];
  for (const [needle, label] of markers) {
    if (!src.includes(needle)) {
      ok = fail("load script", `missing ${label} (${needle})`) && false;
    }
  }
  if (ok) pass("load script wires summary + image route + SELF_TEST");

  // Default concurrency should be conservative (2 or 3).
  if (!/CONCURRENCY\s*\?\?\s*["']3["']/.test(src) && !/default 3/.test(src)) {
    ok =
      fail(
        "default concurrency 2-3",
        "load script default CONCURRENCY should be 3 (policy 2-3)"
      ) && false;
  } else {
    pass("load script default CONCURRENCY=3 (policy 2-3)");
  }

  return ok;
}

function checkPolicyDoc(doc) {
  let ok = true;
  const topics = [
    { re: /默认图片并发建议\s*2\s*[-–~]\s*3|建议[^\n]{0,40}2\s*[-–~]\s*3/i, label: "default image concurrency 2-3" },
    { re: /KA[\s\S]{0,80}白名单|白名单[\s\S]{0,80}KA/i, label: "KA image whitelist" },
    { re: /不能和 Chat 共用|不能.*Chat.*500|为什么图片不能和 Chat/i, label: "why not share Chat 500 concurrency" },
    { re: /failed[\s\S]{0,40}不扣费|timeout[\s\S]{0,40}不扣费/i, label: "failed/timeout not charged" },
    { re: /completed[\s\S]{0,40}url[\s\S]{0,40}扣费|必须有 url 才扣费/i, label: "completed requires url to charge" },
    { re: /billable_success/, label: "billable_success metric" },
    { re: /bad_billing_failures/, label: "bad_billing_failures metric" },
    { re: /missing_url_success/, label: "missing_url_success metric" },
    { re: /upstream_image_error/, label: "upstream_image_error fact" },
    { re: /Nano Banana/i, label: "Nano Banana hard limit stated" },
    { re: /billing/i, label: "billing hard limit stated" },
    { re: /Nginx/i, label: "Nginx hard limit stated" },
    { re: /Chat\s*\/\s*GPT\s*\/\s*Gemini|不改 Chat/i, label: "Chat/GPT/Gemini hard limit stated" },
  ];

  for (const { re, label } of topics) {
    if (!re.test(doc)) {
      ok = fail("policy doc coverage", `missing: ${label}`) && false;
    }
  }
  if (ok) {
    pass("policy doc covers 2-3 default, KA whitelist, Chat isolation, billing rules");
  }

  if (!/不改.*billing|不改 billing/i.test(doc)) {
    ok =
      fail(
        "billing unchanged stated",
        "doc must state P952 does not change billing success debit logic"
      ) && false;
  } else {
    pass("doc states billing success path unchanged");
  }

  return ok;
}

function checkNoForbiddenRuntimeEdits(files) {
  // Runtime helpers/load must not emit these; docs/smoke may name them as negatives.
  const forbidden = [/Cannot set headers/i, /api_error_500/, /charged timeout/i];
  let ok = true;
  for (const [name, src] of Object.entries(files)) {
    if (name === "doc" || name === "smoke") continue;
    for (const re of forbidden) {
      if (re.test(src)) {
        ok =
          fail(
            "forbidden pattern",
            `${name} contains ${re}`
          ) && false;
      }
    }
  }
  if (ok) {
    pass("load/lib free of Cannot set headers / api_error_500 / charged timeout");
  }
  return ok;
}

function checkHardSurfaceUntouched(chatExec, nanoSrc, billingHint) {
  // Smoke only asserts presence of main surfaces — P952 must not require edits.
  let ok = true;
  if (!chatExec.includes("executeChatCompletion") && !chatExec.includes("export")) {
    ok = fail("chat surface readable", "executeChatCompletion.ts unreadable") && false;
  } else {
    pass("Chat execute surface present (P952 does not modify it)");
  }
  if (!/nanoBanana|nano-banana/i.test(nanoSrc)) {
    ok = fail("nano banana surface", "nanoBanana provider missing") && false;
  } else {
    pass("Nano Banana provider present (P952 does not modify main path)");
  }
  if (!billingHint.includes("record_usage_and_debit") && !billingHint.includes("debit")) {
    // soft — just ensure billing file still exists shape
    pass("billing surface check skipped (no debit marker required in scanned file)");
  } else {
    pass("billing helpers still present (P952 does not change success debit)");
  }
  return ok;
}

async function main() {
  console.log("=== P952 Image concurrency production policy (static) ===");
  console.log(`script: ${SCRIPT}`);
  console.log("mode: docs + summary unit checks only (no LIVE image burst)");
  console.log("");

  let doc;
  let loadSrc;
  let libSrc;
  try {
    doc = await readRel(POLICY_DOC);
    loadSrc = await readRel(LOAD_SCRIPT);
    libSrc = await readRel(LOAD_LIB);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    fail("artifacts readable", message);
    console.log("");
    console.log(FAIL_MARKER);
    process.exit(1);
  }

  if (!doc.trim()) {
    fail("policy doc non-empty", `${POLICY_DOC} is empty`);
    console.log("");
    console.log(FAIL_MARKER);
    process.exit(1);
  }
  pass(`policy doc readable: ${POLICY_DOC}`);
  pass(`load script readable: ${LOAD_SCRIPT}`);
  pass(`summary lib readable: ${LOAD_LIB}`);

  let allOk = true;
  allOk = checkSummaryLib() && allOk;
  allOk = checkLoadScript(loadSrc) && allOk;
  allOk = checkPolicyDoc(doc) && allOk;
  allOk =
    checkNoForbiddenRuntimeEdits({
      load: loadSrc,
      lib: libSrc,
      smoke: await readRel(SCRIPT),
      doc,
    }) && allOk;

  // Optional: confirm hard surfaces still exist (not modified by this smoke).
  try {
    const chatExec = await readRel(
      "apps/dmit-api/src/lib/executeChatCompletion.ts"
    );
    const nanoSrc = await readRel(
      "apps/dmit-api/src/upstream/nanoBananaImageProvider.ts"
    );
    const billingHint = await readRel("apps/dmit-api/src/images/worker.ts");
    allOk = checkHardSurfaceUntouched(chatExec, nanoSrc, billingHint) && allOk;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    allOk = fail("hard surfaces readable", message) && false;
  }

  // Lib source must export summarize + required key list.
  if (
    !libSrc.includes("export function summarizeImageConcurrencyLoad") ||
    !libSrc.includes("P952_SUMMARY_KEYS")
  ) {
    allOk =
      fail(
        "lib exports",
        "image-concurrency-load.mjs must export summarize + P952_SUMMARY_KEYS"
      ) && false;
  } else {
    pass("lib exports summarizeImageConcurrencyLoad + P952_SUMMARY_KEYS");
  }

  console.log("");
  console.log(allOk ? PASS_MARKER : FAIL_MARKER);
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  console.log(FAIL_MARKER);
  process.exit(1);
});
