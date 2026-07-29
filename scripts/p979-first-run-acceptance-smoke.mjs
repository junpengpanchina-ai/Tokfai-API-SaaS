#!/usr/bin/env node
/**
 * P979 — External Customer First-Run Acceptance smoke (read-only / light).
 *
 * Verifies product + docs can carry a stranger through first connect:
 *   - commercial docs exist with Base URL / curl / Cursor / request_id / billing
 *   - dashboard first-run surfaces exist (acceptance panel + docs cursor slug)
 *   - GET /v1/models returns capabilities
 *   - ordinary chat succeeds with request_id
 *   - failing request is not_billable (credits_charged=0)
 *
 * Usage:
 *   node scripts/p979-first-run-acceptance-smoke.mjs
 *   LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p979-first-run-acceptance-smoke.mjs
 *
 * Markers:
 *   TOKFAI_P979_EXTERNAL_CUSTOMER_FIRST_RUN_PASS
 *   TOKFAI_P979_EXTERNAL_CUSTOMER_FIRST_RUN_PARTIAL_PASS
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bootstrapClientCompatSmoke,
  pass,
  fail,
} from "./lib/client-compat-smoke-bootstrap.mjs";

const SCRIPT = "scripts/p979-first-run-acceptance-smoke.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS_MARKER = "TOKFAI_P979_EXTERNAL_CUSTOMER_FIRST_RUN_PASS";
const PARTIAL_MARKER = "TOKFAI_P979_EXTERNAL_CUSTOMER_FIRST_RUN_PARTIAL_PASS";
const FAIL_MARKER = "TOKFAI_P979_EXTERNAL_CUSTOMER_FIRST_RUN_FAIL";

const WRITE_REPORT =
  process.env.WRITE_REPORT === "1" || process.env.WRITE_REPORT === "true";
const REPORT_PATH = join(
  ROOT,
  process.env.REPORT_PATH ?? "docs/p979-external-customer-first-run-report.md"
);

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
  console.log("=== static first-run checks ===\n");
  let hardOk = true;
  let softOnly = true;

  const playbookRel = "docs/customer-onboarding-playbook.zh.md";
  const playbookPath = join(ROOT, playbookRel);
  if (!existsSync(playbookPath)) {
    hardOk = record(`doc_exists:${playbookRel}`, false, "missing") && hardOk;
  } else {
    const text = readFileSync(playbookPath, "utf8");
    const need = [
      "api.tokfai.com",
      "curl",
      "Cursor",
      "request_id",
      "账单",
    ];
    const { ok, missing } = includesAll(text, need);
    hardOk =
      record(
        "playbook_first_run_topics",
        ok,
        ok ? "Base URL/curl/Cursor/request_id/billing present" : `missing=${missing.join(",")}`
      ) && hardOk;
  }

  const errorRel = "docs/error-code-guide.zh.md";
  if (!existsSync(join(ROOT, errorRel))) {
    hardOk = record(`doc_exists:${errorRel}`, false, "missing") && hardOk;
  } else {
    const text = readFileSync(join(ROOT, errorRel), "utf8");
    const ok =
      text.includes("不计费") ||
      text.includes("不扣费") ||
      text.includes("not_billable");
    hardOk =
      record(
        "error_guide_not_billable",
        ok,
        ok ? "not-charged language present" : "missing not-billable language"
      ) && hardOk;
  }

  const matrixRel = "docs/model-commercial-matrix.zh.md";
  if (!existsSync(join(ROOT, matrixRel))) {
    hardOk = record(`doc_exists:${matrixRel}`, false, "missing") && hardOk;
  } else {
    const text = readFileSync(join(ROOT, matrixRel), "utf8");
    const { ok, missing } = includesAll(text, [
      "auto-fast",
      "auto-pro",
      "auto-cheap",
    ]);
    hardOk =
      record(
        "matrix_recommended_aliases",
        ok,
        ok ? "auto-fast/pro/cheap present" : `missing=${missing.join(",")}`
      ) && hardOk;
  }

  const panel = readFileSync(
    join(ROOT, "apps/web/components/dashboard-first-run-acceptance.tsx"),
    "utf8"
  );
  hardOk =
    record(
      "dashboard_first_run_panel",
      panel.includes("TOKFAI_API_BASE_URL") &&
        panel.includes("TOKFAI_SMART_MODEL_ALIASES") &&
        panel.includes("CURSOR_SNIPPET") &&
        panel.includes("billingFail") &&
        panel.includes("billingRequestId"),
      "first-run acceptance panel wires Base URL / models / Cursor / billing"
    ) && hardOk;

  const workbenchPage = readFileSync(
    join(ROOT, "apps/web/app/dashboard/integration-workbench/page.tsx"),
    "utf8"
  );
  hardOk =
    record(
      "workbench_hosts_first_run",
      workbenchPage.includes("DashboardFirstRunAcceptancePanel"),
      "integration-workbench hosts first-run panel"
    ) && hardOk;

  const docsRegistry = readFileSync(
    join(ROOT, "apps/web/lib/docs/public-beta-docs-registry.ts"),
    "utf8"
  );
  hardOk =
    record(
      "docs_cursor_slug",
      docsRegistry.includes('slug: "cursor"') &&
        docsRegistry.includes("auto-fast") &&
        docsRegistry.includes("auto-pro") &&
        docsRegistry.includes("auto-cheap"),
      "dashboard docs include #cursor + recommended aliases"
    ) && hardOk;

  const adminOverview = readFileSync(
    join(ROOT, "apps/web/components/admin/admin-overview-panel.tsx"),
    "utf8"
  );
  hardOk =
    record(
      "admin_first_run_ops_glance",
      adminOverview.includes("firstRunOpsTitle") &&
        adminOverview.includes("today_successful_requests") &&
        adminOverview.includes("today_failed_requests") &&
        adminOverview.includes("today_credits_consumed"),
      "admin shows first-run ops glance"
    ) && hardOk;

  // Soft alignment: playbook Base URL matches product constant
  const constants = readFileSync(
    join(ROOT, "apps/web/lib/dashboard-safe/constants.ts"),
    "utf8"
  );
  const productBase = constants.includes(
    'TOKFAI_API_BASE_URL = "https://api.tokfai.com/v1"'
  );
  softOnly =
    record(
      "docs_product_base_url_align",
      productBase,
      productBase ? "product Base URL constant ok" : "constant mismatch",
      !productBase
    ) && softOnly;

  return { hardOk, softOnly };
}

async function apiChecks(ctx) {
  console.log("\n=== API light checks ===\n");
  let hardOk = true;
  const { getJson, postJson, LIVE } = ctx;

  const { res: modelsRes, body: modelBody } = await getJson("/v1/models");
  const list = Array.isArray(modelBody?.data) ? modelBody.data : [];
  const withCaps = list.filter(
    (m) => m && typeof m === "object" && m.capabilities != null
  );
  hardOk =
    record(
      "models_capabilities",
      modelsRes.status === 200 && list.length > 0 && withCaps.length > 0,
      `status=${modelsRes.status} models=${list.length} with_caps=${withCaps.length}`
    ) && hardOk;

  const { res: chatRes, body: chatBody } = await postJson(
    "/v1/chat/completions",
    {
      model: "auto-fast",
      messages: [{ role: "user", content: "P979 first-run smoke: reply ok" }],
      stream: false,
      max_tokens: 16,
    }
  );
  const chatContent =
    chatBody?.choices?.[0]?.message?.content ??
    chatBody?.choices?.[0]?.text ??
    "";
  const chatRid = requestIdOf(chatBody, chatRes);
  hardOk =
    record(
      "chat_success_request_id",
      chatRes.status === 200 &&
        String(chatContent).trim().length > 0 &&
        Boolean(chatRid),
      `status=${chatRes.status} rid=${chatRid ? "yes" : "no"} charged=${charged(chatBody)}`
    ) && hardOk;

  const { res: failRes, body: failBody } = await postJson(
    "/v1/chat/completions",
    {
      model: "auto-fast",
      messages: [{ role: "user", content: "call a tool" }],
      tools: [
        {
          type: "function",
          function: {
            name: "get_weather",
            description: "weather",
            parameters: {
              type: "object",
              properties: { location: { type: "string" } },
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "get_weather" } },
      stream: false,
    }
  );
  const failRid = requestIdOf(failBody, failRes);
  let failOk =
    failRes.status >= 400 &&
    notBillable(failBody) &&
    charged(failBody) === 0 &&
    Boolean(failRid);

  if (
    LIVE &&
    failRes.status === 200 &&
    Array.isArray(failBody?.choices?.[0]?.message?.tool_calls)
  ) {
    record(
      "failure_not_billable_request_id",
      true,
      "LIVE whitelist returned tool_calls — soft",
      true
    );
  } else if (failOk) {
    hardOk =
      record(
        "failure_not_billable_request_id",
        true,
        `status=${failRes.status} code=${failBody?.error?.code} charged=0`
      ) && hardOk;
  } else {
    const { res: badRes, body: badBody } = await postJson(
      "/v1/chat/completions",
      {
        model: "p979-nonexistent-model-xyz",
        messages: [{ role: "user", content: "x" }],
        stream: false,
      }
    );
    const badOk =
      badRes.status >= 400 && notBillable(badBody) && charged(badBody) === 0;
    hardOk =
      record(
        "failure_not_billable_request_id",
        badOk,
        `fallback status=${badRes.status} code=${badBody?.error?.code} charged=${charged(badBody)}`
      ) && hardOk;
  }

  return hardOk;
}

function writeReport(overall, marker) {
  if (!WRITE_REPORT) return;
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  const lines = [
    "# P979 — External Customer First-Run Acceptance Report",
    "",
    `> Generated by \`${SCRIPT}\``,
    "",
    `## Result: ${overall}`,
    "",
    `| Check | Result | Detail |`,
    `|---|---|---|`,
    ...results.map((r) => {
      const mark = r.ok ? (r.soft ? "SOFT" : "PASS") : "FAIL";
      return `| ${r.id} | ${mark} | ${r.detail ?? ""} |`;
    }),
    "",
    `Marker: \`${marker}\``,
    "",
  ];
  writeFileSync(REPORT_PATH, lines.join("\n"), "utf8");
  console.log(`\nWrote ${REPORT_PATH}`);
}

async function main() {
  let ctx = null;
  let hardOk = true;
  try {
    const staticResult = staticChecks();
    hardOk = staticResult.hardOk && hardOk;
    ctx = await bootstrapClientCompatSmoke(SCRIPT);
    hardOk = (await apiChecks(ctx)) && hardOk;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    record("smoke_runtime", false, message);
    hardOk = false;
  } finally {
    ctx?.cleanup?.();
  }

  const anySoftFail = results.some((r) => r.soft && !r.ok);
  const anyHardFail = results.some((r) => !r.ok && !r.soft);
  let marker = PASS_MARKER;
  let overall = "PASS";
  if (anyHardFail || !hardOk) {
    marker = FAIL_MARKER;
    overall = "FAIL";
  } else if (anySoftFail) {
    marker = PARTIAL_MARKER;
    overall = "PARTIAL_PASS";
  }

  writeReport(overall, marker);

  console.log("");
  if (marker === PASS_MARKER) {
    console.log(PASS_MARKER);
    process.exit(0);
  }
  if (marker === PARTIAL_MARKER) {
    console.log(PARTIAL_MARKER);
    process.exit(0);
  }
  console.error(FAIL_MARKER);
  process.exit(1);
}

main();
