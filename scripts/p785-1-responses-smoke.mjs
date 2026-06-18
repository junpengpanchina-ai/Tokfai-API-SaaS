#!/usr/bin/env node
/**
 * Internal operator smoke — not customer documentation.
 *
 * P785.1 / P787 — Responses API smoke (offline mock default).
 *
 * Usage:
 *   node scripts/p785-1-responses-smoke.mjs
 *   LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p785-1-responses-smoke.mjs
 */

import {
  DEFAULT_MOCK_KEY,
  isLiveMode,
  resolveApiBaseUrl,
  printOfflineDefaultHint,
} from "./lib/acceptance-config.mjs";
import { acceptanceFetch } from "./lib/acceptance-http.mjs";
import { ensureMockGateway } from "./lib/ensure-mock-gateway.mjs";

const SCRIPT = "scripts/p785-1-responses-smoke.mjs";
const LIVE = isLiveMode();
let mockChild = null;

if (!LIVE) {
  const mock = await ensureMockGateway();
  mockChild = mock.child;
}

const BASE = resolveApiBaseUrl(LIVE).replace(/\/v1$/, "");
const RESPONSES_URL = `${BASE}/v1/responses`;
const API_KEY = LIVE
  ? process.env.TOKFAI_API_KEY ?? ""
  : process.env.TOKFAI_API_KEY ?? process.env.MOCK_API_KEY ?? DEFAULT_MOCK_KEY;

const CHAT_TIMEOUT_MS = Math.max(
  1000,
  parseInt(process.env.CHAT_TIMEOUT_MS ?? "120000", 10) || 120_000
);

function errorCode(body) {
  return body?.error?.code ?? body?.code ?? null;
}

async function postResponses({ auth, body }) {
  const headers = { "Content-Type": "application/json" };
  if (auth) headers.Authorization = `Bearer ${auth}`;

  const { res, body: json } = await acceptanceFetch(RESPONSES_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    timeoutMs: CHAT_TIMEOUT_MS,
  });

  return { status: res.status, body: json };
}

function pass(label) {
  console.log(`PASS  ${label}`);
  return true;
}

function fail(label, detail) {
  console.error(`FAIL  ${label}`);
  if (detail) console.error(`      ${detail}`);
  return false;
}

async function run() {
  if (!LIVE) {
    printOfflineDefaultHint(SCRIPT);
    console.log(`offline mock: ${RESPONSES_URL}`);
    console.log("");
  } else {
    console.log(`live production: ${RESPONSES_URL}`);
    console.log("");
  }

  let ok = true;

  const missing = await postResponses({
    body: { model: "auto-fast", input: "Say ok only." },
  });
  if (missing.status === 401 && errorCode(missing.body) === "missing_token") {
    ok = pass("missing token → 401 missing_token") && ok;
  } else {
    ok =
      fail(
        "missing token → 401 missing_token",
        `got HTTP ${missing.status}, code=${errorCode(missing.body)}`
      ) && ok;
  }

  const invalid = await postResponses({
    auth: "sk-tokfai_xxx",
    body: { model: "auto-fast", input: "Say ok only." },
  });
  if (invalid.status === 401 && errorCode(invalid.body) === "invalid_token") {
    ok = pass("invalid token → 401 invalid_token") && ok;
  } else {
    ok =
      fail(
        "invalid token → 401 invalid_token",
        `got HTTP ${invalid.status}, code=${errorCode(invalid.body)}`
      ) && ok;
  }

  if (!API_KEY.startsWith("sk-tokfai_")) {
    console.log("SKIP  real-key cases (set TOKFAI_API_KEY or use offline MOCK_API_KEY)");
    if (mockChild) mockChild.kill();
    process.exit(ok ? 0 : 1);
  }

  const realCases = [
    {
      label: LIVE ? "live real key string input → 200" : "mock real key string input → 200",
      body: { model: "auto-fast", input: "Say ok only." },
    },
    {
      label: "real key message array → 200",
      body: {
        model: "auto-fast",
        input: [{ role: "user", content: "Say ok only." }],
      },
    },
    {
      label: "real key content parts → 200",
      body: {
        model: "auto-fast",
        input: [
          {
            role: "user",
            content: [{ type: "input_text", text: "Say ok only." }],
          },
        ],
      },
    },
  ];

  for (const { label, body } of realCases) {
    const res = await postResponses({ auth: API_KEY, body });
    const hasFields =
      res.status === 200 &&
      typeof res.body?.output_text === "string" &&
      res.body.output_text.length > 0 &&
      typeof res.body?.request_id === "string" &&
      res.body.credits_charged !== undefined &&
      typeof res.body?.tokfai?.resolved_model === "string";

    if (hasFields) {
      ok = pass(label) && ok;
    } else {
      ok =
        fail(
          label,
          `HTTP ${res.status}, output_text=${res.body?.output_text}, resolved_model=${res.body?.tokfai?.resolved_model}`
        ) && ok;
    }
  }

  if (mockChild) mockChild.kill();
  process.exit(ok ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
