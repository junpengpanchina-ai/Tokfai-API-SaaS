#!/usr/bin/env node
/**
 * P911 — Chat client compatibility smoke (Cherry / Chatbox / NextChat / …).
 * Offline mock by default. Contract tests OpenAI-compatible payloads these UIs send.
 *
 * Usage: node scripts/p911-chat-client-compat-smoke.mjs
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
  CHAT_CLIENTS,
  STABLE_ALIAS_CASES,
} from "./lib/client-compat-matrix.mjs";

const SCRIPT = "scripts/p911-chat-client-compat-smoke.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ctx = await bootstrapClientCompatSmoke(SCRIPT);
let ok = true;

try {
  {
    const docs = readFileSync(
      join(ROOT, "apps/web/lib/docs/public-beta-docs-registry.ts"),
      "utf8"
    );
    const missing = CHAT_CLIENTS.filter((name) => !docs.includes(name));
    if (!docs.includes("openai-compatible-clients") || missing.length) {
      ok =
        fail(
          "docs cover chat clients",
          `missing=${missing.join(",") || "chapter"}`
        ) && ok;
    } else {
      ok = pass(`docs cover chat clients: ${CHAT_CLIENTS.join(", ")}`) && ok;
    }
  }

  {
    const { res, body } = await ctx.getJson("/v1/models");
    const rows = Array.isArray(body?.data) ? body.data : [];
    const badOwned = rows.filter(
      (r) => r.owned_by && String(r.owned_by).toLowerCase() !== "tokfai"
    );
    const unlabeled = rows.filter((r) => {
      const label = r.display_name || r.name || r.title || "";
      return r.id?.startsWith("gpt") && !/^Tokfai\s+/i.test(label);
    });
    if (res.status !== 200 || badOwned.length || unlabeled.length) {
      ok =
        fail(
          "catalog Tokfai branding for chat UIs",
          `owned=${badOwned.length} unlabeled=${unlabeled.length}`
        ) && ok;
    } else {
      ok = pass("GET /v1/models Tokfai owned_by + display_name") && ok;
    }
  }

  // Cherry / Chatbox / Lobe / OpenWebUI often send openai/ or spaced display names.
  for (const [model, expectResolved] of STABLE_ALIAS_CASES) {
    const { res, body } = await ctx.postJson("/v1/chat/completions", {
      model,
      messages: [{ role: "user", content: "Say ok only." }],
      stream: false,
    });
    const resolved = body?.tokfai?.resolved_model;
    const requested = body?.tokfai?.requested_model;
    if (
      res.status === 401 ||
      res.status !== 200 ||
      resolved == null ||
      requested == null ||
      resolved !== expectResolved
    ) {
      ok =
        fail(
          `chat-client alias ${JSON.stringify(model)}`,
          `HTTP ${res.status} requested=${requested} resolved=${resolved}`
        ) && ok;
    } else {
      ok = pass(`alias ${JSON.stringify(model)} → ${expectResolved}`) && ok;
    }
  }
} finally {
  ctx.cleanup();
}

console.log(
  ok ? "\nTOKFAI_P911_CHAT_CLIENT_COMPAT_PASS" : "\nTOKFAI_P911_CHAT_CLIENT_COMPAT_FAIL"
);
process.exit(ok ? 0 : 1);
