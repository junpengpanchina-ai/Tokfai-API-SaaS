import { priceCreditsForImage } from "../catalog/modelCatalog.js";
import { ApiError } from "../errors.js";
import { log } from "../logger.js";
import { supabase } from "../supabase.js";
import type {
  ImageGenerationTaskInputSnapshot,
  ImageGenerationTaskRow,
  UsageLogInsert,
} from "../types.js";
import { runImageGenerationWithPolling } from "../upstream/imageAsyncProvider.js";
import type { ImageUrlResolveSource } from "../upstream/imageUrlResolver.js";
import {
  finalizeImageTaskFailure,
  finalizeImageTaskSuccess,
  loadImageTaskByRequestId,
  markImageTaskStarted,
  parseInputSnapshot,
  updateImageTaskProgress,
} from "./tasksDb.js";

const IMAGE_LEDGER_REASON = "Image generation usage";
const activeTasks = new Set<string>();

const UPSTREAM_ERROR_CODES = new Set([
  "upstream_auth_error",
  "upstream_rate_limited",
  "upstream_error",
  "upstream_invalid_response",
  "upstream_timeout",
  "image_generation_timeout",
]);

export function enqueueImageGeneration(requestId: string): void {
  void processImageGeneration(requestId);
}

async function processImageGeneration(requestId: string): Promise<void> {
  if (activeTasks.has(requestId)) return;
  activeTasks.add(requestId);

  const startedAt = Date.now();

  try {
    const claimed = await markImageTaskStarted(requestId);
    if (!claimed) {
      const existing = await loadImageTaskByRequestId(requestId);
      if (!existing || existing.status !== "queued") return;
    }

    const task = await loadImageTaskByRequestId(requestId);
    if (!task) return;

    const input = parseInputSnapshot(task.input_snapshot);
    if (!input) {
      await failTask(task, "invalid_request_error", "Invalid task input.", startedAt);
      return;
    }

    await updateImageTaskProgress({
      requestId,
      status: "billing_check",
    });

    try {
      await assertHasCredits(task.user_id);
    } catch (err) {
      if (err instanceof ApiError) {
        await failTask(
          task,
          err.code ?? "insufficient_credits",
          safePublicMessage(err),
          startedAt
        );
        return;
      }
      throw err;
    }

    await updateImageTaskProgress({
      requestId,
      status: "requesting_model",
    });

    await updateImageTaskProgress({
      requestId,
      status: "generating",
    });

    let url: string;
    let upstreamId: string | null = null;

    try {
      const result = await runImageGenerationWithPolling({
        requestId,
        resolvedModel: task.model,
        prompt: input.prompt,
        aspectRatio: input.aspectRatio,
        imageSize: input.imageSize,
        imageUrls: input.imageUrls,
        imageUrlSources: input.imageUrlSources as ImageUrlResolveSource[],
        mode: input.mode,
        promptMode: input.promptMode,
      });
      url = result.url;
      upstreamId = result.upstreamId;
    } catch (err) {
      await handleGenerationError(task, err, startedAt);
      return;
    }

    await updateImageTaskProgress({
      requestId,
      status: "saving_result",
    });

    const creditsCharged = await priceCreditsForImage(
      task.model,
      task.tenant_id
    );

    try {
      await recordImageUsageAndDebit({
        user_id: task.user_id,
        api_key_id: task.api_key_id,
        tenant_id: task.tenant_id,
        model: task.model,
        status: "succeeded",
        prompt_tokens: null,
        completion_tokens: null,
        total_tokens: null,
        credits_charged: creditsCharged,
        request_id: requestId,
        upstream_id: upstreamId,
        error_code: null,
        error_message: null,
        latency_ms: Date.now() - startedAt,
        billable: true,
        finish_reason: null,
        upstream_status: null,
        upstream_error_code: null,
        safety_reason: null,
        idempotency_key: task.idempotency_key,
        endpoint: task.endpoint,
        billing_status: "charged",
      });
    } catch (err) {
      if (err instanceof ApiError) {
        await failTask(
          task,
          err.code ?? "usage_billing_failed",
          safePublicMessage(err),
          startedAt
        );
        return;
      }
      await failTask(
        task,
        "usage_billing_failed",
        "Billing failed. You were not charged for this image.",
        startedAt
      );
      return;
    }

    const usage = { credits_charged: creditsCharged };
    await finalizeImageTaskSuccess({
      requestId,
      resultData: [{ url }],
      creditsCharged,
      usage,
      upstreamId,
      mode: input.mode,
      promptMode: input.promptMode,
    });

    log.info("image_generation_succeeded", {
      requestId,
      route: "/v1/images/generations",
      status: 200,
      code: "succeeded",
      mode: input.mode,
      promptMode: input.promptMode,
      imagesCount: input.imagesCount,
    });
  } catch (err) {
    log.error("image_generation_worker_failed", {
      requestId,
      message: err instanceof Error ? err.message : String(err),
    });
    const task = await loadImageTaskByRequestId(requestId);
    if (task) {
      await failTask(task, "server_error", "Internal error.", startedAt);
    }
  } finally {
    activeTasks.delete(requestId);
  }
}

