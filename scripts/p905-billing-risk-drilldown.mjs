#!/usr/bin/env node
/**
 * P905 — Billing risk drilldown (read-only).
 *
 * Deep-dive a single user or ledger row flagged by P900.
 * Never mutates data. Never revokes keys. Never clears balances.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     TOKFAI_RISK_USER_ID=<uuid> node scripts/p905-billing-risk-drilldown.mjs
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     TOKFAI_RISK_LEDGER_ID=<uuid> node scripts/p905-billing-risk-drilldown.mjs
 *
 * Offline (no env): exits 0 with SKIP — safe for public-beta-ready-all.
 */

import {
  buildManualSqlSuggestions,
  classifyPositiveLedgerRow,
  maskApiKeyPrefix,
  redactEmail,
  redactId,
  recommendedActionForLargeBalance,
  recommendedActionForUnaccountedLedger,
  toNumber,
} from "./lib/billing-risk-helpers.mjs";

const USER_ID = (process.env.TOKFAI_RISK_USER_ID ?? "").trim();
const LEDGER_ID = (process.env.TOKFAI_RISK_LEDGER_ID ?? "").trim();
const UNLIMITED_IDS = new Set(
  (process.env.TOKFAI_UNLIMITED_BILLING_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

function printSection(title, obj) {
  console.log(`\n--- ${title} ---`);
  console.log(JSON.stringify(obj, null, 2));
}

async function main() {
  console.log("=== Tokfai P905 Billing Risk Drilldown (read-only) ===\n");

  if (!USER_ID && !LEDGER_ID) {
    console.log(
      "SKIP  set TOKFAI_RISK_USER_ID and/or TOKFAI_RISK_LEDGER_ID for live drilldown"
    );
    console.log("TOKFAI_P905_BILLING_DRILLDOWN_SKIP");
    process.exit(0);
  }

  const url = process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key || key.length < 20) {
    console.error("Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for drilldown.");
    console.log("TOKFAI_P905_BILLING_DRILLDOWN_FAIL");
    process.exit(1);
  }

  const { createSupabaseAdminClient } = await import("./lib/supabase-admin.mjs");
  const supabase = createSupabaseAdminClient();

  let userId = USER_ID || null;
  let ledgerRow = null;

  if (LEDGER_ID) {
    const { data, error } = await supabase
      .from("credit_ledger")
      .select(
        "id, user_id, tenant_id, type, amount, balance_after, reason, reference_id, created_at"
      )
      .eq("id", LEDGER_ID)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      console.error(`Ledger not found: ${redactId(LEDGER_ID)}`);
      console.log("TOKFAI_P905_BILLING_DRILLDOWN_FAIL");
      process.exit(1);
    }
    ledgerRow = data;
    userId = userId || data.user_id;
  }

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select(
      "id, email, credits_balance, total_credits_purchased, total_credits_used, stripe_customer_id, created_at, updated_at"
    )
    .eq("id", userId)
    .maybeSingle();
  if (profileErr) throw new Error(profileErr.message);

  const { data: adminUser } = await supabase
    .from("admin_users")
    .select("id, user_id, email, status, revoked_at, notes")
    .eq("user_id", userId)
    .maybeSingle();

  const { data: keys } = await supabase
    .from("api_keys")
    .select("id, prefix, name, tenant_id, created_at, last_used_at, revoked_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  const { data: ledger } = await supabase
    .from("credit_ledger")
    .select(
      "id, type, amount, balance_after, reason, reference_id, tenant_id, created_at"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  const { data: usage } = await supabase
    .from("usage_logs")
    .select(
      "id, request_id, model, status, billing_status, credits_charged, billable, created_at"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  let adminAudit = null;
  if (ledgerRow?.id) {
    const { data } = await supabase
      .from("admin_audit_logs")
      .select(
        "id, actor_user_id, actor_email, action, status, request_payload, credit_ledger_id, created_at"
      )
      .eq("credit_ledger_id", ledgerRow.id)
      .limit(5);
    adminAudit = data?.[0] ?? null;
  }

  const tenantIds = [
    ...new Set(
      (keys ?? [])
        .map((k) => k.tenant_id)
        .filter(Boolean)
        .concat(ledgerRow?.tenant_id ? [ledgerRow.tenant_id] : [])
    ),
  ];

  printSection("profile", {
    user_id: redactId(profile?.id ?? userId),
    email: redactEmail(profile?.email),
    balance: toNumber(profile?.credits_balance),
    total_credits_purchased: toNumber(profile?.total_credits_purchased),
    total_credits_used: toNumber(profile?.total_credits_used),
    stripe_customer_id_present: Boolean(profile?.stripe_customer_id),
    created_at: profile?.created_at ?? null,
    updated_at: profile?.updated_at ?? null,
  });

  printSection("tenant", {
    tenant_ids_redacted: tenantIds.map(redactId),
    note: "tenant_id comes from api_keys / ledger; main-site may be null",
  });

  printSection("admin_identity", {
    is_admin_user: Boolean(
      adminUser && adminUser.status === "active" && !adminUser.revoked_at
    ),
    admin_user_id: redactId(adminUser?.id),
    admin_email: redactEmail(adminUser?.email),
    notes: adminUser?.notes ?? null,
    is_unlimited_allowlisted: UNLIMITED_IDS.has(userId),
  });

  printSection(
    "api_keys_masked",
    (keys ?? []).map((k) => ({
      id: redactId(k.id),
      prefix: maskApiKeyPrefix(k.prefix),
      name: k.name ?? null,
      tenant_id: redactId(k.tenant_id),
      created_at: k.created_at,
      last_used_at: k.last_used_at,
      revoked: Boolean(k.revoked_at),
    }))
  );

  printSection(
    "credit_ledger_recent",
    (ledger ?? []).map((r) => ({
      id: redactId(r.id),
      type: r.type,
      amount: toNumber(r.amount),
      balance_after: toNumber(r.balance_after),
      reason: r.reason,
      reference_id: redactId(r.reference_id),
      tenant_id: redactId(r.tenant_id),
      created_at: r.created_at,
      classification: classifyPositiveLedgerRow(r, {
        isAdminUser: Boolean(
          adminUser && adminUser.status === "active" && !adminUser.revoked_at
        ),
        isUnlimitedAllowlisted: UNLIMITED_IDS.has(userId),
        adminAudit: ledgerRow?.id === r.id ? adminAudit : null,
      }),
    }))
  );

  printSection(
    "usage_logs_recent",
    (usage ?? []).map((r) => ({
      id: redactId(r.id),
      request_id: redactId(r.request_id),
      model: r.model,
      status: r.status,
      billing_status: r.billing_status,
      billable: r.billable,
      credits_charged: toNumber(r.credits_charged),
      created_at: r.created_at,
    }))
  );

  const suspicious = [];
  if (toNumber(profile?.credits_balance) > 1_000_000) {
    suspicious.push("balance_above_1e6_threshold");
  }
  if (ledgerRow) {
    const cls = classifyPositiveLedgerRow(ledgerRow, {
      adminAudit,
      isAdminUser: Boolean(
        adminUser && adminUser.status === "active" && !adminUser.revoked_at
      ),
      isUnlimitedAllowlisted: UNLIMITED_IDS.has(userId),
    });
    if (cls.status !== "accounted") {
      suspicious.push(`ledger_${cls.classification}`);
    }
    printSection("target_ledger", {
      ledger_id: redactId(ledgerRow.id),
      user_id: redactId(ledgerRow.user_id),
      tenant_id: redactId(ledgerRow.tenant_id),
      amount: toNumber(ledgerRow.amount),
      reason: ledgerRow.reason,
      reference_id: redactId(ledgerRow.reference_id),
      created_at: ledgerRow.created_at,
      classification: cls,
      admin_audit: adminAudit
        ? {
            id: redactId(adminAudit.id),
            actor_user_id: redactId(adminAudit.actor_user_id),
            actor_email: redactEmail(adminAudit.actor_email),
            action: adminAudit.action,
            status: adminAudit.status,
            reason_in_payload:
              adminAudit.request_payload &&
              typeof adminAudit.request_payload === "object"
                ? adminAudit.request_payload.reason ?? null
                : null,
          }
        : null,
    });
  }

  const activeKeyCount = (keys ?? []).filter((k) => !k.revoked_at).length;
  const largeDiag = {
    is_admin_user: Boolean(
      adminUser && adminUser.status === "active" && !adminUser.revoked_at
    ),
    is_unlimited_allowlisted: UNLIMITED_IDS.has(userId),
    ledger_explained_by_known_sources: (ledger ?? []).some((r) => {
      const c = classifyPositiveLedgerRow(r, {
        isAdminUser: Boolean(adminUser),
        isUnlimitedAllowlisted: UNLIMITED_IDS.has(userId),
      });
      return toNumber(r.amount) > 0 && c.status === "accounted";
    }),
    active_api_key_count: activeKeyCount,
  };

  let recommended;
  if (ledgerRow) {
    const cls = classifyPositiveLedgerRow(ledgerRow, {
      adminAudit,
      isAdminUser: largeDiag.is_admin_user,
      isUnlimitedAllowlisted: largeDiag.is_unlimited_allowlisted,
    });
    recommended = recommendedActionForUnaccountedLedger(cls, {
      reason: ledgerRow.reason,
    });
  } else {
    recommended = recommendedActionForLargeBalance(largeDiag);
  }

  printSection("suspicious_fields", { flags: suspicious, recommended_action: recommended });

  printSection(
    "recommended_manual_sql_do_not_execute",
    buildManualSqlSuggestions({
      userId: userId || undefined,
      ledgerId: LEDGER_ID || undefined,
    })
  );

  console.log("\nNOTE  This script is read-only. It does not clear balances,");
  console.log("      delete ledger rows, or revoke API keys.");
  console.log("\nTOKFAI_P905_BILLING_DRILLDOWN_PASS");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  console.log("TOKFAI_P905_BILLING_DRILLDOWN_FAIL");
  process.exit(1);
});
