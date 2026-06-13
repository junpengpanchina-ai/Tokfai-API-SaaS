import { log } from "../logger.js";
import { supabase } from "../supabase.js";
import type { ChatBatchStatus } from "../types.js";

type ItemStatusRow = {
  status: string;
  credits_charged: string | number | null;
};

export async function finalizeBatch(
  batchId: string,
  forcedStatus?: ChatBatchStatus
): Promise<void> {
  const { data: batch, error: batchError } = await supabase()
    .from("chat_batches")
    .select("status")
    .eq("id", batchId)
    .maybeSingle();

  if (batchError) {
    log.error("batch_finalize_load_failed", {
      batchId,
      message: batchError.message,
    });
    return;
  }

  const { data: items, error } = await supabase()
    .from("chat_batch_items")
    .select("status, credits_charged")
    .eq("batch_id", batchId);

  if (error || !items) {
    log.error("batch_finalize_failed", {
      batchId,
      message: error?.message ?? "items missing",
    });
    return;
  }

  const counts = countItemStatuses(items as ItemStatusRow[]);
  const batchCancelled = batch?.status === "cancelled";
  const allTerminal = counts.terminal === items.length;

  let status: ChatBatchStatus;
  if (forcedStatus) {
    status = forcedStatus;
  } else if (batchCancelled && !allTerminal) {
    status = "cancelled";
  } else {
    status = computeBatchStatus(counts, items.length, batchCancelled);
  }

  const completedAt = new Date().toISOString();
  await supabase()
    .from("chat_batches")
    .update({
      status,
      succeeded_items: counts.succeeded,
      failed_items: counts.failed,
      credits_charged: roundCreditAmount(counts.creditsCharged),
      completed_at: allTerminal ? completedAt : null,
      updated_at: completedAt,
    })
    .eq("id", batchId);
}

export function countItemStatuses(items: ItemStatusRow[]): {
  succeeded: number;
  failed: number;
  creditsCharged: number;
  terminal: number;
} {
  let succeeded = 0;
  let failed = 0;
  let creditsCharged = 0;
  let terminal = 0;

  for (const item of items) {
    if (item.status === "succeeded") {
      succeeded += 1;
      terminal += 1;
      creditsCharged += toNumber(item.credits_charged);
    } else if (
      item.status === "failed" ||
      item.status === "cancelled"
    ) {
      failed += 1;
      terminal += 1;
    } else if (item.status === "cancel_requested" || item.status === "running") {
      // In-flight or orphaned — not terminal yet.
    } else if (item.status === "pending") {
      // Not terminal yet.
    }
  }

  return { succeeded, failed, creditsCharged, terminal };
}

export function computeBatchStatus(
  counts: {
    succeeded: number;
    failed: number;
    terminal: number;
  },
  totalItems: number,
  batchCancelled: boolean
): ChatBatchStatus {
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

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

function roundCreditAmount(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.ceil(amount * 1_000_000) / 1_000_000;
}
