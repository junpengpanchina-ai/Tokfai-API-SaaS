#!/usr/bin/env node
/**
 * P768 — Batch API production acceptance (create → items → poll → credits / request_id).
 *
 * Usage:
 *   TOKFAI_API_KEY=sk-tokfai_... node scripts/batch-production-acceptance.mjs
 *
 * Optional env:
 *   TOKFAI_API_BASE        default https://api.tokfai.com/v1
 *   TOKFAI_MODEL           default auto-fast
 *   BATCH_ITEM_COUNT       default 5
 *   POLL_INTERVAL_MS       default 3000
 *   POLL_TIMEOUT_MS        default 300000
 *   CHAT_TIMEOUT_MS        default 120000
 *   FAIL_PROBE             default 1 (cancel 1-item batch to verify non-success = 0 credits)
 *
 * Writes: batch-test-results/latest.json (API key masked).
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = (process.env.TOKFAI_API_BASE ?? "https://api.tokfai.com/v1").replace(
  /\/+$/,
  ""
);
const API_KEY = process.env.TOKFAI_API_KEY ?? "";
const MODEL = process.env.TOKFAI_MODEL ?? "auto-fast";
const BATCH_ITEM_COUNT = Math.max(
  1,
  Math.min(100, parseInt(process.env.BATCH_ITEM_COUNT ?? "5", 10) || 5)
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
const FAIL_PROBE =
  process.env.FAIL_PROBE === "1" ||
  process.env.FAIL_PROBE === "true" ||
  (process.env.FAIL_PROBE !== "0" && process.env.FAIL_PROBE !== "false");

const RESULTS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "batch-test-results"
);
const RESULTS_FILE = join(RESULTS_DIR, "latest.json");

const TERMINAL_BATCH = new Set([
  "completed",
  "failed",
  "partial_failed",
  "cancelled",
]);

function maskKey(key) {
  if (!key || key.length <= 12) return "(not set)";
  return `${key.slice(0, 12)}…${key.slice(-4)} (len=${key.length})`;
}

function truncate(text, max = 240) {
  if (!text) return "";
  const s = String(text).replace(/\s+/g, " ").trim();
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

async function apiFetch(path, options = {}, timeoutMs = CHAT_TIMEOUT_MS) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { parse_error: true, raw: truncate(text) };
  }

  return { res, body, text };
}

function buildItems(count) {
  return Array.from({ length: count }, (_, i) => ({
    messages: [
      {
        role: "user",
        content: `Say ok only. Item ${i + 1}.`,
      },
    ],
  }));
}

function summarizeItem(item) {
  const durationMs =
    item.started_at && item.completed_at
      ? new Date(item.completed_at).getTime() -
        new Date(item.started_at).getTime()
      : null;
  return {
    id: item.id,
    index: item.index,
    status: item.status,
    request_id: item.request_id ?? null,
    credits_charged: item.credits_charged ?? 0,
    error_code: item.error_code ?? null,
    error_message: truncate(item.error_message ?? "", 120),
    attempt_count: item.attempt_count ?? 0,
    duration_ms: durationMs,
    resolved_model:
      item.output?.tokfai?.resolved_model ??
      item.output?.model ??
      null,
  };
}

function classifyItems(items) {
  const byStatus = {};
  const errorCodes = {};
  for (const item of items) {
    byStatus[item.status] = (byStatus[item.status] ?? 0) + 1;
    if (item.error_code) {
      errorCodes[item.error_code] = (errorCodes[item.error_code] ?? 0) + 1;
    }
  }
  return { byStatus, errorCodes };
}

function runBatchChecks(batch, items) {
  const succeeded = items.filter((i) => i.status === "succeeded");
  const nonSucceeded = items.filter((i) => i.status !== "succeeded");

  const chat_api_200 = true; // set by caller
  const batch_create_ok = true; // set by caller

  const at_least_one_success =
    (batch.succeeded_items ?? 0) > 0 || succeeded.length > 0;

  const succeeded_have_request_id =
    succeeded.length === 0
      ? true
      : succeeded.every(
          (i) => typeof i.request_id === "string" && i.request_id.length > 0
        );

  const succeeded_have_credits =
    succeeded.length === 0
      ? true
      : succeeded.every((i) => Number(i.credits_charged) > 0);

  const failed_zero_credits =
    nonSucceeded.length === 0
      ? true
      : nonSucceeded.every((i) => Number(i.credits_charged ?? 0) === 0);

  const sumSucceededCredits = succeeded.reduce(
    (sum, i) => sum + Number(i.credits_charged ?? 0),
    0
  );
  const batchCredits = Number(batch.credits_charged ?? 0);
  const batch_credits_match =
    succeeded.length === 0
      ? batchCredits === 0
      : Math.abs(batchCredits - sumSucceededCredits) < 0.0001;

  const terminal_batch =
    TERMINAL_BATCH.has(batch.status) &&
    items.every((i) =>
      ["succeeded", "failed", "cancelled"].includes(i.status)
    );

  return {
    chat_api_200,
    batch_create_ok,
    at_least_one_success,
    succeeded_have_request_id,
    succeeded_have_credits,
    failed_zero_credits,
    batch_credits_match,
    terminal_batch,
    sum_succeeded_credits: sumSucceededCredits,
    batch_credits_charged: batchCredits,
  };
}

function checksPass(checks) {
  return Object.entries(checks)
    .filter(([key]) => !key.startsWith("sum_") && !key.endsWith("_charged"))
    .every(([, value]) => value === true);
}

async function pollBatch(batchId, label = "main") {
  const snapshots = [];
  const started = Date.now();

  while (Date.now() - started < POLL_TIMEOUT_MS) {
    const { res, body } = await apiFetch(`/batches/${batchId}`);
    if (!res.ok) {
      throw new Error(
        `${label} get batch failed: HTTP ${res.status} ${truncate(JSON.stringify(body))}`
      );
    }

    snapshots.push({
      at_ms: Date.now() - started,
      status: body.status,
      succeeded_items: body.succeeded_items,
      failed_items: body.failed_items,
      credits_charged: body.credits_charged,
    });

    console.log(
      `  [${label}] status=${body.status} ok=${body.succeeded_items}/${body.total_items} failed=${body.failed_items} credits=${body.credits_charged}`
    );

    if (TERMINAL_BATCH.has(body.status)) {
      return {
        batch: body,
        pollDurationMs: Date.now() - started,
        snapshots,
      };
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(`${label} poll timeout after ${POLL_TIMEOUT_MS}ms`);
}

async function fetchAllItems(batchId) {
  const { res, body } = await apiFetch(
    `/batches/${batchId}/items?limit=100&offset=0`
  );
  if (!res.ok) {
    throw new Error(
      `get items failed: HTTP ${res.status} ${truncate(JSON.stringify(body))}`
    );
  }
  return body;
}

async function runChatSmoke() {
  const started = performance.now();
  const modelsRes = await apiFetch("/models", {}, CHAT_TIMEOUT_MS);
  const modelsOk = modelsRes.res.ok;
  const modelCount = Array.isArray(modelsRes.body?.data)
    ? modelsRes.body.data.length
    : 0;

  const chatStarted = performance.now();
  const chatRes = await apiFetch(
    "/chat/completions",
    {
      method: "POST",
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: "Say ok only." }],
        stream: false,
      }),
    },
    CHAT_TIMEOUT_MS
  );
  const chatLatencyMs = Math.round(performance.now() - chatStarted);

  const requestId =
    chatRes.body?.request_id ??
    chatRes.body?.tokfai?.request_id ??
    chatRes.res.headers.get("x-request-id");
  const resolvedModel =
    chatRes.body?.tokfai?.resolved_model ?? chatRes.body?.model ?? null;

  return {
    models: {
      ok: modelsOk,
      status: modelsRes.res.status,
      model_count: modelCount,
      duration_ms: Math.round(performance.now() - started),
    },
    chat_completions: {
      ok: chatRes.res.ok,
      status: chatRes.res.status,
      latency_ms: chatLatencyMs,
      request_id: requestId ?? null,
      resolved_model: resolvedModel,
      credits_charged:
        chatRes.body?.tokfai?.credits_charged ??
        chatRes.body?.usage?.credits_charged ??
        null,
      error_code: chatRes.body?.error?.code ?? null,
      error_message: truncate(chatRes.body?.error?.message ?? ""),
    },
  };
}

async function runMainBatch() {
  const createStarted = performance.now();
  const { res, body } = await apiFetch("/batches/chat", {
    method: "POST",
    body: JSON.stringify({
      model: MODEL,
      items: buildItems(BATCH_ITEM_COUNT),
    }),
  });
  const createDurationMs = Math.round(performance.now() - createStarted);

  if (res.status !== 202 && !res.ok) {
    return {
      ok: false,
      error: `create batch HTTP ${res.status}`,
      create: { status: res.status, body, duration_ms: createDurationMs },
    };
  }

  console.log(
    `Created batch id=${body.id} status=${body.status} items=${body.total_items}`
  );
  console.log("Polling main batch…");

  const { batch, pollDurationMs, snapshots } = await pollBatch(body.id, "main");
  const itemsBody = await fetchAllItems(body.id);
  const items = (itemsBody.data ?? []).map(summarizeItem);
  const classification = classifyItems(items);

  const batchDurationMs =
    batch.completed_at && batch.started_at
      ? new Date(batch.completed_at).getTime() -
        new Date(batch.started_at).getTime()
      : pollDurationMs;

  const checks = runBatchChecks(batch, items);
  checks.batch_create_ok = res.status === 202 || res.ok;

  return {
    ok: checksPass(checks),
    batch_id: body.id,
    create: {
      status: res.status,
      duration_ms: createDurationMs,
      accepted: res.status === 202,
    },
    final_batch: {
      id: batch.id,
      status: batch.status,
      model: batch.model,
      requested_model: batch.requested_model,
      total_items: batch.total_items,
      succeeded_items: batch.succeeded_items,
      failed_items: batch.failed_items,
      credits_charged: batch.credits_charged,
      started_at: batch.started_at,
      completed_at: batch.completed_at,
      batch_duration_ms: batchDurationMs,
      poll_duration_ms: pollDurationMs,
    },
    poll_snapshots: snapshots,
    items,
    items_total: itemsBody.total ?? items.length,
    classification,
    checks,
  };
}

async function runFailProbe() {
  console.log("");
  console.log("Fail probe: create 1-item batch and cancel (non-success = 0 credits)…");

  const { res, body } = await apiFetch("/batches/chat", {
    method: "POST",
    body: JSON.stringify({
      model: MODEL,
      items: buildItems(1),
    }),
  });

  if (!res.ok && res.status !== 202) {
    return {
      ok: false,
      error: `fail probe create HTTP ${res.status}`,
      create_status: res.status,
    };
  }

  const cancelRes = await apiFetch(`/batches/${body.id}/cancel`, {
    method: "POST",
    body: "{}",
  });

  if (!cancelRes.res.ok) {
    return {
      ok: false,
      error: `cancel HTTP ${cancelRes.res.status}`,
      batch_id: body.id,
      cancel_status: cancelRes.res.status,
      cancel_body: cancelRes.body,
    };
  }

  const { batch, pollDurationMs } = await pollBatch(body.id, "cancel");
  const itemsBody = await fetchAllItems(body.id);
  const items = (itemsBody.data ?? []).map(summarizeItem);

  const nonSuccessZeroCredits = items.every(
    (i) =>
      i.status !== "succeeded" && Number(i.credits_charged ?? 0) === 0
  );
  const batchZeroCredits = Number(batch.credits_charged ?? 0) === 0;
  const terminalCancelled =
    batch.status === "cancelled" ||
    items.every((i) => i.status === "cancelled" || i.status === "failed");

  return {
    ok: nonSuccessZeroCredits && batchZeroCredits && terminalCancelled,
    batch_id: body.id,
    final_status: batch.status,
    poll_duration_ms: pollDurationMs,
    items,
    checks: {
      non_success_zero_credits: nonSuccessZeroCredits,
      batch_zero_credits: batchZeroCredits,
      terminal_cancelled: terminalCancelled,
    },
  };
}

async function writeResults(report) {
  await mkdir(RESULTS_DIR, { recursive: true });
  await writeFile(RESULTS_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

async function main() {
  if (!API_KEY.startsWith("sk-tokfai_")) {
    console.error("Set TOKFAI_API_KEY=sk-tokfai_... before running.");
    process.exit(1);
  }

  console.log("=== P768 batch production acceptance ===");
  console.log(`api_base:   ${BASE}`);
  console.log(`api_key:    ${maskKey(API_KEY)}`);
  console.log(`model:      ${MODEL}`);
  console.log(`items:      ${BATCH_ITEM_COUNT}`);
  console.log(`fail_probe: ${FAIL_PROBE}`);
  console.log("");

  const runStarted = Date.now();
  const report = {
    phase: "P768",
    timestamp: new Date().toISOString(),
    config: {
      api_base: BASE,
      api_key: maskKey(API_KEY),
      model: MODEL,
      batch_item_count: BATCH_ITEM_COUNT,
      fail_probe: FAIL_PROBE,
    },
    chat_smoke: null,
    batch: null,
    fail_probe: null,
    pass: false,
    duration_ms: 0,
    results_file: "batch-test-results/latest.json",
  };

  let hardFailures = 0;

  console.log("Chat API smoke (models + completions)…");
  try {
    report.chat_smoke = await runChatSmoke();
    report.chat_smoke.pass =
      report.chat_smoke.models.ok && report.chat_smoke.chat_completions.ok;
    console.log(
      `  GET /models → HTTP ${report.chat_smoke.models.status} (${report.chat_smoke.models.model_count} models)`
    );
    console.log(
      `  POST /chat/completions → HTTP ${report.chat_smoke.chat_completions.status} request_id=${report.chat_smoke.chat_completions.request_id ?? "(none)"}`
    );
    if (!report.chat_smoke.pass) hardFailures += 1;
  } catch (err) {
    report.chat_smoke = { pass: false, error: String(err?.message ?? err) };
    hardFailures += 1;
    console.error("  chat smoke error:", err.message ?? err);
  }
  console.log("");

  console.log("Main batch workflow…");
  try {
    report.batch = await runMainBatch();
    if (report.batch?.checks) {
      report.batch.checks.chat_api_200 =
        report.chat_smoke?.chat_completions?.ok === true;
    }
    if (!report.batch.ok) hardFailures += 1;

    const items = report.batch.items ?? [];
    console.log("");
    console.log(`Items (${items.length}):`);
    for (const item of items) {
      console.log(
        `  [${item.index}] ${item.status} credits=${item.credits_charged} request_id=${item.request_id ?? "-"} error=${item.error_code ?? "-"}`
      );
    }
    console.log("");
    console.log("Checks:");
    for (const [key, value] of Object.entries(report.batch.checks ?? {})) {
      if (key.startsWith("sum_") || key.endsWith("_charged")) continue;
      console.log(`  ${key}: ${value ? "PASS" : "FAIL"}`);
    }
  } catch (err) {
    report.batch = { ok: false, error: String(err?.message ?? err) };
    hardFailures += 1;
    console.error("  batch workflow error:", err.message ?? err);
  }

  if (FAIL_PROBE) {
    try {
      report.fail_probe = await runFailProbe();
      if (!report.fail_probe.ok) hardFailures += 1;
      console.log(
        `  fail_probe pass=${report.fail_probe.ok} batch=${report.fail_probe.batch_id ?? "-"}`
      );
    } catch (err) {
      report.fail_probe = { ok: false, error: String(err?.message ?? err) };
      hardFailures += 1;
      console.error("  fail_probe error:", err.message ?? err);
    }
  }

  report.duration_ms = Date.now() - runStarted;
  report.pass =
    hardFailures === 0 &&
    report.chat_smoke?.pass === true &&
    report.batch?.ok === true &&
    (FAIL_PROBE ? report.fail_probe?.ok === true : true);

  await writeResults(report);

  console.log("");
  console.log(`Results written to ${RESULTS_FILE}`);
  console.log(`Overall: ${report.pass ? "PASS" : "FAIL"} (${formatDuration(report.duration_ms)})`);

  if (!report.pass) {
    process.exit(1);
  }
}

main().catch(async (err) => {
  const fallback = {
    phase: "P768",
    timestamp: new Date().toISOString(),
    pass: false,
    error: String(err?.message ?? err),
  };
  try {
    await writeResults(fallback);
  } catch {
    // ignore write errors on crash
  }
  console.error(err);
  process.exit(1);
});
