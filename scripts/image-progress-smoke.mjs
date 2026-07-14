#!/usr/bin/env node
/**
 * Image generation progress smoke (offline, static).
 *
 * Checks:
 * 1) image_generation_tasks migration + statuses + progress
 * 2) POST accepts job (202) + enqueue worker
 * 3) GET /v1/images/generations/:id + /v1/api/result return progress fields
 * 4) Public responses never leak upstream provider / hosts / raw upstream errors
 * 5) Idempotency key wiring
 * 6) Frontend progress bar + status i18n keys (EN/ZH)
 *
 * Usage: node scripts/image-progress-smoke.mjs
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

const STATUSES = [
  "queued",
  "validating",
  "billing_check",
  "requesting_model",
  "generating",
  "saving_result",
  "completed",
  "failed",
];

const LEAK_RE =
  /grsai|garsai|grsaiapi\.com|https?:\/\/v1\/api\/generate|\/v1\/api\/generate/i;

let ok = true;

{
  const mig = read("supabase/migrations/0035_image_generation_tasks.sql");
  if (!mig.includes("image_generation_tasks")) {
    ok = fail("migration table", "missing image_generation_tasks") && ok;
  } else {
    const missing = STATUSES.filter((s) => !mig.includes(`'${s}'`));
    if (missing.length) {
      ok = fail("migration statuses", missing.join(", ")) && ok;
    } else if (!mig.includes("progress") || !/progress\s*>=\s*0/.test(mig)) {
      ok = fail("migration progress check", "expected progress 0-100 check") && ok;
    } else if (!mig.includes("idempotency_key")) {
      ok = fail("migration idempotency", "missing idempotency_key") && ok;
    } else {
      pass("migration image_generation_tasks + statuses + progress");
    }
  }
}

{
  const route = read("apps/dmit-api/src/routes/images.ts");
  const worker = read("apps/dmit-api/src/images/worker.ts");
  const pub = read("apps/dmit-api/src/images/publicResponse.ts");
  const msgs = read("apps/dmit-api/src/images/progressMessages.ts");

  const checks = [
    ["POST returns 202", route.includes("202")],
    ["enqueueImageGeneration", route.includes("enqueueImageGeneration")],
    ["GET generations/:id", route.includes('imageRoutes.get("/v1/images/generations/:id"')],
    ["GET api/result", route.includes('imageRoutes.get("/v1/api/result"')],
    ["parseIdempotencyKey", route.includes("parseIdempotencyKey")],
    ["runImageGenerationWithPolling in worker", worker.includes("runImageGenerationWithPolling")],
    ["finalize charge on success", worker.includes("debit_credits")],
    ["no charge on fail path", worker.includes("not_billable")],
    ["retryable_timeout", worker.includes("retryable_timeout")],
    ["public progress field", pub.includes("progress:")],
    ["public message en/zh", pub.includes("message_en") || pub.includes("message:")],
    ["public error safe code", pub.includes("error_code")],
    ["Validating request EN", msgs.includes("Validating request")],
    ["Checking credits EN", msgs.includes("Checking credits")],
    ["Generating image EN", msgs.includes("Generating image")],
  ];

  const failed = checks.filter(([, v]) => !v).map(([n]) => n);
  if (failed.length) {
    ok = fail("backend progress wiring", failed.join(", ")) && ok;
  } else {
    pass("backend progress wiring");
  }

  for (const [label, text] of [
    ["route no leak", route],
    ["worker public messages no leak", worker.replace(/from ["'].*imageAsyncProvider.*/, "")],
    ["publicResponse no leak", pub],
  ]) {
    const m = text.match(LEAK_RE);
    if (m) ok = fail(label, `leaked: ${m[0]}`) && ok;
    else pass(label);
  }
}

{
  const labels = read(
    "apps/web/app/dashboard/image-playground/image-playground-labels.ts"
  );
  const progressUi = read(
    "apps/web/app/dashboard/image-playground/workbench-progress.tsx"
  );
  const imageApi = read("apps/web/lib/dashboard-safe/image-api.ts");

  const requiredKeys = [
    "statusValidating",
    "statusBillingCheck",
    "statusRequestingModel",
    "statusGenerating",
    "statusSavingResult",
    "statusCompleted",
    "statusFailed",
    "progressPercent",
  ];
  const missing = requiredKeys.filter(
    (k) => !labels.includes(`dashboard.imageWorkbench.${k}`)
  );
  if (missing.length) {
    ok = fail("frontend i18n status keys", missing.join(", ")) && ok;
  } else {
    pass("frontend i18n status keys");
  }

  if (!labels.includes('"Validating request"') || !labels.includes('"Checking credits"')) {
    ok = fail("EN status copy", "expected Validating request / Checking credits") && ok;
  } else {
    pass("EN status copy");
  }

  // EN block must not use 算力积分 in status billing check
  const enStart = labels.indexOf("const EN");
  const zhStart = labels.indexOf("const ZH");
  const enBody = labels.slice(enStart, zhStart > 0 ? zhStart : undefined);
  if (/statusBillingCheck[^:]*:[^"]*"[^"]*算力积分/.test(enBody)) {
    ok = fail("EN billing_check no Chinese", "算力积分 in EN statusBillingCheck") && ok;
  } else if (enBody.includes("Checking credits")) {
    pass("EN billing_check uses Checking credits");
  } else {
    ok = fail("EN billing_check", "missing Checking credits") && ok;
  }

  const uiChecks = [
    ["progressbar role", progressUi.includes('role="progressbar"')],
    ["serverStatus prop", progressUi.includes("serverStatus")],
    ["0-80 estimate", progressUi.includes("ESTIMATE_MS") || progressUi.includes("80")],
    ["poll helper", imageApi.includes("imageGenerationsWithProgress")],
    ["GET status helper", imageApi.includes("getImageGenerationStatus")],
  ];
  const uiFail = uiChecks.filter(([, v]) => !v).map(([n]) => n);
  if (uiFail.length) ok = fail("frontend progress UI", uiFail.join(", ")) && ok;
  else pass("frontend progress UI");
}

if (!ok) {
  console.error("\nimage-progress-smoke: FAILED");
  process.exit(1);
}
console.log("\nimage-progress-smoke: OK");
