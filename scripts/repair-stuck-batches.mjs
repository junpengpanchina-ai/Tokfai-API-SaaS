#!/usr/bin/env node
/**
 * P763 — Repair batches stuck in pending/running.
 *
 * Marks timed-out items failed and re-aggregates batch status. Does not debit credits.
 *
 * Usage (from repo root):
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/repair-stuck-batches.mjs
 *
 * Optional env:
 *   STUCK_BATCH_MS          default 900000 (TOKFAI_BATCH_MAX_RUNTIME_MS)
 *   STUCK_ITEM_MS           default 180000 (TOKFAI_BATCH_ITEM_TIMEOUT_MS)
 *   STUCK_ITEM_MS           default 180000 (TOKFAI_BATCH_ITEM_TIMEOUT_MS)
 *   DRY_RUN                 default false — set to 1 to preview only
 *   TOKFAI_REDIS_URL        optional — when set with repair lock checks
 *   TOKFAI_REDIS_ENABLED    optional — set to true to skip batches with active Redis lock
 *   TOKFAI_REDIS_KEY_PREFIX default tokfai
 */

import { createClient as createSupabaseClient } from "../apps/dmit-api/node_modules/@supabase/supabase-js/dist/index.mjs";
import { createClient as createRedisClient } from "../apps/dmit-api/node_modules/redis/dist/index.mjs";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const REDIS_URL = process.env.TOKFAI_REDIS_URL ?? "";
const REDIS_ENABLED =
  process.env.TOKFAI_REDIS_ENABLED === "1" ||
  process.env.TOKFAI_REDIS_ENABLED === "true";
const REDIS_KEY_PREFIX = process.env.TOKFAI_REDIS_KEY_PREFIX ?? "tokfai";
const STUCK_BATCH_MS = Math.max(
  60_000,
  parseInt(process.env.STUCK_BATCH_MS ?? "900000", 10) || 900_000
);
const STUCK_ITEM_MS = Math.max(
  30_000,
  parseInt(process.env.STUCK_ITEM_MS ?? "180000", 10) || 180_000
);
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

const BATCH_ITEM_TIMEOUT_CODE = "batch_item_timeout";
const BATCH_CANCELLED_BY_TIMEOUT_CODE = "cancelled_by_timeout";

function requireEnv() {
  if (!SUPABASE_URL.startsWith("http")) {
    console.error("Set SUPABASE_URL before running this script.");
    process.exit(1);
  }
  if (!SERVICE_ROLE_KEY || SERVICE_ROLE_KEY.length < 20) {
    console.error("Set SUPABASE_SERVICE_ROLE_KEY before running this script.");
    process.exit(1);
  }
}

function roundCreditAmount(amount) {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.ceil(amount * 1_000_000) / 1_000_000;
}

function countItems(items) {
  let succeeded = 0;
  let failed = 0;
  let creditsCharged = 0;
  let terminal = 0;

  for (const item of items) {
    if (item.status === "succeeded") {
      succeeded += 1;
      terminal += 1;
      creditsCharged += Number(item.credits_charged ?? 0);
    } else if (item.status === "failed" || item.status === "cancelled") {
      failed += 1;
      terminal += 1;
    }
  }

  return { succeeded, failed, creditsCharged, terminal };
}

function computeBatchStatus(counts, totalItems, batchCancelled) {
  const { succeeded, failed, terminal } = counts;

  if (terminal < totalItems) {
    return batchCancelled ? "cancelled" : "running";
  }

  if (batchCancelled) {
    return succeeded === 0 ? "cancelled" : "partial_failed";
  }

  if (succeeded === totalItems) return "completed";
  if (failed === totalItems) return "failed";
  return "partial_failed";
}

async function finalizeBatch(supabase, batchId, batchStatus) {
  const { data: items, error } = await supabase
    .from("chat_batch_items")
    .select("status, credits_charged")
    .eq("batch_id", batchId);

  if (error || !items) {
    console.error(`  finalize failed: ${error?.message ?? "no items"}`);
    return;
  }

  const counts = countItems(items);
  const batchCancelled = batchStatus === "cancelled";
  const allTerminal = counts.terminal === items.length;
  const status = computeBatchStatus(counts, items.length, batchCancelled);
  const now = new Date().toISOString();

  if (DRY_RUN) {
    console.log(
      `  [dry-run] would finalize status=${status} succeeded=${counts.succeeded} failed=${counts.failed}`
    );
    return;
  }

  await supabase
    .from("chat_batches")
    .update({
      status,
      succeeded_items: counts.succeeded,
      failed_items: counts.failed,
      credits_charged: roundCreditAmount(counts.creditsCharged),
      completed_at: allTerminal ? now : null,
      updated_at: now,
    })
    .eq("id", batchId);
}