async function handleGenerationError(
  task: ImageGenerationTaskRow,
  err: unknown,
  startedAt: number
): Promise<void> {
  if (err instanceof ApiError) {
    const isTimeout =
      err.code === "image_generation_timeout" ||
      err.code === "upstream_timeout";
    const status = isTimeout ? "retryable_timeout" : "failed";
    const code = err.code ?? "upstream_error";
    await failTask(task, code, safePublicMessage(err), startedAt, status);
    return;
  }

  await failTask(task, "server_error", "Internal error.", startedAt);
}

async function failTask(
  task: ImageGenerationTaskRow,
  errorCode: string,
  errorMessage: string,
  startedAt: number,
  status: "failed" | "retryable_timeout" = "failed"
): Promise<void> {
  await finalizeImageTaskFailure({
    requestId: task.request_id,
    status,
    errorCode,
    errorMessage,
  });

  await writeFailedUsageLog({
    user_id: task.user_id,
    api_key_id: task.api_key_id,
    tenant_id: task.tenant_id,
    model: task.model,
    status:
      errorCode === "upstream_rate_limited" ? "rate_limited" : "failed",
    request_id: task.request_id,
    error_code: errorCode,
    error_message: errorMessage,
    latency_ms: Date.now() - startedAt,
    ...upstreamFailureFields(errorCode),
  });

  log.warn("image_generation_failed", {
    requestId: task.request_id,
    route: "/v1/images/generations",
    code: errorCode,
    message: errorMessage,
  });
}

function safePublicMessage(err: ApiError): string {
  return err.publicMessage || err.message || "Image generation failed.";
}

function upstreamFailureFields(
  code: string
): Pick<UsageLogInsert, "upstream_status" | "upstream_error_code"> {
  if (!UPSTREAM_ERROR_CODES.has(code)) {
    return { upstream_status: null, upstream_error_code: null };
  }

  const upstreamStatus =
    code === "upstream_rate_limited"
      ? 429
      : code === "upstream_timeout" || code === "image_generation_timeout"
        ? 504
        : 502;

  return {
    upstream_status: upstreamStatus,
    upstream_error_code: code,
  };
}

async function assertHasCredits(userId: string): Promise<void> {
  const { data, error } = await supabase()
    .from("profiles")
    .select("credits_balance")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw ApiError.internal(
      `Credit precheck failed: ${error.message}`,
      "credit_precheck_failed"
    );
  }

  const balance =
    typeof data?.credits_balance === "number"
      ? data.credits_balance
      : Number(data?.credits_balance ?? 0);

  if (!data || balance <= 0) {
    throw new ApiError({
      status: 402,
      message: "Insufficient credits.",
      code: "insufficient_credits",
      type: "billing_error",
      publicMessage: "算力积分不足，请充值后再试。",
    });
  }
}

async function recordImageUsageAndDebit(entry: UsageLogInsert): Promise<void> {
  const creditsCharged = entry.credits_charged ?? 0;

  if (creditsCharged > 0) {
    const { error: debitError } = await supabase().rpc("debit_credits", {
      p_user_id: entry.user_id,
      p_amount: creditsCharged,
      p_reason: IMAGE_LEDGER_REASON,
      p_reference_id: entry.request_id,
      p_tenant_id: entry.tenant_id ?? null,
    });

    if (debitError) {
      if (
        debitError.code === "P0001" ||
        debitError.message.toLowerCase().includes("insufficient_credits")
      ) {
        throw new ApiError({
          status: 402,
          message: "Insufficient credits.",
          code: "insufficient_credits",
          type: "billing_error",
          publicMessage: "算力积分不足，请充值后再试。",
        });
      }

      throw ApiError.internal(
        `Usage billing failed: ${debitError.message}`,
        "usage_billing_failed"
      );
    }
  }

  const { error: logError } = await supabase().from("usage_logs").insert({
    ...entry,
    status: "succeeded",
  });

  if (logError) {
    log.warn("usage_log_insert_failed", {
      requestId: entry.request_id,
      route: "/v1/images/generations",
      code: "usage_log_insert_failed",
      message: "Failed to write usage log.",
    });
  }
}

async function writeFailedUsageLog(
  entry: Omit<
    UsageLogInsert,
    | "prompt_tokens"
    | "completion_tokens"
    | "total_tokens"
    | "credits_charged"
    | "upstream_id"
    | "billable"
    | "finish_reason"
    | "safety_reason"
  > &
    Partial<Pick<UsageLogInsert, "upstream_status" | "upstream_error_code">>
): Promise<void> {
  const { error } = await supabase().from("usage_logs").insert({
    prompt_tokens: null,
    completion_tokens: null,
    total_tokens: null,
    credits_charged: null,
    upstream_id: null,
    billable: false,
    finish_reason: null,
    safety_reason: null,
    billing_status: "not_billable",
    ...entry,
  });

  if (error) {
    log.warn("usage_log_insert_failed", {
      requestId: entry.request_id,
      route: "/v1/images/generations",
      code: "usage_log_insert_failed",
      message: "Failed to write usage log.",
    });
  }
}

/** Re-export for route helpers that need typed snapshot construction. */
export type { ImageGenerationTaskInputSnapshot };
