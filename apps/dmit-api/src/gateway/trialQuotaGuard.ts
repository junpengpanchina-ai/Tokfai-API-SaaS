/**
 * P982 — Trial quota / tenant commercial risk control (early guard).
 *
 * Runs before upstream. Failures are not_billable (no debit).
 * Never logs full API secrets — only masked prefix / short ids.
 */

import { ApiError } from "../errors.js";
import { env } from "../env.js";
import { log } from "../logger.js";
import { supabase } from "../supabase.js";
import { isUnlimitedBillingUser } from "./keySafetyLimits.js";
import { maskApiKeyId } from "../auth/apiKey.js";

export const TRIAL_QUOTA_ERROR_CODES = new Set([
  "quota_exceeded",
  "daily_limit_exceeded",
  "monthly_limit_exceeded",
  "trial_limit_exceeded",
  "trial_model_not_allowed",
]);

export type ApiKeyQuotaRow = {
  id: string;
  prefix: string | null;
  trial_mode: boolean;
  trial_credits_limit: number | string | null;
  daily_credit_limit: number | string | null;
  monthly_credit_limit: number | string | null;
};

function toFiniteNumber(
  value: number | string | null | undefined
): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function startOfUtcDayIso(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function startOfUtcMonthIso(): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Exported for smoke / unit-style static verification. */
export function parseTrialAllowedModels(
  raw: string | string[] | undefined
): string[] {
  if (Array.isArray(raw)) {
    return raw.map((s) => s.trim().toLowerCase()).filter(Boolean);
  }
  return String(raw ?? "")
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isModelAllowedForTrial(
  model: string,
  allowed: string[]
): boolean {
  const id = model.trim().toLowerCase();
  if (!id) return false;
  if (allowed.length === 0) return false;
  if (allowed.includes("*") || allowed.includes("all")) return true;
  if (allowed.includes(id)) return true;
  // Prefix match for nano-banana* style denylist is not used; allow exact only.
  return false;
}

async function sumChargedCreditsForKey(
  apiKeyId: string,
  sinceIso: string | null
): Promise<number> {
  let query = supabase()
    .from("usage_logs")
    .select("credits_charged")
    .eq("api_key_id", apiKeyId)
    .eq("billing_status", "charged")
    .gt("credits_charged", 0)
    .limit(5000);

  if (sinceIso) {
    query = query.gte("created_at", sinceIso);
  }

  const { data, error } = await query;
  if (error) {
    log.warn("trial_quota_sum_failed", {
      apiKeyIdMasked: maskApiKeyId(apiKeyId),
      message: "Failed to sum charged credits for trial/quota guard.",
    });
    // Fail open on read errors — atomic debit still protects balance.
    return 0;
  }

  let sum = 0;
  for (const row of data ?? []) {
    const n = Number(
      (row as { credits_charged?: number | string | null }).credits_charged
    );
    if (Number.isFinite(n) && n > 0) sum += n;
  }
  return sum;
}

export async function loadApiKeyQuotaConfig(
  apiKeyId: string
): Promise<ApiKeyQuotaRow | null> {
  const { data, error } = await supabase()
    .from("api_keys")
    .select(
      "id, prefix, trial_mode, trial_credits_limit, daily_credit_limit, monthly_credit_limit"
    )
    .eq("id", apiKeyId)
    .maybeSingle();

  if (error) {
    // Missing columns (migration not applied) → treat as no trial overrides.
    const msg = error.message?.toLowerCase?.() ?? "";
    if (
      msg.includes("column") &&
      (msg.includes("does not exist") || msg.includes("could not find"))
    ) {
      log.warn("trial_quota_columns_missing", {
        apiKeyIdMasked: maskApiKeyId(apiKeyId),
        message: "P982 columns missing — trial guard soft-disabled for key.",
      });
      return null;
    }
    log.warn("trial_quota_key_load_failed", {
      apiKeyIdMasked: maskApiKeyId(apiKeyId),
      message: error.message,
    });
    return null;
  }

  if (!data) return null;
  const row = data as ApiKeyQuotaRow;
  return {
    id: row.id,
    prefix: row.prefix ?? null,
    trial_mode: Boolean(row.trial_mode),
    trial_credits_limit: row.trial_credits_limit,
    daily_credit_limit: row.daily_credit_limit,
    monthly_credit_limit: row.monthly_credit_limit,
  };
}

function throwQuotaError(args: {
  status: number;
  code: string;
  message: string;
  publicMessage: string;
}): never {
  throw new ApiError({
    status: args.status,
    message: args.message,
    code: args.code,
    type:
      args.code === "trial_model_not_allowed"
        ? "invalid_request_error"
        : "rate_limit_error",
    publicMessage: args.publicMessage,
  });
}

/**
 * Early commercial guard: trial model allowlist + per-key trial/daily/monthly caps.
 */
export async function assertTrialQuotaGuards(args: {
  userId: string;
  apiKeyId: string | null | undefined;
  keyId?: string | null;
  tenantId?: string | null;
  model: string;
  requestedRaw?: string;
  requestId: string;
  route?: string;
}): Promise<void> {
  if (!env.TOKFAI_TRIAL_GUARD_ENABLED) return;
  if (isUnlimitedBillingUser(args.userId)) return;
  if (!args.apiKeyId) return;

  const config = await loadApiKeyQuotaConfig(args.apiKeyId);
  if (!config) return;

  const allowedModels = parseTrialAllowedModels(env.TOKFAI_TRIAL_ALLOWED_MODELS);
  const prefixMasked = config.prefix?.trim() || maskApiKeyId(args.apiKeyId);

  if (config.trial_mode) {
    const candidates = [args.model, args.requestedRaw ?? ""]
      .map((s) => s.trim())
      .filter(Boolean);
    const allowed = candidates.some((m) =>
      isModelAllowedForTrial(m, allowedModels)
    );
    if (!allowed) {
      log.warn("trial_model_blocked", {
        requestId: args.requestId,
        route: args.route ?? "/v1/chat/completions",
        userId: args.userId,
        apiKeyPrefix: prefixMasked,
        apiKeyIdMasked: maskApiKeyId(args.apiKeyId),
        model: args.model,
        requestedModel: args.requestedRaw ?? args.model,
        code: "trial_model_not_allowed",
        billing_status: "not_billable",
        credits_charged: 0,
      });
      throwQuotaError({
        status: 403,
        code: "trial_model_not_allowed",
        message: "Model not allowed for trial API keys.",
        publicMessage:
          "当前试用 Key 不能使用该模型。请改用 auto-fast / auto-cheap，或联系升级正式额度。",
      });
    }

    const trialCap =
      toFiniteNumber(config.trial_credits_limit) ??
      env.TOKFAI_TRIAL_DEFAULT_CREDITS_LIMIT;
    if (trialCap > 0) {
      const lifetime = await sumChargedCreditsForKey(args.apiKeyId, null);
      if (lifetime >= trialCap) {
        log.warn("trial_limit_exceeded", {
          requestId: args.requestId,
          userId: args.userId,
          apiKeyPrefix: prefixMasked,
          apiKeyIdMasked: maskApiKeyId(args.apiKeyId),
          model: args.model,
          lifetime,
          trialCap,
          code: "trial_limit_exceeded",
          billing_status: "not_billable",
          credits_charged: 0,
        });
        throwQuotaError({
          status: 429,
          code: "trial_limit_exceeded",
          message: "Trial credit limit exceeded.",
          publicMessage:
            "试用额度已用尽。请充值或联系升级，本次请求未扣费。",
        });
      }
    }
  }

  const dailyCap =
    toFiniteNumber(config.daily_credit_limit) ??
    (config.trial_mode ? env.TOKFAI_TRIAL_DAILY_CREDIT_LIMIT : null);
  if (dailyCap != null && dailyCap > 0) {
    const daily = await sumChargedCreditsForKey(
      args.apiKeyId,
      startOfUtcDayIso()
    );
    if (daily >= dailyCap) {
      log.warn("daily_limit_exceeded", {
        requestId: args.requestId,
        userId: args.userId,
        apiKeyPrefix: prefixMasked,
        apiKeyIdMasked: maskApiKeyId(args.apiKeyId),
        model: args.model,
        daily,
        dailyCap,
        code: "daily_limit_exceeded",
        billing_status: "not_billable",
        credits_charged: 0,
      });
      throwQuotaError({
        status: 429,
        code: "daily_limit_exceeded",
        message: "Daily credit limit exceeded.",
        publicMessage:
          "今日额度已用尽。请明日再试或联系提升限额，本次请求未扣费。",
      });
    }
  }

  const monthlyCap =
    toFiniteNumber(config.monthly_credit_limit) ??
    (config.trial_mode ? env.TOKFAI_TRIAL_MONTHLY_CREDIT_LIMIT : null);
  if (monthlyCap != null && monthlyCap > 0) {
    const monthly = await sumChargedCreditsForKey(
      args.apiKeyId,
      startOfUtcMonthIso()
    );
    if (monthly >= monthlyCap) {
      log.warn("quota_exceeded", {
        requestId: args.requestId,
        userId: args.userId,
        apiKeyPrefix: prefixMasked,
        apiKeyIdMasked: maskApiKeyId(args.apiKeyId),
        model: args.model,
        monthly,
        monthlyCap,
        code: "quota_exceeded",
        billing_status: "not_billable",
        credits_charged: 0,
      });
      throwQuotaError({
        status: 429,
        code: "quota_exceeded",
        message: "Credit quota exceeded.",
        publicMessage:
          "配额已用尽。请联系升级或等待下个周期，本次请求未扣费。",
      });
    }
  }
}

/** Structured commercial trace — never includes full secrets. */
export function logCommercialRequestTrace(args: {
  phase: "success" | "failure" | "guard";
  requestId: string;
  route?: string;
  userId: string;
  apiKeyId?: string | null;
  apiKeyPrefix?: string | null;
  model: string;
  status: string;
  creditsCharged: number;
  errorCode?: string | null;
}): void {
  log.info("commercial_request_trace", {
    phase: args.phase,
    requestId: args.requestId,
    route: args.route ?? "/v1/chat/completions",
    userId: args.userId,
    apiKeyIdMasked: args.apiKeyId ? maskApiKeyId(args.apiKeyId) : null,
    apiKeyPrefix: args.apiKeyPrefix ?? null,
    model: args.model,
    status: args.status,
    credits_charged: args.creditsCharged,
    error_code: args.errorCode ?? null,
  });
}
