#!/usr/bin/env node
/**
 * P942 — Vision analyze smoke (offline static + mock HTTP).
 *
 * Checks:
 * 1) POST /v1/vision/analyze mounted; public surface lists it
 * 2) Isolated from chat text / Cherry / image generation main paths
 * 3) vision_analyze usage type + not_billable on upstream failure
 * 4) SSRF / non-image / oversized rejection codes
 * 5) Mock: image URL ok; localhost/blob rejected; non-image rejected;
 *    huge rejected; upstream fail not_billable; no undefined in errors
 * 6) Does not alter chatCompletionCompat image_url ignore behavior
 *
 * Usage: node scripts/p942-vision-analyze-smoke.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  bootstrapClientCompatSmoke,
  pass,
  fail,
} from "./lib/client-compat-smoke-bootstrap.mjs";
import { acceptanceFetch } from "./lib/acceptance-http.mjs";

const SCRIPT = "scripts/p942-vision-analyze-smoke.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS_MARKER = "TOKFAI_P942_VISION_ANALYZE_PASS";
const FAIL_MARKER = "TOKFAI_P942_VISION_ANALYZE_FAIL";

const LEAK_RE =
  /grsaiapi\.com|generativelanguage\.googleapis\.com|api\.openai\.com|(?<![\w.])grsai(?!api\.com)|(?<![\w.])garsai/i;

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function assertNoLeak(label, text) {
  const m = String(text).match(LEAK_RE);
  if (m) return fail(label, `leaked token: ${m[0]}`);
  return pass(label);
}

function containsUndefinedLiteral(text) {
  return /\bundefined\b/i.test(String(text ?? ""));
}

function isTokfaiErrorEnvelope(body) {
  const err = body?.error;
  return (
    err &&
    typeof err === "object" &&
    typeof err.message === "string" &&
    err.message.trim().length > 0 &&
    typeof err.code === "string" &&
    err.code.trim().length > 0 &&
    typeof err.type === "string" &&
    err.type.trim().length > 0 &&
    !containsUndefinedLiteral(err.message)
  );
}

async function main() {
  let ok = true;
  console.log("=== P942 vision analyze smoke ===\n");

  const app = read("apps/dmit-api/src/app.ts");
  const surface = read("apps/dmit-api/src/lib/publicApiSurface.ts");
  const visionRoute = read("apps/dmit-api/src/routes/vision.ts");
  const visionUsage = read("apps/dmit-api/src/lib/visionUsage.ts");
  const visionProvider = read(
    "apps/dmit-api/src/upstream/visionAnalyzeProvider.ts"
  );
  const visionParts = read("apps/dmit-api/src/lib/visionContentParts.ts");
  const chatCompat = read("apps/dmit-api/src/lib/chatCompletionCompat.ts");
  const chatRoute = read("apps/dmit-api/src/routes/chat.ts");
  const imagesRoute = read("apps/dmit-api/src/routes/images.ts");
  const modelAliases = read("apps/dmit-api/src/upstream/modelAliases.ts");
  const timeoutPolicy = read(
    "apps/dmit-api/src/lib/upstreamTimeoutPolicy.ts"
  );

  ok =
    (app.includes("visionRoutes") &&
    app.includes('app.route("/", visionRoutes)')
      ? pass("app mounts visionRoutes")
      : fail("app mounts visionRoutes")) && ok;

  ok =
    (surface.includes('"POST /v1/vision/analyze"')
      ? pass("publicApiSurface lists POST /v1/vision/analyze")
      : fail("publicApiSurface lists POST /v1/vision/analyze")) && ok;

  ok =
    (visionRoute.includes('"/v1/vision/analyze"') &&
    visionRoute.includes("vision.analysis") &&
    visionRoute.includes("assertImageUrlNotSsrf") &&
    visionRoute.includes("fetchImageAsDataUrl") &&
    visionRoute.includes("image_too_large") &&
    visionRoute.includes("unsupported_image_content_type")
      ? pass("vision route validates SSRF / content-type / size")
      : fail("vision route validates SSRF / content-type / size")) && ok;

  ok =
    (visionUsage.includes('VISION_ANALYZE_USAGE_TYPE = "vision_analyze"') &&
    visionUsage.includes("not_billable") &&
    visionUsage.includes('VISION_ANALYZE_ENDPOINT = "/v1/vision/analyze"')
      ? pass("vision_analyze usage type + not_billable failure path")
      : fail("vision_analyze usage type + not_billable failure path")) && ok;

  ok =
    (visionProvider.includes("buildVisionUserContentParts") &&
    visionProvider.includes("providerFetch") &&
    visionParts.includes('type: "image_url"') &&
    !visionProvider.includes("buildUpstreamChatBody(") &&
    !visionProvider.includes("executeChatCompletion(") &&
    !visionProvider.includes("buildGrsaiImagePayload(")
      ? pass("vision upstream is multimodal-dedicated (not text/image-gen)")
      : fail(
          "vision upstream is multimodal-dedicated (not text/image-gen)"
        )) && ok;

  ok =
    (visionParts.includes("extractImageUrlsFromContent") &&
    visionParts.includes('type: "image_url"')
      ? pass("visionContentParts prep for future chat image_url")
      : fail("visionContentParts prep for future chat image_url")) && ok;

  ok =
    (chatCompat.includes(
      "ignore image_url / tool / illegal object parts for text chat compat"
    )
      ? pass("chatCompletionCompat still ignores image_url (Cherry text)")
      : fail("chatCompletionCompat still ignores image_url (Cherry text)")) &&
    ok;

  ok =
    (!chatRoute.includes("/v1/vision/analyze") &&
    !chatRoute.includes("visionAnalyze")
      ? pass("chat route untouched by vision endpoint")
      : fail("chat route untouched by vision endpoint")) && ok;

  ok =
    (!imagesRoute.includes("/v1/vision/analyze") &&
    !imagesRoute.includes("visionAnalyze")
      ? pass("image generation route untouched by vision endpoint")
      : fail("image generation route untouched by vision endpoint")) && ok;

  ok =
    (!modelAliases.includes("vision-auto")
      ? pass("modelAliases unchanged (vision-auto is route-local)")
      : fail("modelAliases unchanged (vision-auto is route-local)")) && ok;

  ok =
    (!timeoutPolicy.includes("vision")
      ? pass("upstreamTimeoutPolicy unchanged")
      : fail("upstreamTimeoutPolicy unchanged")) && ok;

  ok = assertNoLeak("vision route source has no upstream host leak", visionRoute) && ok;
  {
    // Provider may import ./grsai.js transport — only publicMessage strings matter.
    const publicMsgs = [...visionProvider.matchAll(/publicMessage:\s*"([^"]*)"/g)].map(
      (m) => m[1]
    );
    const joined = publicMsgs.join("\n");
    ok =
      assertNoLeak(
        "vision provider publicMessage has no upstream host leak",
        joined || "(no publicMessage)"
      ) && ok;
  }

  // Cherry matrix / real-body smokes must still pass (offline).
  for (const script of [
    "scripts/p932-cherry-studio-real-body-smoke.mjs",
    "scripts/p933-cherry-studio-compat-matrix-smoke.mjs",
  ]) {
    const r = spawnSync(process.execPath, [join(ROOT, script)], {
      cwd: ROOT,
      encoding: "utf8",
      env: process.env,
    });
    const out = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    if (r.status === 0) {
      ok = pass(`${script} still PASS`) && ok;
    } else {
      ok =
        fail(
          `${script} still PASS`,
          out.slice(-400) || `exit ${r.status}`
        ) && ok;
    }
  }

  // Mock HTTP probes
  const ctx = await bootstrapClientCompatSmoke(SCRIPT);
  try {
    async function postVision(body) {
      return acceptanceFetch(`${ctx.BASE}/v1/vision/analyze`, {
        method: "POST",
        headers: ctx.authHeaders(),
        body: JSON.stringify(body),
        timeoutMs: ctx.TIMEOUT_MS,
      });
    }

    {
      const { res, body, text } = await postVision({
        model: "vision-auto",
        image_url: "https://cdn.tokfai.com/demo.png",
        prompt: "请分析这张图",
      });
      if (
        res.status === 200 &&
        body?.object === "vision.analysis" &&
        typeof body?.output_text === "string" &&
        body.output_text.length > 0 &&
        body?.tokfai?.usage_type === "vision_analyze" &&
        !containsUndefinedLiteral(text)
      ) {
        ok = pass("mock: image URL analyze → 200 vision.analysis") && ok;
      } else {
        ok =
          fail(
            "mock: image URL analyze → 200 vision.analysis",
            `HTTP ${res.status} body=${text.slice(0, 200)}`
          ) && ok;
      }
      ok = assertNoLeak("mock success body no upstream leak", text) && ok;
    }

    {
      const { res, body, text } = await postVision({
        model: "vision-auto",
        image_url: "http://127.0.0.1/secret.png",
        prompt: "x",
      });
      if (
        res.status === 400 &&
        isTokfaiErrorEnvelope(body) &&
        body.error.code === "invalid_image_url"
      ) {
        ok = pass("mock: localhost SSRF rejected") && ok;
      } else {
        ok =
          fail(
            "mock: localhost SSRF rejected",
            `HTTP ${res.status} ${text.slice(0, 200)}`
          ) && ok;
      }
    }

    {
      const { res, body, text } = await postVision({
        model: "vision-auto",
        image_url: "blob:https://tokfai.com/abc",
        prompt: "x",
      });
      if (res.status === 400 && isTokfaiErrorEnvelope(body)) {
        ok = pass("mock: blob: URL rejected") && ok;
      } else {
        ok =
          fail(
            "mock: blob: URL rejected",
            `HTTP ${res.status} ${text.slice(0, 200)}`
          ) && ok;
      }
    }

    {
      const { res, body, text } = await postVision({
        model: "vision-auto",
        image_url: "https://example.com/not-an-image",
        prompt: "x",
      });
      if (
        res.status === 400 &&
        isTokfaiErrorEnvelope(body) &&
        body.error.code === "unsupported_image_content_type"
      ) {
        ok = pass("mock: non-image URL rejected") && ok;
      } else {
        ok =
          fail(
            "mock: non-image URL rejected",
            `HTTP ${res.status} ${text.slice(0, 200)}`
          ) && ok;
      }
    }

    {
      const { res, body, text } = await postVision({
        model: "vision-auto",
        image_url: "https://example.com/huge-image",
        prompt: "x",
      });
      if (
        res.status === 400 &&
        isTokfaiErrorEnvelope(body) &&
        body.error.code === "image_too_large"
      ) {
        ok = pass("mock: oversized image rejected") && ok;
      } else {
        ok =
          fail(
            "mock: oversized image rejected",
            `HTTP ${res.status} ${text.slice(0, 200)}`
          ) && ok;
      }
    }

    {
      const { res, body, text } = await postVision({
        model: "vision-auto",
        image_url: "https://example.com/upstream-fail",
        prompt: "x",
      });
      if (
        res.status >= 400 &&
        isTokfaiErrorEnvelope(body) &&
        (body?.tokfai?.billing_status === "not_billable" ||
          body.error.code === "upstream_error") &&
        !containsUndefinedLiteral(text)
      ) {
        ok = pass("mock: upstream fail → error envelope, not charged") && ok;
      } else {
        ok =
          fail(
            "mock: upstream fail → error envelope, not charged",
            `HTTP ${res.status} ${text.slice(0, 240)}`
          ) && ok;
      }
      ok = assertNoLeak("mock error body no upstream leak", text) && ok;
    }
  } finally {
    ctx.cleanup();
  }

  console.log("");
  console.log(ok ? PASS_MARKER : FAIL_MARKER);
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  console.log(FAIL_MARKER);
  process.exit(1);
});
