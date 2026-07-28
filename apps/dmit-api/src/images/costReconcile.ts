/**
 * P961 — Background image upstream cost reconciliation / orphan cost guard.
 *
 * After local soft timeout (timeout_pending) or hard timeout (retryable_timeout),
 * continue querying the provider task when provider_task_id was persisted on submit:
 * - provider completed + url → completed + charge (later_completed)
 * - provider failed → not_billable
 * - provider still pending past hard window → retryable_timeout, not billed
 *
 * orphan_cost_audit alarms when provider succeeded unpaid, charged without url,
 * or timeout_pending exceeded the reconcile threshold.
 *
 * Does not touch Chat / chatGateway / P954 isolation.
 */

import { priceCreditsForImage } from "../catalog/modelCatalog.js";
import { ApiError } from "../errors.js";
import { log } from "../logger.js";
import { supabase } from "../supabase.js";
import type { ImageGenerationTaskRow, UsageLogInsert } from "../types.js";
import { pollImageGenerationTask } from "../upstream/imageAsyncProvider.js";
import { isImageGenerationActive } from "./activeImageTasks.js";
import { IMAGE_HARD_WAIT_MS, isSoftTimeoutCode } from "./imageTimeoutPolicy.js";
import {
  auditOrphanCost,
  decideReconcileAction,
  hasImageResultUrl,
  ORPHAN_TIMEOUT_PENDING_THRESHOLD_MS,
} from "./orphanCostAudit.js";
import {
  finalizeImageTaskFailure,
  finalizeImageTaskSuccess,
  listImageTasksNeedingReconcile,
  loadImageTaskByRequestId,
  parseInputSnapshot,
  updateImageTaskReconcileMeta,
} from "./tasksDb.js";

const IMAGE_LEDGER_REASON = "Image generation usage";
const RECONCILE_INTERVAL_MS = 30_000;
const RECONCILE_BATCH = 20;

let reconcileTimer: ReturnType<typeof setInterval> | null = null;
let sweepInFlight = false;

export function startImageCostReconcileLoop(): void {
  if (reconcileTimer) return;
  reconcileTimer = setInterval(() => {
    void runImageCostReconcileSweep();
  }, RECONCILE_INTERVAL_MS);
  if (typeof reconcileTimer.unref === "function") {
    reconcileTimer.unref();
  }
  // Kick once shortly after boot for stale pending rows.
  setTimeout(() => {
    void runImageCostReconcileSweep();
  }, 5_000).unref();
}

export function stopImageCostReconcileLoop(): void {
  if (reconcileTimer) {
    clearInterval(reconcileTimer);
    reconcileTimer = null;
  }
}

