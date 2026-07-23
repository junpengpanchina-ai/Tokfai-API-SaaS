/**
 * Vision analyze usage helpers.
 *
 * Independent of chat / image-generation billing paths.
 * usage type label: vision_analyze (application-level; endpoint is the ledger key).
 */

import { recordSuccessfulUsageAndDebit } from "./usageBilling.js";
import { log } from "../logger.js";
import { supabase } from "../supabase.js";
import type { UsageLogInsert } from "../types.js";

export const VISION_ANALYZE_USAGE_TYPE = "vision_analyze" as const;
export const VISION_ANALYZE_ENDPOINT = "/v1/vision/analyze" as const;

export async function recordVisionAnalyzeSuccess(args: {
  entry: UsageLogInsert;
  responseSnapshot?: Record<string, unknown> | null;
}): Promise<{ creditsCharged: number }> {
  const entry: UsageLogInsert = {
    ...args.entry,
    billable: true,
    billing_status: "charged",
    endpoint: VISION_ANALYZE_ENDPOINT,
    // Application usage-type marker (not a Postgres enum).
    safety_reason: `usage_type=${VISION_ANALYZE_USAGE_TYPE}`,
  };

  await recordSuccessfulUsageAndDebit(entry, {
    endpoint: VISION_ANALYZE_ENDPOINT,
    responseSnapshot: args.responseSnapshot ?? null,
  });

  return { creditsCharged: entry.credits_charged ?? 0 };
}

export async function recordVisionAnalyzeFailure(
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
    upstream_id: entry.upstream_id ?? null,
    billable: false,
    finish_reason: null,
    safety_reason: `usage_type=${VISION_ANALYZE_USAGE_TYPE}`,
    billing_status: "not_billable",
    endpoint: VISION_ANALYZE_ENDPOINT,
    ...entry,
  });

  if (error) {
    log.warn("usage_log_insert_failed", {
      requestId: entry.request_id,
      route: VISION_ANALYZE_ENDPOINT,
      usageType: VISION_ANALYZE_USAGE_TYPE,
      code: "usage_log_insert_failed",
      message: "Failed to write vision_analyze usage log.",
    });
  }
}
