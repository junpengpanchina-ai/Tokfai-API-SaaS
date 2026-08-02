import { ApiError } from "../errors.js";
import { supabase } from "../supabase.js";
import type {
  ImageGenerationTaskInputSnapshot,
  ImageGenerationTaskRow,
  ImageGenerationTaskStatus,
} from "../types.js";
import {
  messagesForStatus,
  STATUS_PROGRESS,
  type ImageTaskStatus,
} from "./progressMessages.js";
import {
  IMAGE_SOFT_TIMEOUT_CODE,
  SOFT_TIMEOUT_MESSAGES,
} from "./imageTimeoutPolicy.js";

const IMAGE_ENDPOINT = "/v1/images/generations";

export function imageGenerationsEndpoint(): string {
  return IMAGE_ENDPOINT;
}

export async function insertImageTask(args: {
  requestId: string;
  userId: string;
  apiKeyId: string | null;
  tenantId: string | null;
  model: string;
  idempotencyKey: string | null;
  inputSnapshot: ImageGenerationTaskInputSnapshot;
  mode: string;
  promptMode: string;
}): Promise<ImageGenerationTaskRow> {
  const msgs = messagesForStatus("queued");
  const { data, error } = await supabase()
    .from("image_generation_tasks")
    .insert({
      request_id: args.requestId,
      user_id: args.userId,
      api_key_id: args.apiKeyId,
      tenant_id: args.tenantId,
      model: args.model,
      status: "queued",
      progress: STATUS_PROGRESS.queued,
      message_en: msgs.en,
      message_zh: msgs.zh,
      idempotency_key: args.idempotencyKey,
      endpoint: IMAGE_ENDPOINT,
      input_snapshot: args.inputSnapshot,
      mode: args.mode,
      prompt_mode: args.promptMode,
      billing_status: "pending",
    })
    .select("*")
    .single();

  if (error || !data) {
    throw ApiError.internal(
      `Failed to create image task: ${error?.message ?? "unknown"}`,
      "server_error"
    );
  }

  return data as ImageGenerationTaskRow;
}

export async function lookupImageTaskByIdempotency(args: {
  apiKeyId: string | null;
  idempotencyKey: string | null;
}): Promise<ImageGenerationTaskRow | null> {
  if (!args.apiKeyId || !args.idempotencyKey) return null;

  const { data, error } = await supabase()
    .from("image_generation_tasks")
    .select("*")
    .eq("api_key_id", args.apiKeyId)
    .eq("idempotency_key", args.idempotencyKey)
    .eq("endpoint", IMAGE_ENDPOINT)
    .maybeSingle();

  if (error || !data) return null;
  return data as ImageGenerationTaskRow;
}

/**
 * Owner lookup: user_id from auth; tenant_id from API key / login host — never from query.
 */
export async function loadOwnedImageTask(args: {
  requestId: string;
  userId: string;
  tenantId: string | null;
}): Promise<ImageGenerationTaskRow> {
  let query = supabase()
    .from("image_generation_tasks")
    .select("*")
    .eq("request_id", args.requestId)
    .eq("user_id", args.userId);

  if (args.tenantId) {
    query = query.eq("tenant_id", args.tenantId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw ApiError.internal(
      `Failed to load image task: ${error.message}`,
      "server_error"
    );
  }

  if (!data) {
    throw ApiError.notFound("Image generation not found.", "not_found");
  }

  return data as ImageGenerationTaskRow;
}

export async function loadImageTaskByRequestId(
  requestId: string
): Promise<ImageGenerationTaskRow | null> {
  const { data, error } = await supabase()
    .from("image_generation_tasks")
    .select("*")
    .eq("request_id", requestId)
    .maybeSingle();

  if (error || !data) return null;
  return data as ImageGenerationTaskRow;
}

export async function updateImageTaskProgress(args: {
  requestId: string;
  status: ImageTaskStatus;
  progress?: number;
  extra?: Record<string, unknown>;
}): Promise<void> {
  const msgs = messagesForStatus(args.status);
  const progress =
    args.progress ?? STATUS_PROGRESS[args.status as ImageGenerationTaskStatus];
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: args.status,
    progress,
    message_en: msgs.en,
    message_zh: msgs.zh,
    updated_at: now,
    ...args.extra,
  };

  if (args.status !== "queued" && !args.extra?.started_at) {
    // Set started_at only when first leaving queued (best-effort).
  }

  const { error } = await supabase()
    .from("image_generation_tasks")
    .update(patch)
    .eq("request_id", args.requestId)
    .in("status", [
      "queued",
      "validating",
      "billing_check",
      "requesting_model",
      "generating",
      "saving_result",
    ]);

  if (error) {
    // Non-fatal for mid-flight progress; worker will fail loudly on terminal updates.
  }
}

