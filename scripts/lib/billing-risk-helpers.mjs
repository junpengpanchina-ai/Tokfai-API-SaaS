/**
 * Shared helpers for P900 billing risk audit + P905 drilldown (read-only).
 * Never logs full API keys or secrets.
 */

export function redactId(id) {
  if (id == null || id === "") return "(null)";
  const s = String(id);
  if (s.length <= 10) return `${s.slice(0, 2)}…`;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

export function redactEmail(email) {
  if (!email || typeof email !== "string") return "(null)";
  const at = email.indexOf("@");
  if (at <= 0) return redactId(email);
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const localRed =
    local.length <= 2 ? `${local[0] ?? "x"}…` : `${local.slice(0, 2)}…`;
  return `${localRed}@${domain}`;
}

export function maskApiKeyPrefix(prefix) {
  if (!prefix || typeof prefix !== "string") return "(null)";
  if (prefix.length <= 12) return `${prefix.slice(0, 6)}…`;
  return `${prefix.slice(0, 14)}…`;
}

export function toNumber(value) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Known legitimate credit_ledger reference_id prefixes / patterns. */
export const LEGIT_REFERENCE_PATTERNS = [
  /^signup_bonus:/i,
  /^stripe_checkout:/i,
  /^admin_adjustment:/i,
  /^ops_[a-z0-9_]+:/i,
  /^pi_/i,
  /^cs_/i,
  /^ch_/i,
  /^order_/i,
  /^credit_order:/i,
];

/** Known legitimate reason substrings (case-insensitive). */
export const LEGIT_REASON_PATTERNS = [
  /signup\s*bonus/i,
  /admin/i,
  /stripe/i,
  /payment/i,
  /checkout/i,
  /manual/i,
  /grant/i,
  /top[\s_-]?up/i,
  /order/i,
  /webhook/i,
  /refund/i,
  /public_beta/i,
  /compensation/i,
  /correction/i,
  /offline_payment/i,
  /migration/i,
  /internal_test/i,
  /invite/i,
];

/**
 * Classify a positive credit_ledger row for audit.
 * Returns { status, source, has_payment_ref, has_admin_audit, classification }
 *
 * status:
 *   - accounted — known payment / signup / admin / migration source
 *   - internal_test_candidate — likely test/admin account; P1 ops follow-up
 *   - unaccounted — ordinary user grant with no voucher → P0
 */
export function classifyPositiveLedgerRow(row, ctx = {}) {
  const reason = String(row.reason ?? "");
  const ref = String(row.reference_id ?? "");
  const type = String(row.type ?? "");

  const hasLegitRef = LEGIT_REFERENCE_PATTERNS.some((re) => re.test(ref));
  const hasLegitReason = LEGIT_REASON_PATTERNS.some((re) => re.test(reason));
  const hasPaymentRef =
    /^stripe_checkout:/i.test(ref) ||
    /^pi_/i.test(ref) ||
    /^cs_/i.test(ref) ||
    /^ch_/i.test(ref) ||
    /stripe|payment|checkout/i.test(reason);
  const hasAdminAudit = Boolean(ctx.adminAudit);
  const isAdminUser = Boolean(ctx.isAdminUser);
  const isAllowlistedUnlimited = Boolean(ctx.isUnlimitedAllowlisted);

  let source = "unknown";
  if (/^signup_bonus:/i.test(ref) || /signup\s*bonus/i.test(reason)) {
    source = "signup_bonus";
  } else if (/^stripe_checkout:/i.test(ref) || /stripe|checkout/i.test(reason)) {
    source = "stripe_checkout";
  } else if (/^admin_adjustment:/i.test(ref) || hasAdminAudit) {
    source = "admin_adjustment";
  } else if (/^ops_/i.test(ref) || /migration/i.test(reason)) {
    source = "ops_or_migration";
  } else if (type === "refund" || /refund/i.test(reason)) {
    source = "refund";
  } else if (type === "purchase") {
    source = hasPaymentRef ? "purchase" : "purchase_missing_ref";
  } else if (type === "grant") {
    source = "grant";
  } else if (type === "adjustment") {
    source = "adjustment";
  }

  if (hasLegitRef || hasLegitReason || hasAdminAudit) {
    return {
      status: "accounted",
      source,
      has_payment_ref: hasPaymentRef,
      has_admin_audit: hasAdminAudit,
      classification: "legitimate_known_source",
    };
  }

  if (isAdminUser || isAllowlistedUnlimited || /test|internal|demo/i.test(reason)) {
    return {
      status: "internal_test_candidate",
      source,
      has_payment_ref: hasPaymentRef,
      has_admin_audit: hasAdminAudit,
      classification: "likely_internal_or_test_grant",
    };
  }

  return {
    status: "unaccounted",
    source,
    has_payment_ref: hasPaymentRef,
    has_admin_audit: hasAdminAudit,
    classification: "ordinary_user_unvouchered_grant",
  };
}

export function recommendedActionForLargeBalance(diag) {
  const parts = [
    "Do NOT auto-clear balance. Run: TOKFAI_RISK_USER_ID=<id> node scripts/p905-billing-risk-drilldown.mjs",
  ];
  if (diag?.is_admin_user || diag?.is_unlimited_allowlisted) {
    parts.push(
      "Likely test/internal account: add admin_reason / mark ledger as internal_test_grant in admin_audit_logs (manual)."
    );
  } else if (diag?.ledger_explained_by_known_sources) {
    parts.push(
      "Balance explained by known Stripe/admin/signup ledger rows — verify totals, then document migration_reason if historical."
    );
  } else {
    parts.push(
      "Suspicious large balance: temporarily lower daily_credit_limit for this user, revoke related keys if abuse suspected, then manually verify Stripe/admin grants."
    );
  }
  return parts.join(" ");
}

export function recommendedActionForUnaccountedLedger(cls, diag) {
  if (cls.status === "internal_test_candidate") {
    return (
      "Likely test account grant without formal voucher. " +
      "Manually add admin_reason / mark as internal_test_grant / append audit reason " +
      "(do not auto-delete ledger). Drilldown: TOKFAI_RISK_LEDGER_ID=<id> node scripts/p905-billing-risk-drilldown.mjs"
    );
  }
  if (cls.source === "ops_or_migration" || /migration/i.test(String(diag?.reason ?? ""))) {
    return (
      "Possible historical migration row. Manually backfill migration_reason on the ledger/audit trail. " +
      "Do not auto-delete. Drilldown with TOKFAI_RISK_LEDGER_ID."
    );
  }
  return (
    "P0: ordinary user positive credit with no Stripe/payment/admin voucher. " +
    "Do not auto-clear. Revoke related API keys or set a temporary daily limit, " +
    "then manually verify and either reverse via admin adjust or attach payment/admin reason. " +
    "Drilldown: TOKFAI_RISK_LEDGER_ID=<id> node scripts/p905-billing-risk-drilldown.mjs"
  );
}

export function buildManualSqlSuggestions({ userId, ledgerId } = {}) {
  const stmts = [];
  if (userId) {
    stmts.push(
      `-- profile (read-only)\nselect id, email, credits_balance, created_at, updated_at\nfrom public.profiles where id = '${userId}';`
    );
    stmts.push(
      `-- recent ledger (read-only)\nselect id, type, amount, reason, reference_id, created_at\nfrom public.credit_ledger\nwhere user_id = '${userId}'\norder by created_at desc limit 20;`
    );
    stmts.push(
      `-- recent usage (read-only)\nselect id, request_id, model, status, billing_status, credits_charged, created_at\nfrom public.usage_logs\nwhere user_id = '${userId}'\norder by created_at desc limit 20;`
    );
    stmts.push(
      `-- active keys masked (read-only)\nselect id, prefix, revoked_at, tenant_id, created_at\nfrom public.api_keys\nwhere user_id = '${userId}' and revoked_at is null;`
    );
  }
  if (ledgerId) {
    stmts.push(
      `-- ledger row (read-only)\nselect id, user_id, type, amount, reason, reference_id, tenant_id, created_at\nfrom public.credit_ledger where id = '${ledgerId}';`
    );
    stmts.push(
      `-- admin audit linked to ledger (read-only)\nselect id, actor_user_id, actor_email, action, status, request_payload, created_at\nfrom public.admin_audit_logs\nwhere credit_ledger_id = '${ledgerId}'\nlimit 10;`
    );
  }
  stmts.push(
    "-- Do NOT run UPDATE/DELETE/revoke from this script. Manual ops only after review."
  );
  return stmts;
}
