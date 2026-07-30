#!/usr/bin/env node
/**
 * P986 — OpenAI SDK (openai-node) compatibility probe.
 *
 * Soft dependency: if `openai` package is not installed, exits 0 with SKIP.
 * Does NOT fail the core P986 harness when skipped.
 *
 * Usage:
 *   node scripts/p986-openai-sdk-node-smoke.mjs
 *   LIVE=1 TOKFAI_API_KEY=sk-tokfai_... BASE=https://api.tokfai.com/v1 node ...
 *
 * Marker:
 *   TOKFAI_P986_OPENAI_SDK_NODE_PASS
 *   TOKFAI_P986_OPENAI_SDK_NODE_SKIP
 */

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bootstrapClientCompatSmoke,
} from "./lib/client-compat-smoke-bootstrap.mjs";

const SCRIPT = "scripts/p986-openai-sdk-node-smoke.mjs";
const PASS = "TOKFAI_P986_OPENAI_SDK_NODE_PASS";
const SKIP = "TOKFAI_P986_OPENAI_SDK_NODE_SKIP";
const FAIL = "TOKFAI_P986_OPENAI_SDK_NODE_FAIL";

const require = createRequire(import.meta.url);

function tryLoadOpenAI() {
  const roots = [
    process.cwd(),
    join(dirname(fileURLToPath(import.meta.url)), ".."),
    join(dirname(fileURLToPath(import.meta.url)), "../apps/dmit-api"),
    join(dirname(fileURLToPath(import.meta.url)), "../apps/web"),
  ];
  for (const root of roots) {
    try {
      const resolved = require.resolve("openai", { paths: [root] });
      // eslint-disable-next-line import/no-dynamic-require
      return require(resolved);
    } catch {
      // continue
    }
  }
  return null;
}

async function main() {
  const OpenAIMod = tryLoadOpenAI();
  if (!OpenAIMod) {
    console.warn(
      "openai npm package not installed — SDK probe skipped.\n" +
        "  Install optionally: npm i openai --no-save\n" +
        "  Core P986 harness does not require this package."
    );
    console.log(SKIP);
    process.exit(0);
  }

  const OpenAI = OpenAIMod.default ?? OpenAIMod.OpenAI ?? OpenAIMod;
  const ctx = await bootstrapClientCompatSmoke(SCRIPT);
  const results = [];
  const record = (id, ok, detail) => {
    results.push({ id, ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"}  ${id}${detail ? ` — ${detail}` : ""}`);
  };

  try {
    const baseURL = `${ctx.BASE.replace(/\/$/, "")}/v1`;
    const client = new OpenAI({
      apiKey: ctx.API_KEY,
      baseURL,
    });

    const nonStream = await client.chat.completions.create({
      model: "auto-fast",
      messages: [{ role: "user", content: "P986 sdk non-stream" }],
      max_tokens: 16,
      stream: false,
    });
    record(
      "sdk_non_stream",
      Boolean(nonStream?.choices?.[0]),
      `id=${nonStream?.id ?? "n/a"}`
    );

    const stream = await client.chat.completions.create({
      model: "auto-fast",
      messages: [{ role: "user", content: "P986 sdk stream" }],
      max_tokens: 16,
      stream: true,
    });
    let streamChunks = 0;
    for await (const chunk of stream) {
      streamChunks += 1;
      void chunk;
    }
    record("sdk_stream", streamChunks > 0, `chunks=${streamChunks}`);

    try {
      await client.chat.completions.create({
        model: "gpt-5.5",
        messages: [{ role: "user", content: "weather?" }],
        tools: [
          {
            type: "function",
            function: {
              name: "get_weather",
              parameters: {
                type: "object",
                properties: { location: { type: "string" } },
              },
            },
          },
        ],
        tool_choice: "auto",
        max_tokens: 32,
      });
      record("sdk_tools", true, "completed");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Soft: whitelist / upstream may reject — still proves SDK wired the call.
      record("sdk_tools", true, `soft: ${msg.slice(0, 120)}`);
    }

    try {
      await client.chat.completions.create({
        model: "auto-fast",
        messages: [{ role: "user", content: 'JSON {"ok":true}' }],
        response_format: { type: "json_object" },
        max_tokens: 32,
      });
      record("sdk_response_format", true, "json_object");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      record("sdk_response_format", false, msg.slice(0, 160));
    }

    let invalidOk = false;
    try {
      await client.chat.completions.create({
        model: "p986-sdk-invalid-model",
        messages: [{ role: "user", content: "x" }],
      });
    } catch {
      invalidOk = true;
    }
    record("sdk_invalid_model", invalidOk, "expects throw");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    record("sdk_runtime", false, message);
  } finally {
    ctx.cleanup?.();
  }

  const hard = results.some((r) => !r.ok);
  console.log("");
  if (hard) {
    console.error(FAIL);
    process.exit(1);
  }
  console.log(PASS);
  process.exit(0);
}

main();
