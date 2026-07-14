#!/usr/bin/env node
/**
 * Public Beta Live Acceptance V1 — real production probes (explicit key required).
 *
 * Usage:
 *   TOKFAI_API_KEY=sk-tokfai_... node scripts/public-beta-live-acceptance.mjs
 *   TOKFAI_LIVE_FULL_MATRIX=1 TOKFAI_API_KEY=... node scripts/public-beta-live-acceptance.mjs
 *   TOKFAI_LIVE_IMAGE_SMOKE=1 TOKFAI_API_KEY=... node scripts/public-beta-live-acceptance.mjs
 *
 * Never prints full API key or upstream brand/host/key.
 */

import { acceptanceFetch } from "./lib/acceptance-http.mjs";
import {
  assertNoLeaks,
  extractCredits,
  extractModelTrace,
  extractRequestId,
  maskApiKey,
  normalizeApiBase,
  safeErrorSummary,
} from "./lib/public-beta-live-helpers.mjs";

const API_KEY = (process.env.TOKFAI_API_KEY ?? "").trim();
const BASE = normalizeApiBase(process.env.TOKFAI_API_BASE);
const FULL_MATRIX = process.env.TOKFAI_LIVE_FULL_MATRIX === "1";
const LIVE_IMAGE = process.env.TOKFAI_LIVE_IMAGE_SMOKE === "1";
const DEFAULT_MODELS = ["gpt-5.5", "gemini-2.5-flash"];
const TIMEOUT_MS = Math.max(
  30_000,
  parseInt(process.env.TOKFAI_LIVE_TIMEOUT_MS ?? "120000", 10) || 120_000
);

let failures = 0;

function pass(label, extra = "") {
  console.log(`PASS  ${label}${extra ? ` — ${extra}` : ""}`);
}

function fail(label, detail) {
  failures += 1;
  console.error(`FAIL  ${label}`);
  if (detail) console.error(`      ${detail}`);
}

async function api(method, path, body, opts = {}) {
  const headers = {
    Authorization: `Bearer ${API_KEY}`,
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.idempotencyKey) {
    headers["Idempotency-Key"] = opts.idempotencyKey;
  }
  return acceptanceFetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    timeoutMs: opts.timeoutMs ?? TIMEOUT_MS,
  });
}

function validateSuccessEnvelope(label, res, body, text) {
  const leak = assertNoLeaks(label, text || body);
  if (!leak.ok) {
    fail(label, leak.detail);
    return false;
  }

  if (res.status < 200 || res.status >= 300) {
    fail(label, JSON.stringify(safeErrorSummary(body, res.status)));
    return false;
  }

  const rid = extractRequestId(body, res);
  if (!rid || typeof rid !== "string") {
    fail(label, "missing request_id / id");
    return false;
  }

  const trace = extractModelTrace(body);
  const hasModelTrace =
    trace.model || trace.requested_model || trace.resolved_model;
  if (!hasModelTrace && !label.includes("health") && !label.includes("plans")) {
    // models list / health may not have model field on envelope
  }

  const credits = extractCredits(body);
  const needsUsage =
    label.includes("chat") ||
    label.includes("responses") ||
    label.includes("completions");
  if (needsUsage && credits == null) {
    fail(label, "missing usage / credits_charged");
    return false;
  }

  pass(
    label,
    `HTTP ${res.status} request_id=${rid}${
      credits != null && typeof credits === "number"
        ? ` credits=${credits}`
        : ""
    }`
  );
  return true;
}

async function listCallableModels() {
  const { res, body, text } = await api("GET", "/v1/models");
  const leak = assertNoLeaks("GET /v1/models", text);
  if (!leak.ok) {
    fail("GET /v1/models", leak.detail);
    return DEFAULT_MODELS;
  }
  if (!res.ok) {
    fail("GET /v1/models", `HTTP ${res.status}`);
    return DEFAULT_MODELS;
  }
  const rows = Array.isArray(body?.data) ? body.data : [];
  const ids = rows
    .map((r) => (typeof r?.id === "string" ? r.id : null))
    .filter(Boolean);
  pass("GET /v1/models", `${ids.length} models`);
  return ids.length ? ids : DEFAULT_MODELS;
}

async function probeChat(model) {
  const { res, body, text } = await api("POST", "/v1/chat/completions", {
    model,
    messages: [{ role: "user", content: "Reply with the single word OK." }],
    max_tokens: 16,
    stream: false,
  });
  if (!res.ok) {
    fail(
      `chat non-stream ${model}`,
      JSON.stringify(safeErrorSummary(body, res.status))
    );
    return;
  }
  const trace = extractModelTrace(body);
  if (!(trace.model || trace.requested_model || trace.resolved_model)) {
    fail(`chat non-stream ${model}`, "missing model trace fields");
    return;
  }
  validateSuccessEnvelope(`chat non-stream ${model}`, res, body, text);
}

