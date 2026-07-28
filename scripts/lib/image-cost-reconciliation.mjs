/**
 * P961 — Pure image cost reconciliation / orphan cost audit helpers.
 * Used by smoke + mirrored by apps/dmit-api/src/images/orphanCostAudit.ts.
 */

/** Soft timeout_pending left unreconciled beyond this → orphan alarm. */
export const ORPHAN_TIMEOUT_PENDING_THRESHOLD_MS = 15 * 60 * 1000;

/**
 * @typedef {object} OrphanAuditInput
 * @property {boolean} providerSuccess
 * @property {boolean} customerCharged
 * @property {boolean} missingUrl
 * @property {boolean} [timeoutPending]
 * @property {number|null} [timeoutPendingAgeMs]
 * @property {boolean} [reconciled]
 * @property {number} [thresholdMs]
 */

/**
 * @typedef {object} OrphanAuditResult
 * @property {boolean} ok
 * @property {string[]} alarms
 * @property {{
 *   provider_success_unpaid: boolean,
 *   charged_missing_url: boolean,
 *   stale_timeout_pending: boolean,
 * }} flags
 */

/**
 * orphan_cost_audit rules:
 * - provider_success && !customer_charged → alarm
 * - customer_charged && missing_url → alarm
 * - timeout_pending past threshold without reconciliation → alarm
 *
 * @param {OrphanAuditInput} input
 * @returns {OrphanAuditResult}
 */
export function auditOrphanCost(input) {
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

  /** @type {string[]} */
  const alarms = [];
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

/**
 * Decide reconcile action from provider poll snapshot.
 *
 * @param {{
 *   providerStatus: string | null | undefined,
 *   providerUrl: string | null | undefined,
 *   hardTimedOut?: boolean,
 * }} input
 * @returns {{
 *   action: "later_completed" | "provider_failed" | "hard_timeout" | "still_pending" | "missing_url",
 *   billable: boolean,
 *   customerBillingStatus: "charged" | "not_billable" | "pending",
 * }}
 */
export function decideReconcileAction(input) {
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

/**
 * Scenario fixtures for P961 smoke (success / timeout_pending /
 * later_completed / provider_failed / missing_url).
 */
export const P961_SCENARIO_FIXTURES = {
  success: {
    name: "success",
    providerSuccess: true,
    customerCharged: true,
    missingUrl: false,
    timeoutPending: false,
    timeoutPendingAgeMs: null,
    reconciled: true,
    decide: {
      providerStatus: "completed",
      providerUrl: "https://cdn.example/ok.png",
    },
    expectAction: "later_completed",
    expectAuditOk: true,
  },
  timeout_pending: {
    name: "timeout_pending",
    providerSuccess: false,
    customerCharged: false,
    missingUrl: true,
    timeoutPending: true,
    timeoutPendingAgeMs: 60_000,
    reconciled: false,
    decide: {
      providerStatus: "processing",
      providerUrl: null,
    },
    expectAction: "still_pending",
    expectAuditOk: true,
  },
  later_completed: {
    name: "later_completed",
    providerSuccess: true,
    customerCharged: true,
    missingUrl: false,
    timeoutPending: true,
    timeoutPendingAgeMs: 180_000,
    reconciled: true,
    decide: {
      providerStatus: "completed",
      providerUrl: "https://cdn.example/late.png",
    },
    expectAction: "later_completed",
    expectAuditOk: true,
  },
  provider_failed: {
    name: "provider_failed",
    providerSuccess: false,
    customerCharged: false,
    missingUrl: true,
    timeoutPending: false,
    timeoutPendingAgeMs: null,
    reconciled: true,
    decide: {
      providerStatus: "failed",
      providerUrl: null,
    },
    expectAction: "provider_failed",
    expectAuditOk: true,
  },
  missing_url: {
    name: "missing_url",
    providerSuccess: true,
    customerCharged: true,
    missingUrl: true,
    timeoutPending: false,
    timeoutPendingAgeMs: null,
    reconciled: true,
    decide: {
      providerStatus: "completed",
      providerUrl: null,
    },
    expectAction: "missing_url",
    expectAuditOk: false,
  },
};

/**
 * Alarm-only fixtures that must trip orphan_cost_audit.
 */
export const P961_ORPHAN_ALARM_FIXTURES = {
  provider_success_unpaid: {
    providerSuccess: true,
    customerCharged: false,
    missingUrl: false,
    timeoutPending: false,
    expectAlarm: "provider_success_unpaid",
  },
  charged_missing_url: {
    providerSuccess: true,
    customerCharged: true,
    missingUrl: true,
    timeoutPending: false,
    expectAlarm: "charged_missing_url",
  },
  stale_timeout_pending: {
    providerSuccess: false,
    customerCharged: false,
    missingUrl: true,
    timeoutPending: true,
    timeoutPendingAgeMs: ORPHAN_TIMEOUT_PENDING_THRESHOLD_MS + 1,
    reconciled: false,
    expectAlarm: "stale_timeout_pending",
  },
};
