#!/usr/bin/env node
/**
 * P978 — Commercial Replication Acceptance smoke (read-only / light).
 *
 * Verifies:
 *   - commercial docs exist
 *   - GET /v1/models returns capabilities
 *   - ordinary chat succeeds with request_id
 *   - a failing request is not_billable (credits_charged=0)
 *
 * Usage:
 *   node scripts/p978-commercial-replication-smoke.mjs
 *   LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p978-commercial-replication-smoke.mjs
 *
 * Marker:
 *   TOKFAI_P978_COMMERCIAL_REPLICATION_PASS
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bootstrapClientCompatSmoke,
  pass,
  fail,
} from "./lib/client-compat-smoke-bootstrap.mjs";

const SCRIPT = "scripts/p978-commercial-replication-smoke.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS_MARKER = "TOKFAI_P978_COMMERCIAL_REPLICATION_PASS";
const FAIL_MARKER = "TOKFAI_P978_COMMERCIAL_REPLICATION_FAIL";

const WRITE_REPORT =
  process.env.WRITE_REPORT === "1" || process.env.WRITE_REPORT === "true";
const REPORT_PATH = join(
  ROOT,
  process.env.REPORT_PATH ?? "docs/p978-commercial-replication-report.md"
);

const REQUIRED_DOCS = [
  "docs/customer-onboarding-playbook.zh.md",
  "docs/model-commercial-matrix.zh.md",
  "docs/error-code-guide.zh.md",
];

/** @type {{ id: string, ok: boolean, soft?: boolean, detail?: string }[]} */
const results = [];

function record(id, ok, detail, soft = false) {
  results.push({
    id,
    ok,
    soft,
    detail: detail ? String(detail).slice(0, 360) : undefined,
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

function staticDocChecks() {
  console.log("=== static doc checks ===\n");
  let allOk = true;
  for (const rel of REQUIRED_DOCS) {
    const abs = join(ROOT, rel);
    if (!existsSync(abs)) {
      allOk = record(`doc_exists:${rel}`, false, "missing") && allOk;
      continue;
    }
    const text = readFileSync(abs, "utf8");
    if (text.trim().length < 200) {
      allOk = record(`doc_exists:${rel}`, false, "too short") && allOk;
      continue;
    }
    allOk = record(`doc_exists:${rel}`, true, `bytes=${text.length}`) && allOk;
  }

  const matrix = readFileSync(
    join(ROOT, "docs/model-commercial-matrix.zh.md"),
    "utf8"
  );
  const toolsConservative =
    matrix.includes("VERIFIED_TOOLS_CAPABLE_MODEL_IDS") &&
    (matrix.includes("不作为公开承诺") || matrix.includes("不承诺"));
  allOk =
    record(
      "matrix_tools_not_overpromised",
      toolsConservative,
      toolsConservative ? "tools policy present" : "missing tools caveat"
    ) && allOk;

  const usageUi = readFileSync(
    join(ROOT, "apps/web/components/usage-view-client.tsx"),
    "utf8"
  );
  allOk =
    record(
      "usage_ui_error_column",
      usageUi.includes("dashboard.usage.colError") &&
        usageUi.includes("row.error_code"),
      "error_code column wired"
    ) && allOk;

  const adminSummary = readFileSync(
    join(ROOT, "apps/dmit-api/src/routes/adminDashboardSummary.ts"),
    "utf8"
  );
  allOk =
    record(
      "admin_commercial_metrics",
      adminSummary.includes("today_successful_requests") &&
        adminSummary.includes("today_not_billable_failures") &&
        adminSummary.includes("top_users_7d") &&
        adminSummary.includes("low_balance_users"),
      "admin summary fields present"
    ) && allOk;

  return allOk;
}

async function liveOrMockChecks(ctx) {
  console.log("\n=== API light checks ===\n");
  let allOk = true;
  const { getJson, postJson, LIVE } = ctx;

  const { res: modelsRes, body: modelBody } = await getJson("/v1/models");
  const list = Array.isArray(modelBody?.data) ? modelBody.data : [];
  const withCaps = list.filter(
    (m) => m && typeof m === "object" && m.capabilities != null
  );
  allOk =
    record(
      "models_capabilities",
      modelsRes.status === 200 && list.length > 0 && withCaps.length > 0,
      `status=${modelsRes.status} models=${list.length} with_caps=${withCaps.length}`
    ) && allOk;

  const { res: chatRes, body: chatBody } = await postJson(
    "/v1/chat/completions",
    {
      model: "auto-fast",
      messages: [{ role: "user", content: "P978 commercial smoke: reply ok" }],
      stream: false,
      max_tokens: 16,
    }
  );
  const chatContent =
    chatBody?.choices?.[0]?.message?.content ??
    chatBody?.choices?.[0]?.text ??
    "";
  const chatRid = requestIdOf(chatBody, chatRes);
  const chatOk =
    chatRes.status === 200 &&
    String(chatContent).trim().length > 0 &&
    Boolean(chatRid);
  allOk =
    record(
      "chat_success_request_id",
      chatOk,
      `status=${chatRes.status} rid=${chatRid ? "yes" : "no"} charged=${charged(chatBody)}`
    ) && allOk;

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
  const failCode =
    failBody?.error?.code ?? failBody?.tokfai?.error_code ?? null;
  const failRid = requestIdOf(failBody, failRes);
  let failOk =
    failRes.status >= 400 &&
    notBillable(failBody) &&
    Boolean(failRid) &&
    charged(failBody) === 0;

  if (
    LIVE &&
    failRes.status === 200 &&
    Array.isArray(failBody?.choices?.[0]?.message?.tool_calls)
  ) {
    failOk = true;
    allOk =
      record(
        "failure_not_billable_request_id",
        true,
        "LIVE whitelist returned tool_calls — soft skip",
        true
      ) && allOk;
  } else {
    allOk =
      record(
        "failure_not_billable_request_id",
        failOk,
        `status=${failRes.status} code=${failCode} rid=${failRid ? "yes" : "no"} charged=${charged(failBody)} billing=${failBody?.tokfai?.billing_status ?? "n/a"}`
      ) && allOk;
  }

  if (!failOk) {
    const { res: badRes, body: badBody } = await postJson(
      "/v1/chat/completions",
      {
        model: "p978-nonexistent-model-xyz",
        messages: [{ role: "user", content: "x" }],
        stream: false,
      }
    );
    const badOk =
      badRes.status >= 400 && notBillable(badBody) && charged(badBody) === 0;
    allOk =
      record(
        "failure_not_billable_fallback",
        badOk,
        `status=${badRes.status} code=${badBody?.error?.code} charged=${charged(badBody)}`
      ) && allOk;
  }

  return allOk;
}

function writeReport(overallOk) {
  if (!WRITE_REPORT) return;
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  const lines = [
    "# P978 — Commercial Replication Acceptance Report",
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
    overallOk = staticDocChecks() && overallOk;
    ctx = await bootstrapClientCompatSmoke(SCRIPT);
    overallOk = (await liveOrMockChecks(ctx)) && overallOk;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    record("smoke_runtime", false, message);
    overallOk = false;
  } finally {
    ctx?.cleanup?.();
  }

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