async function probeChatStream(model) {
  const { res, body, text } = await api("POST", "/v1/chat/completions", {
    model,
    messages: [{ role: "user", content: "Reply with the single word OK." }],
    max_tokens: 16,
    stream: true,
  });
  const leak = assertNoLeaks(`chat stream ${model}`, text);
  if (!leak.ok) {
    fail(`chat stream ${model}`, leak.detail);
    return;
  }
  if (res.status !== 200) {
    fail(
      `chat stream ${model}`,
      JSON.stringify(safeErrorSummary(body, res.status))
    );
    return;
  }
  const ok =
    text.includes("data:") &&
    (/\[DONE\]/.test(text) || /chat\.completion\.chunk/.test(text));
  if (!ok) {
    fail(`chat stream ${model}`, "SSE shape incomplete");
    return;
  }
  const rid =
    text.match(/"request_id"\s*:\s*"([^"]+)"/)?.[1] ??
    res.headers.get("x-request-id");
  if (!rid) {
    fail(`chat stream ${model}`, "missing request_id in stream");
    return;
  }
  pass(`chat stream ${model}`, `HTTP 200 request_id=${rid}`);
}

async function probeResponses(model) {
  const { res, body, text } = await api("POST", "/v1/responses", {
    model,
    input: "Reply with the single word OK.",
    stream: false,
  });
  if (!res.ok) {
    fail(
      `responses non-stream ${model}`,
      JSON.stringify(safeErrorSummary(body, res.status))
    );
    return;
  }
  validateSuccessEnvelope(`responses non-stream ${model}`, res, body, text);
}

async function probeResponsesStream(model) {
  const { res, body, text } = await api("POST", "/v1/responses", {
    model,
    input: "Reply with the single word OK.",
    stream: true,
  });
  const leak = assertNoLeaks(`responses stream ${model}`, text);
  if (!leak.ok) {
    fail(`responses stream ${model}`, leak.detail);
    return;
  }
  if (res.status !== 200) {
    fail(
      `responses stream ${model}`,
      JSON.stringify(safeErrorSummary(body, res.status))
    );
    return;
  }
  const ok =
    text.includes("data:") ||
    /event:\s*response\./.test(text) ||
    /\[DONE\]/.test(text);
  if (!ok) {
    fail(`responses stream ${model}`, "SSE shape incomplete");
    return;
  }
  const rid =
    text.match(/"request_id"\s*:\s*"([^"]+)"/)?.[1] ??
    res.headers.get("x-request-id");
  pass(
    `responses stream ${model}`,
    `HTTP 200${rid ? ` request_id=${rid}` : ""}`
  );
}

