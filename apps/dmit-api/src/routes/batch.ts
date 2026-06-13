import { Hono } from "hono";
import { z } from "zod";

import { ApiError } from "../errors.js";
import { env } from "../env.js";
import { requireApiKey } from "../middleware/apiKey.js";
import type { VerifiedApiKey } from "../auth/apiKey.js";
import { supabase } from "../supabase.js";
import { isModelAllowedForChat } from "../catalog/modelCatalog.js";
import { formatBatchId, parseBatchId } from "../batch/batchIds.js";
import { finalizeBatch } from "../batch/finalize.js";
import { enqueueBatchProcessing } from "../batch/worker.js";
import { BATCH_CANCELLED_CODE } from "../batch/constants.js";
import {
  ChatMessageSchema,
  ChatCompletionRequestSchema,
} from "../lib/executeChatCompletion.js";
import type { ChatBatchItemRow, ChatBatchRow } from "../types.js";

const BatchItemInputSchema = z
  .object({
    messages: z.array(ChatMessageSchema).min(1),
  })
  .passthrough();

const CreateBatchSchema = z.object({
  model: z.string().min(1),
  items: z.array(BatchItemInputSchema).min(1),
});

export const batchRoutes = new Hono();

batchRoutes.use("/v1/batches/*", requireApiKey);
batchRoutes.use("/v1/batches", requireApiKey);

batchRoutes.post("/v1/batches/chat", async (c) => {
  const apiKey = c.get("apiKey" as never) as VerifiedApiKey;

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw ApiError.badRequest("Invalid JSON body.", "invalid_request_error");
  }

  const parsed = CreateBatchSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest(
      "Invalid batch chat request.",
      "invalid_request_error"
    );
  }

  const { model, items } = parsed.data;

  if (items.length > env.TOKFAI_BATCH_MAX_ITEMS) {
    throw ApiError.badRequest(
      `Batch exceeds maximum of ${env.TOKFAI_BATCH_MAX_ITEMS} items.`,
      "batch_too_large"
    );
  }

  if (!(await isModelAllowedForChat(model))) {
    throw ApiError.notFound(
      `The model \`${model}\` does not exist.`,
      "model_not_found"
    );
  }

  for (const item of items) {
    const itemCheck = ChatCompletionRequestSchema.safeParse({
      ...item,
      model,
      stream: false,
    });
    if (!itemCheck.success) {
      throw ApiError.badRequest(
        "Invalid batch item: each item must include messages.",
        "invalid_request_error"
      );
    }
  }

  const now = new Date().toISOString();
  const { data: batch, error: batchError } = await supabase()
    .from("chat_batches")
    .insert({
      user_id: apiKey.userId,
      api_key_id: apiKey.apiKeyId,
      model,
      requested_model: model,
      status: "pending",
      total_items: items.length,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (batchError || !batch) {
    throw ApiError.internal(
      batchError?.message ?? "Failed to create batch.",
      "batch_create_failed"
    );
  }

  const itemRows = items.map((item, index) => ({
    batch_id: batch.id,
    index,
    status: "pending",
    input: item,
    created_at: now,
    updated_at: now,
  }));

  const { error: itemsError } = await supabase()
    .from("chat_batch_items")
    .insert(itemRows);

  if (itemsError) {
    await supabase().from("chat_batches").delete().eq("id", batch.id);
    throw ApiError.internal(
      itemsError.message,
      "batch_items_create_failed"
    );
  }

  enqueueBatchProcessing(batch.id);

  return c.json(formatBatchSummary(batch as ChatBatchRow), 202);
});

batchRoutes.get("/v1/batches/:id", async (c) => {
  const apiKey = c.get("apiKey" as never) as VerifiedApiKey;
  const batch = await loadOwnedBatch(c.req.param("id"), apiKey.userId);
  return c.json(formatBatchSummary(batch));
});