async function repairBatch(supabase, redis, batch) {
  const batchAgeMs = batch.started_at
    ? Date.now() - new Date(batch.started_at).getTime()
    : Date.now() - new Date(batch.created_at).getTime();

  if (batchAgeMs < STUCK_BATCH_MS) {
    return false;
  }

  if (redis) {
    const lockKey = `${REDIS_KEY_PREFIX}:batch:lock:${batch.id}`;
    const held = await redis.exists(lockKey);
    if (held === 1) {
      console.log(`  skip batch ${batch.id}: redis lock held by active worker`);
      return false;
    }
  }

  console.log(
    `Repair batch ${batch.id} status=${batch.status} age_ms=${batchAgeMs}`
  );

  const { data: items, error } = await supabase
    .from("chat_batch_items")
    .select("id, status, started_at")
    .eq("batch_id", batch.id);

  if (error || !items) {
    console.error(`  load items failed: ${error?.message ?? "missing"}`);
    return false;
  }

  const now = new Date().toISOString();
  let repairedItems = 0;

  for (const item of items) {
    if (!["pending", "running", "cancel_requested"].includes(item.status)) {
      continue;
    }

    const itemAgeMs = item.started_at
      ? Date.now() - new Date(item.started_at).getTime()
      : batchAgeMs;

    const shouldFail =
      item.status === "pending"
        ? true
        : itemAgeMs >= STUCK_ITEM_MS;

    if (!shouldFail) continue;

    const errorCode =
      item.status === "pending"
        ? BATCH_CANCELLED_BY_TIMEOUT_CODE
        : BATCH_ITEM_TIMEOUT_CODE;
    const errorMessage =
      item.status === "pending"
        ? "Batch exceeded maximum runtime (repair)."
        : "Batch item exceeded maximum runtime (repair).";

    if (DRY_RUN) {
      console.log(
        `  [dry-run] would fail item ${item.id} status=${item.status} code=${errorCode}`
      );
    } else {
      await supabase
        .from("chat_batch_items")
        .update({
          status: "failed",
          error_code: errorCode,
          error_message: errorMessage,
          credits_charged: 0,
          completed_at: now,
          updated_at: now,
        })
        .eq("id", item.id)
        .in("status", ["pending", "running", "cancel_requested"]);
    }

    repairedItems += 1;
  }

  if (repairedItems > 0 || batch.status !== "cancelled") {
    await finalizeBatch(supabase, batch.id, batch.status);
    console.log(`  repaired_items=${repairedItems}`);
    return true;
  }

  return false;
}

async function main() {
  requireEnv();

  const supabase = createSupabaseClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let redis = null;
  if (REDIS_ENABLED && REDIS_URL) {
    try {
      redis = createRedisClient({ url: REDIS_URL });
      await redis.connect();
      console.log("Redis lock checks enabled for repair.");
    } catch (err) {
      console.warn(
        `Redis unavailable for repair lock checks: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
      console.warn(
        "Continuing repair without lock checks — may conflict with an active worker."
      );
    }
  } else {
    console.log(
      "Redis lock checks disabled — repair may conflict with an active worker."
    );
  }

  const cutoff = new Date(Date.now() - STUCK_BATCH_MS).toISOString();

  console.log("=== P763/P764 repair stuck batches ===");
  console.log(`stuck_batch_ms: ${STUCK_BATCH_MS}`);
  console.log(`stuck_item_ms:  ${STUCK_ITEM_MS}`);
  console.log(`dry_run:        ${DRY_RUN}`);
  console.log(`cutoff:         ${cutoff}`);
  console.log("");

  const { data: batches, error } = await supabase
    .from("chat_batches")
    .select("id, status, started_at, created_at")
    .in("status", ["pending", "running"])
    .or(`started_at.lt.${cutoff},and(status.eq.pending,created_at.lt.${cutoff})`);

  if (error) {
    console.error("Failed to load stuck batches:", error.message);
    process.exit(1);
  }

  if (!batches?.length) {
    console.log("No stuck batches found.");
    return;
  }

  let repaired = 0;
  for (const batch of batches) {
    if (await repairBatch(supabase, redis, batch)) {
      repaired += 1;
    }
  }

  if (redis) {
    await redis.quit().catch(() => undefined);
  }

  console.log("");
  console.log(`Done. batches_scanned=${batches.length} batches_repaired=${repaired}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
