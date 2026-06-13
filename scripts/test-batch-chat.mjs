#!/usr/bin/env node
/**
 * P762/P763 batch chat queue smoke test.
 *
 * Usage:
 *   TOKFAI_API_KEY=sk-tokfai_... node scripts/test-batch-chat.mjs
 *
 * Optional env:
 *   TOKFAI_API_BASE        default https://api.tokfai.com/v1
 *   TOKFAI_MODEL           default auto-fast
 *   BATCH_ITEM_COUNT       default 5
 *   POLL_INTERVAL_MS       default 3000
 *   POLL_TIMEOUT_MS        default 300000
 */

const BASE = (process.env.TOKFAI_API_BASE ?? "https://api.tokfai.com/v1").replace(
  /\/+$/,
  ""
);
const API_KEY = process.env.TOKFAI_API_KEY ?? "";
const MODEL = process.env.TOKFAI_MODEL ?? "auto-fast";
const BATCH_ITEM_COUNT = Math.max(
  1,
  Math.min(
    100,
    parseInt(process.env.BATCH_ITEM_COUNT ?? "5", 10) || 5
  )
);
const POLL_INTERVAL_MS = Math.max(
  500,
  parseInt(process.env.POLL_INTERVAL_MS ?? "3000", 10) || 3000
);
const POLL_TIMEOUT_MS = Math.max(
  10_000,
  parseInt(process.env.POLL_TIMEOUT_MS ?? "300000", 10) || 300_000
);

function maskKey(key) {
  if (!key || key.length <= 12) return "(not set)";
  return `${key.slice(0, 12)}…${key.slice(-4)} (len=${key.length})`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

async function apiFetch(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
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
    body = { parse_error: true, raw: text.slice(0, 300) };
  }

  return { res, body };
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

async function createBatch() {
  const { res, body } = await apiFetch("/batches/chat", {
    method: "POST",
    body: JSON.stringify({
      model: MODEL,
      items: buildItems(BATCH_ITEM_COUNT),
    }),
  });

  if (!res.ok) {
    console.error("Create batch failed:", res.status, body);
    process.exit(1);
  }

  return body;
}

async function getBatch(batchId) {
  const { res, body } = await apiFetch(`/batches/${batchId}`);
  if (!res.ok) {
    console.error("Get batch failed:", res.status, body);
    process.exit(1);
  }
  return body;
}

async function getBatchItems(batchId) {
  const { res, body } = await apiFetch(
    `/batches/${batchId}/items?limit=100&offset=0`
  );
  if (!res.ok) {
    console.error("Get batch items failed:", res.status, body);
    process.exit(1);
  }
  return body;
}

async function pollBatch(batchId) {
  const terminal = new Set(["completed", "failed", "partial_failed", "cancelled"]);
  const started = Date.now();

  while (Date.now() - started < POLL_TIMEOUT_MS) {
    const batch = await getBatch(batchId);
    console.log(
      `  status=${batch.status} succeeded=${batch.succeeded_items}/${batch.total_items} failed=${batch.failed_items} credits=${batch.credits_charged}`
    );

    if (terminal.has(batch.status)) {
      return { batch, pollDurationMs: Date.now() - started };
    }

    await sleep(POLL_INTERVAL_MS);
  }

  console.error(`Poll timeout after ${POLL_TIMEOUT_MS}ms`);
  process.exit(1);
}

function printItemsSummary(itemsBody) {
  const items = itemsBody.data ?? [];
  console.log("");
  console.log(`Items (${items.length} returned, total ${itemsBody.total ?? "?"}):`);

  for (const item of items) {
    const duration =
      item.started_at && item.completed_at
        ? formatDuration(
            new Date(item.completed_at).getTime() -
              new Date(item.started_at).getTime()
          )
        : "-";
    console.log(
      `  [${item.index}] status=${item.status} attempt_count=${item.attempt_count ?? 0} credits=${item.credits_charged ?? 0} duration=${duration} request_id=${item.request_id ?? "(none)"} error=${item.error_code ?? "-"}`
    );
  }

  const requestIds = items
    .map((item) => item.request_id)
    .filter(Boolean);
  const succeeded = items.filter((item) => item.status === "succeeded").length;
  const failed = items.filter((item) => item.status === "failed").length;
  const cancelled = items.filter((item) => item.status === "cancelled").length;
  const maxAttempts = Math.max(
    0,
    ...items.map((item) => item.attempt_count ?? 0)
  );

  console.log("");
  console.log("Summary:");
  console.log(`  succeeded:     ${succeeded}`);
  console.log(`  failed:        ${failed}`);
  console.log(`  cancelled:     ${cancelled}`);
  console.log(`  max_attempts:  ${maxAttempts}`);
  console.log(`  request_ids:   ${requestIds.length}/${items.length}`);
}

async function main() {
  if (!API_KEY.startsWith("sk-tokfai_")) {
    console.error(
      "Set TOKFAI_API_KEY=sk-tokfai_... before running this script."
    );
    process.exit(1);
  }

  console.log("=== P762/P763 batch chat smoke test ===");
  console.log(`api_base:   ${BASE}`);
  console.log(`api_key:    ${maskKey(API_KEY)}`);
  console.log(`model:      ${MODEL}`);
  console.log(`items:      ${BATCH_ITEM_COUNT}`);
  console.log("");

  const runStarted = Date.now();

  console.log("Creating batch…");
  const created = await createBatch();
  console.log(`Created batch id=${created.id} status=${created.status} total_items=${created.total_items}`);
  console.log("");

  console.log("Polling batch status…");
  const { batch: finalBatch, pollDurationMs } = await pollBatch(created.id);
  const batchDurationMs =
    finalBatch.completed_at && finalBatch.started_at
      ? new Date(finalBatch.completed_at).getTime() -
        new Date(finalBatch.started_at).getTime()
      : Date.now() - runStarted;

  console.log("");
  console.log("Final batch:");
  console.log(`  id:               ${finalBatch.id}`);
  console.log(`  status:           ${finalBatch.status}`);
  console.log(`  succeeded_items:  ${finalBatch.succeeded_items}`);
  console.log(`  failed_items:     ${finalBatch.failed_items}`);
  console.log(`  credits_charged:  ${finalBatch.credits_charged}`);
  console.log(`  batch_duration:   ${formatDuration(batchDurationMs)}`);
  console.log(`  poll_duration:    ${formatDuration(pollDurationMs)}`);
  console.log("");

  const itemsBody = await getBatchItems(created.id);
  printItemsSummary(itemsBody);

  const hasSuccess = (finalBatch.succeeded_items ?? 0) > 0;
  if (!hasSuccess) {
    console.error("");
    console.error("Smoke test failed: no succeeded items.");
    process.exit(1);
  }

  console.log("");
  console.log("Smoke test passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
