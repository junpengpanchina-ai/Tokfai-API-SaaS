#!/usr/bin/env node
/**
 * Public Beta Live Acceptance V1 — real production probes (explicit key required).
 *
 * Usage:
 *   TOKFAI_API_KEY=sk-tokfai_... node scripts/public-beta-live-acceptance.mjs
 *   TOKFAI_LIVE_FULL_MATRIX=1 TOKFAI_API_KEY=... node scripts/public-beta-live-acceptance.mjs
 *   TOKFAI_LIVE_IMAGE_SMOKE=1 TOKFAI_API_KEY=... node scripts/public-beta-live-acceptance.mjs
 *
 * Default capability matrix (TOKFAI_LIVE_FULL_MATRIX unset):
 *   - gpt-5.5: chat + responses + stream (all four)
 *   - gemini-2.5-flash: responses non-stream only
 *
 * Results:
 *   PASS     — gateway / auth / billing / required probes OK
 *   DEGRADED — upstream_timeout / upstream_model_busy (envelope OK, no leak, no charge)
 *   FAIL     — Tokfai internal / leak / bad charge / empty error envelope
 *
 * Never prints full API key or upstream brand/host/key.
 */

import { acceptanceFetch } from "./lib/acceptance-http.mjs";
import {
  assertNoLeaks,
  assertStandardErrorEnvelope,
  extractCredits,
  extractModelTrace,
  extractRequestId,
  isUpstreamDegradedCode,
  maskApiKey,
  normalizeApiBase,
  safeErrorSummary,
} from "./lib/public-beta-live-helpers.mjs";

const API_KEY = (process.env.TOKFAI_API_KEY ?? "").trim();
const BASE = normalizeApiBase(process.env.TOKFAI_API_BASE);
const FULL_MATRIX = process.env.TOKFAI_LIVE_FULL_MATRIX === "1";
const LIVE_IMAGE = process.env.TOKFAI_LIVE_IMAGE_SMOKE === "1";
const PROMPT = "Say OK in one short sentence.";
const TIMEOUT_MS = Math.max(
  30_000,
  parseInt(process.env.TOKFAI_LIVE_TIMEOUT_MS ?? "120000", 10) || 120_000
);

/** Default required probes — capability-aware (not every model × every surface). */
const DEFAULT_MODEL_CAPABILITIES = {
  "gpt-5.5": ["chat", "chat_stream", "responses", "responses_stream"],
  "gemini-2.5-flash": ["responses"],
};

const FULL_MATRIX_PROBES = [
  "chat",
  "chat_stream",
  "responses",
  "responses_stream",
];

let failures = 0;
let degraded = 0;

function pass(label, extra = "") {
  console.log(`PASS  ${label}${extra ? ` — ${extra}` : ""}`);
}

function markDegraded(label, detail) {
  degraded += 1;
  console.warn(`DEGRADED  ${label}${detail ? ` — ${detail}` : ""}`);
}

function fail(label, detail) {
  failures += 1;
  console.error(`FAIL  ${label}`);
  if (detail) console.error(`      ${detail}`);
}

/** True for responses non-stream probes (not the streaming variant). */
function isResponsesNonStreamLabel(label) {
  return label.startsWith("responses non-stream");
}

/**
 * Redacted debug dump on probe failure. Never prints API key material.
 */
function printProbeDebug(args) {
  const {
    route,
    method,
    model,
    stream,
    payload,
    res,
    body,
    text,
  } = args;
  const keys =
    payload && typeof payload === "object"
      ? Object.keys(payload).sort().join(",")
      : "(none)";
  const rid = extractRequestId(body, res);
  const preview =
    typeof text === "string"
      ? text.slice(0, 240)
      : JSON.stringify(body ?? {}).slice(0, 240);
  console.error("DEBUG  probe failure (redacted)");
  console.error(`      route=${route}`);
  console.error(`      method=${method}`);
  console.error(`      model=${model ?? "(n/a)"}`);
  console.error(`      stream=${stream}`);
  console.error(`      payload_keys=${keys}`);
  console.error(`      status=${res?.status ?? "(n/a)"}`);
  console.error(`      content_type=${res?.headers?.get?.("content-type") ?? "(n/a)"}`);
  console.error(`      request_id=${rid ?? "(n/a)"}`);
  console.error(`      final_url=${res?.url ?? "(n/a)"}`);
  console.error(`      body_preview=${JSON.stringify(preview)}`);
}

