/**
 * Audio transcription usage / billing seam (P1072).
 * Never uses chat token pricing to fake STT charges.
 */

import { log } from "../logger.js";
import { supabase } from "../supabase.js";
import type { UsageLogInsert } from "../types.js";
import { recordSuccessfulUsageAndDebit } from "./usageBilling.js";

export const AUDIO_TRANSCRIPTION_USAGE_TYPE = "audio_transcription" as const;
export const AUDIO_TRANSCRIPTION_ENDPOINT =
  "/v1/audio/transcriptions" as const;

export async function recordAudioTranscriptionSuccess(args: {
  entry: UsageLogInsert;
  /** When false, write not_billable success (price not configured). */
  billable: boolean;
  responseSnapshot?: Record<string, unknown> | null;
}): Promise<{ creditsCharged: number; billingStatus: string }> {
  if (!args.billable || !(Number(args.entry.credits_charged ?? 0) > 0)) {
    const { error } = await supabase().from("usage_logs").insert({
      ...args.entry,
      billable: false,
      billing_status: "not_billable",
      credits_charged: 0,
      endpoint: AUDIO_TRANSCRIPTION_ENDPOINT,
      safety_reason: `usage_type=${AUDIO_TRANSCRIPTION_USAGE_TYPE}`,
    });
    if (error) {
      log.warn("usage_log_insert_failed", {
        requestId: args.entry.request_id,
        route: AUDIO_TRANSCRIPTION_ENDPOINT,
        usageType: AUDIO_TRANSCRIPTION_USAGE_TYPE,
        code: "usage_log_insert_failed",
      });
    }
    return { creditsCharged: 0, billingStatus: "not_billable" };
  }

  const entry: UsageLogInsert = {
    ...args.entry,
    billable: true,
    billing_status: "charged",
    endpoint: AUDIO_TRANSCRIPTION_ENDPOINT,
    safety_reason: `usage_type=${AUDIO_TRANSCRIPTION_USAGE_TYPE}`,
  };

  await recordSuccessfulUsageAndDebit(entry, {
    endpoint: AUDIO_TRANSCRIPTION_ENDPOINT,
    responseSnapshot: args.responseSnapshot ?? null,
  });

  return {
    creditsCharged: entry.credits_charged ?? 0,
    billingStatus: "charged",
  };
}

export async function recordAudioTranscriptionFailure(
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
    safety_reason: `usage_type=${AUDIO_TRANSCRIPTION_USAGE_TYPE}`,
    billing_status: "not_billable",
    endpoint: AUDIO_TRANSCRIPTION_ENDPOINT,
    ...entry,
  });

  if (error) {
    log.warn("usage_log_insert_failed", {
      requestId: entry.request_id,
      route: AUDIO_TRANSCRIPTION_ENDPOINT,
      usageType: AUDIO_TRANSCRIPTION_USAGE_TYPE,
      code: "usage_log_insert_failed",
    });
  }
}
