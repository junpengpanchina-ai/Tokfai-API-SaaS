/**
 * P993 — Single debit path for image generation tasks.
 *
 * Idempotency: credit_ledger unique index on debit reference_id
 * (request_id / task_id). Duplicate worker / reconcile / PM2 restart
 * must not double-charge. GET poll never calls this module.
 */

import { ApiError } from "../errors.js";
import { log } from "../logger.js";
import { supabase } from "../supabase.js";
import type { UsageLogInsert } from "../types.js";
import { imageTaskLedgerReferenceId } from "./imageResultAssetGate.js";

const IMAGE_LEDGER_REASON = "Image generation usage";

function isUniqueViolation(error: { code?: string; message?: string }): boolean {
  const code = String(error.code ?? "");
  const msg = String(error.message ?? "").toLowerCase();
  return (
    code === "23505" ||
    msg.includes("duplicate") ||
    msg.includes("unique") ||
    msg.includes("credit_ledger_debit_ref")
  );
}

/**
 * Atomic debit via debit_credits. Same request_id never creates a second debit.
 * Unique violation → treated as already charged (idempotent success).
 */
export async function debitImageCreditsIdempotent(args: {
  userId: string;
  amount: number;
  requestId: string;
  tenantId: string | null;
}): Promise<{ alreadyCharged: boolean }> {
  if (args.amount <= 0) {
    return { alreadyCharged: false };
  }

  const referenceId = imageTaskLedgerReferenceId(args.requestId);
  const { error: debitError } = await supabase().rpc("debit_credits", {
    p_user_id: args.userId,
    p_amount: args.amount,
    p_reason: IMAGE_LEDGER_REASON,
    p_reference_id: referenceId,
    p_tenant_id: args.tenantId ?? null,
  });

  if (!debitError) {
    return { alreadyCharged: false };
  }

  if (isUniqueViolation(debitError)) {
    log.info("image_debit_idempotent_hit", {
      requestId: args.requestId,
      tokfai_request_id: args.requestId,
      reference_id: referenceId,
      code: "image_debit_idempotent_hit",
    });
    return { alreadyCharged: true };
  }

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

/** Debit (idempotent) + write succeeded usage_logs row once. */
export async function recordImageUsageAndDebit(
  entry: UsageLogInsert
): Promise<void> {
  const creditsCharged = entry.credits_charged ?? 0;

  if (creditsCharged > 0) {
    await debitImageCreditsIdempotent({
      userId: entry.user_id,
      amount: creditsCharged,
      requestId: entry.request_id,
      tenantId: entry.tenant_id ?? null,
    });
  }

  const { error: logError } = await supabase().from("usage_logs").insert({
    ...entry,
    status: "succeeded",
  });

  if (logError) {
    if (isUniqueViolation(logError)) return;
    log.warn("usage_log_insert_failed", {
      requestId: entry.request_id,
      route: "/v1/images/generations",
      code: "usage_log_insert_failed",
      message: "Failed to write usage log.",
    });
  }
}
