#!/usr/bin/env node
/**
 * P912 — Workflow / RAG platform compatibility (Dify / FastGPT / LangChain / LlamaIndex).
 * Offline mock: OpenAI-compatible payloads with extra platform fields.
 *
 * Usage: node scripts/p912-workflow-platform-compat-smoke.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bootstrapClientCompatSmoke,
  pass,
  fail,
} from "./lib/client-compat-smoke-bootstrap.mjs";
import { WORKFLOW_PLATFORMS } from "./lib/client-compat-matrix.mjs";

const SCRIPT = "scripts/p912-workflow-platform-compat-smoke.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ctx = await bootstrapClientCompatSmoke(SCRIPT);
let ok = true;

try {
  {
    const docs = readFileSync(
      join(ROOT, "apps/web/lib/docs/public-beta-docs-registry.ts"),
      "utf8"
    );
    const missing = ["Dify", "FastGPT", "LangChain", "LlamaIndex"].filter(
      (n) => !docs.includes(n)
    );
    if (missing.length) {
      ok = fail("docs cover workflow platforms", missing.join(",")) && ok;
    } else {
      ok =
        pass(`docs cover workflow platforms: ${WORKFLOW_PLATFORMS.join(", ")}`) &&
        ok;
    }
  }

  // Dify / LangChain often send user + extra metadata; FastGPT may send system prompts.
  {
    const { res, body } = await ctx.postJson("/v1/chat/completions", {
      model: "gpt-5.5",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Say ok only." },
      ],
      stream: false,
      temperature: 0,
      user: "dify-workflow-user",
      response_format: { type: "text" },
      presence_penalty: 0,
      frequency_penalty: 0,
      n: 1,
    });
    if (res.status !== 200 || !body?.choices?.[0]?.message?.content) {
      ok =
        fail(
          "Dify/LangChain-style chat payload",
          `HTTP ${res.status} code=${body?.error?.code}`
        ) && ok;
    } else {
      ok = pass("workflow chat payload (extra fields ignored, HTTP 200)") && ok;
    }
  }

  // LlamaIndex / knowledge apps often use responses with string or array input.
  {
    const { res, body } = await ctx.postJson("/v1/responses", {
      model: "gemini-2.5-flash",
      input: [
        { type: "message", role: "user", content: [{ type: "input_text", text: "Say ok only." }] },
      ],
      stream: false,
      max_output_tokens: 64,
      metadata: { app: "llamaindex" },
    });
    if (res.status !== 200 || body?.object !== "response") {
      ok =
        fail(
          "LlamaIndex-style responses payload",
          `HTTP ${res.status} code=${body?.error?.code}`
        ) && ok;
    } else {
      ok = pass("workflow responses payload (array input) HTTP 200") && ok;
    }
  }

  // FastGPT-style: tools field present but may be unsupported — must not 500.
  {
    const { res, body } = await ctx.postJson("/v1/chat/completions", {
      model: "gpt-5",
      messages: [{ role: "user", content: "Say ok only." }],
      stream: false,
      tools: [
        {
          type: "function",
          function: { name: "noop", parameters: { type: "object", properties: {} } },
        },
      ],
      tool_choice: "auto",
    });
    if (res.status >= 500) {
      ok = fail("tools field must not 500", `HTTP ${res.status}`) && ok;
    } else if (res.status !== 200 && res.status !== 400) {
      ok =
        fail(
          "tools field accepted or soft-rejected",
          `HTTP ${res.status} code=${body?.error?.code}`
        ) && ok;
    } else {
      ok =
        pass(
          `tools/tool_choice present → HTTP ${res.status} (no 500)`
        ) && ok;
    }
  }
} finally {
  ctx.cleanup();
}

console.log(
  ok
    ? "\nTOKFAI_P912_WORKFLOW_PLATFORM_COMPAT_PASS"
    : "\nTOKFAI_P912_WORKFLOW_PLATFORM_COMPAT_FAIL"
);
process.exit(ok ? 0 : 1);