export async function markImageTaskStarted(requestId: string): Promise<boolean> {
  const now = new Date().toISOString();
  const msgs = messagesForStatus("validating");
  const { data, error } = await supabase()
    .from("image_generation_tasks")
    .update({
      status: "validating",
      progress: STATUS_PROGRESS.validating,
      message_en: msgs.en,
      message_zh: msgs.zh,
      started_at: now,
      updated_at: now,
    })
    .eq("request_id", requestId)
    .eq("status", "queued")
    .select("id")
    .maybeSingle();

  if (error) return false;
  return Boolean(data);
}

export async function finalizeImageTaskSuccess(args: {
  requestId: string;
  resultData: Array<{ url: string; revised_prompt?: string | null }>;
  creditsCharged: number;
  usage: Record<string, unknown>;
  upstreamId: string | null;
  mode: string;
  promptMode: string;
  reconcileResult?: string | null;
}): Promise<void> {
  const now = new Date().toISOString();
  const msgs = messagesForStatus("completed");
  const { error } = await supabase()
    .from("image_generation_tasks")
    .update({
      status: "completed",
      progress: 100,
      message_en: msgs.en,
      message_zh: msgs.zh,
      result_data: args.resultData,
      usage: args.usage,
      credits_charged: args.creditsCharged,
      billing_status: args.creditsCharged > 0 ? "charged" : "not_billable",
      upstream_id: args.upstreamId,
      provider_task_id: args.upstreamId,
      provider_status: "completed",
      error_code: null,
      error_message: null,
      reconcile_status: "reconciled",
      reconcile_result: args.reconcileResult ?? "success",
      reconciled_at: now,
      orphan_cost_flags: {},
      mode: args.mode,
      prompt_mode: args.promptMode,
      completed_at: now,
      updated_at: now,
    })
    .eq("request_id", args.requestId);

  if (error) {
    throw ApiError.internal(
      `Failed to finalize image task: ${error.message}`,
      "server_error"
    );
  }
}

export async function finalizeImageTaskFailure(args: {
  requestId: string;
  status: "failed" | "retryable_timeout";
  errorCode: string;
  errorMessage: string;
  reconcileResult?: string | null;
  keepReconcilePending?: boolean;
  usage?: Record<string, unknown>;
}): Promise<void> {
  const now = new Date().toISOString();
  const msgs = messagesForStatus(args.status);
  const progress = STATUS_PROGRESS[args.status];
  const keepPending = Boolean(args.keepReconcilePending);
  const usage: Record<string, unknown> = {
    ...(args.usage && typeof args.usage === "object" ? args.usage : {}),
    credits_charged: 0,
  };
  const { error } = await supabase()
    .from("image_generation_tasks")
    .update({
      status: args.status,
      progress,
      message_en: msgs.en,
      message_zh: msgs.zh,
      error_code: args.errorCode,
      error_message: args.errorMessage || msgs.en,
      credits_charged: 0,
      usage,
      billing_status: "not_billable",
      reconcile_status: keepPending ? "pending" : "reconciled",
      reconcile_result:
        args.reconcileResult ??
        (args.status === "retryable_timeout" ? "hard_timeout" : "provider_failed"),
      reconciled_at: keepPending ? null : now,
      completed_at: now,
      updated_at: now,
    })
    .eq("request_id", args.requestId)
    .in("status", [
      "queued",
      "validating",
      "billing_check",
      "requesting_model",
      "generating",
      "saving_result",
      // P961: allow reconcile to re-terminalize from soft-timeout-era hard stop
      "retryable_timeout",
    ]);

  if (error) {
    // Best-effort; avoid throwing over double-finalize races.
  }
}

/**
 * P957 — Soft wait window exceeded while upstream may still be running.
 * Keeps task in-flight so poll can continue; not billable; not terminal.
 * P961 — Also marks reconcile_status=pending for background orphan-cost guard.
 */
export async function markImageTaskWaitWindowExceeded(
  requestId: string
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase()
    .from("image_generation_tasks")
    .update({
      error_code: IMAGE_SOFT_TIMEOUT_CODE,
      error_message:
        "Image generation is still in progress past the wait window. Poll again with task_id. Not billed yet.",
      message_en: SOFT_TIMEOUT_MESSAGES.en,
      message_zh: SOFT_TIMEOUT_MESSAGES.zh,
      reconcile_status: "pending",
      updated_at: now,
    })
    .eq("request_id", requestId)
    .in("status", [
      "queued",
      "validating",
      "billing_check",
      "requesting_model",
      "generating",
      "saving_result",
    ]);

  if (error) {
    // Non-fatal — publicResponse also derives soft timeout from created_at age.
  }
}