export async function runImageCostReconcileSweep(): Promise<void> {
  if (sweepInFlight) return;
  sweepInFlight = true;
  try {
    const tasks = await listImageTasksNeedingReconcile(RECONCILE_BATCH);
    for (const task of tasks) {
      if (isImageGenerationActive(task.request_id)) continue;
      try {
        await reconcileImageTask(task);
      } catch (err) {
        log.warn("image_cost_reconcile_task_failed", {
          tokfai_request_id: task.request_id,
          requestId: task.request_id,
          code: "reconcile_error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } finally {
    sweepInFlight = false;
  }
}

export async function reconcileImageTask(
  task: ImageGenerationTaskRow
): Promise<void> {
  const tokfaiRequestId = task.request_id;
  const providerTaskId =
    (typeof task.provider_task_id === "string" && task.provider_task_id.trim()
      ? task.provider_task_id.trim()
      : null) ||
    (typeof task.upstream_id === "string" && task.upstream_id.trim()
      ? task.upstream_id.trim()
      : null);

  if (!providerTaskId) {
    await updateImageTaskReconcileMeta({
      requestId: tokfaiRequestId,
      reconcileStatus: "skipped",
      reconcileResult: "missing_provider_task_id",
      markReconciledAt: true,
    });
    return;
  }

  // Already successfully charged with url — nothing to reconcile.
  if (
    task.status === "completed" &&
    hasImageResultUrl(task.result_data) &&
    Number(task.credits_charged ?? 0) > 0
  ) {
    await updateImageTaskReconcileMeta({
      requestId: tokfaiRequestId,
      reconcileStatus: "reconciled",
      reconcileResult: "success",
      providerStatus: "completed",
      orphanCostFlags: {},
      markReconciledAt: true,
    });
    return;
  }

  await updateImageTaskReconcileMeta({
    requestId: tokfaiRequestId,
    reconcileStatus: "in_progress",
  });

  let providerUrl: string | null = null;
  let providerStatus: string | null = null;

  try {
    const polled = await pollImageGenerationTask({
      requestId: tokfaiRequestId,
      taskId: providerTaskId,
    });
    providerUrl = polled.url;
    providerStatus = polled.status;
  } catch (err) {
    const code = err instanceof ApiError ? err.code : "upstream_image_error";
    if (
      code === "upstream_error" ||
      code === "upstream_image_error" ||
      code === "upstream_invalid_response"
    ) {
      providerStatus = "failed";
    } else {
      providerStatus = "pending";
    }
  }

  const createdMs = new Date(task.created_at).getTime();
  const ageMs = Number.isFinite(createdMs) ? Date.now() - createdMs : 0;
  const hardTimedOut = ageMs >= IMAGE_HARD_WAIT_MS;
  const decision = decideReconcileAction({
    providerStatus,
    providerUrl,
    hardTimedOut,
  });

  const softPending =
    isSoftTimeoutCode(task.error_code) ||
    task.reconcile_status === "pending" ||
    decision.action === "still_pending";

  const customerCharged =
    task.billing_status === "charged" && Number(task.credits_charged ?? 0) > 0;
  const missingUrl = !hasImageResultUrl(task.result_data) && !providerUrl;

  if (decision.action === "later_completed" && providerUrl) {
    await applyLaterCompleted({
      task,
      providerTaskId,
      providerUrl,
      providerStatus: providerStatus ?? "completed",
    });
    return;
  }

  if (decision.action === "provider_failed") {
    await applyProviderFailed(task, providerTaskId, providerStatus);
    return;
  }

  if (decision.action === "missing_url") {
    await applyMissingUrl(task, providerTaskId, providerStatus);
    return;
  }

  if (decision.action === "hard_timeout") {
    await applyHardTimeout(task, providerTaskId, providerStatus);
    return;
  }

  // still_pending — keep pending; orphan alarm if soft timeout stale.
  const audit = auditOrphanCost({
    providerSuccess: false,
    customerCharged,
    missingUrl: true,
    timeoutPending: softPending,
    timeoutPendingAgeMs: ageMs,
    reconciled: false,
    thresholdMs: ORPHAN_TIMEOUT_PENDING_THRESHOLD_MS,
  });

  await updateImageTaskReconcileMeta({
    requestId: tokfaiRequestId,
    reconcileStatus: "pending",
    reconcileResult: "still_pending",
    providerStatus: providerStatus ?? "pending",
    orphanCostFlags: audit.flags,
    markReconciledAt: false,
  });

  logImageReconcile({
    tokfaiRequestId,
    providerTaskId,
    providerStatus: providerStatus ?? "pending",
    customerBillingStatus: "pending",
    creditsCharged: Number(task.credits_charged ?? 0),
    reconcileResult: "still_pending",
    orphanAlarms: audit.alarms,
  });

  if (!audit.ok) {
    log.warn("orphan_cost_audit", {
      tokfai_request_id: tokfaiRequestId,
      provider_task_id: providerTaskId,
      provider_status: providerStatus ?? "pending",
      customer_billing_status: "pending",
      credits_charged: Number(task.credits_charged ?? 0),
      reconcile_result: "still_pending",
      orphan_cost_audit: true,
      orphan_alarms: audit.alarms.join(","),
      code: "orphan_cost_audit",
    });
  }
}

async function applyLaterCompleted(args: {
  task: ImageGenerationTaskRow;
  providerTaskId: string;
  providerUrl: string;
  providerStatus: string;
}): Promise<void> {
  const { task, providerTaskId, providerUrl, providerStatus } = args;
  const tokfaiRequestId = task.request_id;
  const input = parseInputSnapshot(task.input_snapshot);

  // Idempotent: already charged
  if (
    task.status === "completed" &&
    Number(task.credits_charged ?? 0) > 0 &&
    hasImageResultUrl(task.result_data)
  ) {
    await updateImageTaskReconcileMeta({
      requestId: tokfaiRequestId,
      reconcileStatus: "reconciled",
      reconcileResult: "later_completed",
      providerStatus,
      orphanCostFlags: {},
      markReconciledAt: true,
    });
    return;
  }

  let creditsCharged = 0;
  let charged = false;

  try {
    creditsCharged = await priceCreditsForImage(task.model, task.tenant_id);
    if (creditsCharged > 0) {
      await debitImageCredits({
        userId: task.user_id,
        amount: creditsCharged,
        requestId: tokfaiRequestId,
        tenantId: task.tenant_id,
      });
      charged = true;
    }

    await writeSucceededUsageLog({
      user_id: task.user_id,
      api_key_id: task.api_key_id,
      tenant_id: task.tenant_id,
      model: task.model,
      status: "succeeded",
      prompt_tokens: null,
      completion_tokens: null,
      total_tokens: null,
      credits_charged: creditsCharged,
      request_id: tokfaiRequestId,
      upstream_id: providerTaskId,
      error_code: null,
      error_message: null,
      latency_ms: null,
      billable: creditsCharged > 0,
      finish_reason: null,
      upstream_status: 200,
      upstream_error_code: null,
      safety_reason: null,
      idempotency_key: task.idempotency_key,
      endpoint: task.endpoint,
      billing_status: creditsCharged > 0 ? "charged" : "not_billable",
    });

    await finalizeImageTaskSuccess({
      requestId: tokfaiRequestId,
      resultData: [{ url: providerUrl, revised_prompt: null }],
      creditsCharged,
      usage: { credits_charged: creditsCharged },
      upstreamId: providerTaskId,
      mode: input?.mode ?? task.mode ?? "text_to_image",
      promptMode: input?.promptMode ?? task.prompt_mode ?? "normal",
      reconcileResult: "later_completed",
    });

    const audit = auditOrphanCost({
      providerSuccess: true,
      customerCharged: charged || creditsCharged === 0,
      missingUrl: false,
      reconciled: true,
    });

    logImageReconcile({
      tokfaiRequestId,
      providerTaskId,
      providerStatus,
      customerBillingStatus: charged ? "charged" : "not_billable",
      creditsCharged,
      reconcileResult: "later_completed",
      orphanAlarms: audit.alarms,
    });
  } catch (err) {
    // Provider succeeded but we could not charge → orphan cost alarm.
    const audit = auditOrphanCost({
      providerSuccess: true,
      customerCharged: false,
      missingUrl: false,
      reconciled: false,
    });

    await updateImageTaskReconcileMeta({
      requestId: tokfaiRequestId,
      reconcileStatus: "orphan_alarm",
      reconcileResult: "later_completed_unpaid",
      providerStatus,
      orphanCostFlags: audit.flags,
      markReconciledAt: false,
    });

    log.warn("orphan_cost_audit", {
      tokfai_request_id: tokfaiRequestId,
      provider_task_id: providerTaskId,
      provider_status: providerStatus,
      customer_billing_status: "not_billable",
      credits_charged: 0,
      reconcile_result: "later_completed_unpaid",
      orphan_cost_audit: true,
      orphan_alarms: audit.alarms.join(","),
      code: "orphan_cost_audit",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

async function applyProviderFailed(
  task: ImageGenerationTaskRow,
  providerTaskId: string,
  providerStatus: string | null
): Promise<void> {
  const tokfaiRequestId = task.request_id;

  if (task.status !== "failed" && task.status !== "retryable_timeout") {
    await finalizeImageTaskFailure({
      requestId: tokfaiRequestId,
      status: "failed",
      errorCode: "upstream_image_error",
      errorMessage:
        "Image generation is temporarily unavailable. Please retry shortly.",
      reconcileResult: "provider_failed",
      keepReconcilePending: false,
    });
  } else {
    await updateImageTaskReconcileMeta({
      requestId: tokfaiRequestId,
      reconcileStatus: "reconciled",
      reconcileResult: "provider_failed",
      providerStatus: providerStatus ?? "failed",
      orphanCostFlags: {},
      markReconciledAt: true,
    });
  }

  const audit = auditOrphanCost({
    providerSuccess: false,
    customerCharged: false,
    missingUrl: true,
    reconciled: true,
  });

  logImageReconcile({
    tokfaiRequestId,
    providerTaskId,
    providerStatus: providerStatus ?? "failed",
    customerBillingStatus: "not_billable",
    creditsCharged: 0,
    reconcileResult: "provider_failed",
    orphanAlarms: audit.alarms,
  });
}

async function applyMissingUrl(
  task: ImageGenerationTaskRow,
  providerTaskId: string,
  providerStatus: string | null
): Promise<void> {
  const tokfaiRequestId = task.request_id;
  const customerCharged =
    task.billing_status === "charged" && Number(task.credits_charged ?? 0) > 0;

  const audit = auditOrphanCost({
    providerSuccess: true,
    customerCharged,
    missingUrl: true,
    reconciled: true,
  });

  await finalizeImageTaskFailure({
    requestId: tokfaiRequestId,
    status: "failed",
    errorCode: "upstream_image_error",
    errorMessage:
      "Image generation is temporarily unavailable. Please retry shortly.",
    reconcileResult: "missing_url",
    keepReconcilePending: false,
  });

  await updateImageTaskReconcileMeta({
    requestId: tokfaiRequestId,
    reconcileStatus: audit.ok ? "reconciled" : "orphan_alarm",
    reconcileResult: "missing_url",
    providerStatus: providerStatus ?? "completed",
    orphanCostFlags: audit.flags,
    markReconciledAt: true,
  });

  logImageReconcile({
    tokfaiRequestId,
    providerTaskId,
    providerStatus: providerStatus ?? "completed",
    customerBillingStatus: customerCharged ? "charged" : "not_billable",
    creditsCharged: Number(task.credits_charged ?? 0),
    reconcileResult: "missing_url",
    orphanAlarms: audit.alarms,
  });

  if (!audit.ok) {
    log.warn("orphan_cost_audit", {
      tokfai_request_id: tokfaiRequestId,
      provider_task_id: providerTaskId,
      provider_status: providerStatus ?? "completed",
      customer_billing_status: customerCharged ? "charged" : "not_billable",
      credits_charged: Number(task.credits_charged ?? 0),
      reconcile_result: "missing_url",
      orphan_cost_audit: true,
      orphan_alarms: audit.alarms.join(","),
      code: "orphan_cost_audit",
    });
  }
}

async function applyHardTimeout(
  task: ImageGenerationTaskRow,
  providerTaskId: string,
  providerStatus: string | null
): Promise<void> {
  const tokfaiRequestId = task.request_id;

  if (task.status !== "retryable_timeout") {
    await finalizeImageTaskFailure({
      requestId: tokfaiRequestId,
      status: "retryable_timeout",
      errorCode: "image_task_timeout",
      errorMessage: "Image generation timed out before completion.",
      reconcileResult: "hard_timeout",
      keepReconcilePending: false,
    });
  } else {
    await updateImageTaskReconcileMeta({
      requestId: tokfaiRequestId,
      reconcileStatus: "reconciled",
      reconcileResult: "hard_timeout",
      providerStatus: providerStatus ?? "timeout",
      orphanCostFlags: {},
      markReconciledAt: true,
    });
  }

  logImageReconcile({
    tokfaiRequestId,
    providerTaskId,
    providerStatus: providerStatus ?? "timeout",
    customerBillingStatus: "not_billable",
    creditsCharged: 0,
    reconcileResult: "hard_timeout",
    orphanAlarms: [],
  });
}

function logImageReconcile(args: {
  tokfaiRequestId: string;
  providerTaskId: string;
  providerStatus: string;
  customerBillingStatus: string;
  creditsCharged: number;
  reconcileResult: string;
  orphanAlarms: string[];
}): void {
  log.info("image_cost_reconcile", {
    tokfai_request_id: args.tokfaiRequestId,
    requestId: args.tokfaiRequestId,
    provider_task_id: args.providerTaskId,
    provider_status: args.providerStatus,
    customer_billing_status: args.customerBillingStatus,
    credits_charged: args.creditsCharged,
    reconcile_result: args.reconcileResult,
    orphan_alarms: args.orphanAlarms.join(",") || undefined,
    code: "image_cost_reconcile",
  });
}

async function debitImageCredits(args: {
  userId: string;
  amount: number;
  requestId: string;
  tenantId: string | null;
}): Promise<void> {
  const { error: debitError } = await supabase().rpc("debit_credits", {
    p_user_id: args.userId,
    p_amount: args.amount,
    p_reason: IMAGE_LEDGER_REASON,
    p_reference_id: args.requestId,
    p_tenant_id: args.tenantId ?? null,
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

async function writeSucceededUsageLog(entry: UsageLogInsert): Promise<void> {
  const { error } = await supabase().from("usage_logs").insert({
    ...entry,
    status: "succeeded",
  });
  if (error) {
    // Idempotent re-reconcile may hit unique request_id — ignore duplicates.
    const msg = error.message.toLowerCase();
    if (msg.includes("duplicate") || msg.includes("unique")) return;
    log.warn("usage_log_insert_failed", {
      requestId: entry.request_id,
      tokfai_request_id: entry.request_id,
      route: "/v1/images/generations",
      code: "usage_log_insert_failed",
      message: "Failed to write usage log.",
    });
  }
}

/** Re-export for tests / ops scripts. */
export { loadImageTaskByRequestId };
