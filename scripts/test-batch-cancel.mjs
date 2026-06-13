#!/usr/bin/env node
/**
 * P763 — Batch cancel smoke test.
 *
 * Creates a multi-item batch, cancels immediately, then verifies pending items
 * are not processed.
 *
 * Usage:
 *   TOKFAI_API_KEY=sk-tokfai_... node scripts/test-batch-cancel.mjs
 *
 * Optional env:
 *   TOKFAI_API_BASE        default https://api.tokfai.com/v1
 *   TOKFAI_MODEL           default auto-fast
 *   BATCH_ITEM_COUNT       default 10
 *   POLL_INTERVAL_MS       default 2000
 *   POLL_TIMEOUT_MS        default 60000
 */

const BASE = (process.env.TOKFAI_API_BASE ?? "https://api.tokfai.com/v1").replace(
  /\/+$/,
  ""
);
const API_KEY = process.env.TOKFAI_API_KEY ?? "";
const MODEL = process.env.TOKFAI_MODEL ?? "auto-fast";
const BATCH_ITEM_COUNT = Math.max(
  3,
  Math.min(
    100,
    parseInt(process.env.BATCH_ITEM_COUNT ?? "10", 10) || 10
  )
);
const POLL_INTERVAL_MS = Math.max(
  500,
  parseInt(process.env.POLL_INTERVAL_MS ?? "2000", 10) || 2000
);
const POLL_TIMEOUT_MS = Math.max(
  10_000,
  parseInt(process.env.POLL_TIMEOUT_MS ?? "60000", 10) || 60_000
);

function maskKey(key) {
  if (!key || key.length <= 12) return "(not set)";
  return `${key.slice(0, 12)}…${key.slice(-4)} (len=${key.length})`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
        content: `Write a long paragraph about item ${i + 1}.`,
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

async function cancelBatch(batchId) {
  const { res, body } = await apiFetch(`/batches/${batchId}/cancel`, {
    method: "POST",
  });

  if (!res.ok) {
    console.error("Cancel batch failed:", res.status, body);
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

async function pollUntilSettled(batchId) {
  const terminal = new Set([
    "completed",
    "failed",
    "partial_failed",
    "cancelled",
  ]);
  const started = Date.now();

  while (Date.now() - started < POLL_TIMEOUT_MS) {
    const batch = await getBatch(batchId);
    console.log(
      `  status=${batch.status} succeeded=${batch.succeeded_items}/${batch.total_items} failed=${batch.failed_items}`
    );

    if (terminal.has(batch.status) && batch.completed_at) {
      return batch;
    }

    if (terminal.has(batch.status)) {
      return batch;
    }

    await sleep(POLL_INTERVAL_MS);
  }

  console.error(`Poll timeout after ${POLL_TIMEOUT_MS}ms`);
  process.exit(1);
}

async function main() {
  if (!API_KEY.startsWith("sk-tokfai_")) {
    console.error(
      "Set TOKFAI_API_KEY=sk-tokfai_... before running this script."
    );
    process.exit(1);
  }

  console.log("=== P763 batch cancel smoke test ===");
  console.log(`api_base:   ${BASE}`);
  console.log(`api_key:    ${maskKey(API_KEY)}`);
  console.log(`model:      ${MODEL}`);
  console.log(`items:      ${BATCH_ITEM_COUNT}`);
  console.log("");

  console.log("Creating batch…");
  const created = await createBatch();
  console.log(`Created batch id=${created.id} status=${created.status}`);
  console.log("");

  console.log("Cancelling batch immediately…");
  const cancelled = await cancelBatch(created.id);
  console.log(
    `Cancelled batch status=${cancelled.status} succeeded=${cancelled.succeeded_items} failed=${cancelled.failed_items}`
  );
  console.log("");

  console.log("Polling until settled…");
  const finalBatch = await pollUntilSettled(created.id);
  const itemsBody = await getBatchItems(created.id);
  const items = itemsBody.data ?? [];

  const cancelledItems = items.filter((item) => item.status === "cancelled");
  const succeededItems = items.filter((item) => item.status === "succeeded");
  const pendingItems = items.filter((item) => item.status === "pending");

  console.log("");
  console.log("Final batch:");
  console.log(`  status:          ${finalBatch.status}`);
  console.log(`  succeeded_items: ${finalBatch.succeeded_items}`);
  console.log(`  failed_items:    ${finalBatch.failed_items}`);
  console.log("");
  console.log("Items:");
  console.log(`  cancelled: ${cancelledItems.length}`);
  console.log(`  succeeded: ${succeededItems.length}`);
  console.log(`  pending:   ${pendingItems.length}`);

  for (const item of items.slice(0, 5)) {
    console.log(
      `  [${item.index}] status=${item.status} attempt_count=${item.attempt_count ?? 0} error=${item.error_code ?? "-"}`
    );
  }

  const ok =
    finalBatch.status === "cancelled" &&
    cancelledItems.length >= BATCH_ITEM_COUNT - succeededItems.length &&
    pendingItems.length === 0 &&
    succeededItems.length === 0;

  if (!ok) {
    console.error("");
    console.error(
      "Cancel test failed: expected cancelled batch with no pending/succeeded items."
    );
    process.exit(1);
  }

  console.log("");
  console.log("Cancel test passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