/**
 * P961 — Persist provider task ids as soon as upstream accepts the job.
 * Never expose these ids on the public poll response.
 */
export async function markImageTaskUpstreamSubmitted(args: {
  requestId: string;
  providerTaskId: string;
  upstreamRequestId?: string | null;
  providerStatus?: string | null;
}): Promise<void> {
  const now = new Date().toISOString();
  const providerTaskId = args.providerTaskId.trim();
  if (!providerTaskId) return;

  const upstreamRequestId =
    typeof args.upstreamRequestId === "string" && args.upstreamRequestId.trim()
      ? args.upstreamRequestId.trim()
      : providerTaskId;

  const { error } = await supabase()
    .from("image_generation_tasks")
    .update({
      upstream_id: providerTaskId,
      provider_task_id: providerTaskId,
      upstream_request_id: upstreamRequestId,
      upstream_submitted_at: now,
      provider_status: args.providerStatus ?? "pending",
      reconcile_status: "pending",
      updated_at: now,
    })
    .eq("request_id", args.requestId)
    .in("status", [
      "queued",
      "validating",
      "billing_check",
      "requesting_model",
      "generating",
      "saving_result",
    ]);

  if (error) {
    // Best-effort — worker still holds ids in memory for success finalize.
  }
}

/** P961 — Mark task eligible for background reconcile (soft/hard timeout paths). */
export async function markImageTaskReconcilePending(
  requestId: string
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase()
    .from("image_generation_tasks")
    .update({
      reconcile_status: "pending",
      updated_at: now,
    })
    .eq("request_id", requestId)
    .neq("reconcile_status", "reconciled");

  if (error) {
    // Non-fatal
  }
}

export async function updateImageTaskReconcileMeta(args: {
  requestId: string;
  reconcileStatus: string;
  reconcileResult?: string | null;
  providerStatus?: string | null;
  orphanCostFlags?: Record<string, unknown> | null;
  markReconciledAt?: boolean;
}): Promise<void> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    reconcile_status: args.reconcileStatus,
    updated_at: now,
  };
  if (args.reconcileResult !== undefined) {
    patch.reconcile_result = args.reconcileResult;
  }
  if (args.providerStatus !== undefined) {
    patch.provider_status = args.providerStatus;
  }
  if (args.orphanCostFlags !== undefined) {
    patch.orphan_cost_flags = args.orphanCostFlags ?? {};
  }
  if (args.markReconciledAt) {
    patch.reconciled_at = now;
  }

  const { error } = await supabase()
    .from("image_generation_tasks")
    .update(patch)
    .eq("request_id", args.requestId);

  if (error) {
    // Best-effort
  }
}

/** Tasks needing P961 background reconcile (has provider id + pending). */
export async function listImageTasksNeedingReconcile(limit = 25): Promise<
  ImageGenerationTaskRow[]
> {
  const { data, error } = await supabase()
    .from("image_generation_tasks")
    .select("*")
    .eq("reconcile_status", "pending")
    .or("provider_task_id.not.is.null,upstream_id.not.is.null")
    .order("updated_at", { ascending: true })
    .limit(Math.max(1, Math.min(limit, 100)));

  if (error || !data) return [];
  return data as ImageGenerationTaskRow[];
}

export function parseInputSnapshot(
  value: unknown
): ImageGenerationTaskInputSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.prompt !== "string") return null;
  if (typeof row.aspectRatio !== "string") return null;
  if (typeof row.imageSize !== "string") return null;
  if (!Array.isArray(row.imageUrls)) return null;
  return {
    prompt: row.prompt,
    aspectRatio: row.aspectRatio,
    imageSize: row.imageSize,
    imageUrls: row.imageUrls.filter((u): u is string => typeof u === "string"),
    imageUrlSources: Array.isArray(row.imageUrlSources)
      ? row.imageUrlSources.filter((u): u is string => typeof u === "string")
      : [],
    mode: row.mode === "reference_edit" ? "reference_edit" : "text_to_image",
    promptMode:
      row.promptMode === "subject_preserve" ? "subject_preserve" : "normal",
    imagesCount: Number(row.imagesCount ?? 0),
    imageSourceType: String(row.imageSourceType ?? "none"),
    imageSourceTypes: Array.isArray(row.imageSourceTypes)
      ? row.imageSourceTypes.filter((u): u is string => typeof u === "string")
      : [],
    hasBlobBlocked: Boolean(row.hasBlobBlocked),
    n: Number(row.n ?? 1),
    responseFormat: String(row.responseFormat ?? "url"),
    requestedModel: String(row.requestedModel ?? ""),
  };
}
