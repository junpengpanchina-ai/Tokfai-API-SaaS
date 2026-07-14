#!/usr/bin/env node
/**
 * P821 — Image public API smoke (offline, static + local validation helpers).
 *
 * Checks:
 * 1) Public routes POST /v1/images/generations + GET /v1/images/generations/:id
 * 2) Internal async provider adapter exists (create / poll / run)
 * 3) Text-to-image body fields accepted by route schema
 * 4) Reference edit without images → reference_image_required
 * 5) blob: URLs blocked
 * 6) Public success/error shapes do not leak upstream brands / hosts / paths
 *
 * Usage: node scripts/p821-image-public-api-smoke.mjs
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

const LEAK_RE =
  /grsai|garsai|grsaiapi\.com|https?:\/\/v1\/api\/generate|\/v1\/api\/generate/i;

function assertNoLeak(label, text) {
  const m = text.match(LEAK_RE);
  if (m) {
    return fail(label, `leaked token: ${m[0]}`);
  }
  return pass(label);
}

/** Mirrors public request compatibility (not full zod). */
function validatePublicImageBody(body) {
  const errors = [];
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, errors: ["body must be object"] };
  }
  if (body.model != null && typeof body.model !== "string") {
    errors.push("model must be string");
  }
  if (body.prompt != null && typeof body.prompt !== "string") {
    errors.push("prompt must be string");
  }
  for (const key of ["size", "aspect_ratio", "aspectRatio", "response_format"]) {
    if (body[key] != null && typeof body[key] !== "string") {
      errors.push(`${key} must be string`);
    }
  }
  if (body.images != null) {
    if (!Array.isArray(body.images)) errors.push("images must be array");
    else if (body.images.some((x) => typeof x !== "string")) {
      errors.push("images items must be strings");
    }
  }
  return { ok: errors.length === 0, errors };
}

function checkRoutesAndAdapter() {
  const route = read("apps/dmit-api/src/routes/images.ts");
  const worker = read("apps/dmit-api/src/images/worker.ts");
  const provider = read("apps/dmit-api/src/upstream/imageAsyncProvider.ts");
  const normalize = read("apps/dmit-api/src/upstream/normalizeImageInputs.ts");
  const surface = read("apps/dmit-api/src/lib/publicApiSurface.ts");

  const checks = [
    [
      "POST route",
      route.includes('imageRoutes.post("/v1/images/generations"'),
    ],
    [
      "GET route",
      route.includes('imageRoutes.get("/v1/images/generations/:id"'),
    ],
    [
      "uses runImageGenerationWithPolling",
      worker.includes("runImageGenerationWithPolling") ||
        route.includes("runImageGenerationWithPolling"),
    ],
    [
      "enqueue async worker",
      route.includes("enqueueImageGeneration"),
    ],
    [
      "reference_image_required",
      route.includes('"reference_image_required"'),
    ],
    [
      "public success builder",
      (route.includes("buildPublicImageSuccessResponse") ||
        route.includes("buildPublicImageTaskResponse")) &&
        (route.includes('object: "image.generation"') ||
          read("apps/dmit-api/src/images/publicResponse.ts").includes(
            'object: "image.generation"'
          )),
    ],
    [
      "createImageGenerationTask",
      provider.includes("export async function createImageGenerationTask"),
    ],
    [
      "pollImageGenerationTask",
      provider.includes("export async function pollImageGenerationTask"),
    ],
    [
      "runImageGenerationWithPolling",
      provider.includes("export async function runImageGenerationWithPolling"),
    ],
    [
      "IMAGE_PROVIDER env aliases",
      provider.includes("IMAGE_PROVIDER_BASE_URL") &&
        provider.includes("IMAGE_PROVIDER_API_KEY"),
    ],
    [
      "timeout defaults >= 180s",
      /return Math\.max\(requestTimeoutMs\(\),\s*180_000\)/.test(provider) ||
        provider.includes("180_000"),
    ],
    [
      "timeout/busy retry once",
      provider.includes("isRetryableImageError") &&
        provider.includes("retryDelayMs") &&
        provider.includes("image_generation_retrying"),
    ],
    [
      "friendly timeout",
      provider.includes("image_generation_timeout") &&
        provider.includes("图片生成时间较长"),
    ],
    [
      "blob blocked",
      normalize.includes("blob:") &&
        normalize.includes("invalid_image_url"),
    ],
    [
      "public surface lists GET",
      surface.includes('"GET /v1/images/generations/:id"'),
    ],
  ];

  const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
  if (failed.length) {
    return fail("routes + adapter wiring", failed.join(", "));
  }
  return pass("routes + adapter wiring");
}

