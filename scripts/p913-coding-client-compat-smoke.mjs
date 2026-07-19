#!/usr/bin/env node
/**
 * P913 — Coding client compatibility (Continue / Cline / Roo / Codex as one case).
 * Offline mock. Must not hard-code Codex-only behavior.
 *
 * Usage: node scripts/p913-coding-client-compat-smoke.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bootstrapClientCompatSmoke,
  pass,
  fail,
} from "./lib/client-compat-smoke-bootstrap.mjs";
import { CODING_CLIENTS } from "./lib/client-compat-matrix.mjs";

const SCRIPT = "scripts/p913-coding-client-compat-smoke.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ctx = await bootstrapClientCompatSmoke(SCRIPT);
let ok = true;

try {
  {
    const docs = readFileSync(
      join(ROOT, "apps/web/lib/docs/public-beta-docs-registry.ts"),
      "utf8"
    );
    const required = ["Continue", "Cline", "Roo Code", "Codex"];
    const missing = required.filter((n) => !docs.includes(n));
    const oneCase =
      docs.includes("Codex 只是其中一个 case") ||
      docs.includes("Codex is one case among many");
    if (missing.length || !oneCase) {
      ok =
        fail(
          "docs cover coding clients (Codex not exclusive)",
          `missing=${missing.join(",")} oneCase=${oneCase}`
        ) && ok;
    } else {
      ok = pass(`docs cover coding clients: ${CODING_CLIENTS.join(", ")}`) && ok;
    }
  }

  // Continue / Cline: chat completions with max_tokens
  {
    const { res, body } = await ctx.postJson("/v1/chat/completions", {
      model: "gpt-5.5",
      messages: [
        { role: "system", content: "You are a coding assistant." },
        { role: "user", content: "Say ok only." },
      ],
      stream: false,
      max_tokens: 128,
      temperature: 0,
    });
    if (res.status !== 200 || body?.tokfai?.resolved_model == null) {
      ok = fail("Continue/Cline-style chat", `HTTP ${res.status}`) && ok;
    } else {
      ok = pass("coding chat/completions HTTP 200 + tokfai meta") && ok;
    }
  }

  // Roo / agent-style: responses preferred (not Codex-only)
  {
    const { res, body } = await ctx.postJson("/v1/responses", {
      model: "gpt-5-pro",
      input: "Say ok only.",
      stream: false,
      max_output_tokens: 64,
    });
    if (
      res.status !== 200 ||
      body?.object !== "response" ||
      body?.tokfai?.requested_model !== "gpt-5-pro"
    ) {
      ok = fail("Roo/agent-style responses", `HTTP ${res.status}`) && ok;
    } else {
      ok = pass("coding responses HTTP 200 (not Codex-only path)") && ok;
    }
  }

  // Codex-style case (one of many): stream responses
  {
    const { res, text } = await ctx.postJson("/v1/responses", {
      model: "gpt-5.4-pro",
      input: "Say ok only.",
      stream: true,
    });
    if (res.status !== 200 || !String(text).includes("event:")) {
      ok = fail("Codex-style responses stream", `HTTP ${res.status}`) && ok;
    } else {
      ok = pass("Codex-style responses stream (one case among many)") && ok;
    }
  }
} finally {
  ctx.cleanup();
}

console.log(
  ok
    ? "\nTOKFAI_P913_CODING_CLIENT_COMPAT_PASS"
    : "\nTOKFAI_P913_CODING_CLIENT_COMPAT_FAIL"
);
process.exit(ok ? 0 : 1);
