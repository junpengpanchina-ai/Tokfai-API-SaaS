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
import { assertImageQuotaGuards } from "./imageQuotaGuards.js";
import {
  acquireImageCircuit,
  classifyImageFailureCode,
  hydrateImageCircuitFromRedis,
  imageCircuitKey,
  IMAGE_CIRCUIT_PROVIDER_ID,
  operationFromImageMode,
  recordImageCircuitResult,
} from "./imageCircuitBreaker.js";
import {
  buildImageAttemptChain,
  sanitizePublicAttempts,
  type ImagePublicAttempt,
} from "./imageFallbackRouting.js";
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

    // P995 — re-check balance + daily/monthly + trial before upstream.
    // Soft-check parity with text; queue delay may exhaust caps after POST.
    try {
      await assertImageQuotaGuards({
        userId: task.user_id,
        apiKeyId: task.api_key_id,
        keyId: null,
        tenantId: task.tenant_id,
        model: task.model,
        requestedRaw: input.requestedModel,
        requestId,
        route: "/v1/images/generations",
      });
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

    const operation = operationFromImageMode(input.mode);
    const requestedModel = input.requestedModel || task.model;
    const resolvedModel = task.model;
    const attemptChain = await buildImageAttemptChain({
      requestedModel,
      resolvedModel,
      operation,
      imagesCount: input.imagesCount,
      tenantId: task.tenant_id,
    });

    const publicAttempts: ImagePublicAttempt[] = [];
    let providerUrl: string | null = null;
    let upstreamId: string | null = null;
    let attemptModelUsed: string | null = null;
    let lastProviderError: ApiError | null = null;
    let sawNonSkipFailure = false;
    let allSkippedOpenOrBusy = attemptChain.length > 0;

    for (const candidate of attemptChain) {
      const breakerKey = imageCircuitKey(
        candidate.provider,
        candidate.model,
        operation
      );
      await hydrateImageCircuitFromRedis(breakerKey);
      const acquired = acquireImageCircuit(breakerKey);
      const attemptStarted = Date.now();

      if (!acquired.allowed) {
        publicAttempts.push({
          model: candidate.model,
          provider: candidate.provider,
          result: "skipped",
          skipped_reason: acquired.skippedReason ?? "circuit_open",
          failure_category: null,
          failure_code: null,
          duration_ms: Date.now() - attemptStarted,
          breaker_key: breakerKey,
          breaker_state_before: acquired.stateBefore,
          breaker_state_after: acquired.stateAfter,
        });
        log.info("image_circuit_attempt", {
          requestId,
          tokfai_request_id: requestId,
          task_id: requestId,
          breaker_key: breakerKey,
          breaker_state_before: acquired.stateBefore,
          breaker_state_after: acquired.stateAfter,
          attempt_model: candidate.model,
          provider: candidate.provider,
          result: "skipped",
          failure_category: null,
          duration_ms: Date.now() - attemptStarted,
          fallback_used: candidate.model !== resolvedModel,
          code: acquired.skippedReason ?? "circuit_open",
        });
        continue;
      }

      allSkippedOpenOrBusy = false;
      submittedProviderTaskId = null;

      try {
        const generateParams = {
          requestId,
          resolvedModel: candidate.model,
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
              attempt_model: candidate.model,
              code: "image_upstream_submitted",
            });
          },
          onSoftWaitExceeded: async () => {
            await markImageTaskWaitWindowExceeded(requestId);
            log.info("image_timeout_pending", {
              tokfai_request_id: requestId,
              requestId,
              provider_task_id: submittedProviderTaskId ?? undefined,
              provider_status: "processing",
              customer_billing_status: "pending",
              credits_charged: 0,
              reconcile_result: "timeout_pending",
              attempt_model: candidate.model,
              code: "image_task_timeout_pending",
            });
          },
        };

        const result = isNanoBananaImageModel(candidate.model)
          ? await runNanoBananaImageGeneration(generateParams)
          : await runImageGenerationWithPolling(generateParams);

        await updateImageTaskProgress({
          requestId,
          status: "saving_result",
        });

        // P993 URL gate — provider URL alone is not success.
        let tokfaiUrl: string;
        try {
          const persisted = await downloadValidateAndPersistProviderImage({
            providerUrl: result.url,
            requestId,
            userId: task.user_id,
          });
          tokfaiUrl = persisted.publicUrl;
        } catch (assetErr) {
          const code =
            assetErr instanceof ApiError
              ? assetErr.code ?? "provider_asset_unavailable"
              : "provider_asset_unavailable";
          const category = classifyImageFailureCode(code);
          const snap = recordImageCircuitResult({
            key: breakerKey,
            success: false,
            code,
            category,
          });
          publicAttempts.push({
            model: candidate.model,
            provider: candidate.provider,
            result: "failed",
            failure_category: category,
            failure_code: code,
            duration_ms: Date.now() - attemptStarted,
            breaker_key: breakerKey,
            breaker_state_before: acquired.stateBefore,
            breaker_state_after: snap.state,
          });
          log.info("image_circuit_attempt", {
            requestId,
            tokfai_request_id: requestId,
            task_id: requestId,
            breaker_key: breakerKey,
            breaker_state_before: acquired.stateBefore,
            breaker_state_after: snap.state,
            attempt_model: candidate.model,
            provider: candidate.provider,
            result: "failed",
            failure_category: category,
            duration_ms: Date.now() - attemptStarted,
            fallback_used: candidate.model !== resolvedModel,
            code,
          });

          // Internal storage/verify failures: do not burn fallbacks indefinitely.
          if (category === "internal" || !ASSET_GATE_ERROR_CODES.has(code)) {
            await failTask(
              task,
              code,
              assetErr instanceof ApiError
                ? safePublicMessage(assetErr)
                : "Image asset handling failed.",
              startedAt,
              "failed",
              {
                keepReconcilePending: false,
                reconcileResult: code,
                routingUsage: buildRoutingUsage({
                  requestedModel,
                  resolvedModel,
                  attemptModel: candidate.model,
                  provider: candidate.provider,
                  attempts: publicAttempts,
                  creditsCharged: 0,
                }),
              }
            );
            return;
          }

          // Provider asset failures count + try next attempt.
          sawNonSkipFailure = true;
          lastProviderError =
            assetErr instanceof ApiError
              ? assetErr
              : ApiError.internal("Provider asset unavailable.", code);
          continue;
        }

        const snapOk = recordImageCircuitResult({
          key: breakerKey,
          success: true,
          category: "provider",
        });
        publicAttempts.push({
          model: candidate.model,
          provider: candidate.provider,
          result: "success",
          duration_ms: Date.now() - attemptStarted,
          breaker_key: breakerKey,
          breaker_state_before: acquired.stateBefore,
          breaker_state_after: snapOk.state,
        });
        log.info("image_circuit_attempt", {
          requestId,
          tokfai_request_id: requestId,
          task_id: requestId,
          breaker_key: breakerKey,
          breaker_state_before: acquired.stateBefore,
          breaker_state_after: snapOk.state,
          attempt_model: candidate.model,
          provider: candidate.provider,
          result: "success",
          failure_category: null,
          duration_ms: Date.now() - attemptStarted,
          fallback_used: candidate.model !== resolvedModel,
          code: "succeeded",
        });

        providerUrl = tokfaiUrl;
        upstreamId = result.upstreamId ?? submittedProviderTaskId;
        attemptModelUsed = candidate.model;
        break;
      } catch (err) {
        const code =
          err instanceof ApiError ? err.code ?? "upstream_image_error" : "server_error";
        const category = classifyImageFailureCode(code);
        const snap = recordImageCircuitResult({
          key: breakerKey,
          success: false,
          code,
          category,
        });
        const isTimeout =
          code === "image_generation_timeout" ||
          code === "image_task_timeout" ||
          code === "upstream_timeout" ||
          code === "retryable_timeout";
        publicAttempts.push({
          model: candidate.model,
          provider: candidate.provider,
          result: isTimeout ? "timeout" : "failed",
          failure_category: category,
          failure_code: code,
          duration_ms: Date.now() - attemptStarted,
          breaker_key: breakerKey,
          breaker_state_before: acquired.stateBefore,
          breaker_state_after: snap.state,
        });
        log.info("image_circuit_attempt", {
          requestId,
          tokfai_request_id: requestId,
          task_id: requestId,
          breaker_key: breakerKey,
          breaker_state_before: acquired.stateBefore,
          breaker_state_after: snap.state,
          attempt_model: candidate.model,
          provider: candidate.provider,
          result: isTimeout ? "timeout" : "failed",
          failure_category: category,
          duration_ms: Date.now() - attemptStarted,
          fallback_used: candidate.model !== resolvedModel,
          code,
        });

        // Client errors (bad prompt / policy): stop, do not fallback.
        if (category === "client") {
          await handleGenerationError(
            task,
            err,
            startedAt,
            submittedProviderTaskId,
            buildRoutingUsage({
              requestedModel,
              resolvedModel,
              attemptModel: candidate.model,
              provider: candidate.provider,
              attempts: publicAttempts,
              creditsCharged: 0,
            })
          );
          return;
        }

        // Soft/hard timeout with provider_task_id: keep reconcile path, no more attempts.
        if (
          err instanceof ApiError &&
          (code === "image_generation_timeout" ||
            code === "image_task_timeout" ||
            code === "upstream_timeout" ||
            code === "retryable_timeout") &&
          (submittedProviderTaskId || task.provider_task_id)
        ) {
          await handleGenerationError(
            task,
            err,
            startedAt,
            submittedProviderTaskId,
            buildRoutingUsage({
              requestedModel,
              resolvedModel,
              attemptModel: candidate.model,
              provider: candidate.provider,
              attempts: publicAttempts,
              creditsCharged: 0,
            })
          );
          return;
        }

        sawNonSkipFailure = true;
        lastProviderError =
          err instanceof ApiError
            ? err
            : ApiError.internal("Image generation failed.", "server_error");
        continue;
      }
    }

    if (!providerUrl || !attemptModelUsed) {
      if (allSkippedOpenOrBusy && !sawNonSkipFailure) {
        const busyOnly = publicAttempts.every(
          (a) =>
            a.skipped_reason === "circuit_open" ||
            a.skipped_reason === "breaker_half_open_busy"
        );
        const code = busyOnly
          ? publicAttempts.every((a) => a.skipped_reason === "breaker_half_open_busy")
            ? "breaker_half_open_busy"
            : "all_image_upstreams_unavailable"
          : "all_image_upstreams_unavailable";
        await failTask(
          task,
          code,
          code === "breaker_half_open_busy"
            ? "Image upstream is probing recovery. Please retry shortly."
            : "All image upstreams are temporarily unavailable. Please retry shortly.",
          startedAt,
          "failed",
          {
            keepReconcilePending: false,
            reconcileResult: code,
            routingUsage: buildRoutingUsage({
              requestedModel,
              resolvedModel,
              attemptModel: null,
              provider: IMAGE_CIRCUIT_PROVIDER_ID,
              attempts: publicAttempts,
              creditsCharged: 0,
            }),
          }
        );
        return;
      }

      await handleGenerationError(
        task,
        lastProviderError ??
          new ApiError({
            status: 502,
            message: "Image generation failed.",
            code: "upstream_image_error",
            type: "upstream_error",
            publicMessage: "Image generation is temporarily unavailable. Please retry shortly.",
          }),
        startedAt,
        submittedProviderTaskId,
        buildRoutingUsage({
          requestedModel,
          resolvedModel,
          attemptModel: null,
          provider: IMAGE_CIRCUIT_PROVIDER_ID,
          attempts: publicAttempts,
          creditsCharged: 0,
        })
      );
      return;
    }

    // Charge only after Tokfai URL verified — once, for the winning attempt model.
    const creditsCharged = await priceCreditsForImage(
      attemptModelUsed,
      task.tenant_id
    );

    const routingUsage = buildRoutingUsage({
      requestedModel,
      resolvedModel,
      attemptModel: attemptModelUsed,
      provider: IMAGE_CIRCUIT_PROVIDER_ID,
      attempts: publicAttempts,
      creditsCharged,
    });

    try {
      await recordImageUsageAndDebit({
        user_id: task.user_id,
        api_key_id: task.api_key_id,
        tenant_id: task.tenant_id,
        model: attemptModelUsed,
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
      // Billing failure is internal — release does not hurt provider health.
      recordImageCircuitResult({
        key: imageCircuitKey(
          IMAGE_CIRCUIT_PROVIDER_ID,
          attemptModelUsed,
          operation
        ),
        success: false,
        code: "usage_billing_failed",
        category: "internal",
      });
      if (err instanceof ApiError) {
        await failTask(
          task,
          err.code ?? "usage_billing_failed",
          safePublicMessage(err),
          startedAt,
          "failed",
          { routingUsage: { ...routingUsage, credits_charged: 0 } }
        );
        return;
      }
      await failTask(
        task,
        "usage_billing_failed",
        "Billing failed. You were not charged for this image.",
        startedAt,
        "failed",
        { routingUsage: { ...routingUsage, credits_charged: 0 } }
      );
      return;
    }

    await finalizeImageTaskSuccess({
      requestId,
      resultData: [{ url: providerUrl, revised_prompt: null }],
      creditsCharged,
      usage: routingUsage,
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
      model: attemptModelUsed,
      requested_model: requestedModel,
      resolved_model: resolvedModel,
      attempt_model: attemptModelUsed,
      provider: IMAGE_CIRCUIT_PROVIDER_ID,
      fallback_used: attemptModelUsed !== resolvedModel,
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

function buildRoutingUsage(args: {
  requestedModel: string;
  resolvedModel: string;
  attemptModel: string | null;
  provider: string;
  attempts: ImagePublicAttempt[];
  creditsCharged: number;
}): Record<string, unknown> {
  const attempts = sanitizePublicAttempts(args.attempts);
  return {
    credits_charged: args.creditsCharged,
    requested_model: args.requestedModel,
    resolved_model: args.resolvedModel,
    attempt_model: args.attemptModel,
    provider: args.provider,
    fallback_used: Boolean(
      args.attemptModel && args.attemptModel !== args.resolvedModel
    ),
    attempts,
  };
}

async function handleGenerationError(
  task: ImageGenerationTaskRow,
  err: unknown,
  startedAt: number,
  providerTaskId: string | null,
  routingUsage?: Record<string, unknown>
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
          routingUsage,
        }
      );
      return;
    }
    const code = err.code ?? "upstream_image_error";
    await failTask(task, code, safePublicMessage(err), startedAt, "failed", {
      keepReconcilePending: false,
      reconcileResult: "provider_failed",
      routingUsage,
    });
    return;
  }

  await failTask(task, "server_error", "Internal error.", startedAt, "failed", {
    routingUsage,
  });
}

async function failTask(
  task: ImageGenerationTaskRow,
  errorCode: string,
  errorMessage: string,
  startedAt: number,
  status: "failed" | "retryable_timeout" = "failed",
  opts?: {
    keepReconcilePending?: boolean;
    reconcileResult?: string | null;
    routingUsage?: Record<string, unknown>;
  }
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
    usage: opts?.routingUsage ?? { credits_charged: 0 },
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
