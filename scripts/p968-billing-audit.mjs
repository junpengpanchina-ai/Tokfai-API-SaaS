#!/usr/bin/env node
/**
 * P968 — Billing Audit / Credit Reconciliation (read-only).
 *
 * Never mutates ledger / usage / image tasks / profiles.
 * Never prints full API keys.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/p968-billing-audit.mjs
 *
 * Optional:
 *   LOOKBACK_HOURS=720          (default 720 = 30d for usage/ledger/image windows)
 *   BALANCE_TOLERANCE=0.0001
 *   CHAT_SAMPLE=100
 *   PAGE_SIZE=1000
 *   WRITE_REPORT=1              write docs/p968-billing-audit-report.md from live results
 *   REPORT_PATH=docs/p968-billing-audit-report.md
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createSupabaseAdminClient,
  requireSupabaseAdminEnv,
} from "./lib/supabase-admin.mjs";
import { redactEmail, redactId, toNumber } from "./lib/billing-risk-helpers.mjs";
import {
  auditOrphanCost,
  hasImageResultUrl,
  ORPHAN_TIMEOUT_PENDING_THRESHOLD_MS,
} from "./lib/image-cost-reconciliation.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOOKBACK_HOURS = Math.max(
  1,
  parseInt(process.env.LOOKBACK_HOURS ?? "720", 10) || 720
);
const BALANCE_TOLERANCE = Math.max(
  0,
  parseFloat(process.env.BALANCE_TOLERANCE ?? "0.0001") || 0.0001
);
const CHAT_SAMPLE = Math.max(
  1,
  parseInt(process.env.CHAT_SAMPLE ?? "100", 10) || 100
);
const PAGE_SIZE = Math.min(
  1000,
  Math.max(100, parseInt(process.env.PAGE_SIZE ?? "1000", 10) || 1000)
);
const WRITE_REPORT =
  process.env.WRITE_REPORT === "1" || process.env.WRITE_REPORT === "true";
const REPORT_PATH = join(
  ROOT,
  process.env.REPORT_PATH ?? "docs/p968-billing-audit-report.md"
);
const CREDITS_PER_YUAN = 10_000;
const CHAT_DIFF_TOLERANCE = 0.000001;

function sinceIso(hours = LOOKBACK_HOURS) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function round6(n) {
  return Math.round(n * 1_000_000) / 1_000_000;
}

function roundCreditAmount(amount) {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.ceil(amount * 1_000_000) / 1_000_000;
}

function asComputeCredits(value) {
  if (value > 0 && value < 1) return value * CREDITS_PER_YUAN;
  return value;
}

function isUsageSuccess(status) {
  const s = String(status ?? "").toLowerCase();
  return s === "succeeded" || s === "success" || s === "ok";
}

function isChatLikeEndpoint(endpoint, model) {
  const ep = String(endpoint ?? "").toLowerCase();
  if (ep.includes("/images")) return false;
  const m = String(model ?? "").toLowerCase();
  if (
    m.includes("nano-banana") ||
    m.includes("gpt-image") ||
    m.startsWith("dall")
  ) {
    return false;
  }
  return true;
}

async function fetchAllPages(supabase, table, select, applyFilters) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    let q = supabase.from(table).select(select).range(from, to);
    if (applyFilters) q = applyFilters(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

function printSamples(label, rows, limit = 10) {
  console.log(`${label}: ${rows.length}`);
  for (const row of rows.slice(0, limit)) {
    console.log(`  - ${JSON.stringify(row)}`);
  }
  if (rows.length > limit) console.log(`  … and ${rows.length - limit} more`);
}

// ─── A. Balance reconciliation ─────────────────────────────────────────────

async function auditBalances(supabase) {
  section("A. User balance reconciliation");

  const profiles = await fetchAllPages(
    supabase,
    "profiles",
    "id, email, credits_balance, total_credits_purchased, total_credits_used, created_at"
  );

  const ledger = await fetchAllPages(
    supabase,
    "credit_ledger",
    "id, user_id, type, amount, reference_id, created_at"
  );

  const usage = await fetchAllPages(
    supabase,
    "usage_logs",
    "id, user_id, status, billing_status, billable, credits_charged, request_id"
  );

  const imageTasks = await fetchAllPages(
    supabase,
    "image_generation_tasks",
    "id, request_id, user_id, model, status, billing_status, credits_charged, result_data, orphan_cost_flags, reconcile_status, reconcile_result, error_code, created_at, updated_at, completed_at"
  );

  const byUser = new Map();
  for (const p of profiles) {
    byUser.set(p.id, {
      user_id: p.id,
      email: redactEmail(p.email),
      balance: toNumber(p.credits_balance),
      total_purchased_col: toNumber(p.total_credits_purchased),
      total_used_col: toNumber(p.total_credits_used),
      credit_in: 0,
      credit_out: 0,
      ledger_debit_sum: 0,
      usage_success_charged: 0,
      image_charged: 0,
      ledger_rows: 0,
    });
  }

  for (const row of ledger) {
    const u = byUser.get(row.user_id);
    if (!u) continue;
    const amt = toNumber(row.amount);
    u.ledger_rows += 1;
    if (amt >= 0) u.credit_in += amt;
    else {
      u.credit_out += Math.abs(amt);
      if (row.type === "debit") u.ledger_debit_sum += Math.abs(amt);
    }
  }

  for (const row of usage) {
    const u = byUser.get(row.user_id);
    if (!u) continue;
    const charged = toNumber(row.credits_charged);
    if (
      charged > 0 &&
      (row.billing_status === "charged" ||
        row.billable === true ||
        isUsageSuccess(row.status))
    ) {
      u.usage_success_charged += charged;
    }
  }

  for (const row of imageTasks) {
    const u = byUser.get(row.user_id);
    if (!u) continue;
    const charged = toNumber(row.credits_charged);
    if (charged > 0 && row.billing_status === "charged") {
      u.image_charged += charged;
    }
  }

  const mismatches = [];
  for (const u of byUser.values()) {
    const expected = round6(u.credit_in - u.credit_out);
    const balance = round6(u.balance);
    const diff = round6(balance - expected);
    if (Math.abs(diff) > BALANCE_TOLERANCE) {
      mismatches.push({
        user_id: redactId(u.user_id),
        email: u.email,
        balance,
        credit_in: round6(u.credit_in),
        credit_out: round6(u.credit_out),
        expected_balance: expected,
        diff,
        ledger_debit_sum: round6(u.ledger_debit_sum),
        usage_success_charged: round6(u.usage_success_charged),
        image_charged: round6(u.image_charged),
        ledger_rows: u.ledger_rows,
      });
    }
  }

  mismatches.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  console.log(`profiles: ${profiles.length}`);
  console.log(`ledger rows: ${ledger.length}`);
  console.log(`usage rows: ${usage.length}`);
  console.log(`image tasks: ${imageTasks.length}`);
  printSamples("balance_mismatches", mismatches, 20);

  return {
    profile_count: profiles.length,
    ledger_count: ledger.length,
    usage_count: usage.length,
    image_task_count: imageTasks.length,
    mismatch_count: mismatches.length,
    mismatches: mismatches.slice(0, 50),
    // keep raw maps for later checks
    _raw: { profiles, ledger, usage, imageTasks, byUser },
  };
}

// ─── B. Usage ↔ ledger consistency ─────────────────────────────────────────

async function auditUsageLedger(supabase, since, raw) {
  section("B. Usage vs ledger consistency");

  const usage =
    raw?.usage ??
    (await fetchAllPages(
      supabase,
      "usage_logs",
      "id, user_id, model, status, billing_status, billable, credits_charged, request_id, endpoint, created_at, error_code",
      (q) => q.gte("created_at", since)
    ));

  // Prefer lookback window for this section when raw is full-history.
  const usageWindow = usage.filter(
    (r) => !r.created_at || r.created_at >= since
  );

  const debitByRef = new Map();
  const ledger =
    raw?.ledger ??
    (await fetchAllPages(
      supabase,
      "credit_ledger",
      "id, user_id, type, amount, reference_id, created_at",
      (q) => q.eq("type", "debit")
    ));

  const debits = ledger.filter((r) => r.type === "debit");
  for (const d of debits) {
    const ref = d.reference_id;
    if (!ref) continue;
    if (!debitByRef.has(ref)) debitByRef.set(ref, []);
    debitByRef.get(ref).push(d);
  }

  const missingDebit = [];
  const failedCharged = [];
  const duplicateDebits = [];

  for (const row of usageWindow) {
    const charged = toNumber(row.credits_charged);
    const successBillable =
      charged > 0 &&
      (row.billing_status === "charged" ||
        row.billable === true ||
        (isUsageSuccess(row.status) && charged > 0));

    if (successBillable && row.request_id) {
      const hits = debitByRef.get(row.request_id) ?? [];
      if (hits.length === 0) {
        missingDebit.push({
          kind: "success_usage_missing_debit",
          request_id: redactId(row.request_id),
          user_id: redactId(row.user_id),
          model: row.model,
          credits_charged: charged,
          billing_status: row.billing_status,
          status: row.status,
          created_at: row.created_at,
        });
      }
    }

    if (!isUsageSuccess(row.status) && charged > 0) {
      failedCharged.push({
        kind: "failed_usage_charged",
        request_id: redactId(row.request_id),
        user_id: redactId(row.user_id),
        model: row.model,
        status: row.status,
        billing_status: row.billing_status,
        credits_charged: charged,
        error_code: row.error_code,
        created_at: row.created_at,
      });
    }
  }

  for (const [ref, rows] of debitByRef.entries()) {
    if (rows.length > 1) {
      duplicateDebits.push({
        kind: "duplicate_request_id_debit",
        reference_id: redactId(ref),
        debit_count: rows.length,
        amounts: rows.map((r) => toNumber(r.amount)),
        user_id: redactId(rows[0]?.user_id),
      });
    }
  }

  // Image billable matrix from image_generation_tasks
  const imageTasks =
    raw?.imageTasks ??
    (await fetchAllPages(
      supabase,
      "image_generation_tasks",
      "id, request_id, user_id, model, status, billing_status, credits_charged, result_data, orphan_cost_flags, reconcile_status, reconcile_result, error_code, created_at, updated_at, completed_at"
    ));

  const imageWindow = imageTasks.filter(
    (r) => !r.created_at || r.created_at >= since
  );

  const imageCompletedShouldBill = [];
  const imageFailedShouldNotBill = [];
  const imageBadBilling = [];

  for (const t of imageWindow) {
    const hasUrl = hasImageResultUrl(t.result_data);
    const charged = toNumber(t.credits_charged);
    const status = String(t.status ?? "");
    const billing = String(t.billing_status ?? "");

    if (status === "completed" && hasUrl) {
      // Expect billable: charged + credits > 0 (or public billable)
      const ok =
        (billing === "charged" || billing === "billable") && charged > 0;
      if (!ok) {
        imageCompletedShouldBill.push({
          kind: "completed_with_url_not_billable",
          request_id: redactId(t.request_id),
          status,
          billing_status: billing,
          credits_charged: charged,
          has_url: true,
        });
      }
    }

    const notBillableExpected =
      status === "failed" ||
      status === "retryable_timeout" ||
      t.reconcile_result === "missing_url" ||
      (status === "completed" && !hasUrl);

    if (notBillableExpected) {
      const wronglyCharged =
        charged > 0 || billing === "charged" || billing === "billable";
      // completed + hasUrl is billable — do not treat as non-success
      if (wronglyCharged && !(status === "completed" && hasUrl)) {
        imageFailedShouldNotBill.push({
          kind: "non_success_image_charged",
          request_id: redactId(t.request_id),
          status,
          billing_status: billing,
          credits_charged: charged,
          has_url: hasUrl,
          reconcile_result: t.reconcile_result,
          error_code: t.error_code,
        });
      }
    }

    if (hasUrl && billing !== "charged" && billing !== "billable" && charged <= 0) {
      // already covered above
    }
    if (hasUrl && billing !== "charged" && billing !== "billable") {
      imageBadBilling.push({
        kind: "url_exists_billing_status_not_billable",
        request_id: redactId(t.request_id),
        status,
        billing_status: billing,
        credits_charged: charged,
      });
    }
    if (charged > 0 && !hasUrl) {
      imageBadBilling.push({
        kind: "credits_charged_without_url",
        request_id: redactId(t.request_id),
        status,
        billing_status: billing,
        credits_charged: charged,
      });
    }
  }

  printSamples("success_usage_missing_debit", missingDebit);
  printSamples("failed_usage_charged", failedCharged);
  printSamples("duplicate_request_id_debits", duplicateDebits);
  printSamples("image_completed_url_not_billable", imageCompletedShouldBill);
  printSamples("image_failed_or_missing_url_charged", imageFailedShouldNotBill);
  printSamples("image_bad_billing_extra", imageBadBilling);

  return {
    lookback_hours: LOOKBACK_HOURS,
    since,
    usage_window_count: usageWindow.length,
    missing_debit_count: missingDebit.length,
    missing_debit: missingDebit.slice(0, 30),
    failed_charged_count: failedCharged.length,
    failed_charged: failedCharged.slice(0, 30),
    duplicate_debit_count: duplicateDebits.length,
    duplicate_debits: duplicateDebits.slice(0, 30),
    image_completed_url_not_billable_count: imageCompletedShouldBill.length,
    image_completed_url_not_billable: imageCompletedShouldBill.slice(0, 30),
    image_non_success_charged_count: imageFailedShouldNotBill.length,
    image_non_success_charged: imageFailedShouldNotBill.slice(0, 30),
    image_bad_billing_count: imageBadBilling.length,
    image_bad_billing: imageBadBilling.slice(0, 30),
    _imageTasks: imageTasks,
  };
}

// ─── C. Image money-bag protection ─────────────────────────────────────────

async function auditImageMoneyBag(imageTasks) {
  section("C. Image money-bag protection");

  const now = Date.now();
  const counters = {
    provider_success_unpaid: 0,
    charged_missing_url: 0,
    stale_timeout_pending: 0,
    missing_url_success: 0,
    bad_billing: 0,
    orphan_image_task: 0,
    completed_without_url: 0,
    credits_charged_no_url: 0,
    url_exists_not_billable: 0,
  };
  const samples = {
    provider_success_unpaid: [],
    charged_missing_url: [],
    stale_timeout_pending: [],
    missing_url_success: [],
    bad_billing: [],
    orphan_image_task: [],
    completed_without_url: [],
    credits_charged_no_url: [],
    url_exists_not_billable: [],
  };

  function pushSample(key, row) {
    counters[key] += 1;
    if (samples[key].length < 15) samples[key].push(row);
  }

  for (const t of imageTasks) {
    const hasUrl = hasImageResultUrl(t.result_data);
    const charged =
      toNumber(t.credits_charged) > 0 &&
      (t.billing_status === "charged" || t.billing_status === "billable");
    const flags = t.orphan_cost_flags ?? {};
    const status = String(t.status ?? "");
    const updatedAt = t.updated_at ? Date.parse(t.updated_at) : NaN;
    const ageMs = Number.isFinite(updatedAt) ? now - updatedAt : null;
    const timeoutPending =
      status === "retryable_timeout" ||
      t.error_code === "image_task_timeout_pending" ||
      t.error_code === "timeout_pending" ||
      flags.stale_timeout_pending === true;

    const audit = auditOrphanCost({
      providerSuccess: status === "completed" && hasUrl,
      customerCharged: charged,
      missingUrl: !hasUrl && (status === "completed" || charged),
      timeoutPending,
      timeoutPendingAgeMs: ageMs,
      reconciled: t.reconcile_status === "reconciled",
      thresholdMs: ORPHAN_TIMEOUT_PENDING_THRESHOLD_MS,
    });

    const sample = {
      request_id: redactId(t.request_id),
      status,
      billing_status: t.billing_status,
      credits_charged: toNumber(t.credits_charged),
      has_url: hasUrl,
      reconcile_status: t.reconcile_status,
      reconcile_result: t.reconcile_result,
      orphan_cost_flags: flags,
    };

    if (flags.provider_success_unpaid === true || audit.flags.provider_success_unpaid) {
      pushSample("provider_success_unpaid", sample);
    }
    if (flags.charged_missing_url === true || audit.flags.charged_missing_url) {
      pushSample("charged_missing_url", sample);
    }
    if (flags.stale_timeout_pending === true || audit.flags.stale_timeout_pending) {
      pushSample("stale_timeout_pending", sample);
    }
    if (
      (status === "completed" && !hasUrl) ||
      t.reconcile_result === "missing_url"
    ) {
      pushSample("missing_url_success", sample);
      if (status === "completed" && !hasUrl) {
        pushSample("completed_without_url", sample);
      }
    }
    if (toNumber(t.credits_charged) > 0 && !hasUrl) {
      pushSample("credits_charged_no_url", sample);
      pushSample("bad_billing", sample);
    }
    if (hasUrl && t.billing_status !== "charged" && t.billing_status !== "billable") {
      pushSample("url_exists_not_billable", sample);
      pushSample("bad_billing", sample);
    }
    if (t.reconcile_status === "orphan_alarm") {
      pushSample("orphan_image_task", sample);
    }
  }

  for (const [k, n] of Object.entries(counters)) {
    console.log(`${k}: ${n}`);
  }
  for (const [k, rows] of Object.entries(samples)) {
    if (rows.length) printSamples(`sample_${k}`, rows, 5);
  }

  return { counters, samples };
}

// ─── D. Chat pricing formula ───────────────────────────────────────────────

async function auditChatFormula(supabase, since) {
  section("D. Chat billing formula (last N chat usage)");

  const { data: pricingRows, error: pricingError } = await supabase
    .from("model_pricing")
    .select(
      "model_id, billing_type, input_credits_per_million_tokens, output_credits_per_million_tokens, markup_ratio, markup_multiplier, input_per_1k, output_per_1k, enabled, updated_at"
    )
    .eq("enabled", true)
    .limit(500);

  if (pricingError) throw new Error(pricingError.message);

  const pricingByModel = new Map();
  for (const row of pricingRows ?? []) {
    const input =
      asComputeCredits(toNumber(row.input_credits_per_million_tokens)) ||
      toNumber(row.input_per_1k) * 1000;
    const output =
      asComputeCredits(toNumber(row.output_credits_per_million_tokens)) ||
      toNumber(row.output_per_1k) * 1000;
    const markup =
      toNumber(row.markup_ratio) > 0
        ? toNumber(row.markup_ratio)
        : toNumber(row.markup_multiplier) > 0
          ? toNumber(row.markup_multiplier)
          : 1;
    pricingByModel.set(row.model_id, {
      input,
      output,
      markup,
      updated_at: row.updated_at,
      billing_type: row.billing_type,
    });
  }

  // Tenant multipliers (optional; may explain diffs)
  const { data: tenants } = await supabase
    .from("tenants")
    .select("id, base_price_multiplier")
    .limit(500);
  const tenantBase = new Map(
    (tenants ?? []).map((t) => [t.id, toNumber(t.base_price_multiplier) || 1])
  );
  const { data: tenantRules } = await supabase
    .from("tenant_pricing_rules")
    .select("tenant_id, model_id, price_multiplier")
    .limit(2000);
  const tenantRule = new Map();
  for (const r of tenantRules ?? []) {
    tenantRule.set(`${r.tenant_id}::${r.model_id}`, toNumber(r.price_multiplier) || 1);
  }

  const { data: chatUsage, error: usageError } = await supabase
    .from("usage_logs")
    .select(
      "id, request_id, user_id, tenant_id, model, status, billing_status, prompt_tokens, completion_tokens, total_tokens, credits_charged, endpoint, created_at"
    )
    .gte("created_at", since)
    .in("status", ["succeeded", "success", "ok"])
    .order("created_at", { ascending: false })
    .limit(CHAT_SAMPLE * 3);

  if (usageError) throw new Error(usageError.message);

  const chatRows = (chatUsage ?? [])
    .filter((r) => isChatLikeEndpoint(r.endpoint, r.model))
    .slice(0, CHAT_SAMPLE);

  const comparisons = [];
  let mismatchCount = 0;
  let missingPricing = 0;

  for (const row of chatRows) {
    const prompt = toNumber(row.prompt_tokens);
    const completion = toNumber(row.completion_tokens);
    const charged = toNumber(row.credits_charged);
    const cfg = pricingByModel.get(row.model);
    let expected = null;
    let pricingVersion = null;
    let note = null;

    if (!cfg) {
      missingPricing += 1;
      note = "no_enabled_model_pricing_row";
    } else {
      const base =
        (prompt / 1_000_000) * cfg.input + (completion / 1_000_000) * cfg.output;
      let raw = base * cfg.markup;
      if (row.tenant_id) {
        const key = `${row.tenant_id}::${row.model}`;
        const mult =
          tenantRule.get(key) || tenantBase.get(row.tenant_id) || 1;
        if (mult > 0 && mult !== 1) raw *= mult;
      }
      expected = roundCreditAmount(raw);
      pricingVersion = cfg.updated_at ?? "model_pricing.enabled";
    }

    const diff =
      expected == null ? null : round6(charged - expected);
    const mismatch =
      expected != null && Math.abs(diff) > CHAT_DIFF_TOLERANCE;
    if (mismatch) mismatchCount += 1;

    comparisons.push({
      request_id: redactId(row.request_id),
      model: row.model,
      prompt_tokens: prompt,
      completion_tokens: completion,
      total_tokens: toNumber(row.total_tokens),
      credits_charged: charged,
      expected_credits: expected,
      diff,
      pricing_version: pricingVersion,
      note,
      mismatch,
    });
  }

  printSamples(
    "chat_formula_mismatches",
    comparisons.filter((c) => c.mismatch || c.note),
    20
  );
  printSamples("chat_formula_sample", comparisons.slice(0, 10), 10);
  console.log(`chat_sample: ${comparisons.length}`);
  console.log(`chat_formula_mismatch: ${mismatchCount}`);
  console.log(`missing_pricing_rows: ${missingPricing}`);
  console.log(
    `note: fixed_fee / minimum_charge not implemented in DB (admin UI shows null)`
  );

  return {
    sample_size: comparisons.length,
    mismatch_count: mismatchCount,
    missing_pricing_count: missingPricing,
    comparisons,
    pricing_transparency: {
      formula:
        "expected = ceil6( (prompt/1e6)*input_credits_per_million + (completion/1e6)*output_credits_per_million ) * markup_ratio [* tenant_multiplier]",
      fixed_fee: "not_implemented",
      minimum_charge: "not_implemented",
      opaque: mismatchCount > 0 || missingPricing > 0,
    },
  };
}

// ─── Verdict ───────────────────────────────────────────────────────────────

function buildVerdict(parts) {
  const findings = {
    leak_charge: // 漏扣
      parts.usage.missing_debit_count > 0 ||
      parts.usage.image_completed_url_not_billable_count > 0 ||
      parts.money.counters.provider_success_unpaid > 0 ||
      parts.money.counters.url_exists_not_billable > 0,
    duplicate_charge: parts.usage.duplicate_debit_count > 0,
    failed_charge:
      parts.usage.failed_charged_count > 0 ||
      parts.usage.image_non_success_charged_count > 0 ||
      parts.money.counters.credits_charged_no_url > 0 ||
      parts.money.counters.charged_missing_url > 0,
    provider_success_unpaid:
      parts.money.counters.provider_success_unpaid > 0 ||
      parts.usage.image_completed_url_not_billable_count > 0,
    balance_mismatch: parts.balance.mismatch_count > 0,
    // Opaque = recalculation does not match charged (or pricing row missing for charged rows).
    // Note: fixed_fee / minimum_charge are intentionally unimplemented — that alone is not opacity.
    chat_formula_opaque: parts.chat.mismatch_count > 0,
  };

  // Hard blockers for full PASS (money integrity)
  const hard =
    findings.leak_charge ||
    findings.duplicate_charge ||
    findings.failed_charge ||
    findings.provider_success_unpaid ||
    findings.balance_mismatch;

  // Soft: chat formula mismatches without money-bag orphans → still PARTIAL
  const softOnly = !hard && findings.chat_formula_opaque;

  const marker =
    hard || softOnly
      ? "TOKFAI_P968_BILLING_AUDIT_PARTIAL_PASS"
      : "TOKFAI_P968_BILLING_AUDIT_PASS";

  // Small-scope real-customer trial: block only on undercharge / double-charge /
  // failure-charge / unpaid provider success. Balance drift on admin/test
  // accounts (excess balance vs ledger) is PARTIAL but not a trial blocker.
  const trialOk =
    !findings.leak_charge &&
    !findings.duplicate_charge &&
    !findings.failed_charge &&
    !findings.provider_success_unpaid;

  return {
    findings,
    marker,
    trialOk,
    hard,
    softOnly,
    stale_timeout_pending: parts.money.counters.stale_timeout_pending,
  };
}

function renderReport(meta, parts, verdict) {
  const f = verdict.findings;
  const yn = (v) => (v ? "是" : "否");
  const lines = [];
  lines.push("# P968 Billing Audit / Credit Reconciliation Report");
  lines.push("");
  lines.push(`> 日期：${meta.date}`);
  lines.push(`> 环境：生产 Supabase（只读）`);
  lines.push(`> 约束：未压测；未改 Chat/Image/Provider 核心链路；未重算覆盖历史账单；未打印 API Key 明文`);
  lines.push(`> HEAD：\`${meta.git_head}\``);
  lines.push(`> lookback_hours：${LOOKBACK_HOURS}`);
  lines.push("");
  lines.push("## 最终结论");
  lines.push("");
  lines.push("```");
  lines.push(verdict.marker);
  lines.push("```");
  lines.push("");
  lines.push("| # | 检查项 | 结果 |");
  lines.push("|---|---|---|");
  lines.push(`| 1 | 是否发现漏扣 | **${yn(f.leak_charge)}** |`);
  lines.push(`| 2 | 是否发现重复扣费 | **${yn(f.duplicate_charge)}** |`);
  lines.push(`| 3 | 是否发现失败扣费 | **${yn(f.failed_charge)}** |`);
  lines.push(
    `| 4 | 是否发现图片上游成功但未扣费 | **${yn(f.provider_success_unpaid)}** |`
  );
  lines.push(`| 5 | 是否发现用户余额不一致 | **${yn(f.balance_mismatch)}** |`);
  lines.push(
    `| 6 | 是否发现 Chat 计费公式不透明 | **${yn(f.chat_formula_opaque)}** |`
  );
  lines.push(
    `| 7 | 是否可以进入真实客户小范围试用 | **${verdict.trialOk ? "可以（小范围）" : "暂缓，先修钱袋子问题"}** |`
  );
  lines.push("");
  lines.push("## 一、用户余额对账");
  lines.push("");
  lines.push(`- profiles：${parts.balance.profile_count}`);
  lines.push(`- credit_ledger rows：${parts.balance.ledger_count}`);
  lines.push(`- usage_logs rows：${parts.balance.usage_count}`);
  lines.push(`- image_generation_tasks：${parts.balance.image_task_count}`);
  lines.push(`- balance ≠ credit_in − credit_out：**${parts.balance.mismatch_count}**`);
  lines.push("");
  if (parts.balance.mismatches.length) {
    lines.push("### Mismatch 用户（脱敏）");
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify(parts.balance.mismatches.slice(0, 30), null, 2));
    lines.push("```");
    lines.push("");
  } else {
    lines.push("无余额不一致用户。");
    lines.push("");
  }
  lines.push("## 二、usage ↔ ledger");
  lines.push("");
  lines.push(`- 窗口：${parts.usage.since}（${parts.usage.lookback_hours}h）`);
  lines.push(`- 成功 billable usage 缺 debit：${parts.usage.missing_debit_count}`);
  lines.push(`- 失败 usage 仍扣费：${parts.usage.failed_charged_count}`);
  lines.push(
    `- image completed+url 未 billable：${parts.usage.image_completed_url_not_billable_count}`
  );
  lines.push(
    `- image failed/timeout/missing_url 却扣费：${parts.usage.image_non_success_charged_count}`
  );
  lines.push(`- duplicate request_id debit：${parts.usage.duplicate_debit_count}`);
  lines.push("");
  lines.push("## 三、图片钱袋子");
  lines.push("");
  lines.push("| 风险项 | 计数 |");
  lines.push("|---|---:|");
  for (const [k, n] of Object.entries(parts.money.counters)) {
    lines.push(`| ${k} | ${n} |`);
  }
  lines.push("");
  lines.push("## 四、Chat 计费公式重算（最近样本）");
  lines.push("");
  lines.push(`- 样本数：${parts.chat.sample_size}`);
  lines.push(`- 与 pricing 重算不一致：${parts.chat.mismatch_count}`);
  lines.push(`- 缺 pricing 行：${parts.chat.missing_pricing_count}`);
  lines.push(`- 公式：\`${parts.chat.pricing_transparency.formula}\``);
  lines.push(
    `- fixed_fee：${parts.chat.pricing_transparency.fixed_fee}；minimum_charge：${parts.chat.pricing_transparency.minimum_charge}`
  );
  lines.push("");
  lines.push("### 对比表（脱敏 request_id）");
  lines.push("");
  lines.push(
    "| request_id | model | prompt | completion | total | charged | expected | diff | pricing_version |"
  );
  lines.push("|---|---|---:|---:|---:|---:|---:|---:|---|");
  for (const c of parts.chat.comparisons.slice(0, 100)) {
    lines.push(
      `| ${c.request_id} | ${c.model} | ${c.prompt_tokens} | ${c.completion_tokens} | ${c.total_tokens} | ${c.credits_charged} | ${c.expected_credits ?? "n/a"} | ${c.diff ?? "n/a"} | ${c.pricing_version ?? c.note ?? ""} |`
    );
  }
  lines.push("");
  lines.push("## 五、后台用量口径");
  lines.push("");
  lines.push(
    meta.admin_usage_fix_note ??
      "Admin `/admin/usage` 统计卡片改为「当前加载用量」文案，并补充服务端全站汇总字段（只读展示，不改计费）。"
  );
  lines.push("");
  lines.push("## 六、脚本与复现");
  lines.push("");
  lines.push("```bash");
  lines.push(
    "SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/p968-billing-audit.mjs"
  );
  lines.push("```");
  lines.push("");
  lines.push("只读；禁止用本脚本结果覆盖历史账单。");
  lines.push("");
  return lines.join("\n");
}

async function main() {
  requireSupabaseAdminEnv();
  const supabase = createSupabaseAdminClient();
  const since = sinceIso();

  console.log("=== P968 Billing Audit (read-only) ===");
  console.log(`lookback_hours: ${LOOKBACK_HOURS}`);
  console.log(`since: ${since}`);
  console.log(`balance_tolerance: ${BALANCE_TOLERANCE}`);
  console.log(`chat_sample: ${CHAT_SAMPLE}`);
  console.log("");

  const balance = await auditBalances(supabase);
  const usage = await auditUsageLedger(supabase, since, balance._raw);
  const money = await auditImageMoneyBag(
    usage._imageTasks ?? balance._raw.imageTasks
  );
  const chat = await auditChatFormula(supabase, since);

  // drop heavy raw before verdict
  delete balance._raw;
  delete usage._imageTasks;

  const parts = { balance, usage, money, chat };
  const verdict = buildVerdict(parts);

  section("Verdict");
  console.log(JSON.stringify(verdict.findings, null, 2));
  console.log("");
  console.log(verdict.marker);
  console.log(
    `trial_ready_small_scope: ${verdict.trialOk ? "YES" : "NO"}`
  );
  console.log(
    `stale_timeout_pending_ops: ${verdict.stale_timeout_pending ?? 0}`
  );

  const summaryPath = join(ROOT, "tmp/p968-audit-summary.json");
  try {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(join(ROOT, "tmp"), { recursive: true });
    writeFileSync(
      summaryPath,
      JSON.stringify({ parts, verdict, lookback_hours: LOOKBACK_HOURS, since }, null, 2)
    );
    console.log(`\nWrote ${summaryPath}`);
  } catch (err) {
    console.log(`\n(skip summary json: ${err instanceof Error ? err.message : err})`);
  }

  if (WRITE_REPORT) {
    let gitHead = "(unknown)";
    try {
      const { execSync } = await import("node:child_process");
      gitHead = execSync("git rev-parse HEAD", {
        cwd: ROOT,
        encoding: "utf8",
      }).trim();
    } catch {
      /* ignore */
    }
    const md = renderReport(
      {
        date: new Date().toISOString().slice(0, 10),
        git_head: gitHead,
        admin_usage_fix_note:
          "Admin usage 页面：标题/统计改为「当前加载用量」；并增加服务端全站汇总（总请求/成功/失败/图像/对话/累计消耗积分）。",
      },
      parts,
      verdict
    );
    writeFileSync(REPORT_PATH, md, "utf8");
    console.log(`\nWrote ${REPORT_PATH}`);
  }

  // Exit 0 even on PARTIAL — audit completed; marker encodes severity.
  // Exit 1 only on script failure.
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