function checkTextToImageSchema() {
  const body = {
    model: "gpt-image-2",
    prompt: "生成一张边牧与古牧正在抖音直播间直播带货截图",
    images: [],
    size: "1024x1024",
    aspect_ratio: "1:1",
    aspectRatio: "1024x1024",
    response_format: "url",
  };
  const result = validatePublicImageBody(body);
  if (!result.ok) {
    return fail("text-to-image body schema", result.errors.join("; "));
  }

  const route = read("apps/dmit-api/src/routes/images.ts");
  for (const field of ["aspect_ratio", "aspectRatio", "response_format"]) {
    if (!route.includes(field)) {
      return fail("text-to-image body schema", `route missing ${field}`);
    }
  }
  return pass("text-to-image body schema");
}

function checkReferenceRequired() {
  const route = read("apps/dmit-api/src/routes/images.ts");
  const normalize = read("apps/dmit-api/src/upstream/normalizeImageInputs.ts");

  if (!route.includes("请先上传参考图片，或改用文生图模式。")) {
    return fail(
      "reference_image_required message",
      "friendly Chinese message missing"
    );
  }
  if (!normalize.includes("promptImpliesReferenceEdit")) {
    return fail("reference intent helper missing");
  }
  // Intentional: reference_edit mode with zero images must throw reference_image_required
  if (
    !route.includes('mode === "reference_edit" && normalized.imagesCount === 0')
  ) {
    return fail("reference edit without images guard missing");
  }
  return pass("reference edit requires images");
}

function checkBlobForbidden() {
  const normalize = read("apps/dmit-api/src/upstream/normalizeImageInputs.ts");
  if (!normalize.includes("/^blob:/i") && !normalize.includes("^blob:")) {
    return fail("blob regex missing");
  }
  if (!normalize.includes("blob: and file: URLs are not supported")) {
    return fail("blob throw message missing");
  }
  return pass("blob URLs forbidden");
}

function checkNoLeakInPublicLayers() {
  const files = [
    "apps/dmit-api/src/routes/images.ts",
    "apps/dmit-api/src/upstream/imageAsyncProvider.ts",
    "apps/web/lib/docs/public-beta-docs-registry.ts",
    "apps/web/components/consumer-docs-guide.tsx",
    "apps/web/lib/customer-image-api-chapter.ts",
  ];

  let ok = true;
  for (const rel of files) {
    const src = read(rel);
    // Internal adapter may mention IMAGE_PROVIDER_* and fall back to GRSAI env —
    // public docs + route public response builders must not leak brands/hosts.
    if (rel.includes("imageAsyncProvider.ts")) {
      // Provider file is internal; still must not put brand strings into publicMessage.
      if (/publicMessage:\s*[`"'].*(grsai|grsaiapi)/i.test(src)) {
        ok = fail(`${rel} publicMessage leak`) && ok;
      } else {
        pass(`${rel} publicMessage clean`);
      }
      continue;
    }
    if (rel.includes("routes/images.ts")) {
      const pub = read("apps/dmit-api/src/images/publicResponse.ts");
      const publicFn =
        src.match(/function buildPublicImageSuccessResponse[\s\S]*?\n\}/) ||
        pub.match(/function buildPublicImageTaskResponse[\s\S]*?\n\}/);
      if (!publicFn) {
        ok = fail("public success builder missing") && ok;
        continue;
      }
      ok = assertNoLeak("public success response builder", publicFn[0]) && ok;
      if (LEAK_RE.test(src) && /publicMessage:[\s\S]{0,80}grsai/i.test(src)) {
        ok = fail("route publicMessage leak") && ok;
      } else {
        pass("route public messages clean");
      }
      continue;
    }
    ok = assertNoLeak(rel, src) && ok;
  }
  return ok;
}

function checkFriendlyErrors() {
  const route = read("apps/dmit-api/src/routes/images.ts");
  const worker = read("apps/dmit-api/src/images/worker.ts");
  const provider = read("apps/dmit-api/src/upstream/imageAsyncProvider.ts");
  const needed = [
    [
      "insufficient_credits zh",
      route.includes("算力积分不足，请充值后再试。") ||
        worker.includes("算力积分不足，请充值后再试。"),
    ],
    [
      "reference_image_required zh",
      route.includes("请先上传参考图片，或改用文生图模式。"),
    ],
    [
      "timeout zh",
      provider.includes("图片生成时间较长，请稍后重试或更换模型。"),
    ],
  ];
  const failed = needed.filter(([, ok]) => !ok).map(([n]) => n);
  if (failed.length) return fail("friendly error copy", failed.join(", "));
  return pass("friendly error copy");
}

function main() {
  console.log("P821 image public API smoke\n");
  const results = [
    checkRoutesAndAdapter(),
    checkTextToImageSchema(),
    checkReferenceRequired(),
    checkBlobForbidden(),
    checkFriendlyErrors(),
    checkNoLeakInPublicLayers(),
  ];
  const failed = results.filter((r) => !r).length;
  console.log(`\n${failed === 0 ? "OK" : "FAILED"}  ${results.length - failed}/${results.length} checks passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
