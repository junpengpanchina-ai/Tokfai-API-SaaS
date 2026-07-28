/**
 * P961 — orphan_cost_audit + reconcile decision helpers.
 * Keep in sync with scripts/lib/image-cost-reconciliation.mjs.
 *
 * Does not touch Chat / P954 isolation.
 */

/** Soft timeout_pending left unreconciled beyond this → orphan alarm. */
export const ORPHAN_TIMEOUT_PENDING_THRESHOLD_MS = 15 * 60 * 1000;

export type OrphanCostFlags = {
  provider_success_unpaid: boolean;
  charged_missing_url: boolean;
  stale_timeout_pending: boolean;
};

export type OrphanAuditInput = {
  providerSuccess: boolean;
  customerCharged: boolean;
  missingUrl: boolean;
  timeoutPending?: boolean;
  timeoutPendingAgeMs?: number | null;
  reconciled?: boolean;
  thresholdMs?: number;
};

export type OrphanAuditResult = {
  ok: boolean;
  alarms: string[];
  flags: OrphanCostFlags;
};

/**
 * orphan_cost_audit:
 * - provider_success=true && customer_charged=false → alarm
 * - customer_charged=true && missing_url=true → alarm
 * - timeout_pending past threshold without reconciliation → alarm
 */
export function auditOrphanCost(input: OrphanAuditInput): OrphanAuditResult {
  const thresholdMs =
    typeof input.thresholdMs === "number" && input.thresholdMs > 0
      ? input.thresholdMs
      : ORPHAN_TIMEOUT_PENDING_THRESHOLD_MS;

  const providerSuccessUnpaid =
    Boolean(input.providerSuccess) && !Boolean(input.customerCharged);
  const chargedMissingUrl =
    Boolean(input.customerCharged) && Boolean(input.missingUrl);
  const age =
    typeof input.timeoutPendingAgeMs === "number" &&
    Number.isFinite(input.timeoutPendingAgeMs)
      ? input.timeoutPendingAgeMs
      : null;
  const staleTimeoutPending =
    Boolean(input.timeoutPending) &&
    !Boolean(input.reconciled) &&
    age != null &&
    age >= thresholdMs;

  const alarms: string[] = [];
  if (providerSuccessUnpaid) alarms.push("provider_success_unpaid");
  if (chargedMissingUrl) alarms.push("charged_missing_url");
  if (staleTimeoutPending) alarms.push("stale_timeout_pending");

  return {
    ok: alarms.length === 0,
    alarms,
    flags: {
      provider_success_unpaid: providerSuccessUnpaid,
      charged_missing_url: chargedMissingUrl,
      stale_timeout_pending: staleTimeoutPending,
    },
  };
}

export type ReconcileAction =
  | "later_completed"
  | "provider_failed"
  | "hard_timeout"
  | "still_pending"
  | "missing_url";

export type ReconcileDecision = {
  action: ReconcileAction;
  billable: boolean;
  customerBillingStatus: "charged" | "not_billable" | "pending";
};

export function decideReconcileAction(input: {
  providerStatus: string | null | undefined;
  providerUrl: string | null | undefined;
  hardTimedOut?: boolean;
}): ReconcileDecision {
  const status = String(input.providerStatus ?? "")
    .trim()
    .toLowerCase();
  const url =
    typeof input.providerUrl === "string" && input.providerUrl.trim()
      ? input.providerUrl.trim()
      : null;

  const failed = ["failed", "error", "cancelled", "canceled"].includes(status);
  const succeeded = ["succeeded", "success", "completed", "done"].includes(
    status
  );

  if (url) {
    return {
      action: "later_completed",
      billable: true,
      customerBillingStatus: "charged",
    };
  }

  if (succeeded && !url) {
    return {
      action: "missing_url",
      billable: false,
      customerBillingStatus: "not_billable",
    };
  }

  if (failed) {
    return {
      action: "provider_failed",
      billable: false,
      customerBillingStatus: "not_billable",
    };
  }

  if (input.hardTimedOut) {
    return {
      action: "hard_timeout",
      billable: false,
      customerBillingStatus: "not_billable",
    };
  }

  return {
    action: "still_pending",
    billable: false,
    customerBillingStatus: "pending",
  };
}

export function hasImageResultUrl(resultData: unknown): boolean {
  if (!Array.isArray(resultData)) return false;
  return resultData.some((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const url = (item as Record<string, unknown>).url;
    return typeof url === "string" && url.trim().length > 0;
  });
}
