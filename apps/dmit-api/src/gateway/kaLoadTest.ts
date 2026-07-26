import { env } from "../env.js";

/**
 * P953 — production load-test allowlist for elevated gateway quotas.
 *
 * Hard limits:
 * - Does NOT skip auth, billing debit, or balance checks.
 * - Does NOT raise global defaults for ordinary keys.
 * - Does NOT touch Nano Banana / image worker paths.
 * - Empty KA_LOAD_TEST_KEYS + KA_LOAD_TEST_TENANTS ⇒ identical to normal policy.
 */

export type RateLimitPolicy = "normal" | "ka_load_test";

export interface KaLoadTestLimits {
  policy: RateLimitPolicy;
  keyRpm: number;
  keyConcurrency: number;
  tenantRpm: number;
  ipRpm: number;
  /** When true, daily/monthly credit period caps are skipped for this caller. */
  skipCreditPeriodLimits: boolean;
}

function listed(id: string | null | undefined, allow: readonly string[]): boolean {
  if (!id) return false;
  const needle = id.trim();
  if (!needle) return false;
  return allow.includes(needle);
}

/**
 * Pure resolver (testable without mutating process env).
 * `keys` may contain api_keys.id (UUID) and/or api_keys.key_id (12-hex).
 */
export function resolveKaLoadTestLimits(input: {
  apiKeyId: string | null | undefined;
  keyId?: string | null | undefined;
  tenantId: string | null | undefined;
  keys: readonly string[];
  tenants: readonly string[];
  normal: {
    keyRpm: number;
    keyConcurrency: number;
    tenantRpm: number;
    ipRpm: number;
  };
  ka: {
    keyRpm: number;
    keyConcurrency: number;
    tenantRpm: number;
    ipRpm: number;
  };
}): KaLoadTestLimits {
  const keyHit =
    listed(input.apiKeyId, input.keys) || listed(input.keyId, input.keys);
  const tenantHit = listed(input.tenantId, input.tenants);
  const hit = keyHit || tenantHit;

  if (!hit) {
    return {
      policy: "normal",
      keyRpm: input.normal.keyRpm,
      keyConcurrency: input.normal.keyConcurrency,
      tenantRpm: input.normal.tenantRpm,
      ipRpm: input.normal.ipRpm,
      skipCreditPeriodLimits: false,
    };
  }

  return {
    policy: "ka_load_test",
    keyRpm: input.ka.keyRpm,
    keyConcurrency: input.ka.keyConcurrency,
    tenantRpm: input.ka.tenantRpm,
    ipRpm: input.ka.ipRpm,
    // Period caps only for listed *keys* (not tenant-wide).
    // Balance check + success debit still apply.
    skipCreditPeriodLimits: keyHit,
  };
}

/** Runtime resolver backed by env allowlists + elevated defaults. */
export function getKaLoadTestLimits(input: {
  apiKeyId: string | null | undefined;
  keyId?: string | null | undefined;
  tenantId: string | null | undefined;
}): KaLoadTestLimits {
  return resolveKaLoadTestLimits({
    apiKeyId: input.apiKeyId,
    keyId: input.keyId,
    tenantId: input.tenantId,
    keys: env.KA_LOAD_TEST_KEYS,
    tenants: env.KA_LOAD_TEST_TENANTS,
    normal: {
      keyRpm: env.TOKFAI_RATE_LIMIT_RPM,
      keyConcurrency: env.TOKFAI_MAX_CONCURRENCY_PER_KEY,
      tenantRpm: env.TOKFAI_RATE_LIMIT_TENANT_RPM,
      ipRpm: env.TOKFAI_RATE_LIMIT_IP_RPM,
    },
    ka: {
      keyRpm: env.KA_LOAD_TEST_KEY_RPM,
      keyConcurrency: env.KA_LOAD_TEST_KEY_CONCURRENCY,
      tenantRpm: env.KA_LOAD_TEST_TENANT_RPM,
      ipRpm: env.KA_LOAD_TEST_IP_RPM,
    },
  });
}

export function isKaLoadTestCaller(input: {
  apiKeyId: string | null | undefined;
  keyId?: string | null | undefined;
  tenantId: string | null | undefined;
}): boolean {
  return getKaLoadTestLimits(input).policy === "ka_load_test";
}
