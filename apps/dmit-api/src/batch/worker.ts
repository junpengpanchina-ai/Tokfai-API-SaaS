import { generateRequestId } from "../middleware/requestId.js";
import type { ChatCaller } from "../middleware/chatAuth.js";
import { log } from "../logger.js";
import { env } from "../env.js";
import { supabase } from "../supabase.js";
import {
  ChatCompletionRequestSchema,
  executeChatCompletion,
} from "../lib/executeChatCompletion.js";
import { batchItemIdempotencyKey } from "../lib/idempotency.js";
import type {
  ChatBatchItemRow,
  ChatBatchRow,
  ChatBatchStatus,
} from "../types.js";
import {
  BATCH_CANCELLED_BY_TIMEOUT_CODE,
  BATCH_ITEM_TIMEOUT_CODE,
  RETRYABLE_BATCH_ERROR_CODES,
} from "./constants.js";
import { finalizeBatch } from "./finalize.js";
import { releaseBatchLock, tryAcquireBatchLock } from "./lock.js";

const activeBatches = new Set<string>();

export function enqueueBatchProcessing(batchId: string): void {
  void enqueueBatchProcessingAsync(batchId);
}

async function enqueueBatchProcessingAsync(batchId: string): Promise<void> {
  if (activeBatches.has(batchId)) return;

  const lockAcquired = await tryAcquireBatchLock(batchId);
  if (!lockAcquired) {
    log.info("batch_lock_skip", { batchId });
    return;
  }

  activeBatches.add(batchId);

  try {
    await processBatch(batchId);
  } catch (err) {
    log.error("batch_worker_failed", {
      batchId,
      message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    activeBatches.delete(batchId);
    await releaseBatchLock(batchId);
  }
}

async function processBatch(batchId: string): Promise<void> {
  const batch = await loadBatch(batchId);
  if (!batch || !isProcessableBatchStatus(batch.status)) {
    return;
  }

  if (batch.status === "cancelled") {
    await finalizeBatch(batchId);
    return;
  }

  if (batch.status === "pending") {
    const now = new Date().toISOString();
    const { data: updated } = await supabase()
      .from("chat_batches")
      .update({
        status: "running",
        started_at: now,
        updated_at: now,
      })
      .eq("id", batchId)
      .eq("status", "pending")
      .select("*")
      .maybeSingle();

    if (!updated) {
      const latest = await loadBatch(batchId);
      if (latest?.status === "cancelled") {
        await finalizeBatch(batchId);
      }
      return;
    }

    batch.status = "running";
    batch.started_at = now;
  }

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

  let tenantId: string | null = null;
  if (batch.api_key_id) {
    const { data: keyRow } = await supabase()
      .from("api_keys")
      .select("tenant_id")
      .eq("id", batch.api_key_id)
      .maybeSingle();
    tenantId =
      typeof keyRow?.tenant_id === "string" ? keyRow.tenant_id : null;
  }

  const caller: ChatCaller = {
    userId: batch.user_id,
    apiKeyId: batch.api_key_id,
    tenantId,
  };

  const pendingItems = (items as ChatBatchItemRow[]).filter(
    (item) => item.status === "pending"
  );

  await runPool(
    pendingItems,
    env.TOKFAI_BATCH_ITEM_CONCURRENCY,
    async (item) => {
      try {
        await processBatchItem({
          batchId,
          batch,
          item,
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
          attemptCount: 0,
          errorCode: "server_error",
          errorMessage: "Internal error.",
        });
      }
    }
  );

  await failTimedOutNonTerminalItems(batchId, batch);
  await finalizeBatch(batchId);
}

async function processBatchItem(args: {
  batchId: string;
  batch: ChatBatchRow;
  item: ChatBatchItemRow;
  caller: ChatCaller;
}): Promise<void> {
  const { batchId, batch, item, caller } = args;
  const maxAttempts = 1 + env.TOKFAI_BATCH_ITEM_MAX_RETRIES;

  const skipReason = await getItemSkipReason(batchId, batch);
  if (skipReason) {
    await markItemTerminal(item.id, skipReason);
    return;
  }

  const parsed = ChatCompletionRequestSchema.safeParse({
    ...(item.input as Record<string, unknown>),
    model: batch.requested_model,
    stream: false,
  });

  if (!parsed.success) {
    await markItemFailed(item.id, {
      requestId: generateRequestId(),
      attemptCount: 1,
      errorCode: "invalid_request_error",
      errorMessage: "Invalid batch item input.",
    });
    return;
  }

  let lastRequestId = generateRequestId();
  let lastErrorCode = "server_error";
  let lastErrorMessage = "Request failed.";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const skip = await getItemSkipReason(batchId, batch);
    if (skip) {
      await markItemTerminal(item.id, skip);
      return;
    }

    lastRequestId = generateRequestId();
    const startedAt = new Date().toISOString();

    const { data: claimed, error: claimError } = await supabase()
      .from("chat_batch_items")
      .update({
        status: "running",
        request_id: lastRequestId,
        attempt_count: attempt,
        started_at: item.started_at ?? startedAt,
        updated_at: startedAt,
      })
      .eq("id", item.id)
      .eq("status", "pending")
      .select("id");

    if (claimError || !claimed?.length) {
      return;
    }

    const result = await runWithItemTimeout(
      executeChatCompletion({
        caller,
        requestId: lastRequestId,
        body: parsed.data,
        route: "/v1/batches/chat",
        idempotencyKey: batchItemIdempotencyKey(item.id),
      }),
      env.TOKFAI_BATCH_ITEM_TIMEOUT_MS
    );

    if (result.kind === "timeout") {
      lastErrorCode = BATCH_ITEM_TIMEOUT_CODE;
      lastErrorMessage = "Batch item exceeded maximum runtime.";
      log.warn("batch_item_timeout", {
        batchId,
        itemId: item.id,
        attempt,
        timeoutMs: env.TOKFAI_BATCH_ITEM_TIMEOUT_MS,
      });
    } else if (result.value.ok) {
      const completedAt = new Date().toISOString();
      await supabase()
        .from("chat_batch_items")
        .update({
          status: "succeeded",
          output: result.value.response,
          credits_charged: result.value.creditsCharged,
          error_code: null,
          error_message: null,
          completed_at: completedAt,
          updated_at: completedAt,
        })
        .eq("id", item.id);
      return;
    } else {
      lastErrorCode = result.value.errorCode;
      lastErrorMessage = result.value.errorMessage;
    }

    const canRetry =
      attempt < maxAttempts &&
      RETRYABLE_BATCH_ERROR_CODES.has(lastErrorCode);

    if (canRetry) {
      log.info("batch_item_retry", {
        batchId,
        itemId: item.id,
        attempt,
        nextAttempt: attempt + 1,
        errorCode: lastErrorCode,
      });
      await supabase()
        .from("chat_batch_items")
        .update({
          status: "pending",
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id)
        .eq("status", "running");
      continue;
    }

    await markItemFailed(item.id, {
      requestId: lastRequestId,
      attemptCount: attempt,
      errorCode: lastErrorCode,
      errorMessage: lastErrorMessage,
    });
    return;
  }
}

type ItemSkipReason = {
  errorCode: string;
  errorMessage: string;
};

async function getItemSkipReason(
  batchId: string,
  batch: ChatBatchRow
): Promise<ItemSkipReason | null> {
  const latest = await loadBatch(batchId);
  if (!latest) {
    return {
      errorCode: "batch_not_found",
      errorMessage: "Batch not found.",
    };
  }

  if (latest.status === "cancelled") {
    return {
      errorCode: "batch_cancelled",
      errorMessage: "Batch cancelled by user.",
    };
  }

  if (isBatchRuntimeExceeded(latest)) {
    return {
      errorCode: BATCH_CANCELLED_BY_TIMEOUT_CODE,
      errorMessage: "Batch exceeded maximum runtime.",
    };
  }

  return null;
}

function isBatchRuntimeExceeded(batch: ChatBatchRow): boolean {
  if (!batch.started_at) return false;
  const elapsed = Date.now() - new Date(batch.started_at).getTime();
  return elapsed > env.TOKFAI_BATCH_MAX_RUNTIME_MS;
}

async function failTimedOutNonTerminalItems(
  batchId: string,
  batch: ChatBatchRow
): Promise<void> {
  if (!isBatchRuntimeExceeded(batch)) {
    const latest = await loadBatch(batchId);
    if (!latest || !isBatchRuntimeExceeded(latest)) return;
  }

  const now = new Date().toISOString();
  const { data: staleItems } = await supabase()
    .from("chat_batch_items")
    .select("id, status, started_at")
    .eq("batch_id", batchId)
    .in("status", ["pending", "running", "cancel_requested"]);

  if (!staleItems?.length) return;

  for (const item of staleItems) {
    const itemTimedOut =
      item.status === "running" || item.status === "cancel_requested"
        ? item.started_at &&
          Date.now() - new Date(item.started_at).getTime() >
            env.TOKFAI_BATCH_ITEM_TIMEOUT_MS
        : true;

    if (!itemTimedOut) continue;

    await supabase()
      .from("chat_batch_items")
      .update({
        status: "failed",
        error_code:
          item.status === "pending"
            ? BATCH_CANCELLED_BY_TIMEOUT_CODE
            : BATCH_ITEM_TIMEOUT_CODE,
        error_message:
          item.status === "pending"
            ? "Batch exceeded maximum runtime."
            : "Batch item exceeded maximum runtime.",
        credits_charged: 0,
        completed_at: now,
        updated_at: now,
      })
      .eq("id", item.id)
      .in("status", ["pending", "running", "cancel_requested"]);
  }
}

async function markItemTerminal(
  itemId: string,
  reason: ItemSkipReason
): Promise<void> {
  const now = new Date().toISOString();
  const status =
    reason.errorCode === "batch_cancelled" ? "cancelled" : "failed";

  await supabase()
    .from("chat_batch_items")
    .update({
      status,
      error_code: reason.errorCode,
      error_message: reason.errorMessage,
      credits_charged: 0,
      completed_at: now,
      updated_at: now,
    })
    .eq("id", itemId)
    .in("status", ["pending", "running"]);
}

async function markItemFailed(
  itemId: string,
  args: {
    requestId: string;
    attemptCount: number;
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
      attempt_count: args.attemptCount,
      error_code: args.errorCode,
      error_message: args.errorMessage,
      credits_charged: 0,
      completed_at: completedAt,
      updated_at: completedAt,
    })
    .eq("id", itemId);
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

type TimedResult<T> =
  | { kind: "ok"; value: T }
  | { kind: "timeout" };

async function runWithItemTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<TimedResult<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const result = await Promise.race([
      promise.then((value) => ({ kind: "ok" as const, value })),
      new Promise<{ kind: "timeout" }>((resolve) => {
        timer = setTimeout(() => resolve({ kind: "timeout" }), timeoutMs);
      }),
    ]);
    return result;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function isProcessableBatchStatus(status: ChatBatchStatus): boolean {
  return status === "pending" || status === "running";
}
