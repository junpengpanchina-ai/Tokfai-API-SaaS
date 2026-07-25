#!/usr/bin/env node
/**
 * P948 — Nano Banana image capability smoke (default: static + mock).
 *
 * Checks:
 * 1) model=nano-banana hits image_generation capability
 * 2) nano-banana cannot use /v1/chat/completions
 * 3) gpt/gemini cannot use /v1/images/generations
 * 4) image failure → not_billable
 * 5) image timeout → not_billable
 * 6) mock success returns data[0].url or b64_json
 * 7) response error message/code never undefined
 * 8) video_generation is reserved/disabled
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

  ok =
    (policy.includes('image_generation') &&
    policy.includes("nano-banana") &&
    policy.includes("getModelCapability") &&
    policy.includes("assertCapabilityAllowed") &&
    policy.includes("isImageModel") &&
    policy.includes("isVideoModel") &&
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
    images.includes("isTextChatModel")
      ? pass("images route uses capability routing")
      : fail("images route uses capability routing")) && ok;

  ok =
    (chatExec.includes("isImageModel") &&
    chatExec.includes("image_capability_isolation") &&
    chatExec.includes("/v1/images/generations")
      ? pass("chat completions isolates image models")
      : fail("chat completions isolates image models")) && ok;

  ok =
    (publicResp.includes("billing_status") &&
    publicResp.includes("task_id") &&
    publicResp.includes("revised_prompt")
      ? pass("public image response includes Tokfai billing + task_id")
      : fail("public image response includes Tokfai billing + task_id")) && ok;

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

    // 1) nano-banana → image_generation accept
    {
      const { res, body, text } = await postJson("/v1/images/generations", {
        model: "nano-banana",
        prompt: "a simple red circle on white background",
        size: "1024x1024",
        n: 1,
        response_format: "url",
      });
      const accepted =
        (res.status === 202 || res.status === 200) &&
        (body?.task_id || body?.id || body?.request_id);
      ok =
        (accepted
          ? pass("1. model=nano-banana hits image_generation (POST accepted)")
          : fail(
              "1. model=nano-banana hits image_generation (POST accepted)",
              `status=${res.status} body=${String(text).slice(0, 240)}`
            )) && ok;

      if (accepted && containsUndefinedLiteral(text)) {
        ok =
          fail(
            "1b. accept response has no undefined literals",
            String(text).slice(0, 200)
          ) && false;
      } else if (accepted) {
        pass("1b. accept response has no undefined literals");
      }

      const taskId = body?.task_id || body?.id || body?.request_id;
      if (taskId && !REAL_NANO_BANANA) {
        const polled = await pollUntilTerminal(getJson, taskId);
        const data0 = polled?.body?.data?.[0];
        const hasUrl =
          typeof data0?.url === "string" && data0.url.trim().length > 0;
        const hasB64 =
          typeof data0?.b64_json === "string" && data0.b64_json.trim().length > 0;
        ok =
          (polled?.body?.status === "completed" && (hasUrl || hasB64)
            ? pass("6. mock success returns data[0].url or b64_json")
            : fail(
                "6. mock success returns data[0].url or b64_json",
                `status=${polled?.body?.status} data0=${JSON.stringify(data0)}`
              )) && ok;

        const billable =
          polled?.body?.tokfai?.billing_status === "billable" ||
          Number(polled?.body?.tokfai?.credits_charged ?? 0) > 0 ||
          Number(polled?.body?.credits_charged ?? 0) > 0;
        if (polled?.body?.status === "completed") {
          ok =
            (billable || polled?.body?.tokfai?.billing_status
              ? pass("6b. completed response includes tokfai billing fields")
              : fail("6b. completed response includes tokfai billing fields")) &&
            ok;
        }
      } else if (REAL_NANO_BANANA && taskId) {
        pass("6. LIVE Nano Banana accept ok (skip mock url assert)");
      }
    }

    // 2) nano-banana cannot use chat/completions
    {
      const { res, body, text } = await postJson("/v1/chat/completions", {
        model: "nano-banana",
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 8,
      });
      const rejected =
        res.status >= 400 &&
        (body?.error?.code === "model_not_available" ||
          /image/i.test(String(body?.error?.message ?? "")));
      ok =
        (rejected
          ? pass("2. nano-banana cannot use /v1/chat/completions")
          : fail(
              "2. nano-banana cannot use /v1/chat/completions",
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
            "7a. chat reject error has defined message/code",
            JSON.stringify(body.error)
          ) && false;
      } else {
        pass("7a. chat reject error has defined message/code");
      }
    }

    // 3) gpt/gemini cannot use images/generations
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
        (body?.error?.code === "image_model_not_available" ||
          body?.tokfai?.billing_status === "not_billable");
      ok =
        (rejected
          ? pass(`3. ${model} cannot use /v1/images/generations`)
          : fail(
              `3. ${model} cannot use /v1/images/generations`,
              `status=${res.status} body=${String(text).slice(0, 240)}`
            )) && ok;
    }

    if (!REAL_NANO_BANANA) {
      // 4) failure not billable
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
              "4. image failure not_billable",
              `accept failed status=${res.status} ${String(text).slice(0, 200)}`
            ) && false;
        } else {
          const polled = await pollUntilTerminal(getJson, taskId);
          const notBillable =
            polled?.body?.tokfai?.billing_status === "not_billable" &&
            Number(polled?.body?.tokfai?.credits_charged ?? 0) === 0 &&
            Number(polled?.body?.credits_charged ?? 0) === 0;
          const failed =
            polled?.body?.status === "failed" ||
            polled?.body?.error?.code === "upstream_image_error";
          ok =
            (failed && notBillable
              ? pass("4. image failure not_billable")
              : fail(
                  "4. image failure not_billable",
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
                "7b. failure error has defined message/code",
                JSON.stringify(err)
              ) && false;
          } else {
            pass("7b. failure error has defined message/code");
          }
        }
      }

      // 5) timeout not billable
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
              "5. image timeout not_billable",
              `accept failed status=${res.status} ${String(text).slice(0, 200)}`
            ) && false;
        } else {
          const polled = await pollUntilTerminal(getJson, taskId);
          const notBillable =
            polled?.body?.tokfai?.billing_status === "not_billable" &&
            Number(polled?.body?.tokfai?.credits_charged ?? 0) === 0;
          const timedOut =
            polled?.body?.status === "retryable_timeout" ||
            polled?.body?.error?.code === "image_task_timeout";
          ok =
            (timedOut && notBillable
              ? pass("5. image timeout not_billable")
              : fail(
                  "5. image timeout not_billable",
                  `status=${polled?.body?.status} tokfai=${JSON.stringify(polled?.body?.tokfai)} error=${JSON.stringify(polled?.body?.error)}`
                )) && ok;
        }
      }
    } else {
      pass("4. image failure not_billable (skipped on LIVE Nano Banana)");
      pass("5. image timeout not_billable (skipped on LIVE Nano Banana)");
      pass("7b. failure error envelope (skipped on LIVE Nano Banana)");
    }

    // 8) video reserved — static already; assertCapabilityAllowed in policy source
    {
      const policy = read(
        "apps/dmit-api/src/capabilities/modelCapabilityPolicy.ts"
      );
      ok =
        (policy.includes("video_generation") &&
        /reserved|disabled/.test(policy) &&
        !policy.includes("runVideoGeneration")
          ? pass("8. video_generation reserved/disabled (no production wire)")
          : fail("8. video_generation reserved/disabled (no production wire)")) &&
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
