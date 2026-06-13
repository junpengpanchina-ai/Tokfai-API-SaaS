import { supabase } from "../supabase.js";
import type { UsageLogInsert } from "../types.js";

export interface BillingIdempotencyHit {
  requestId: string;
  creditsCharged: number;
  debitLedgerId: string | null;
  responseSnapshot: Record<string, unknown> | null;
}

export async function lookupBillingIdempotency(args: {
  apiKeyId: string | null;
  idempotencyKey: string | null;
  endpoint: string;
}): Promise<BillingIdempotencyHit | null> {
  const { apiKeyId, idempotencyKey, endpoint } = args;
  if (!apiKeyId || !idempotencyKey) return null;

  const { data, error } = await supabase().rpc("lookup_usage_idempotency", {
    p_api_key_id: apiKeyId,
    p_idempotency_key: idempotencyKey,
    p_endpoint: endpoint,
  });

  if (error || !data || typeof data !== "object") {
    return null;
  }

  const payload = data as Record<string, unknown>;
  const snapshot = payload.response_snapshot;
  return {
    requestId: String(payload.request_id ?? ""),
    creditsCharged: Number(payload.credits_charged ?? 0),
    debitLedgerId:
      typeof payload.debit_ledger_id === "string"
        ? payload.debit_ledger_id
        : null,
    responseSnapshot:
      snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
        ? (snapshot as Record<string, unknown>)
        : null,
  };
}

export interface RecordUsageDebitResult {
  balanceAfter: number;
  debitLedgerId: string | null;
  idempotentReplay: boolean;
}

export async function recordSuccessfulUsageAndDebit(
  entry: UsageLogInsert,
  args: {
    idempotencyKey?: string | null;
    endpoint: string;
    responseSnapshot?: Record<string, unknown> | null;
  }
): Promise<RecordUsageDebitResult> {
  const { error, data } = await supabase().rpc("record_usage_and_debit", {
    p_user_id: entry.user_id,
    p_api_key_id: entry.api_key_id,
    p_model: entry.model,
    p_prompt_tokens: entry.prompt_tokens,
    p_completion_tokens: entry.completion_tokens,
    p_total_tokens: entry.total_tokens,
    p_credits_charged: entry.credits_charged ?? 0,
    p_request_id: entry.request_id,
    p_upstream_id: entry.upstream_id,
    p_latency_ms: entry.latency_ms,
    p_billable: entry.billable,
    p_finish_reason: entry.finish_reason,
    p_upstream_status: entry.upstream_status,
    p_upstream_error_code: entry.upstream_error_code,
    p_safety_reason: entry.safety_reason,
    p_idempotency_key: args.idempotencyKey ?? null,
    p_endpoint: args.endpoint,
    p_response_snapshot: args.responseSnapshot ?? null,
  });

  if (error) {
    throw error;
  }

  const payload =
    data && typeof data === "object"
      ? (data as Record<string, unknown>)
      : {};

  return {
    balanceAfter: Number(payload.balance_after ?? 0),
    debitLedgerId:
      typeof payload.debit_ledger_id === "string"
        ? payload.debit_ledger_id
        : null,
    idempotentReplay: Boolean(payload.idempotent_replay),
  };
}
