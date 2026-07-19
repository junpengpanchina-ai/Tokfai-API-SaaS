#!/usr/bin/env node
/**
 * P910 — OpenAI SDK / curl compatibility smoke (offline mock by default).
 *
 * Usage:
 *   node scripts/p910-openai-sdk-compat-smoke.mjs
 *   LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p910-openai-sdk-compat-smoke.mjs
 */

import {
  bootstrapClientCompatSmoke,
  pass,
  fail,
} from "./lib/client-compat-smoke-bootstrap.mjs";
import { REQUIRED_MODEL_IDS } from "./lib/client-compat-matrix.mjs";

const SCRIPT = "scripts/p910-openai-sdk-compat-smoke.mjs";
const ctx = await bootstrapClientCompatSmoke(SCRIPT);
let ok = true;

try {
  {
    const { res, body } = await ctx.getJson("/v1/models");
    const ids = Array.isArray(body?.data) ? body.data.map((r) => r.id) : [];
    const missing = REQUIRED_MODEL_IDS.filter((id) => !ids.includes(id));
    if (res.status !== 200 || missing.length) {
      ok = fail("GET /v1/models", `HTTP ${res.status} missing=${missing}`) && ok;
    } else {
      ok = pass("GET /v1/models") && ok;
    }
  }

  {
    const { res, body } = await ctx.postJson("/v1/chat/completions", {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "Say ok only." }],
      stream: false,
      temperature: 0.2,
      top_p: 0.95,
      max_tokens: 64,
      max_completion_tokens: 64,
      stream_options: { include_usage: true },
      // Unknown SDK fields must not 500
      logit_bias: {},
      user: "tokfai-compat-smoke",
      metadata: { source: "p910" },
    });
    if (
      res.status !== 200 ||
      body?.object !== "chat.completion" ||
      !body?.choices?.[0]?.message?.content ||
      body?.tokfai?.request_id == null
    ) {
      ok =
        fail(
          "chat non-stream + common fields",
          `HTTP ${res.status} code=${body?.error?.code}`
        ) && ok;
    } else {
      ok = pass("POST /v1/chat/completions stream=false (SDK fields)") && ok;
    }
  }

  {
    const { res, text } = await ctx.postJson("/v1/chat/completions", {
      model: "auto-fast",
      messages: [{ role: "user", content: "Say ok only." }],
      stream: true,
      max_completion_tokens: 32,
    });
    if (res.status !== 200 || !String(text).includes("data:")) {
      ok = fail("chat stream=true", `HTTP ${res.status}`) && ok;
    } else {
      ok = pass("POST /v1/chat/completions stream=true") && ok;
    }
  }

  {
    const { res, body } = await ctx.postJson("/v1/responses", {
      model: "gpt-5",
      input: "Say ok only.",
      stream: false,
      max_output_tokens: 64,
      temperature: 0.1,
      stream_options: { include_usage: true },
    });
    if (res.status !== 200 || body?.object !== "response" || !body?.output_text) {
      ok = fail("responses non-stream", `HTTP ${res.status}`) && ok;
    } else {
      ok = pass("POST /v1/responses stream=false") && ok;
    }
  }

  {
    const { res, text } = await ctx.postJson("/v1/responses", {
      model: "gpt-5.4",
      input: [{ role: "user", content: "Say ok only." }],
      stream: true,
      max_completion_tokens: 32,
    });
    const ct = res.headers?.get?.("content-type") ?? "";
    if (
      res.status !== 200 ||
      (!ct.includes("text/event-stream") && !String(text).includes("event:"))
    ) {
      ok = fail("responses stream=true", `HTTP ${res.status}`) && ok;
    } else {
      ok = pass("POST /v1/responses stream=true") && ok;
    }
  }
} finally {
  ctx.cleanup();
}

console.log(ok ? "\nTOKFAI_P910_OPENAI_SDK_COMPAT_PASS" : "\nTOKFAI_P910_OPENAI_SDK_COMPAT_FAIL");
process.exit(ok ? 0 : 1);