/**
 * Live probes match plain curl: Authorization + Content-Type only.
 * (X-Tokfai-Acceptance headers are for offline/mock tooling, not production curl parity.)
 */
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
    curlCompatible: true,
  });
}

/**
 * Classify a non-2xx model probe.
 * Upstream timeout/busy → DEGRADED (if envelope + no leak + no charge).
 * Other 5xx without upstream_xxx → FAIL.
 * Empty envelope → FAIL.
 */
function classifyProbeError(label, res, body, text, debugCtx) {
  if (debugCtx) printProbeDebug(debugCtx);

  const leak = assertNoLeaks(label, text || body);
  if (!leak.ok) {
    fail(label, leak.detail);
    return "fail";
  }

  const envelope = assertStandardErrorEnvelope(body, res, text);
  if (!envelope.ok) {
    fail(
      label,
      `empty/incomplete error envelope: ${envelope.detail} ${JSON.stringify(envelope.summary)}`
    );
    return "fail";
  }

  const credits = extractCredits(body);
  if (typeof credits === "number" && credits > 0) {
    fail(label, `error path charged credits=${credits}`);
    return "fail";
  }

  const { code, message, request_id: requestId } = envelope.summary;
  const summary = `HTTP ${res.status} code=${code} request_id=${requestId}`;

  if (isUpstreamDegradedCode(code)) {
    markDegraded(label, `${summary} message=${message}`);
    return "degraded";
  }

  // 5xx that is not a known upstream capacity code → gateway FAIL
  if (res.status >= 500) {
    fail(label, `${summary} message=${message}`);
    return "fail";
  }

  // 4xx on a required probe is a real failure (bad payload / routing / validation)
  fail(label, `${summary} message=${message}`);
  return "fail";
}