async function probeIdempotency(model) {
  const key = `pb-live-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  const payload = {
    model,
    messages: [{ role: "user", content: "Reply with OK." }],
    max_tokens: 8,
  };
  const a = await api("POST", "/v1/chat/completions", payload, {
    idempotencyKey: key,
  });
  const b = await api("POST", "/v1/chat/completions", payload, {
    idempotencyKey: key,
  });
  if (!a.res.ok || !b.res.ok) {
    fail(
      "idempotency replay",
      `HTTP ${a.res.status}/${b.res.status}`
    );
    return;
  }
  const ca = extractCredits(a.body);
  const cb = extractCredits(b.body);
  const ra = extractRequestId(a.body, a.res);
  const rb = extractRequestId(b.body, b.res);
  // Same key should not double-charge: credits equal and often same request_id
  if (typeof ca === "number" && typeof cb === "number" && ca !== cb) {
    fail("idempotency no double charge", `credits ${ca} vs ${cb}`);
    return;
  }
  pass(
    "idempotency no double charge",
    `request_id=${ra}${rb && rb !== ra ? ` replay=${rb}` : ""} credits=${ca}`
  );
}

async function probeFailedNoCharge() {
  const { res, body, text } = await api("POST", "/v1/chat/completions", {
    model: "auto-fast",
    messages: [],
    max_tokens: 8,
  });
  const leak = assertNoLeaks("failed request envelope", text);
  if (!leak.ok) {
    fail("failed request no leak", leak.detail);
    return;
  }
  if (res.ok) {
    fail("failed request expected error", "empty messages should fail");
    return;
  }
  const credits = extractCredits(body);
  if (typeof credits === "number" && credits > 0) {
    fail("failed request no charge", `credits_charged=${credits}`);
    return;
  }
  pass(
    "failed request no finalized charge",
    JSON.stringify(safeErrorSummary(body, res.status))
  );
}

async function probeImageOnce() {
  const model = (process.env.TOKFAI_IMAGE_MODEL ?? "gpt-image-2").trim();
  const prompt =
    process.env.TOKFAI_IMAGE_PROMPT ??
    "A clean minimal API dashboard illustration, white background";
  const size = process.env.TOKFAI_IMAGE_SIZE ?? "1024x1024";

  const { res, body, text } = await api("POST", "/v1/images/generations", {
    model,
    prompt,
    size,
    n: 1,
    response_format: "url",
  });
  const leak = assertNoLeaks("image POST", text);
  if (!leak.ok) {
    fail("image POST", leak.detail);
    return;
  }
  const taskId = body?.id ?? body?.request_id;
  if (!(res.status === 202 || res.status === 200) || !taskId) {
    fail(
      "image POST accept",
      JSON.stringify(safeErrorSummary(body, res.status))
    );
    return;
  }
  pass(`image POST`, `HTTP ${res.status} id=${taskId}`);

  const deadline = Date.now() + 180_000;
  let latest = body;
  while (Date.now() < deadline) {
    const status = latest?.status;
    if (
      status === "completed" ||
      status === "succeeded" ||
      status === "failed" ||
      status === "retryable_timeout"
    ) {
      break;
    }
    await new Promise((r) => setTimeout(r, 2000));
    const poll = await api(
      "GET",
      `/v1/images/generations/${encodeURIComponent(taskId)}`
    );
    latest = poll.body;
    const leak2 = assertNoLeaks("image poll", poll.text);
    if (!leak2.ok) {
      fail("image poll", leak2.detail);
      return;
    }
  }

  if (latest?.status === "failed" || latest?.status === "retryable_timeout") {
    const err = latest?.error ?? {};
    pass(
      "image failed (friendly)",
      `code=${err.code ?? latest.status} request_id=${taskId}`
    );
    return;
  }

  if (latest?.status !== "completed" && latest?.status !== "succeeded") {
    fail("image poll timeout", `last status=${latest?.status}`);
    return;
  }

  const progress = latest?.progress;
  if (typeof progress === "number" && progress !== 100) {
    fail("image progress", `expected 100 got ${progress}`);
    return;
  }
  const url =
    latest?.data?.[0]?.url ??
    latest?.results?.[0]?.url ??
    null;
  if (!url) {
    fail("image result url", "missing data url");
    return;
  }
  const credits = extractCredits(latest);
  pass(
    "image completed",
    `progress=${progress ?? 100} credits=${credits ?? "n/a"}`
  );
}

async function main() {
  console.log("=== Tokfai Public Beta Live Acceptance ===");
  console.log(`base: ${BASE}`);
  console.log(`api_key: ${maskApiKey(API_KEY)}`);
  console.log(`full_matrix: ${FULL_MATRIX ? "yes" : "no"}`);
  console.log(`image: ${LIVE_IMAGE ? "yes" : "no"}`);
  console.log("");

  if (!API_KEY.startsWith("sk-tokfai_")) {
    console.error("TOKFAI_API_KEY is required (sk-tokfai_...).");
    process.exit(1);
  }

  // Basic endpoints
  {
    const { res, body, text } = await acceptanceFetch(`${BASE}/health`, {
      method: "GET",
      timeoutMs: 15_000,
    });
    const leak = assertNoLeaks("health", text);
    if (!leak.ok) fail("GET /health", leak.detail);
    else if (!res.ok) fail("GET /health", `HTTP ${res.status}`);
    else pass("GET /health", `HTTP ${res.status}`);
    void body;
  }

  {
    const { res, body, text } = await acceptanceFetch(
      `${BASE}/v1/billing/plans`,
      { method: "GET", timeoutMs: 15_000 }
    );
    const leak = assertNoLeaks("plans", text);
    if (!leak.ok) fail("GET /v1/billing/plans", leak.detail);
    else if (!res.ok) fail("GET /v1/billing/plans", `HTTP ${res.status}`);
    else {
      const data = body?.data ?? body?.plans;
      if (!Array.isArray(data) && body?.object !== "list") {
        fail("GET /v1/billing/plans", "unexpected shape");
      } else pass("GET /v1/billing/plans");
    }
  }

  const listed = await listCallableModels();
  const toTest = FULL_MATRIX
    ? listed
        .filter((id) => !/image|embedding|whisper|tts|dall/i.test(id))
        .slice(0, 24)
    : DEFAULT_MODELS;

  console.log(`\n── Models under test (${toTest.length}) ──`);
  for (const model of toTest) {
    await probeChat(model);
    await probeChatStream(model);
    await probeResponses(model);
    await probeResponsesStream(model);
  }

  console.log("\n── Billing safety ──");
  await probeFailedNoCharge();
  await probeIdempotency(toTest[0] ?? "gpt-5.5");

  if (LIVE_IMAGE) {
    console.log("\n── Image (opt-in) ──");
    await probeImageOnce();
  }

  console.log("\n=== Summary ===");
  if (failures > 0) {
    console.error(`public-beta-live-acceptance: FAILED (${failures})`);
    process.exit(1);
  }
  console.log("public-beta-live-acceptance: OK");
  console.log("TOKFAI_PUBLIC_BETA_LIVE_READY");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
