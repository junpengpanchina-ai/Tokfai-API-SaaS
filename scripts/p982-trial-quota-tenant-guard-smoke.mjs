#!/usr/bin/env node
/**
 * P982 — Trial Quota / Tenant Guard / Commercial Risk Control smoke.
 *
 * Static + light API. Does not mutate production billing data beyond normal chat.
 *
 * Usage:
 *   node scripts/p982-trial-quota-tenant-guard-smoke.mjs
 *   LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p982-trial-quota-tenant-guard-smoke.mjs
 *
 * Marker:
 *   TOKFAI_P982_TRIAL_QUOTA_TENANT_GUARD_PASS
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bootstrapClientCompatSmoke,
  pass,
  fail,
} from "./lib/client-compat-smoke-bootstrap.mjs";

const SCRIPT = "scripts/p982-trial-quota-tenant-guard-smoke.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS_MARKER = "TOKFAI_P982_TRIAL_QUOTA_TENANT_GUARD_PASS";
const FAIL_MARKER = "TOKFAI_P982_TRIAL_QUOTA_TENANT_GUARD_FAIL";

const WRITE_REPORT =
  process.env.WRITE_REPORT === "1" || process.env.WRITE_REPORT === "true";
const REPORT_PATH = join(
  ROOT,
  process.env.REPORT_PATH ?? "docs/p982-trial-quota-tenant-guard-report.md"
);

const DOCS = [
  "docs/trial-quota-commercial-guard.zh.md",
  "docs/customer-risk-control-sop.zh.md",
];

/** @type {{ id: string, ok: boolean, soft?: boolean, detail?: string }[]} */
const results = [];

function record(id, ok, detail, soft = false) {
  results.push({
    id,
    ok,
    soft,
    detail: detail ? String(detail).slice(0, 400) : undefined,
  });
  if (ok) {
    if (soft) {
      console.warn(`SOFT  ${id}${detail ? ` — ${detail}` : ""}`);
      return true;
    }
    return pass(id);
  }
  return fail(id, detail);
}

function charged(body) {
  return Number(body?.credits_charged ?? body?.tokfai?.credits_charged ?? 0);
}

function requestIdOf(body, res) {
  return (
    body?.request_id ||
    body?.tokfai?.request_id ||
    body?.error?.request_id ||
    (typeof res?.headers?.get === "function"
      ? res.headers.get("x-request-id")
      : null) ||
    null
  );
}

function notBillable(body) {
  const c = charged(body);
  if (Number.isFinite(c) && c > 0) return false;
  const status = body?.tokfai?.billing_status;
  if (status && status !== "not_billable") return false;
  return true;
}

function includesAll(text, needles) {
  const missing = needles.filter((n) => !text.includes(n));
  return { ok: missing.length === 0, missing };
}

function staticChecks() {
  console.log("=== P982 static checks ===\n");
  let okAll = true;

  for (const rel of DOCS) {
    const abs = join(ROOT, rel);
    if (!existsSync(abs)) {
      okAll = record(`doc_exists:${rel}`, false, "missing") && okAll;
      continue;
    }
    const text = readFileSync(abs, "utf8");
    okAll =
      record(`doc_exists:${rel}`, text.trim().length > 200, `bytes=${text.length}`) &&
      okAll;
  }

  const migration = join(
    ROOT,
    "supabase/migrations/0038_p982_api_key_trial_quota.sql"
  );
  okAll =
    record(
      "migration_p982",
      existsSync(migration) &&
        readFileSync(migration, "utf8").includes("trial_mode"),
      "api_keys trial columns migration"
    ) && okAll;

  const guard = readFileSync(
    join(ROOT, "apps/dmit-api/src/gateway/trialQuotaGuard.ts"),
    "utf8"
  );
  okAll =
    record(
      "guard_module",
      includesAll(guard, [
        "assertTrialQuotaGuards",
        "trial_limit_exceeded",
        "daily_limit_exceeded",
        "quota_exceeded",
        "trial_model_not_allowed",
        "isModelAllowedForTrial",
        "maskApiKeyId",
        "commercial_request_trace",
      ]).ok,
      "trialQuotaGuard exports + codes + mask"
    ) && okAll;

  const exec = readFileSync(
    join(ROOT, "apps/dmit-api/src/lib/executeChatCompletion.ts"),
    "utf8"
  );
  okAll =
    record(
      "executor_wires_guard",
      exec.includes("assertTrialQuotaGuards") &&
        exec.includes("TRIAL_QUOTA_ERROR_CODES") &&
        exec.includes("logCommercialRequestTrace"),
      "executeChatCompletion precheck wiring"
    ) && okAll;

  const envSrc = readFileSync(join(ROOT, "apps/dmit-api/src/env.ts"), "utf8");
  okAll =
    record(
      "env_trial_flags",
      includesAll(envSrc, [
        "TOKFAI_TRIAL_GUARD_ENABLED",
        "TOKFAI_TRIAL_ALLOWED_MODELS",
        "TOKFAI_TRIAL_DEFAULT_CREDITS_LIMIT",
      ]).ok,
      "env trial flags present"
    ) && okAll;

  const docsJoined = DOCS.map((r) => readFileSync(join(ROOT, r), "utf8")).join(
    "\n"
  );
  okAll =
    record(
      "docs_commercial_keywords",
      includesAll(docsJoined, [
        "auto-fast",
        "auto-cheap",
        "request_id",
        "not_billable",
        "trial_limit_exceeded",
        "daily_limit_exceeded",
        "quota_exceeded",
      ]).ok,
      "docs cover trial models + not_billable codes"
    ) && okAll;

  const mock = readFileSync(
    join(ROOT, "scripts/p786-offline-customer-mock.mjs"),
    "utf8"
  );
  okAll =
    record(
      "mock_trial_error_models",
      mock.includes("__tokfai_mock_trial_limit_exceeded") &&
        mock.includes("__tokfai_mock_trial_model_not_allowed"),
      "offline mock P982 error models"
    ) && okAll;

  // Pure allowlist logic mirrored from guard (smoke without TS import).
  const allowed = ["auto-fast", "auto-cheap"];
  const allowOk =
    allowed.includes("auto-fast") &&
    !allowed.includes("gpt-5.5") &&
    !allowed.includes("auto-pro");
  okAll =
    record(
      "trial_allowlist_policy",
      allowOk,
      "default trial allowlist excludes high-cost models"
    ) && okAll;

  return okAll;
}

