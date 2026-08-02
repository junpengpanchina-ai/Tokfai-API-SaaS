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
  isNanoBananaImageModel,
  runNanoBananaImageGeneration,
} from "../upstream/nanoBananaImageProvider.js";
import {
  clearImageGenerationActive,
  markImageGenerationActive,
} from "./activeImageTasks.js";
import { recordImageUsageAndDebit } from "./imageBilling.js";
import { downloadValidateAndPersistProviderImage } from "./imageResultAssetGate.js";
import { messagesForStatus } from "./progressMessages.js";
import {
  finalizeImageTaskFailure,
  finalizeImageTaskSuccess,
  loadImageTaskByRequestId,
  markImageTaskStarted,
  markImageTaskUpstreamSubmitted,
  markImageTaskWaitWindowExceeded,
  parseInputSnapshot,
  updateImageTaskProgress,
} from "./tasksDb.js";

const UPSTREAM_ERROR_CODES = new Set([
  "upstream_auth_error",
  "upstream_rate_limited",
  "upstream_error",
  "upstream_invalid_response",
  "upstream_timeout",
  "image_generation_timeout",
  "image_task_timeout",
  "upstream_image_error",
  "provider_asset_unavailable",
  "provider_asset_invalid",
  "asset_persist_failed",
  "asset_verify_failed",
  "missing_url",
]);

const ASSET_GATE_ERROR_CODES = new Set([
  "provider_asset_unavailable",
  "provider_asset_invalid",
  "asset_persist_failed",
  "asset_verify_failed",
  "missing_url",
]);

export function enqueueImageGeneration(requestId: string): void {
  void processImageGeneration(requestId);
}

async function processImageGeneration(requestId: string): Promise<void> {
  if (!markImageGenerationActive(requestId)) return;

  const startedAt = Date.now();
  let submittedProviderTaskId: string | null = null;

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

    let providerUrl: string;
    let upstreamId: string | null = null;

    try {
      const generateParams = {
        requestId,
        resolvedModel: task.model,
        prompt: input.prompt,
        aspectRatio: input.aspectRatio,
        imageSize: input.imageSize,
        imageUrls: input.imageUrls,
        imageUrlSources: input.imageUrlSources as ImageUrlResolveSource[],
        mode: input.mode,
        promptMode: input.promptMode,
        onUpstreamSubmitted: async (info: {
          providerTaskId: string;
          upstreamRequestId: string;
          providerStatus: string | null;
        }) => {
          // P961: persist provider_task_id / upstream_request_id / tokfai_request_id
          // as soon as upstream accepts — before soft/hard timeout.
          submittedProviderTaskId = info.providerTaskId;
          await markImageTaskUpstreamSubmitted({
            requestId,
            providerTaskId: info.providerTaskId,
            upstreamRequestId: info.upstreamRequestId,
            providerStatus: info.providerStatus,
          });
          log.info("image_upstream_submitted", {
            tokfai_request_id: requestId,
            requestId,
            provider_task_id: info.providerTaskId,
            upstream_request_id: info.upstreamRequestId,
            provider_status: info.providerStatus ?? "pending",
            customer_billing_status: "pending",
            credits_charged: 0,
            reconcile_result: "pending",
            code: "image_upstream_submitted",
          });
        },
        onSoftWaitExceeded: async () => {
          // P957/P961: keep task in-flight (timeout_pending); not billed;
          // enter background reconcile via reconcile_status=pending.
          await markImageTaskWaitWindowExceeded(requestId);
          log.info("image_timeout_pending", {
            tokfai_request_id: requestId,
            requestId,
            provider_task_id: submittedProviderTaskId ?? undefined,
            provider_status: "processing",
            customer_billing_status: "pending",
            credits_charged: 0,
            reconcile_result: "timeout_pending",
            code: "image_task_timeout_pending",
          });
        },
      };
      const result = isNanoBananaImageModel(task.model)
        ? await runNanoBananaImageGeneration(generateParams)
        : await runImageGenerationWithPolling(generateParams);
      providerUrl = result.url;
      upstreamId = result.upstreamId ?? submittedProviderTaskId;
    } catch (err) {
      await handleGenerationError(task, err, startedAt, submittedProviderTaskId);
      return;
    }

    await updateImageTaskProgress({
      requestId,
      status: "saving_result",
    });

    // P993: provider URL string is not success — GET + persist + verify first.
    let tokfaiUrl: string;
    try {
      const persisted = await downloadValidateAndPersistProviderImage({
        providerUrl,
        requestId,
        userId: task.user_id,
      });
      tokfaiUrl = persisted.publicUrl;
    } catch (err) {
      if (err instanceof ApiError && ASSET_GATE_ERROR_CODES.has(err.code ?? "")) {
        await failTask(
          task,
          err.code ?? "provider_asset_unavailable",
          safePublicMessage(err),
          startedAt,
          "failed",
          {
            keepReconcilePending: false,
            reconcileResult: err.code ?? "provider_asset_unavailable",
          }
        );
        return;
      }
      await handleGenerationError(task, err, startedAt, submittedProviderTaskId);
      return;
    }

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
      resultData: [{ url: tokfaiUrl, revised_prompt: null }],
      creditsCharged,
      usage,
      upstreamId,
      mode: input.mode,
      promptMode: input.promptMode,
      reconcileResult: "success",
    });

    log.info("image_generation_succeeded", {
      requestId,
      tokfai_request_id: requestId,
      route: "/v1/images/generations",
      status: 200,
      code: "succeeded",
      model: task.model,
      provider_task_id: upstreamId ?? undefined,
      provider_status: "completed",
      customer_billing_status: creditsCharged > 0 ? "charged" : "not_billable",
      credits_charged: creditsCharged,
      reconcile_result: "success",
      latencyMs: Date.now() - startedAt,
    });
  } catch (err) {
    log.error("image_generation_worker_failed", {
      requestId,
      tokfai_request_id: requestId,
      message: err instanceof Error ? err.message : String(err),
    });
    const task = await loadImageTaskByRequestId(requestId);
    if (task) {
      await failTask(task, "server_error", "Internal error.", startedAt);
    }
  } finally {
    clearImageGenerationActive(requestId);
  }
}

