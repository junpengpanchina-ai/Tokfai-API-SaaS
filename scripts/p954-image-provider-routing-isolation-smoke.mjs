#!/usr/bin/env node
/**
 * P954 — Image provider routing isolation smoke.
 *
 * Asserts:
 * 1) nano-banana on /v1/chat/completions → image_model_not_for_chat (not_billable)
 * 2) gemini-2.5-flash on /v1/images/generations → model_not_image_capable (not_billable)
 * 3) nano-banana on /v1/images/generations → submit task_id OK
 * 4) Static: capability policy + route isolation codes present
 *
 * Usage:
 *   node scripts/p954-image-provider-routing-isolation-smoke.mjs
 *   LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p954-image-provider-routing-isolation-smoke.mjs
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

const SCRIPT = "scripts/p954-image-provider-routing-isolation-smoke.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS_MARKER = "TOKFAI_P954_IMAGE_PROVIDER_ROUTING_ISOLATION_PASS";
const FAIL_MARKER = "TOKFAI_P954_IMAGE_PROVIDER_ROUTING_ISOLATION_FAIL";

const LIVE = String(process.env.LIVE ?? "").trim() === "1";

function readSrc(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function assertStatic() {
  let ok = true;
  const policy = readSrc("apps/dmit-api/src/capabilities/modelCapabilityPolicy.ts");
  const chatExec = readSrc("apps/dmit-api/src/lib/executeChatCompletion.ts");
  const images = readSrc("apps/dmit-api/src/routes/images.ts");
  const aliases = readSrc("apps/dmit-api/src/upstream/imageModelAliases.ts");
  const catalog = readSrc("apps/dmit-api/src/upstream/modelCatalog.ts");
  const groups = readSrc("apps/web/lib/docs/consumer-model-groups.ts");
  const registry = readSrc("apps/web/lib/public-model-registry.ts");

  ok =
    (policy.includes("IMAGE_MODEL_NOT_FOR_CHAT_CODE") &&
    policy.includes("MODEL_NOT_IMAGE_CAPABLE_CODE") &&
    (policy.includes("isNonImageTextModel") ||
      readSrc("apps/dmit-api/src/lib/imageProviderIsolation.ts").includes(
        "isNonImageTextModel"
      ))
      ? pass("policy exports isolation codes + isNonImageTextModel")
      : fail("policy exports isolation codes + isNonImageTextModel")) && ok;

  ok =
    (chatExec.includes("image_model_not_for_chat") &&
    chatExec.includes("IMAGE_MODEL_NOT_FOR_CHAT_CODE") &&
    chatExec.includes("billing_status: \"not_billable\"")
      ? pass("chat rejects image models with image_model_not_for_chat")
      : fail("chat rejects image models with image_model_not_for_chat")) &&
    ok;

  ok =
    (images.includes("MODEL_NOT_IMAGE_CAPABLE_CODE") &&
    images.includes("model_not_image_capable") &&
    images.includes("isNonImageTextModel")
      ? pass("images rejects text models with model_not_image_capable")
      : fail("images rejects text models with model_not_image_capable")) &&
    ok;

  ok =
    (aliases.includes("UNAVAILABLE_IMAGE_MODEL_IDS") &&
    !/"gpt-image-2"\s*,/.test(
      aliases.match(/UNAVAILABLE_IMAGE_MODEL_IDS[\s\S]*?\];/)?.[0] ?? "gpt-image-2"
    ) &&
    catalog.includes('"gpt-image-2"') &&
    /"gpt-image-2"\s*:\s*\{[\s\S]*?enabled:\s*true/.test(catalog)
      ? pass("gpt-image-2 enabled for Image Generation (P956; not in UNAVAILABLE)")
      : fail("gpt-image-2 enabled for Image Generation (P956; not in UNAVAILABLE)")) &&
    ok;

  ok =
    (groups.includes("Chat Models") &&
    groups.includes("Vision Models") &&
    groups.includes("Image Generation Models")
      ? pass("frontend groups: Chat / Vision / Image Generation")
      : fail("frontend groups: Chat / Vision / Image Generation")) && ok;

  ok =
    (registry.includes('group: "chat"') &&
    registry.includes('group: "vision"') &&
    registry.includes('group: "image"') &&
    /id:\s*"gpt-image-2"[\s\S]*?supportsImageGeneration:\s*true/.test(registry) &&
    !/id:\s*"gpt-image-2"[\s\S]*?comingSoon:\s*true/.test(
      registry.match(/id:\s*"gpt-image-2"[\s\S]*?bestForEn:[\s\S]*?},/)?.[0] ??
        "comingSoon: true"
    )
      ? pass("registry: gpt-image-2 in Image Generation (not comingSoon)")
      : fail("registry: gpt-image-2 in Image Generation (not comingSoon)")) && ok;

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

async function main() {
  console.log("=== P954 Image provider routing isolation ===");
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

    {
      const { res, body, text } = await postJson("/v1/chat/completions", {
        model: "nano-banana",
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
          ? pass("chat + nano-banana → image_model_not_for_chat")
          : fail(
              "chat + nano-banana → image_model_not_for_chat",
              `status=${res.status} body=${String(text).slice(0, 280)}`
            )) && ok;
    }

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
          ? pass("images + gemini-2.5-flash → model_not_image_capable")
          : fail(
              "images + gemini-2.5-flash → model_not_image_capable",
              `status=${res.status} body=${String(text).slice(0, 280)}`
            )) && ok;
    }

    {
      const { res, body, text } = await postJson("/v1/images/generations", {
        model: "nano-banana",
        prompt: "a simple blue circle on white background",
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
      ok =
        (accepted
          ? pass(`images + nano-banana → submit task_id (${taskId})`)
          : fail(
              "images + nano-banana → submit task_id",
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
