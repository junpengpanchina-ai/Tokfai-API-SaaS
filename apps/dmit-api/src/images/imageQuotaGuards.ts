/**
 * P995 — Image quota parity with chat/responses precheck.
 *
 * Soft-check only (same class as text): period caps sum charged usage_logs.
 * Extreme concurrency may slightly overshoot daily/monthly caps; balance is
 * still protected by atomic debit_credits. No reservation / advisory lock.
 *
 * Call sites: POST /v1/images/generations (before insert) and worker
 * billing_check (before upstream).
 */

import { ApiError } from "../errors.js";
import { assertCreditPeriodLimits } from "../gateway/keySafetyLimits.js";
import { assertTrialQuotaGuards } from "../gateway/trialQuotaGuard.js";
import { supabase } from "../supabase.js";

export type AssertImageQuotaGuardsArgs = {
  userId: string;
  apiKeyId?: string | null;
  keyId?: string | null;
  tenantId?: string | null;
  model: string;
  requestedRaw?: string;
  requestId: string;
  route?: string;
};

/** Balance precheck — same semantics as chat executeChatCompletion. */
export async function assertHasCredits(userId: string): Promise<void> {
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

type GuardImpls = {
  assertHasCredits: (userId: string) => Promise<void>;
  assertCreditPeriodLimits: typeof assertCreditPeriodLimits;
  assertTrialQuotaGuards: typeof assertTrialQuotaGuards;
};

let testGuardImpls: Partial<GuardImpls> | null = null;

/** Test-only: inject guard implementations (no live DB). Pass null to clear. */
export function __imageQuotaGuardsTestSet(
  overrides: Partial<GuardImpls> | null
): void {
  testGuardImpls = overrides;
}

/**
 * Sequential soft guards — must not invent a second quota formula.
 * Order: balance → user daily/monthly → per-key trial/daily/monthly.
 */
export async function assertImageQuotaGuards(
  args: AssertImageQuotaGuardsArgs
): Promise<void> {
  const hasCredits =
    testGuardImpls?.assertHasCredits ?? assertHasCredits;
  const periodLimits =
    testGuardImpls?.assertCreditPeriodLimits ?? assertCreditPeriodLimits;
  const trialGuards =
    testGuardImpls?.assertTrialQuotaGuards ?? assertTrialQuotaGuards;

  await hasCredits(args.userId);
  await periodLimits(args.userId, {
    apiKeyId: args.apiKeyId,
    keyId: args.keyId,
    tenantId: args.tenantId,
  });
  await trialGuards({
    userId: args.userId,
    apiKeyId: args.apiKeyId,
    keyId: args.keyId,
    tenantId: args.tenantId,
    model: args.model,
    requestedRaw: args.requestedRaw,
    requestId: args.requestId,
    route: args.route ?? "/v1/images/generations",
  });
}
