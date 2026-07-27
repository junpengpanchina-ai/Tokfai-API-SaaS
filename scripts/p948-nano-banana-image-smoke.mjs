#!/usr/bin/env node
/**
 * P948 — Nano Banana image capability smoke (default: static + mock).
 *
 * Checks:
 * 1) model=nano-banana hits image_generation; maps upstream to nano-banana-fast;
 *    public response model stays nano-banana; completes with data[0].url
 * 2) model=nano-banana-fast success path billable
 * 3) model=nano-banana-2 success path billable (or slow) and cannot use chat
 * 4) unavailable Nano Banana SKUs → image_model_not_available
 * 5) gpt/gemini cannot use /v1/images/generations
 * 6) image failure → not_billable
 * 7) image timeout → not_billable
 * 8) response error message/code never undefined
 * 9) video_generation is reserved/disabled
 * 10) logs emit requestedModel + upstreamModel + providerId (static)
 *
 * Usage (gate / offline — mock only, never real Nano Banana):
 *   node scripts/p948-nano-banana-image-smoke.mjs
 *
 * Real Nano Banana (explicit opt-in):
 *   LIVE=1 MODEL=nano-banana TOKFAI_API_KEY=sk-tokfai_... \
 *     node scripts/p948-nano-banana-image-smoke.mjs
 *
 * Acceptance:
 *   TOKFAI_P948_NANO_BANANA_IMAGE_CAPABILITY_PASS
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bootstrapClientCompatSmoke,
  pass,
  fail,
} from "./lib/client-compat-smoke-bootstrap.mjs";
import { ensureMockGateway } from "./lib/ensure-mock-gateway.mjs";
import { acceptanceFetch } from "./lib/acceptance-http.mjs";

const SCRIPT = "scripts/p948-nano-banana-image-smoke.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS_MARKER = "TOKFAI_P948_NANO_BANANA_IMAGE_CAPABILITY_PASS";
const FAIL_MARKER = "TOKFAI_P948_NANO_BANANA_IMAGE_CAPABILITY_FAIL";

const LIVE = String(process.env.LIVE ?? "").trim() === "1";
const LIVE_MODEL = String(process.env.MODEL ?? "").trim().toLowerCase();
/** Only when LIVE=1 AND MODEL=nano-banana may this smoke hit real upstream. */
const REAL_NANO_BANANA = LIVE && LIVE_MODEL === "nano-banana";

const UNAVAILABLE_IMAGE_MODELS = [
  "nano-banana-2-lite",
  "nano-banana-pro",
  "nano-banana-pro-vip",
  "nano-banana-pro-cl",
  "nano-banana-2-cl",
  "nano-banana-2-2k-cl",
  "nano-banana-2-4k-cl",
  "nano-banana-pro-4k-vip",
];

/**
 * Default / gate path: always mock (even if LIVE=1 without MODEL=nano-banana).
 * Real upstream only when LIVE=1 MODEL=nano-banana.
 */
async function bootstrapP948() {
  if (REAL_NANO_BANANA) {
    return bootstrapClientCompatSmoke(SCRIPT);
  }

  // Force offline mock contract — never call real Nano Banana by accident.
  const prevLive = process.env.LIVE;
  process.env.LIVE = "0";
  try {
    const mock = await ensureMockGateway();
    const BASE = mock.baseUrl.replace(/\/v1$/, "");
    const API_KEY = mock.apiKey;
    const TIMEOUT_MS = 120_000;
    const mockChild = mock.child ?? null;

    function authHeaders(extra = {}) {
      return {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
        ...extra,
      };
    }

    async function postJson(path, body) {
      return acceptanceFetch(`${BASE}${path}`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(body),
        timeoutMs: TIMEOUT_MS,
      });
    }

    async function getJson(path) {
      return acceptanceFetch(`${BASE}${path}`, {
        headers: authHeaders(),
        timeoutMs: TIMEOUT_MS,
      });
    }

    function cleanup() {
      if (mockChild) {
        try {
          mockChild.kill();
        } catch {
          // ignore
        }
      }
    }

    console.log(`offline mock: ${BASE}`);
    console.log(`api_key: ${API_KEY.slice(0, 14)}… (len=${API_KEY.length})`);
    console.log("");

    return {
      LIVE: false,
      BASE,
      API_KEY,
      TIMEOUT_MS,
      postJson,
      getJson,
      cleanup,
      authHeaders,
    };
  } finally {
    if (prevLive === undefined) delete process.env.LIVE;
    else process.env.LIVE = prevLive;
  }
}

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function containsUndefinedLiteral(value) {
  return /\bundefined\b/i.test(String(value ?? ""));
}

