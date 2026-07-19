#!/usr/bin/env node
/**
 * P914 — Client-facing error copy smoke (offline mock).
 * Asserts Tokfai vocabulary + no upstream/vendor leaks.
 *
 * Usage: node scripts/p914-client-error-copy-smoke.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bootstrapClientCompatSmoke,
  pass,
  fail,
} from "./lib/client-compat-smoke-bootstrap.mjs";
import {
  assertNoErrorLeak,
  codeMatchesVocab,
} from "./lib/client-compat-matrix.mjs";

const SCRIPT = "scripts/p914-client-error-copy-smoke.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ctx = await bootstrapClientCompatSmoke(SCRIPT);
let ok = true;

function checkEnvelope(label, vocab, res, body) {
  if (res.status === 401) {
    return fail(label, "HTTP 401 — mock auth misconfigured");
  }
  const code = body?.error?.code;
  const message = body?.error?.message ?? "";
  const leak = assertNoErrorLeak(message);
  if (leak) return fail(label, leak);
  if (!codeMatchesVocab(vocab, code)) {
    return fail(label, `code=${code} not in vocab ${vocab}`);
  }
  if (!message || /grsaiapi|upstream provider|stack/i.test(message)) {
    return fail(label, `bad message=${JSON.stringify(message).slice(0, 100)}`);
  }
  return pass(`${label} → ${code}`);
}

try {
  {
    const aliases = readFileSync(
      join(ROOT, "apps/dmit-api/src/upstream/modelAliases.ts"),
      "utf8"
    );
    const grsai = readFileSync(
      join(ROOT, "apps/dmit-api/src/upstream/grsai.ts"),
      "utf8"
    );
    if (
      /model not register/i.test(aliases) ||
      /not registered upstream/i.test(grsai) ||
      !aliases.includes("This model is not available on Tokfai")
    ) {
      ok = fail("static Tokfai-safe model error copy", "leak or missing copy") && ok;
    } else {
      ok = pass("static: no vendor model-register leak in DMIT copy") && ok;
    }
  }

  {
    const { res, body } = await ctx.postJson("/v1/chat/completions", {
      model: "not-a-real-tokfai-model-zzz",
      messages: [{ role: "user", content: "hi" }],
      stream: false,
    });
    if (res.status !== 400) {
      ok = fail("unknown model HTTP", `expected 400 got ${res.status}`) && ok;
    }
    ok =
      checkEnvelope("model_not_available", "model_not_available", res, body) &&
      ok;
    if (
      !String(body?.error?.message ?? "").includes(
        "This model is not available on Tokfai"
      )
    ) {
      ok = fail("model_not_available message text", body?.error?.message) && ok;
    }
  }

  {
    const { res, body } = await ctx.postJson("/v1/chat/completions", {
      model: "__tokfai_mock_insufficient_credits",
      messages: [{ role: "user", content: "hi" }],
      stream: false,
    });
    if (res.status !== 402) {
      ok = fail("insufficient_balance HTTP", `expected 402 got ${res.status}`) && ok;
    }
    ok =
      checkEnvelope("insufficient_balance", "insufficient_balance", res, body) &&
      ok;
  }

  {
    const { res, body } = await ctx.postJson("/v1/chat/completions", {
      model: "__tokfai_mock_rate_limited",
      messages: [{ role: "user", content: "hi" }],
      stream: false,
    });
    if (res.status !== 429) {
      ok = fail("rate_limited HTTP", `expected 429 got ${res.status}`) && ok;
    }
    ok = checkEnvelope("rate_limited", "rate_limited", res, body) && ok;
  }

  {
    const { res, body } = await ctx.postJson("/v1/chat/completions", {
      model: "__tokfai_mock_upstream_busy",
      messages: [{ role: "user", content: "hi" }],
      stream: false,
    });
    if (res.status !== 503) {
      ok = fail("upstream_busy HTTP", `expected 503 got ${res.status}`) && ok;
    }
    ok = checkEnvelope("upstream_busy", "upstream_busy", res, body) && ok;
  }

  {
    const { res, body } = await ctx.postJson("/v1/chat/completions", {
      model: "gpt-5",
      messages: [],
      stream: false,
    });
    if (res.status !== 400) {
      ok = fail("invalid_request HTTP", `expected 400 got ${res.status}`) && ok;
    }
    ok = checkEnvelope("invalid_request", "invalid_request", res, body) && ok;
  }
} finally {
  ctx.cleanup();
}

console.log(
  ok ? "\nTOKFAI_P914_CLIENT_ERROR_COPY_PASS" : "\nTOKFAI_P914_CLIENT_ERROR_COPY_FAIL"
);
process.exit(ok ? 0 : 1);