batchRoutes.get("/v1/batches/:id/items", async (c) => {
  const apiKey = c.get("apiKey" as never) as VerifiedApiKey;
  const batch = await loadOwnedBatch(c.req.param("id"), apiKey.userId);

  const limit = parseLimit(c.req.query("limit"), 50, 100);
  const offset = parseOffset(c.req.query("offset"));

  const { data: items, error, count } = await supabase()
    .from("chat_batch_items")
    .select("*", { count: "exact" })
    .eq("batch_id", batch.id)
    .order("index", { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    throw ApiError.internal(error.message, "batch_items_load_failed");
  }

  return c.json({
    object: "list",
    batch_id: formatBatchId(batch.id),
    data: (items ?? []).map(formatBatchItem),
    limit,
    offset,
    total: count ?? 0,
  });
});

batchRoutes.post("/v1/batches/:id/cancel", async (c) => {
  const apiKey = c.get("apiKey" as never) as VerifiedApiKey;
  const batch = await loadOwnedBatch(c.req.param("id"), apiKey.userId);

  if (batch.status !== "pending" && batch.status !== "running") {
    throw ApiError.badRequest(
      "Batch cannot be cancelled in its current state.",
      "batch_not_cancellable"
    );
  }

  const now = new Date().toISOString();

  const { error: batchError } = await supabase()
    .from("chat_batches")
    .update({
      status: "cancelled",
      updated_at: now,
    })
    .eq("id", batch.id)
    .in("status", ["pending", "running"]);

  if (batchError) {
    throw ApiError.internal(batchError.message, "batch_cancel_failed");
  }

  await supabase()
    .from("chat_batch_items")
    .update({
      status: "cancelled",
      error_code: BATCH_CANCELLED_CODE,
      error_message: "Batch cancelled by user.",
      credits_charged: 0,
      completed_at: now,
      updated_at: now,
    })
    .eq("batch_id", batch.id)
    .eq("status", "pending");

  await supabase()
    .from("chat_batch_items")
    .update({
      status: "cancel_requested",
      updated_at: now,
    })
    .eq("batch_id", batch.id)
    .eq("status", "running");

  if (batch.status === "pending") {
    await finalizeBatch(batch.id);
  }

  const { data: updated, error: reloadError } = await supabase()
    .from("chat_batches")
    .select("*")
    .eq("id", batch.id)
    .maybeSingle();

  if (reloadError || !updated) {
    throw ApiError.internal(
      reloadError?.message ?? "Failed to reload batch.",
      "batch_load_failed"
    );
  }

  return c.json(formatBatchSummary(updated as ChatBatchRow));
});

async function loadOwnedBatch(
  rawId: string,
  userId: string
): Promise<ChatBatchRow> {
  const batchId = parseBatchId(rawId);
  if (!batchId) {
    throw ApiError.notFound("Batch not found.", "batch_not_found");
  }

  const { data, error } = await supabase()
    .from("chat_batches")
    .select("*")
    .eq("id", batchId)
    .maybeSingle();

  if (error) {
    throw ApiError.internal(error.message, "batch_load_failed");
  }

  if (!data || data.user_id !== userId) {
    throw ApiError.notFound("Batch not found.", "batch_not_found");
  }

  return data as ChatBatchRow;
}

function formatBatchSummary(batch: ChatBatchRow) {
  return {
    id: formatBatchId(batch.id),
    object: "batch",
    status: batch.status,
    model: batch.model,
    requested_model: batch.requested_model,
    total_items: batch.total_items,
    succeeded_items: batch.succeeded_items,
    failed_items: batch.failed_items,
    credits_charged: toNumber(batch.credits_charged),
    created_at: batch.created_at,
    updated_at: batch.updated_at,
    started_at: batch.started_at,
    completed_at: batch.completed_at,
  };
}

function formatBatchItem(item: ChatBatchItemRow) {
  return {
    id: item.id,
    object: "batch_item",
    index: item.index,
    status: item.status,
    input: item.input,
    output: item.output,
    error_code: item.error_code,
    error_message: item.error_message,
    request_id: item.request_id,
    attempt_count: item.attempt_count ?? 0,
    credits_charged: toNumber(item.credits_charged),
    created_at: item.created_at,
    updated_at: item.updated_at,
    started_at: item.started_at,
    completed_at: item.completed_at,
  };
}

function parseLimit(raw: string | undefined, fallback: number, max: number): number {
  const value = raw ? parseInt(raw, 10) : fallback;
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(value, max);
}

function parseOffset(raw: string | undefined): number {
  const value = raw ? parseInt(raw, 10) : 0;
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}
