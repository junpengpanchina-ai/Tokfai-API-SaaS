#!/usr/bin/env node
/**
 * P831 — Consumer model alias compatibility smoke (offline by default).
 *
 * - POST /v1/responses model=gpt-5.4-pro → 200
 * - POST /v1/chat/completions model=gpt-5.4-pro → 200
 * - stream=true model=gpt-5.4-pro → 200 SSE
 * - tokfai.requested_model / tokfai.resolved_model
 * - GET /v1/models includes gpt-5.4-pro with Tokfai display name
 *
 * Usage:
 *   node scripts/p831-model-alias-compat-smoke.mjs
 *   LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p831-model-alias-compat-smoke.mjs
 */

import {
  DEFAULT_MOCK_KEY,
  isLiveMode,
  resolveApiBaseUrl,
  printOfflineDefaultHint,
} from "./lib/acceptance-config.mjs";
import { acceptanceFetch } from "./lib/acceptance-http.mjs";
import { ensureMockGateway } from "./lib/ensure-mock-gateway.mjs";

const SCRIPT = "scripts/p831-model-alias-compat-smoke.mjs";
const LIVE = isLiveMode();
let mockChild = null;

if (!LIVE) {
  const mock = await ensureMockGateway();
  mockChild = mock.child;
}

const BASE = resolveApiBaseUrl(LIVE).replace(/\/v1$/, "");
const API_KEY = LIVE
  ? process.env.TOKFAI_API_KEY ?? ""
  : process.env.TOKFAI_API_KEY ?? process.env.MOCK_API_KEY ?? DEFAULT_MOCK_KEY;

const TIMEOUT_MS = Math.max(
  1000,
  parseInt(process.env.CHAT_TIMEOUT_MS ?? "120000", 10) || 120_000
);

function pass(label) {
  console.log(`PASS  ${label}`);
  return true;
}

function fail(label, detail) {
  console.error(`FAIL  ${label}`);
  if (detail) console.error(`      ${detail}`);
  return false;
}

async function postJson(path, body) {
  return acceptanceFetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    timeoutMs: TIMEOUT_MS,
  });
}

async function run() {
  if (!LIVE) printOfflineDefaultHint(SCRIPT);
  console.log(LIVE ? `live: ${BASE}` : `offline mock: ${BASE}`);
  console.log("");

  let ok = true;

  {
    const { res, body } = await acceptanceFetch(`${BASE}/v1/models`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
      timeoutMs: TIMEOUT_MS,
    });
    const ids = Array.isArray(body?.data)
      ? body.data.map((r) => r.id).filter(Boolean)
      : [];
    const row = Array.isArray(body?.data)
      ? body.data.find((r) => r.id === "gpt-5.4-pro")
      : null;
    const label = row?.display_name || row?.name || row?.title || "";
    const required = ["gpt-5", "gpt-5-pro", "gpt-5.4-pro", "gemini-3-pro"];
    const missing = required.filter((id) => !ids.includes(id));
    if (res.status !== 200 || missing.length) {
      ok =
        fail(
          "GET /v1/models alias catalog",
          `HTTP ${res.status} missing=${missing.join(",") || "none"}`
        ) && ok;
    } else if (!/^Tokfai\s+/i.test(label)) {
      ok =
        fail(
          "gpt-5.4-pro Tokfai display_name",
          `label=${JSON.stringify(label)}`
        ) && ok;
    } else {
      ok = pass("GET /v1/models includes gpt-5 / gpt-5-pro / gpt-5.4-pro / gemini-3-pro") && ok;
      ok = pass(`gpt-5.4-pro display_name=${label}`) && ok;
    }
  }

  {
    const { res, body } = await postJson("/v1/responses", {
      model: "gpt-5.4-pro",
      input: "Return exactly: TOKFAI_ALIAS_READY",
      stream: false,
    });
    const text = String(body?.output_text ?? "");
    const requested = body?.tokfai?.requested_model;
    const resolved = body?.tokfai?.resolved_model;
    if (
      res.status !== 200 ||
      !/TOKFAI_ALIAS_READY/i.test(text) ||
      requested !== "gpt-5.4-pro" ||
      resolved !== "gpt-5-pro"
    ) {
      ok =
        fail(
          "POST /v1/responses model=gpt-5.4-pro",
          `HTTP ${res.status} requested=${requested} resolved=${resolved} text=${text.slice(0, 80)}`
        ) && ok;
    } else {
      ok =
        pass(
          "POST /v1/responses model=gpt-5.4-pro → requested=gpt-5.4-pro resolved=gpt-5-pro"
        ) && ok;
    }
  }

  {
    const { res, body } = await postJson("/v1/chat/completions", {
      model: "gpt-5.4-pro",
      messages: [
        { role: "user", content: "Return exactly: TOKFAI_CHAT_ALIAS_READY" },
      ],
      stream: false,
    });
    const content = String(body?.choices?.[0]?.message?.content ?? "");
    const requested = body?.tokfai?.requested_model;
    const resolved = body?.tokfai?.resolved_model;
    if (
      res.status !== 200 ||
      !/TOKFAI_CHAT_ALIAS_READY/i.test(content) ||
      requested !== "gpt-5.4-pro" ||
      resolved !== "gpt-5-pro"
    ) {
      ok =
        fail(
          "POST /v1/chat/completions model=gpt-5.4-pro",
          `HTTP ${res.status} requested=${requested} resolved=${resolved} content=${content.slice(0, 80)}`
        ) && ok;
    } else {
      ok =
        pass(
          "POST /v1/chat/completions model=gpt-5.4-pro → requested=gpt-5.4-pro resolved=gpt-5-pro"
        ) && ok;
    }
  }

  {
    const { res, text } = await acceptanceFetch(`${BASE}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.4-pro",
        messages: [{ role: "user", content: "Say ok only." }],
        stream: true,
      }),
      timeoutMs: TIMEOUT_MS,
    });
    if (res.status !== 200 || !String(text).includes("data:")) {
      ok =
        fail(
          "POST /v1/chat/completions stream model=gpt-5.4-pro",
          `HTTP ${res.status}`
        ) && ok;
    } else {
      ok = pass("POST /v1/chat/completions stream=true model=gpt-5.4-pro") && ok;
    }
  }

  // Display-name / spaced variants normalize to the same canonical target.
  for (const [model, expectResolved] of [
    ["GPT 5.4 Pro", "gpt-5-pro"],
    ["gpt-5-4-pro", "gpt-5-pro"],
    ["GPT 5 Pro", "gpt-5-pro"],
    ["GPT 5", "gpt-5"],
    ["gpt-5.4", "gpt-5"],
  ]) {
    const { res, body } = await postJson("/v1/chat/completions", {
      model,
      messages: [{ role: "user", content: "Say ok only." }],
      stream: false,
    });
    const resolved = body?.tokfai?.resolved_model;
    if (res.status !== 200 || resolved !== expectResolved) {
      ok =
        fail(
          `alias normalize ${JSON.stringify(model)}`,
          `HTTP ${res.status} resolved=${resolved} expected=${expectResolved}`
        ) && ok;
    } else {
      ok =
        pass(`alias normalize ${JSON.stringify(model)} → ${expectResolved}`) &&
        ok;
    }
  }

  if (mockChild) mockChild.kill();
  console.log(ok ? "\nALL PASS" : "\nFAILED");
  process.exit(ok ? 0 : 1);
}

run().catch((err) => {
  if (mockChild) mockChild.kill();
  console.error(err);
  process.exit(1);
});
