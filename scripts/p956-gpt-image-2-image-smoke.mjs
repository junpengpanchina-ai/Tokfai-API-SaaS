#!/usr/bin/env node
/**
 * P956 — gpt-image-2 / gpt-image-2-vip Image Generation adaptation smoke.
 *
 * Keeps P954 isolation codes:
 *   - image → chat  → image_model_not_for_chat (not_billable)
 *   - text → images → model_not_image_capable (not_billable)
 *
 * Asserts:
 * 1) gpt-image-2 submit → task_id → poll → completed + url + billable
 * 2) gpt-image-2 on /v1/chat/completions → image_model_not_for_chat
 * 3) gemini-2.5-flash on /v1/images/generations → model_not_image_capable
 * 4) Static: gpt-image-2 / vip enabled, not in UNAVAILABLE, in Image Generation
 *
 * Usage (gate / offline — mock):
 *   node scripts/p956-gpt-image-2-image-smoke.mjs
 *
 * Live (optional):
 *   LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p956-gpt-image-2-image-smoke.mjs
 *
 * Acceptance:
 *   TOKFAI_P956_GPT_IMAGE_2_IMAGE_PASS
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { acceptanceFetch } from "./lib/acceptance-http.mjs";
import { ensureMockGateway } from "./lib/ensure-mock-gateway.mjs";
import {
  bootstrapClientCompatSmoke,
  pass,
  fail,
} from "./lib/client-compat-smoke-bootstrap.mjs";

const SCRIPT = "scripts/p956-gpt-image-2-image-smoke.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS_MARKER = "TOKFAI_P956_GPT_IMAGE_2_IMAGE_PASS";
const FAIL_MARKER = "TOKFAI_P956_GPT_IMAGE_2_IMAGE_FAIL";

const LIVE = String(process.env.LIVE ?? "").trim() === "1";

function readSrc(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertStatic() {
  let ok = true;
  const aliases = readSrc("apps/dmit-api/src/upstream/imageModelAliases.ts");
  const catalog = readSrc("apps/dmit-api/src/upstream/modelCatalog.ts");
  const registry = readSrc("apps/web/lib/public-model-registry.ts");
  const isolation = readSrc("apps/dmit-api/src/lib/imageProviderIsolation.ts");
  const chatExec = readSrc("apps/dmit-api/src/lib/executeChatCompletion.ts");
  const images = readSrc("apps/dmit-api/src/routes/images.ts");
  const unavailableBlock =
    aliases.match(/UNAVAILABLE_IMAGE_MODEL_IDS[\s\S]*?\];/)?.[0] ?? "";

  ok =
    (!unavailableBlock.includes('"gpt-image-2"') &&
    !unavailableBlock.includes('"gpt-image-2-vip"')
      ? pass("static: gpt-image-2 / vip not in UNAVAILABLE_IMAGE_MODEL_IDS")
      : fail("static: gpt-image-2 / vip not in UNAVAILABLE_IMAGE_MODEL_IDS")) &&
    ok;

  ok =
    (/"gpt-image-2"\s*:\s*\{[\s\S]*?enabled:\s*true/.test(catalog) &&
    /"gpt-image-2-vip"\s*:\s*\{[\s\S]*?enabled:\s*true/.test(catalog)
      ? pass("static: modelCatalog gpt-image-2 / vip enabled")
      : fail("static: modelCatalog gpt-image-2 / vip enabled")) && ok;

  ok =
    (/id:\s*"gpt-image-2"[\s\S]*?supportsImageGeneration:\s*true/.test(
      registry
    ) &&
    /id:\s*"gpt-image-2-vip"[\s\S]*?supportsImageGeneration:\s*true/.test(
      registry
    ) &&
    /id:\s*"gpt-image-2"[\s\S]*?group:\s*"image"/.test(registry)
      ? pass("static: registry Image Generation includes gpt-image-2 / vip")
      : fail(
          "static: registry Image Generation includes gpt-image-2 / vip"
        )) && ok;

  ok =
    (isolation.includes("IMAGE_MODEL_NOT_FOR_CHAT_CODE") &&
    isolation.includes("MODEL_NOT_IMAGE_CAPABLE_CODE") &&
    chatExec.includes("image_model_not_for_chat") &&
    images.includes("model_not_image_capable")
      ? pass("static: P954 isolation codes unchanged")
      : fail("static: P954 isolation codes unchanged")) && ok;

  return ok;
}

async function bootstrap() {
  if (LIVE) {
    return bootstrapClientCompatSmoke(SCRIPT);
  }
  const mock = await ensureMockGateway();
  const BASE = mock.baseUrl.replace(/\/v1$/, "");
  const API_KEY = mock.apiKey;
  const mockChild = mock.child ?? null;
  return {
    BASE,
    API_KEY,
    cleanup() {
      if (mockChild) {
        try {
          mockChild.kill();
        } catch {
          // ignore
        }
      }
    },
  };
}

async function pollUntilTerminal(getJson, taskId, { timeoutMs = 15_000 } = {}) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    last = await getJson(`/v1/images/generations/${taskId}`);
    const status = last?.body?.status;
    if (
      status === "completed" ||
      status === "failed" ||
      status === "retryable_timeout"
    ) {
      return last;
    }
    await sleep(150);
  }
  return last;
}

function isBillableSuccess(polled) {
  const body = polled?.body;
  if (!body || body.status !== "completed") return false;
  const url = body?.data?.[0]?.url;
  if (typeof url !== "string" || url.trim().length === 0) return false;
  return (
    body?.tokfai?.billing_status === "billable" ||
    Number(body?.tokfai?.credits_charged ?? body?.usage?.credits_charged ?? 0) >
      0
  );
}

async function main() {
  console.log("=== P956 gpt-image-2 Image Generation ===");
  let ok = assertStatic();

  const ctx = await bootstrap();
  const { BASE, API_KEY, cleanup } = ctx;
  try {
    async function postJson(path, body) {
      return acceptanceFetch(`${BASE}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        timeoutMs: 60_000,
      });
    }

    async function getJson(path) {
      return acceptanceFetch(`${BASE}${path}`, {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
        timeoutMs: 60_000,
      });
    }

    // 1) gpt-image-2 submit + poll → completed + url + billable
    {
      const { res, body, text } = await postJson("/v1/images/generations", {
        model: "gpt-image-2",
        prompt: "a simple red square on white background",
        size: "1024x1024",
        n: 1,
        response_format: "url",
      });
      const taskId =
        body?.id ?? body?.task_id ?? body?.data?.[0]?.task_id ?? null;
      const accepted =
        (res.status === 200 || res.status === 202) &&
        typeof taskId === "string" &&
        taskId.length > 0;
      if (!accepted) {
        ok =
          fail(
            "1. gpt-image-2 submit task_id",
            `status=${res.status} body=${String(text).slice(0, 280)}`
          ) && false;
      } else {
        pass(`1a. gpt-image-2 submit task_id (${taskId})`);
        const polled = await pollUntilTerminal(getJson, taskId, {
          timeoutMs: LIVE ? 180_000 : 8_000,
        });
        const success = isBillableSuccess(polled);
        ok =
          (success
            ? pass(
                `1b. gpt-image-2 poll completed+url+billable (status=${polled?.body?.status})`
              )
            : fail(
                "1b. gpt-image-2 poll completed+url+billable",
                `status=${polled?.body?.status} tokfai=${JSON.stringify(polled?.body?.tokfai)} url=${polled?.body?.data?.[0]?.url}`
              )) && ok;
      }
    }

    // 2) gpt-image-2 on chat → forbidden (P954 code)
    {
      const { res, body, text } = await postJson("/v1/chat/completions", {
        model: "gpt-image-2",
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 8,
      });
      const rejected =
        res.status === 400 &&
        body?.error?.code === "image_model_not_for_chat" &&
        (body?.tokfai?.billing_status === "not_billable" ||
          body?.tokfai?.credits_charged === 0 ||
          body?.tokfai == null);
      ok =
        (rejected
          ? pass("2. gpt-image-2 chat → image_model_not_for_chat (not_billable)")
          : fail(
              "2. gpt-image-2 chat → image_model_not_for_chat (not_billable)",
              `status=${res.status} body=${String(text).slice(0, 280)}`
            )) && ok;
    }

    // 3) gemini on images → forbidden (P954 code)
    {
      const { res, body, text } = await postJson("/v1/images/generations", {
        model: "gemini-2.5-flash",
        prompt: "should not generate",
        size: "1024x1024",
        n: 1,
        response_format: "url",
      });
      const rejected =
        res.status === 400 &&
        body?.error?.code === "model_not_image_capable" &&
        body?.tokfai?.billing_status === "not_billable";
      ok =
        (rejected
          ? pass(
              "3. gemini-2.5-flash images → model_not_image_capable (not_billable)"
            )
          : fail(
              "3. gemini-2.5-flash images → model_not_image_capable (not_billable)",
              `status=${res.status} body=${String(text).slice(0, 280)}`
            )) && ok;
    }
  } finally {
    cleanup?.();
  }

  if (ok) {
    console.log(PASS_MARKER);
    process.exit(0);
  }
  console.error(FAIL_MARKER);
  process.exit(1);
}

main().catch((err) => {
  console.error(FAIL_MARKER, err);
  process.exit(1);
});