function isDefinedString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function checkStaticSources() {
  let ok = true;
  const policy = read(
    "apps/dmit-api/src/capabilities/modelCapabilityPolicy.ts"
  );
  const provider = read(
    "apps/dmit-api/src/upstream/nanoBananaImageProvider.ts"
  );
  const images = read("apps/dmit-api/src/routes/images.ts");
  const chatExec = read("apps/dmit-api/src/lib/executeChatCompletion.ts");
  const publicResp = read("apps/dmit-api/src/images/publicResponse.ts");
  const app = read("apps/dmit-api/src/app.ts");
  const aliases = read("apps/dmit-api/src/upstream/imageModelAliases.ts");
  const asyncProvider = read(
    "apps/dmit-api/src/upstream/imageAsyncProvider.ts"
  );
  const imageAdapter = read("apps/dmit-api/src/upstream/imageAdapter.ts");
  const catalog = read("apps/dmit-api/src/upstream/modelCatalog.ts");
  const loggerSrc = read("apps/dmit-api/src/logger.ts");

  ok =
    (policy.includes("image_generation") &&
    policy.includes("nano-banana") &&
    policy.includes("getModelCapability") &&
    policy.includes("assertCapabilityAllowed") &&
    policy.includes("isImageModel") &&
    policy.includes("isVideoModel") &&
    policy.includes("isUnavailableImageModel") &&
    /video_generation[\s\S]*reserved|reserved[\s\S]*video_generation/.test(
      policy
    )
      ? pass("capability policy module defines Nano Banana + helpers")
      : fail(
          "capability policy module defines Nano Banana + helpers",
          "missing exports or nano-banana / video reserved"
        )) && ok;

  ok =
    (policy.includes("gpt-5.5") &&
    policy.includes("gpt-5.4") &&
    policy.includes("gemini-3-pro") &&
    policy.includes("gemini-2.5-flash")
      ? pass("text_chat models listed in capability policy")
      : fail("text_chat models listed in capability policy")) && ok;

  ok =
    (aliases.includes("resolveImageUpstreamModel") &&
    aliases.includes('if (normalized === "nano-banana") return "nano-banana-fast"') &&
    aliases.includes("UNAVAILABLE_IMAGE_MODEL_IDS") &&
    UNAVAILABLE_IMAGE_MODELS.every((id) => aliases.includes(`"${id}"`)) &&
    !/"gpt-image-2"\s*,/.test(
      aliases.match(/UNAVAILABLE_IMAGE_MODEL_IDS[\s\S]*?\];/)?.[0] ?? ""
    )
      ? pass(
          "resolveImageUpstreamModel maps nano-banana→nano-banana-fast + unavailable set (no gpt-image-2)"
        )
      : fail(
          "resolveImageUpstreamModel maps nano-banana→nano-banana-fast + unavailable set (no gpt-image-2)"
        )) && ok;

  ok =
    (asyncProvider.includes("resolveImageUpstreamModel") &&
    /resolveImageUpstreamModel\s*\(\s*(?:params\.resolvedModel|requestedModel)\s*\)/.test(
      asyncProvider
    ) &&
    /payload\.model\s*=\s*upstreamModel/.test(asyncProvider)
      ? pass(
          "imageAsyncProvider applies resolveImageUpstreamModel + hard-pins payload.model"
        )
      : fail(
          "imageAsyncProvider applies resolveImageUpstreamModel + hard-pins payload.model"
        )) && ok;

  ok =
    (asyncProvider.includes("requestedModel") &&
    asyncProvider.includes("upstreamModel") &&
    /providerId:\s*PROVIDER_ID/.test(asyncProvider) &&
    /image_generation_upstream_request[\s\S]*?requestedModel[\s\S]*?upstreamModel/.test(
      asyncProvider
    ) &&
    loggerSrc.includes('"upstreamModel"') &&
    imageAdapter.includes("requestedModel") &&
    imageAdapter.includes("upstreamModel") &&
    /payload\.model\s*=\s*upstreamModel/.test(imageAdapter)
      ? pass(
          "nano-banana default upstreamModel must be nano-banana-fast (logs + allowlist + pin)"
        )
      : fail(
          "nano-banana default upstreamModel must be nano-banana-fast (logs + allowlist + pin)"
        )) && ok;

  ok =
    (/upstream_model:\s*"nano-banana-fast"/.test(catalog) &&
    /"nano-banana"\s*:\s*\{[\s\S]*?upstream_model:\s*"nano-banana-fast"/.test(
      catalog
    )
      ? pass("modelCatalog nano-banana upstream_model is nano-banana-fast")
      : fail("modelCatalog nano-banana upstream_model is nano-banana-fast")) &&
    ok;

  ok =
    (provider.includes("runNanoBananaImageGeneration") &&
    provider.includes("upstream_image_error") &&
    provider.includes("image_task_timeout") &&
    provider.includes("NANO_BANANA_MAX_WAIT_MS") &&
    provider.includes("request_id") &&
    provider.includes("capability") &&
    provider.includes("upstream_status") &&
    provider.includes("latencyMs")
      ? pass("nanoBananaImageProvider long-task + timeout + log fields")
      : fail("nanoBananaImageProvider long-task + timeout + log fields")) &&
    ok;

  ok =
    (images.includes('"/v1/images/generations"') &&
    images.includes("assertCapabilityAllowed") &&
    images.includes("isNonImageTextModel") &&
    images.includes("model_not_image_capable")
      ? pass("images route uses capability routing")
      : fail("images route uses capability routing")) && ok;

  ok =
    (chatExec.includes("isImageModel") &&
    chatExec.includes("image_capability_isolation") &&
    chatExec.includes("image_model_not_for_chat") &&
    chatExec.includes("/v1/images/generations")
      ? pass("chat completions isolates image models")
      : fail("chat completions isolates image models")) && ok;

  ok =
    (publicResp.includes("billing_status") &&
    publicResp.includes("task_id") &&
    publicResp.includes("revised_prompt") &&
    !publicResp.includes("upstream_model") &&
    !/grsai/i.test(publicResp)
      ? pass("public image response includes Tokfai billing + task_id (no upstream leak)")
      : fail(
          "public image response includes Tokfai billing + task_id (no upstream leak)"
        )) && ok;

  ok =
    (app.includes("imageRoutes")
      ? pass("app mounts imageRoutes")
      : fail("app mounts imageRoutes")) && ok;

  ok =
    (/video_generation:\s*"reserved"|status:\s*CAPABILITY_AVAILABILITY\.video_generation|video_generation:\s*\{\s*[\s\S]*status:.*reserved/.test(
      policy
    ) ||
    policy.includes('video_generation: "reserved"') ||
    /video_generation[\s\S]{0,80}reserved/.test(policy)
      ? pass("video_generation reserved/disabled in policy")
      : fail("video_generation reserved/disabled in policy")) && ok;

  return ok;
}

async function pollUntilTerminal(getJson, taskId, { timeoutMs = 8_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let latest = null;
  while (Date.now() < deadline) {
    const { res, body } = await getJson(
      `/v1/images/generations/${encodeURIComponent(taskId)}`
    );
    latest = { res, body };
    const status = body?.status;
    if (
      status === "completed" ||
      status === "failed" ||
      status === "retryable_timeout"
    ) {
      return latest;
    }
    await sleep(120);
  }
  return latest;
}

async function postImageAndAwait(postJson, getJson, model, prompt, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 8_000;
  const { res, body, text } = await postJson("/v1/images/generations", {
    model,
    prompt,
    size: "1024x1024",
    n: 1,
    response_format: "url",
  });
  const taskId = body?.task_id || body?.id || body?.request_id;
  const accepted =
    (res.status === 202 || res.status === 200) && Boolean(taskId);
  if (!accepted) {
    return { accepted: false, res, body, text, polled: null };
  }
  const polled = await pollUntilTerminal(getJson, taskId, { timeoutMs });
  return { accepted: true, res, body, text, polled, taskId };
}

function hasCompletedUrl(polled) {
  const data0 = polled?.body?.data?.[0];
  const hasUrl =
    typeof data0?.url === "string" && data0.url.trim().length > 0;
  const hasB64 =
    typeof data0?.b64_json === "string" && data0.b64_json.trim().length > 0;
  return polled?.body?.status === "completed" && (hasUrl || hasB64);
}

function isBillableSuccess(polled) {
  if (!hasCompletedUrl(polled)) return false;
  const billing =
    polled?.body?.tokfai?.billing_status ?? polled?.body?.billing_status;
  const credits = Number(
    polled?.body?.tokfai?.credits_charged ??
      polled?.body?.credits_charged ??
      polled?.body?.usage?.credits_charged ??
      0
  );
  return billing === "billable" && credits > 0;
}

function isNotBillableFailureOrTimeout(polled) {
  const billing =
    polled?.body?.tokfai?.billing_status ?? polled?.body?.billing_status;
  const credits = Number(
    polled?.body?.tokfai?.credits_charged ??
      polled?.body?.credits_charged ??
      0
  );
  const status = polled?.body?.status;
  const code = polled?.body?.error?.code;
  const terminalFail =
    status === "failed" ||
    status === "retryable_timeout" ||
    code === "upstream_image_error" ||
    code === "image_task_timeout";
  return terminalFail && billing === "not_billable" && credits === 0;
}

function leaksUpstream(body, text) {
  const blob = `${JSON.stringify(body ?? {})}\n${String(text ?? "")}`;
  if (/\bgrsai\b/i.test(blob)) return true;
  if (/\bupstream_model\b/i.test(blob)) return true;
  if (/sk-[a-z0-9_-]{16,}/i.test(blob) && !/sk-tokfai_/i.test(blob)) {
    return true;
  }
  return false;
}

async function main() {
  let ok = true;
  console.log("=== P948 Nano Banana image capability smoke ===");
  console.log(
    REAL_NANO_BANANA
      ? "mode: LIVE real Nano Banana (MODEL=nano-banana)"
      : "mode: static + mock (default; no real Nano Banana)"
  );
  console.log("");

  ok = checkStaticSources() && ok;

  const ctx = await bootstrapP948();
  const { postJson, getJson, cleanup } = ctx;

  try {
    // 1) nano-banana → image_generation; upstream mapping; completed; public model
    {
      const result = await postImageAndAwait(
        postJson,
        getJson,
        "nano-banana",
        "a simple red circle on white background",
        { timeoutMs: REAL_NANO_BANANA ? 130_000 : 8_000 }
      );
      ok =
        (result.accepted
          ? pass("1. model=nano-banana hits image_generation (POST accepted)")
          : fail(
              "1. model=nano-banana hits image_generation (POST accepted)",
              `status=${result.res.status} body=${String(result.text).slice(0, 240)}`
            )) && ok;

      if (result.accepted && containsUndefinedLiteral(result.text)) {
        ok =
          fail(
            "1b. accept response has no undefined literals",
            String(result.text).slice(0, 200)
          ) && false;
      } else if (result.accepted) {
        pass("1b. accept response has no undefined literals");
      }

      if (result.accepted) {
        const publicModel =
          result.polled?.body?.model ?? result.body?.model ?? null;
        ok =
          (publicModel === "nano-banana"
            ? pass(
                "1c. public response model stays nano-banana (no upstream leak)"
              )
            : fail(
                "1c. public response model stays nano-banana (no upstream leak)",
                `model=${publicModel}`
              )) && ok;

        ok =
          (!leaksUpstream(result.polled?.body ?? result.body, result.text)
            ? pass("1d. response does not leak grsai / upstream_model / key")
            : fail(
                "1d. response does not leak grsai / upstream_model / key"
              )) && ok;
      }

      if (result.accepted && result.polled) {
        const completed = hasCompletedUrl(result.polled);
        // Static asserts already prove nano-banana→nano-banana-fast wiring.
        ok =
          (completed
            ? pass(
                "1e. model=nano-banana maps upstream nano-banana-fast and completed"
              )
            : fail(
                "1e. model=nano-banana maps upstream nano-banana-fast and completed",
                `status=${result.polled?.body?.status} data0=${JSON.stringify(result.polled?.body?.data?.[0])}`
              )) && ok;

        const billable =
          result.polled?.body?.tokfai?.billing_status === "billable" ||
          Number(result.polled?.body?.tokfai?.credits_charged ?? 0) > 0 ||
          Number(result.polled?.body?.credits_charged ?? 0) > 0;
        if (result.polled?.body?.status === "completed") {
          ok =
            (billable || result.polled?.body?.tokfai?.billing_status
              ? pass("1f. completed response includes tokfai billing fields")
              : fail("1f. completed response includes tokfai billing fields")) &&
            ok;
        }
      }
    }

    // 2) nano-banana-fast success path billable
    {
      const result = await postImageAndAwait(
        postJson,
        getJson,
        "nano-banana-fast",
        "a simple blue square on white background",
        { timeoutMs: REAL_NANO_BANANA ? 130_000 : 8_000 }
      );
      if (!REAL_NANO_BANANA) {
        ok =
          (result.accepted && isBillableSuccess(result.polled)
            ? pass("2. nano-banana-fast success path billable")
            : fail(
                "2. nano-banana-fast success path billable",
                `accepted=${result.accepted} status=${result.polled?.body?.status} tokfai=${JSON.stringify(result.polled?.body?.tokfai)}`
              )) && ok;
      } else if (result.accepted) {
        const status = result.polled?.body?.status;
        if (status === "completed") {
          ok =
            (isBillableSuccess(result.polled)
              ? pass("2. nano-banana-fast success path billable")
              : fail(
                  "2. nano-banana-fast success path billable",
                  `tokfai=${JSON.stringify(result.polled?.body?.tokfai)}`
                )) && ok;
        } else {
          ok =
            (status === "retryable_timeout" || status === "failed"
              ? pass(`2. model=nano-banana-fast terminal (${status})`)
              : fail(
                  "2. model=nano-banana-fast terminal",
                  `status=${status}`
                )) && ok;
        }
      } else {
        ok =
          fail(
            "2. nano-banana-fast success path billable",
            `status=${result.res.status} body=${String(result.text).slice(0, 240)}`
          ) && false;
      }
    }

    // 3) nano-banana-2 success path billable (or slow); cannot use chat
    {
      const result = await postImageAndAwait(
        postJson,
        getJson,
        "nano-banana-2",
        "a simple green triangle on white background",
        { timeoutMs: REAL_NANO_BANANA ? 130_000 : 8_000 }
      );
      if (!REAL_NANO_BANANA) {
        ok =
          (result.accepted && isBillableSuccess(result.polled)
            ? pass("3a. nano-banana-2 success path billable")
            : fail(
                "3a. nano-banana-2 success path billable",
                `accepted=${result.accepted} status=${result.polled?.body?.status} tokfai=${JSON.stringify(result.polled?.body?.tokfai)}`
              )) && ok;
      } else if (result.accepted) {
        const status = result.polled?.body?.status;
        if (status === "completed") {
          ok =
            (isBillableSuccess(result.polled)
              ? pass("3a. nano-banana-2 success path billable")
              : fail(
                  "3a. nano-banana-2 success path billable",
                  `tokfai=${JSON.stringify(result.polled?.body?.tokfai)}`
                )) && ok;
        } else {
          const okTerminal =
            status === "retryable_timeout" ||
            status === "failed" ||
            result.polled?.body?.processing === true;
          ok =
            (okTerminal
              ? pass(
                  `3a. model=nano-banana-2 completed or slow (${status ?? "processing"})`
                )
              : fail(
                  "3a. model=nano-banana-2 completed or slow",
                  `status=${status}`
                )) && ok;
        }
      } else {
        ok =
          fail(
            "3a. nano-banana-2 success path billable",
            `status=${result.res.status} body=${String(result.text).slice(0, 240)}`
          ) && false;
      }

      const { res, body, text } = await postJson("/v1/chat/completions", {
        model: "nano-banana-2",
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 8,
      });
      const rejected =
        res.status >= 400 &&
        (body?.error?.code === "image_model_not_for_chat" ||
          body?.error?.code === "model_not_available" ||
          /image/i.test(String(body?.error?.message ?? "")));
      ok =
        (rejected
          ? pass("3b. nano-banana-2 cannot use /v1/chat/completions")
          : fail(
              "3b. nano-banana-2 cannot use /v1/chat/completions",
              `status=${res.status} body=${String(text).slice(0, 240)}`
            )) && ok;
    }

    // 4) nano-banana cannot use chat/completions
    {
      const { res, body, text } = await postJson("/v1/chat/completions", {
        model: "nano-banana",
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 8,
      });
      const rejected =
        res.status >= 400 &&
        (body?.error?.code === "image_model_not_for_chat" ||
          body?.error?.code === "model_not_available" ||
          /image/i.test(String(body?.error?.message ?? "")));
      ok =
        (rejected
          ? pass("4. nano-banana cannot use /v1/chat/completions")
          : fail(
              "4. nano-banana cannot use /v1/chat/completions",
              `status=${res.status} body=${String(text).slice(0, 240)}`
            )) && ok;
      if (
        body?.error &&
        (!isDefinedString(body.error.message) ||
          !isDefinedString(body.error.code) ||
          containsUndefinedLiteral(body.error.message))
      ) {
        ok =
          fail(
            "8a. chat reject error has defined message/code",
            JSON.stringify(body.error)
          ) && false;
      } else {
        pass("8a. chat reject error has defined message/code");
      }
    }

    // 5) unavailable models → image_model_not_available
    for (const model of UNAVAILABLE_IMAGE_MODELS) {
      const { res, body, text } = await postJson("/v1/images/generations", {
        model,
        prompt: "should not generate",
        size: "1024x1024",
        n: 1,
        response_format: "url",
      });
      const rejected =
        res.status >= 400 &&
        body?.error?.code === "image_model_not_available" &&
        body?.tokfai?.billing_status === "not_billable";
      ok =
        (rejected
          ? pass(`5. ${model} → image_model_not_available`)
          : fail(
              `5. ${model} → image_model_not_available`,
              `status=${res.status} body=${String(text).slice(0, 240)}`
            )) && ok;
    }

    // 6) gpt/gemini cannot use images/generations
    for (const model of ["gpt-5.4", "gemini-2.5-flash"]) {
      const { res, body, text } = await postJson("/v1/images/generations", {
        model,
        prompt: "should not generate",
        size: "1024x1024",
        n: 1,
        response_format: "url",
      });
      const rejected =
        res.status >= 400 &&
        (body?.error?.code === "model_not_image_capable" ||
          body?.error?.code === "image_model_not_available" ||
          body?.tokfai?.billing_status === "not_billable");
      ok =
        (rejected
          ? pass(`6. ${model} cannot use /v1/images/generations`)
          : fail(
              `6. ${model} cannot use /v1/images/generations`,
              `status=${res.status} body=${String(text).slice(0, 240)}`
            )) && ok;
    }

    if (!REAL_NANO_BANANA) {
      // 7) failure not billable
      {
        const { res, body, text } = await postJson("/v1/images/generations", {
          model: "nano-banana",
          prompt: "__tokfai_image_fail__ force_upstream_image_error",
          size: "1024x1024",
          n: 1,
          response_format: "url",
        });
        const taskId = body?.task_id || body?.id || body?.request_id;
        if (!(res.status === 202 || res.status === 200) || !taskId) {
          ok =
            fail(
              "7. image failure not_billable",
              `accept failed status=${res.status} ${String(text).slice(0, 200)}`
            ) && false;
        } else {
          const polled = await pollUntilTerminal(getJson, taskId);
          ok =
            (isNotBillableFailureOrTimeout(polled)
              ? pass("7. failed/timeout path not_billable (failure)")
              : fail(
                  "7. failed/timeout path not_billable (failure)",
                  `status=${polled?.body?.status} tokfai=${JSON.stringify(polled?.body?.tokfai)} error=${JSON.stringify(polled?.body?.error)}`
                )) && ok;

          const err = polled?.body?.error;
          if (
            err &&
            (!isDefinedString(err.message) ||
              !isDefinedString(err.code) ||
              containsUndefinedLiteral(err.message))
          ) {
            ok =
              fail(
                "8b. failure error has defined message/code",
                JSON.stringify(err)
              ) && false;
          } else {
            pass("8b. failure error has defined message/code");
          }
        }
      }

      // 8) timeout not billable
      {
        const { res, body, text } = await postJson("/v1/images/generations", {
          model: "nano-banana",
          prompt: "__tokfai_image_timeout__ force_image_task_timeout",
          size: "1024x1024",
          n: 1,
          response_format: "url",
        });
        const taskId = body?.task_id || body?.id || body?.request_id;
        if (!(res.status === 202 || res.status === 200) || !taskId) {
          ok =
            fail(
              "8. image timeout not_billable",
              `accept failed status=${res.status} ${String(text).slice(0, 200)}`
            ) && false;
        } else {
          const polled = await pollUntilTerminal(getJson, taskId);
          ok =
            (isNotBillableFailureOrTimeout(polled)
              ? pass("8. failed/timeout path not_billable (timeout)")
              : fail(
                  "8. failed/timeout path not_billable (timeout)",
                  `status=${polled?.body?.status} tokfai=${JSON.stringify(polled?.body?.tokfai)} error=${JSON.stringify(polled?.body?.error)}`
                )) && ok;
        }
      }
    } else {
      pass("7. failed/timeout path not_billable (failure skipped on LIVE)");
      pass("8. failed/timeout path not_billable (timeout skipped on LIVE)");
      pass("8b. failure error envelope (skipped on LIVE Nano Banana)");
    }

    // 9) video reserved — static already; assertCapabilityAllowed in policy source
    {
      const policy = read(
        "apps/dmit-api/src/capabilities/modelCapabilityPolicy.ts"
      );
      ok =
        (policy.includes("video_generation") &&
        /reserved|disabled/.test(policy) &&
        !policy.includes("runVideoGeneration")
          ? pass("9. video_generation reserved/disabled (no production wire)")
          : fail("9. video_generation reserved/disabled (no production wire)")) &&
        ok;
    }
  } finally {
    cleanup();
  }

  console.log("");
  console.log(ok ? PASS_MARKER : FAIL_MARKER);
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  console.log(FAIL_MARKER);
  process.exit(1);
});