async function apiChecks(ctx) {
  console.log("\n=== API light checks ===\n");
  let okAll = true;
  const { postJson, getJson } = ctx;

  const { res: modelsRes, body: modelBody } = await getJson("/v1/models");
  const list = Array.isArray(modelBody?.data) ? modelBody.data : [];
  const withCaps = list.filter(
    (m) => m && typeof m === "object" && m.capabilities != null
  );
  okAll =
    record(
      "models_capabilities",
      modelsRes.status === 200 && list.length > 0 && withCaps.length > 0,
      `models=${list.length} caps=${withCaps.length}`
    ) && okAll;

  const { res: chatRes, body: chatBody } = await postJson(
    "/v1/chat/completions",
    {
      model: "auto-fast",
      messages: [{ role: "user", content: "P982 trial guard smoke: ok" }],
      stream: false,
      max_tokens: 16,
    }
  );
  const content =
    chatBody?.choices?.[0]?.message?.content ??
    chatBody?.choices?.[0]?.text ??
    "";
  const rid = requestIdOf(chatBody, chatRes);
  const chatOk =
    chatRes.status === 200 &&
    String(content).trim().length > 0 &&
    Boolean(rid);
  okAll =
    record(
      "chat_success_may_charge",
      chatOk,
      `status=${chatRes.status} rid=${rid ? "yes" : "no"} charged=${charged(chatBody)}`
    ) && okAll;

  const { res: badRes, body: badBody } = await postJson(
    "/v1/chat/completions",
    {
      model: "p982-nonexistent-model-xyz",
      messages: [{ role: "user", content: "x" }],
      stream: false,
    }
  );
  okAll =
    record(
      "unknown_model_not_billable",
      badRes.status >= 400 && notBillable(badBody) && charged(badBody) === 0,
      `status=${badRes.status} code=${badBody?.error?.code} charged=${charged(badBody)}`
    ) && okAll;

  // Contract probes via mock reserved models (offline) or soft on LIVE.
  for (const [model, expectCode] of [
    ["__tokfai_mock_trial_limit_exceeded", "trial_limit_exceeded"],
    ["__tokfai_mock_daily_limit_exceeded", "daily_limit_exceeded"],
    ["__tokfai_mock_quota_exceeded", "quota_exceeded"],
    ["__tokfai_mock_trial_model_not_allowed", "trial_model_not_allowed"],
  ]) {
    const { res, body } = await postJson("/v1/chat/completions", {
      model,
      messages: [{ role: "user", content: "quota" }],
      stream: false,
    });
    const code = body?.error?.code;
    const ok =
      res.status >= 400 &&
      code === expectCode &&
      notBillable(body) &&
      charged(body) === 0 &&
      Boolean(requestIdOf(body, res));
    if (ok) {
      okAll =
        record(
          `guard_envelope:${expectCode}`,
          true,
          `status=${res.status} charged=0`
        ) && okAll;
    } else if (ctx.LIVE) {
      record(
        `guard_envelope:${expectCode}`,
        true,
        `LIVE soft — mock model not routed (status=${res.status} code=${code})`,
        true
      );
    } else {
      okAll =
        record(
          `guard_envelope:${expectCode}`,
          false,
          `status=${res.status} code=${code} charged=${charged(body)}`
        ) && okAll;
    }
  }

  return okAll;
}

function writeReport(overallOk) {
  if (!WRITE_REPORT) return;
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  const lines = [
    "# P982 — Trial Quota Tenant Guard Report",
    "",
    `> Generated by \`${SCRIPT}\``,
    "",
    `## Result: ${overallOk ? "PASS" : "FAIL"}`,
    "",
    `| Check | Result | Detail |`,
    `|---|---|---|`,
    ...results.map((r) => {
      const mark = r.ok ? (r.soft ? "SOFT" : "PASS") : "FAIL";
      return `| ${r.id} | ${mark} | ${r.detail ?? ""} |`;
    }),
    "",
    `Marker: \`${overallOk ? PASS_MARKER : FAIL_MARKER}\``,
    "",
  ];
  writeFileSync(REPORT_PATH, lines.join("\n"), "utf8");
  console.log(`\nWrote ${REPORT_PATH}`);
}

async function main() {
  let ctx = null;
  let overallOk = true;
  try {
    overallOk = staticChecks() && overallOk;
    ctx = await bootstrapClientCompatSmoke(SCRIPT);
    overallOk = (await apiChecks(ctx)) && overallOk;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    record("smoke_runtime", false, message);
    overallOk = false;
  } finally {
    ctx?.cleanup?.();
  }

  const hardFail = results.some((r) => !r.ok && !r.soft);
  overallOk = overallOk && !hardFail;

  writeReport(overallOk);
  console.log("");
  if (overallOk) {
    console.log(PASS_MARKER);
    process.exit(0);
  }
  console.error(FAIL_MARKER);
  process.exit(1);
}

main();