async function handleGenerationError(
  task: ImageGenerationTaskRow,
  err: unknown,
  startedAt: number,
  providerTaskId: string | null
): Promise<void> {
  if (err instanceof ApiError) {
    const isTimeout =
      err.code === "image_generation_timeout" ||
      err.code === "image_task_timeout" ||
      err.code === "upstream_timeout";
    if (isTimeout) {
      const msgs = messagesForStatus("retryable_timeout");
      // P961: hard timeout is retryable_timeout / not_billable, but keep
      // reconcile pending when a provider task was already submitted.
      await failTask(
        task,
        err.code === "image_task_timeout"
          ? "image_task_timeout"
          : "retryable_timeout",
        err.code === "image_task_timeout"
          ? safePublicMessage(err)
          : msgs.en,
        startedAt,
        "retryable_timeout",
        {
          keepReconcilePending: Boolean(
            providerTaskId || task.upstream_id || task.provider_task_id
          ),
        }
      );
      return;
    }
    const code = err.code ?? "upstream_image_error";
    await failTask(task, code, safePublicMessage(err), startedAt, "failed", {
      keepReconcilePending: false,
      reconcileResult: "provider_failed",
    });
    return;
  }

  await failTask(task, "server_error", "Internal error.", startedAt);
}

async function failTask(
  task: ImageGenerationTaskRow,
  errorCode: string,
  errorMessage: string,
  startedAt: number,
  status: "failed" | "retryable_timeout" = "failed",
  opts?: { keepReconcilePending?: boolean; reconcileResult?: string | null }
): Promise<void> {
  const keepReconcilePending = Boolean(opts?.keepReconcilePending);
  await finalizeImageTaskFailure({
    requestId: task.request_id,
    status,
    errorCode,
    errorMessage,
    keepReconcilePending,
    reconcileResult:
      opts?.reconcileResult ??
      (status === "retryable_timeout" ? "hard_timeout" : "provider_failed"),
  });

  const providerTaskId = task.provider_task_id || task.upstream_id || null;

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
    upstream_id: providerTaskId,
    ...upstreamFailureFields(errorCode),
  });

  log.warn("image_generation_failed", {
    requestId: task.request_id,
    tokfai_request_id: task.request_id,
    route: "/v1/images/generations",
    code: errorCode,
    message: errorMessage,
    provider_task_id: providerTaskId ?? undefined,
    provider_status: status === "retryable_timeout" ? "timeout" : "failed",
    customer_billing_status: "not_billable",
    credits_charged: 0,
    reconcile_result:
      opts?.reconcileResult ??
      (status === "retryable_timeout" ? "hard_timeout" : "provider_failed"),
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
      : code === "upstream_timeout" ||
          code === "image_generation_timeout" ||
          code === "image_task_timeout"
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

async function writeFailedUsageLog(
  entry: Omit<
    UsageLogInsert,
    | "prompt_tokens"
    | "completion_tokens"
    | "total_tokens"
    | "credits_charged"
    | "billable"
    | "finish_reason"
    | "safety_reason"
  > &
    Partial<
      Pick<
        UsageLogInsert,
        "upstream_status" | "upstream_error_code" | "upstream_id"
      >
    >
): Promise<void> {
  const { error } = await supabase().from("usage_logs").insert({
    prompt_tokens: null,
    completion_tokens: null,
    total_tokens: null,
    credits_charged: null,
    billable: false,
    finish_reason: null,
    safety_reason: null,
    billing_status: "not_billable",
    ...entry,
    upstream_id: entry.upstream_id ?? null,
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
