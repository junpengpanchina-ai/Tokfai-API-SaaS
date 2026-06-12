import { generateRequestId } from "../middleware/requestId.js";
import type { ChatCaller } from "../middleware/chatAuth.js";
import { log } from "../logger.js";
import { env } from "../env.js";
import { supabase } from "../supabase.js";
import {
  ChatCompletionRequestSchema,
  executeChatCompletion,
} from "../lib/executeChatCompletion.js";
import type {
  ChatBatchItemRow,
  ChatBatchRow,
  ChatBatchStatus,
} from "../types.js";

const activeBatches = new Set<string>();

export function enqueueBatchProcessing(batchId: string): void {
  if (activeBatches.has(batchId)) return;
  activeBatches.add(batchId);

  void processBatch(batchId)
    .catch((err) => {
      log.error("batch_worker_failed", {
        batchId,
        message: err instanceof Error ? err.message : String(err),
      });
    })
    .finally(() => {
      activeBatches.delete(batchId);
    });
}

async function processBatch(batchId: string): Promise<void> {
  const batch = await loadBatch(batchId);
  if (!batch || batch.status !== "pending") {
    return;
  }

  const now = new Date().toISOString();
  await supabase()
    .from("chat_batches")
    .update({
      status: "running",
      started_at: now,
      updated_at: now,
    })
    .eq("id", batchId)
    .eq("status", "pending");

  const { data: items, error: itemsError } = await supabase()
    .from("chat_batch_items")
    .select("*")
    .eq("batch_id", batchId)
    .order("index", { ascending: true });

  if (itemsError || !items?.length) {
    log.error("batch_items_load_failed", {
      batchId,
      message: itemsError?.message ?? "no items",
    });
    await finalizeBatch(batchId, "failed");
    return;
  }

  const caller: ChatCaller = {
    userId: batch.user_id,
    apiKeyId: batch.api_key_id,
  };

  await runPool(
    items as ChatBatchItemRow[],
    env.TOKFAI_BATCH_ITEM_CONCURRENCY,
    async (item) => {
      try {
        await processBatchItem({
          batch,
          item: item as ChatBatchItemRow,
          caller,
        });
      } catch (err) {
        log.error("batch_item_unhandled_error", {
          batchId,
          itemId: item.id,
          message: err instanceof Error ? err.message : String(err),
        });
        await markItemFailed(item.id, {
          requestId: generateRequestId(),
          errorCode: "server_error",
          errorMessage: "Internal error.",
        });
      }
    }
  );

  await finalizeBatch(batchId);
}

async function processBatchItem(args: {
  batch: ChatBatchRow;
  item: ChatBatchItemRow;
  caller: ChatCaller;
}): Promise<void> {
  const { batch, item, caller } = args;
  const requestId = generateRequestId();
  const startedAt = new Date().toISOString();

  await supabase()
    .from("chat_batch_items")
    .update({
      status: "running",
      request_id: requestId,
      started_at: startedAt,
      updated_at: startedAt,
    })
    .eq("id", item.id)
    .eq("status", "pending");

  const parsed = ChatCompletionRequestSchema.safeParse({
    ...(item.input as Record<string, unknown>),
    model: batch.requested_model,
    stream: false,
  });

  if (!parsed.success) {
    await markItemFailed(item.id, {
      requestId,
      errorCode: "invalid_request_error",
      errorMessage: "Invalid batch item input.",
    });
    return;
  }

  const result = await executeChatCompletion({
    caller,
    requestId,
    body: parsed.data,
    route: "/v1/batches/chat",
  });

  if (result.ok) {
    const completedAt = new Date().toISOString();
    await supabase()
      .from("chat_batch_items")
      .update({
        status: "succeeded",
        output: result.response,
        credits_charged: result.creditsCharged,
        error_code: null,
        error_message: null,
        completed_at: completedAt,
        updated_at: completedAt,
      })
      .eq("id", item.id);

    return;
  }

  await markItemFailed(item.id, {
    requestId,
    errorCode: result.errorCode,
    errorMessage: result.errorMessage,
  });
}

async function markItemFailed(
  itemId: string,
  args: {
    requestId: string;
    errorCode: string;
    errorMessage: string;
  }
): Promise<void> {
  const completedAt = new Date().toISOString();
  await supabase()
    .from("chat_batch_items")
    .update({
      status: "failed",
      request_id: args.requestId,
      error_code: args.errorCode,
      error_message: args.errorMessage,
      credits_charged: 0,
      completed_at: completedAt,
      updated_at: completedAt,
    })
    .eq("id", itemId);
}

async function finalizeBatch(
  batchId: string,
  forcedStatus?: ChatBatchStatus
): Promise<void> {
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

  let succeeded = 0;
  let failed = 0;
  let creditsCharged = 0;

  for (const item of items) {
    if (item.status === "succeeded") {
      succeeded += 1;
      creditsCharged += toNumber(item.credits_charged);
    } else if (item.status === "failed") {
      failed += 1;
    }
  }

  const status: ChatBatchStatus =
    forcedStatus ??
    (succeeded === items.length
      ? "completed"
      : failed === items.length
        ? "failed"
        : "partial_failed");

  const completedAt = new Date().toISOString();
  await supabase()
    .from("chat_batches")
    .update({
      status,
      succeeded_items: succeeded,
      failed_items: failed,
      credits_charged: roundCreditAmount(creditsCharged),
      completed_at: completedAt,
      updated_at: completedAt,
    })
    .eq("id", batchId);
}

async function loadBatch(batchId: string): Promise<ChatBatchRow | null> {
  const { data, error } = await supabase()
    .from("chat_batches")
    .select("*")
    .eq("id", batchId)
    .maybeSingle();

  if (error) {
    log.error("batch_load_failed", {
      batchId,
      message: error.message,
    });
    return null;
  }

  return data as ChatBatchRow | null;
}

async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;

  async function workerLoop(): Promise<void> {
    while (true) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      await worker(items[i]!);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => workerLoop()
  );
  await Promise.all(workers);
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
