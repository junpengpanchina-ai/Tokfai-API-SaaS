#!/usr/bin/env node
/**
 * P785.1 — Responses API compatibility smoke tests.
 *
 * Usage:
 *   node scripts/p785-1-responses-smoke.mjs
 *   TOKFAI_API_KEY=sk-tokfai_... node scripts/p785-1-responses-smoke.mjs
 *
 * Optional:
 *   TOKFAI_API_BASE=https://api.tokfai.com
 */

const BASE = (process.env.TOKFAI_API_BASE ?? "https://api.tokfai.com").replace(
  /\/+$/,
  ""
);
const API_KEY = process.env.TOKFAI_API_KEY ?? "";
const RESPONSES_URL = `${BASE}/v1/responses`;
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

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);

  try {
    const res = await fetch(RESPONSES_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { _raw: text };
    }
    return { status: res.status, body: json };
  } finally {
    clearTimeout(timer);
  }
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
  let ok = true;

  // 1. Missing token
  const missing = await postResponses({
    body: { model: "auto-fast", input: "Say ok only." },
  });
  if (
    missing.status === 401 &&
    errorCode(missing.body) === "missing_token"
  ) {
    ok = pass("missing token → 401 missing_token") && ok;
  } else {
    ok =
      fail(
        "missing token → 401 missing_token",
        `got HTTP ${missing.status}, code=${errorCode(missing.body)}`
      ) && ok;
  }

  // 2. Invalid token
  const invalid = await postResponses({
    auth: "sk-tokfai_xxx",
    body: { model: "auto-fast", input: "Say ok only." },
  });
  if (
    invalid.status === 401 &&
    errorCode(invalid.body) === "invalid_token"
  ) {
    ok = pass("invalid token → 401 invalid_token") && ok;
  } else {
    ok =
      fail(
        "invalid token → 401 invalid_token",
        `got HTTP ${invalid.status}, code=${errorCode(invalid.body)}`
      ) && ok;
  }

  if (!API_KEY) {
    console.log(
      "SKIP  real-key cases (set TOKFAI_API_KEY to run 3–5)"
    );
    process.exit(ok ? 0 : 1);
  }

  const realCases = [
    {
      label: "real key string input → 200",
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

  process.exit(ok ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