function validateSuccessEnvelope(label, res, body, text) {
  const leak = assertNoLeaks(label, text || body);
  if (!leak.ok) {
    fail(label, leak.detail);
    return false;
  }

  if (res.status < 200 || res.status >= 300) {
    classifyProbeError(label, res, body, text);
    return false;
  }

  const rid = extractRequestId(body, res);
  if (!rid || typeof rid !== "string") {
    fail(label, "missing request_id / id");
    return false;
  }

  if (isResponsesNonStreamLabel(label)) {
    if (body?.object !== "response") {
      fail(label, `expected object=response got ${body?.object ?? "missing"}`);
      return false;
    }
    if (body?.status !== "completed") {
      fail(label, `expected status=completed got ${body?.status ?? "missing"}`);
      return false;
    }
    const hasText =
      (typeof body?.output_text === "string" && body.output_text.length > 0) ||
      (Array.isArray(body?.output) && body.output.length > 0);
    if (!hasText) {
      fail(label, "missing output_text / output");
      return false;
    }
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
      credits != null ? ` credits=${credits}` : ""
    }`
  );
  return true;
}

async function listCallableModels() {
  const { res, body, text } = await api("GET", "/v1/models");
  const leak = assertNoLeaks("GET /v1/models", text);
  if (!leak.ok) {
    fail("GET /v1/models", leak.detail);
    return Object.keys(DEFAULT_MODEL_CAPABILITIES);
  }
  if (!res.ok) {
    fail("GET /v1/models", `HTTP ${res.status}`);
    return Object.keys(DEFAULT_MODEL_CAPABILITIES);
  }
  const rows = Array.isArray(body?.data) ? body.data : [];
  const ids = rows
    .map((r) => (typeof r?.id === "string" ? r.id : null))
    .filter(Boolean);
  pass("GET /v1/models", `${ids.length} models`);
  return ids.length ? ids : Object.keys(DEFAULT_MODEL_CAPABILITIES);
}

function resolveProbePlan(listedIds) {
  if (FULL_MATRIX) {
    const models = listedIds
      .filter((id) => !/image|embedding|whisper|tts|dall/i.test(id))
      .slice(0, 24);
    return models.map((model) => ({ model, probes: [...FULL_MATRIX_PROBES] }));
  }

  const plan = [];
  for (const [model, probes] of Object.entries(DEFAULT_MODEL_CAPABILITIES)) {
    // Prefer listed id when present; still probe defaults even if catalog lags.
    const resolved =
      listedIds.find((id) => id === model) ??
      listedIds.find((id) => id.toLowerCase() === model.toLowerCase()) ??
      model;
    plan.push({ model: resolved, probes: [...probes] });
  }
  return plan;
}

async function probeChat(model) {
  const label = `chat non-stream ${model}`;
  const payload = {
    model,
    messages: [{ role: "user", content: PROMPT }],
    stream: false,
  };
  const { res, body, text } = await api("POST", "/v1/chat/completions", payload);
  const debugCtx = {
    route: "/v1/chat/completions",
    method: "POST",
    model,
    stream: false,
    payload,
    res,
    body,
    text,
  };
  if (!res.ok) {
    classifyProbeError(label, res, body, text, debugCtx);
    return;
  }
  const trace = extractModelTrace(body);
  if (!(trace.model || trace.requested_model || trace.resolved_model)) {
    printProbeDebug(debugCtx);
    fail(label, "missing model trace fields");
    return;
  }
  validateSuccessEnvelope(label, res, body, text);
}

async function probeChatStream(model) {
  const label = `chat stream ${model}`;
  const payload = {
    model,
    messages: [{ role: "user", content: PROMPT }],
    stream: true,
  };
  const { res, body, text } = await api("POST", "/v1/chat/completions", payload);
  const debugCtx = {
    route: "/v1/chat/completions",
    method: "POST",
    model,
    stream: true,
    payload,
    res,
    body,
    text,
  };
  if (res.status !== 200) {
    classifyProbeError(label, res, body, text, debugCtx);
    return;
  }
  const leak = assertNoLeaks(label, text);
  if (!leak.ok) {
    fail(label, leak.detail);
    return;
  }
  const ok =
    text.includes("data:") &&
    (/\[DONE\]/.test(text) || /chat\.completion\.chunk/.test(text));
  if (!ok) {
    printProbeDebug(debugCtx);
    fail(label, "SSE shape incomplete");
    return;
  }
  const rid =
    text.match(/"request_id"\s*:\s*"([^"]+)"/)?.[1] ??
    res.headers.get("x-request-id");
  if (!rid) {
    printProbeDebug(debugCtx);
    fail(label, "missing request_id in stream");
    return;
  }
  pass(label, `HTTP 200 request_id=${rid}`);
}

async function probeResponses(model) {
  const label = `responses non-stream ${model}`;
  // Verified curl body: model + input string + stream:false only.
  const payload = {
    model,
    input: PROMPT,
    stream: false,
  };
  const { res, body, text } = await api("POST", "/v1/responses", payload);
  const debugCtx = {
    route: "/v1/responses",
    method: "POST",
    model,
    stream: false,
    payload,
    res,
    body,
    text,
  };

  if (!res.ok) {
    classifyProbeError(label, res, body, text, debugCtx);
    return;
  }
  if (!validateSuccessEnvelope(label, res, body, text)) {
    printProbeDebug(debugCtx);
  }
}

async function probeResponsesStream(model) {
  const label = `responses stream ${model}`;
  const payload = {
    model,
    input: PROMPT,
    stream: true,
  };
  const { res, body, text } = await api("POST", "/v1/responses", payload);
  const debugCtx = {
    route: "/v1/responses",
    method: "POST",
    model,
    stream: true,
    payload,
    res,
    body,
    text,
  };
  if (res.status !== 200) {
    classifyProbeError(label, res, body, text, debugCtx);
    return;
  }
  const leak = assertNoLeaks(label, text);
  if (!leak.ok) {
    fail(label, leak.detail);
    return;
  }
  const ok =
    text.includes("data:") ||
    /event:\s*response\./.test(text) ||
    /\[DONE\]/.test(text);
  if (!ok) {
    printProbeDebug(debugCtx);
    fail(label, "SSE shape incomplete");
    return;
  }
  const rid =
    text.match(/"request_id"\s*:\s*"([^"]+)"/)?.[1] ??
    res.headers.get("x-request-id");
  pass(label, `HTTP 200${rid ? ` request_id=${rid}` : ""}`);
}

async function runProbe(kind, model) {
  switch (kind) {
    case "chat":
      return probeChat(model);
    case "chat_stream":
      return probeChatStream(model);
    case "responses":
      return probeResponses(model);
    case "responses_stream":
      return probeResponsesStream(model);
    default:
      fail(`unknown probe ${kind}`, model);
  }
}

async function probeIdempotency(model) {
  const key = `pb-live-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  const payload = {
    model,
    messages: [{ role: "user", content: PROMPT }],
    stream: false,
  };
  const a = await api("POST", "/v1/chat/completions", payload, {
    idempotencyKey: key,
  });
  const b = await api("POST", "/v1/chat/completions", payload, {
    idempotencyKey: key,
  });
  if (!a.res.ok || !b.res.ok) {
    // Prefer degraded classification if either side is upstream capacity
    if (!a.res.ok) classifyProbeError("idempotency first", a.res, a.body, a.text);
    if (!b.res.ok) classifyProbeError("idempotency replay", b.res, b.body, b.text);
    return;
  }
  const ca = extractCredits(a.body);
  const cb = extractCredits(b.body);
  const ra = extractRequestId(a.body, a.res);
  const rb = extractRequestId(b.body, b.res);
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
  const label = "failed request envelope";
  const { res, body, text } = await api("POST", "/v1/chat/completions", {
    model: "gpt-5.5",
    messages: [],
    stream: false,
  });
  const leak = assertNoLeaks(label, text);
  if (!leak.ok) {
    fail("failed request no leak", leak.detail);
    return;
  }
  if (res.ok) {
    fail("failed request expected error", "empty messages should fail");
    return;
  }
  const envelope = assertStandardErrorEnvelope(body, res, text);
  if (!envelope.ok) {
    fail(
      "failed request standard envelope",
      `${envelope.detail} ${JSON.stringify(envelope.summary)}`
    );
    return;
  }
  const credits = extractCredits(body);
  if (typeof credits === "number" && credits > 0) {
    fail("failed request no charge", `credits_charged=${credits}`);
    return;
  }
  pass(
    "failed request no finalized charge",
    JSON.stringify(envelope.summary)
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
    if (res.status >= 400) {
      classifyProbeError("image POST accept", res, body, text);
    } else {
      fail(
        "image POST accept",
        JSON.stringify(safeErrorSummary(body, res.status, text))
      );
    }
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

  if (latest?.status === "retryable_timeout") {
    const progress =
      typeof latest.progress === "number" ? latest.progress : null;
    const credits = extractCredits(latest);
    if (progress != null && progress >= 100) {
      fail("image timeout progress", `progress=${progress}`);
      return;
    }
    if (typeof credits === "number" && credits > 0) {
      fail("image timeout no charge", `credits=${credits}`);
      return;
    }
    markDegraded(
      "image retryable_timeout",
      `request_id=${taskId} progress=${progress ?? "n/a"}`
    );
    return;
  }

  if (latest?.status === "failed") {
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
  const plan = resolveProbePlan(listed);

  console.log(`\n── Capability probes (${plan.length} models) ──`);
  for (const { model, probes } of plan) {
    console.log(`  ${model}: ${probes.join(", ")}`);
    for (const kind of probes) {
      await runProbe(kind, model);
    }
  }

  console.log("\n── Billing safety ──");
  await probeFailedNoCharge();
  const idemModel =
    plan.find((p) => p.probes.includes("chat"))?.model ?? "gpt-5.5";
  await probeIdempotency(idemModel);

  if (LIVE_IMAGE) {
    console.log("\n── Image (opt-in) ──");
    await probeImageOnce();
  }

  console.log("\n=== Summary ===");
  console.log(`PASS/DEGRADED/FAIL counts: degraded=${degraded} fail=${failures}`);
  if (failures > 0) {
    console.error(`public-beta-live-acceptance: FAILED (${failures})`);
    process.exit(1);
  }
  console.log("public-beta-live-acceptance: OK");
  console.log("TOKFAI_PUBLIC_BETA_LIVE_READY");
  if (degraded > 0) {
    console.log("TOKFAI_PUBLIC_BETA_UPSTREAM_DEGRADED");
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
