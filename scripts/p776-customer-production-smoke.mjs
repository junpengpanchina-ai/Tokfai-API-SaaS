#!/usr/bin/env node
/**
 * Internal operator smoke only — not customer documentation.
 * Customers validate with API Key + Dashboard Usage/Credits; they never run this script.
 *
 * P776 — production integration smoke (API Key auth paths).
 *
 * Usage:
 *   node scripts/p776-customer-production-smoke.mjs
 *   TOKFAI_API_KEY=sk-tokfai_... node scripts/p776-customer-production-smoke.mjs
 *
 * Optional:
 *   TOKFAI_API_BASE=https://api.tokfai.com/v1
 *   TOKFAI_MODEL=auto-fast
 *   BATCH_ITEM_COUNT=3
 *   POLL_INTERVAL_MS=3000
 *   POLL_TIMEOUT_MS=300000
 *
 * Writes: p776-smoke-results/latest.json (API key masked).
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_MOCK_KEY,
  isLiveMode,
  resolveApiBaseUrl,
  printOfflineDefaultHint,
} from "./lib/acceptance-config.mjs";
import { acceptanceFetch } from "./lib/acceptance-http.mjs";
import { ensureMockGateway } from "./lib/ensure-mock-gateway.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = "scripts/p776-customer-production-smoke.mjs";
const LIVE = isLiveMode();
const BASE = resolveApiBaseUrl(LIVE);
const API_KEY = LIVE
  ? process.env.TOKFAI_API_KEY ?? ""
  : process.env.TOKFAI_API_KEY ?? process.env.MOCK_API_KEY ?? DEFAULT_MOCK_KEY;
const MODEL = (process.env.TOKFAI_MODEL ?? "auto-fast").trim();
const BATCH_ITEM_COUNT = Math.max(
  1,
  Math.min(20, parseInt(process.env.BATCH_ITEM_COUNT ?? "3", 10) || 3)
);
const POLL_INTERVAL_MS = Math.max(
  500,
  parseInt(process.env.POLL_INTERVAL_MS ?? "3000", 10) || 3000
);
const POLL_TIMEOUT_MS = Math.max(
  10_000,
  parseInt(process.env.POLL_TIMEOUT_MS ?? "300000", 10) || 300_000
);
const CHAT_TIMEOUT_MS = Math.max(
  1000,
  parseInt(process.env.CHAT_TIMEOUT_MS ?? "120000", 10) || 120_000
);

const RESULTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "p776-smoke-results");
const RESULTS_FILE = join(RESULTS_DIR, "latest.json");

const TERMINAL_BATCH = new Set([
  "completed",
  "failed",
  "partial_failed",
  "cancelled",
]);

function maskKey(key) {
  if (!key || key.length <= 12) return null;
  return `${key.slice(0, 12)}…${key.slice(-4)}`;
}

function truncate(text, max = 240) {
  if (!text) return "";
  const s = String(text).replace(/\s+/g, " ").trim();
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorCode(body) {
  return body?.error?.code ?? body?.code ?? null;
}

function requestId(body, res) {
  return (
    body?.request_id ??
    body?.tokfai?.request_id ??
    body?.error?.request_id ??
    res?.headers?.get("x-request-id") ??
    null
  );
}

async function apiFetch(path, options = {}, timeoutMs = CHAT_TIMEOUT_MS) {
  const headers = { ...(options.headers ?? {}) };
  if (options.auth === false) {
    // no Authorization
  } else if (options.authKey !== undefined) {
    if (options.authKey) headers.Authorization = `Bearer ${options.authKey}`;
  } else if (API_KEY) {
    headers.Authorization = `Bearer ${API_KEY}`;
  }
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  return acceptanceFetch(`${BASE}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body,
    timeoutMs,
  });
}

function buildBatchItems(count) {
  return Array.from({ length: count }, (_, i) => ({
    messages: [{ role: "user", content: `Say ok only. Item ${i + 1}.` }],
  }));
}

async function main() {
  let mockChild = null;
  if (!LIVE) {
    printOfflineDefaultHint(SCRIPT);
    console.log("");
    const mock = await ensureMockGateway();
    mockChild = mock.child;
    console.log(`offline mock base: ${BASE}`);
    console.log("");
  }

  const report = {
    suite: "p776-customer-production-smoke",
    mode: LIVE ? "live" : "offline-mock",
    timestamp: new Date().toISOString(),
    base: BASE,
    model: MODEL,
    api_key_masked: maskKey(API_KEY),
    steps: [],
  };

  function step(name, pass, fields = {}) {
    const row = { step: name, pass, ...fields };
    report.steps.push(row);
    const mark = pass ? "PASS" : "FAIL";
    console.log(`[${mark}] ${name}`);
    if (fields.http_status) console.log(`  HTTP ${fields.http_status}`);
    if (fields.error_code) console.log(`  error.code: ${fields.error_code}`);
    if (fields.request_id) console.log(`  request_id: ${fields.request_id}`);
    if (fields.notes) console.log(`  notes: ${fields.notes}`);
    console.log("");
    return pass;
  }

  console.log("=== P776 customer production integration smoke ===");
  console.log(`mode: ${LIVE ? "live" : "offline-mock"}`);
  console.log(`base: ${BASE}`);
  console.log(`model: ${MODEL}`);
  console.log(`api_key: ${maskKey(API_KEY) ?? "(not set — auth paths skipped)"}`);
  console.log("");

  let failures = 0;

  // --- Error probes (no valid key required) ---
  {
    const { res, body } = await apiFetch("/chat/completions", {
      method: "POST",
      auth: false,
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: "Say ok only." }],
        stream: false,
      }),
    });
    const code = errorCode(body);
    const ok = res.status === 401 && code === "missing_token";
    if (!ok) failures += 1;
    step("error.chat_missing_token", ok, {
      source: "POST /v1/chat/completions (no Authorization)",
      expected: "HTTP 401, missing_token",
      http_status: res.status,
      error_code: code,
      request_id: requestId(body, res),
      notes: truncate(body?.error?.message),
    });
  }

  {
    const { res, body } = await apiFetch("/chat/completions", {
      method: "POST",
      authKey: "sk-tokfai_invalid_smoke_key",
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: "Say ok only." }],
        stream: false,
      }),
    });
    const code = errorCode(body);
    const ok = res.status === 401 && code === "invalid_token";
    if (!ok) failures += 1;
    step("error.chat_invalid_token", ok, {
      source: "POST /v1/chat/completions (bad Bearer)",
      expected: "HTTP 401, invalid_token",
      http_status: res.status,
      error_code: code,
      request_id: requestId(body, res),
    });
  }

  {
    const { res, body } = await apiFetch("/models", { auth: false });
    const count = Array.isArray(body?.data) ? body.data.length : 0;
    const ok = LIVE
      ? res.status === 200 && count > 0
      : res.status === 401 && errorCode(body) === "missing_token";
    if (!ok) failures += 1;
    step(LIVE ? "models.public_catalog" : "models.offline_requires_auth", ok, {
      source: "GET /v1/models (no Authorization)",
      expected: LIVE
        ? "HTTP 200, model list (public catalog)"
        : "HTTP 401 missing_token on offline mock",
      http_status: res.status,
      model_count: count,
      error_code: errorCode(body),
      notes: LIVE
        ? "Tokfai exposes GET /v1/models without auth on production."
        : "Offline mock requires Bearer — production public catalog skipped.",
    });
  }

  if (!LIVE) {
    step("auth_suite_offline_mock", true, {
      source: "offline mock",
      expected: "error probes on mock; set LIVE=1 for production auth suite",
      notes: "Use LIVE=1 TOKFAI_API_KEY=... for full production suite.",
    });

    await mkdir(RESULTS_DIR, { recursive: true });
    await writeFile(RESULTS_FILE, JSON.stringify(report, null, 2));
    console.log(`Results: ${RESULTS_FILE}`);
    console.log("PARTIAL PASS — offline error probes on mock; LIVE=1 for production suite");
    if (mockChild) mockChild.kill();
    process.exit(failures > 0 ? 1 : 0);
  }

  if (!API_KEY.startsWith("sk-tokfai_")) {
    step("auth_suite_skipped", true, {
      source: "TOKFAI_API_KEY",
      expected: "sk-tokfai_… for chat, batch, Usage/Credits reconciliation",
      notes:
        "Error probes passed. Set TOKFAI_API_KEY and re-run for chat/batch. Dashboard steps manual.",
    });

    await mkdir(RESULTS_DIR, { recursive: true });
    await writeFile(RESULTS_FILE, JSON.stringify(report, null, 2));
    console.log(`Results: ${RESULTS_FILE}`);
    console.log("PARTIAL PASS — error probes OK; set TOKFAI_API_KEY for full auth suite");
    process.exit(0);
  }

  {
    const { res, body } = await apiFetch("/models");
    const count = Array.isArray(body?.data) ? body.data.length : 0;
    const ok = res.status === 200 && count > 0;
    if (!ok) failures += 1;
    step("models.authenticated", ok, {
      source: "GET /v1/models (Bearer)",
      expected: "HTTP 200",
      http_status: res.status,
      model_count: count,
    });
  }

  let chatRequestId = null;
  let chatCredits = null;
  let resolvedModel = null;

  {
    const started = performance.now();
    const { res, body } = await apiFetch("/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: "Say ok only." }],
        stream: false,
      }),
    });
    const latencyMs = Math.round(performance.now() - started);
    chatRequestId = requestId(body, res);
    resolvedModel = body?.tokfai?.resolved_model ?? body?.model ?? null;
    chatCredits =
      body?.tokfai?.credits_charged ??
      body?.usage?.credits_charged ??
      body?.credits_charged ??
      null;
    const ok = res.status === 200 && chatRequestId;
    if (!ok) failures += 1;
    step("chat.auto_fast", ok, {
      source: "POST /v1/chat/completions",
      expected: "HTTP 200, request_id, resolved model",
      http_status: res.status,
      request_id: chatRequestId,
      resolved_model: resolvedModel,
      credits_charged: chatCredits,
      latency_ms: latencyMs,
      error_code: errorCode(body),
    });
  }

  {
    const { res, body } = await apiFetch("/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        model: "nonexistent-model-xyz-p776",
        messages: [{ role: "user", content: "hi" }],
        stream: false,
      }),
    });
    const code = errorCode(body);
    const ok =
      res.status >= 400 &&
      (code === "model_not_available" ||
        code === "all_upstreams_unavailable" ||
        code === "invalid_request");
    if (!ok) failures += 1;
    step("error.chat_bad_model", ok, {
      source: "POST /v1/chat/completions (invalid model id)",
      expected: "HTTP 4xx with error.code (model_not_available or similar)",
      http_status: res.status,
      error_code: code,
      request_id: requestId(body, res),
    });
  }

  let batchId = null;
  let batchCredits = null;
  const itemRequestIds = [];

  {
    const { res, body } = await apiFetch(
      "/batches/chat",
      {
        method: "POST",
        body: JSON.stringify({ model: MODEL, items: buildBatchItems(BATCH_ITEM_COUNT) }),
      },
      60_000
    );
    batchId = body?.id ?? body?.batch?.id ?? null;
    const ok = res.status === 202 && batchId;
    if (!ok) failures += 1;
    step("batch.create", ok, {
      source: "POST /v1/batches/chat",
      expected: `HTTP 202, batch id, ${BATCH_ITEM_COUNT} items`,
      http_status: res.status,
      batch_id: batchId,
      error_code: errorCode(body),
    });
  }

  if (batchId) {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    let terminal = null;
    let lastBody = null;

    while (Date.now() < deadline) {
      const { res, body } = await apiFetch(`/batches/${batchId}`, {}, 60_000);
      lastBody = body;
      const status = body?.status ?? body?.batch?.status;
      if (res.ok && TERMINAL_BATCH.has(status)) {
        terminal = status;
        break;
      }
      await sleep(POLL_INTERVAL_MS);
    }

    batchCredits = lastBody?.credits_charged ?? lastBody?.batch?.credits_charged ?? null;
    const items = lastBody?.items ?? lastBody?.batch?.items ?? [];
    for (const item of items) {
      const rid =
        item?.request_id ??
        item?.tokfai?.request_id ??
        item?.response?.request_id ??
        null;
      if (rid) itemRequestIds.push(rid);
    }

    const succeeded = items.filter((i) => i?.status === "succeeded").length;
    const ok = terminal === "completed" && succeeded === BATCH_ITEM_COUNT;
    if (!ok) failures += 1;
    step("batch.poll_completed", ok, {
      source: `GET /v1/batches/${batchId}`,
      expected: `terminal completed, ${BATCH_ITEM_COUNT} succeeded items with request_id`,
      batch_status: terminal,
      succeeded_items: succeeded,
      batch_credits_charged: batchCredits,
      item_request_ids: itemRequestIds,
      notes: `polled until ${terminal ?? "timeout"}`,
    });
  }

  report.summary = {
    chat_request_id: chatRequestId,
    chat_credits_charged: chatCredits,
    chat_resolved_model: resolvedModel,
    batch_id: batchId,
    batch_credits_charged: batchCredits,
    batch_item_request_ids: itemRequestIds,
    failures,
  };

  await mkdir(RESULTS_DIR, { recursive: true });
  await writeFile(RESULTS_FILE, JSON.stringify(report, null, 2));
  console.log(`Results: ${RESULTS_FILE}`);

  if (failures > 0) {
    console.error(`FAILED (${failures} check(s))`);
    process.exit(1);
  }

  console.log("PASS — P776 smoke complete");
  console.log(
    "Manual: Dashboard API Keys (create + one-time secret), Usage search by request_id, Credits ledger."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
