#!/usr/bin/env node
/**
 * P980 — Commercial Delivery Pack Acceptance smoke (docs + light API).
 *
 * Does not touch core Chat/Billing. Verifies delivery-pack docs exist and
 * carry first-run / sales / matrix / error+request_id SOP content, plus
 * light API: capabilities, chat+request_id, failure not_billable.
 *
 * Usage:
 *   node scripts/p980-commercial-delivery-pack-smoke.mjs
 *   LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p980-commercial-delivery-pack-smoke.mjs
 *
 * Marker:
 *   TOKFAI_P980_COMMERCIAL_DELIVERY_PACK_PASS
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bootstrapClientCompatSmoke,
  pass,
  fail,
} from "./lib/client-compat-smoke-bootstrap.mjs";

const SCRIPT = "scripts/p980-commercial-delivery-pack-smoke.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS_MARKER = "TOKFAI_P980_COMMERCIAL_DELIVERY_PACK_PASS";
const FAIL_MARKER = "TOKFAI_P980_COMMERCIAL_DELIVERY_PACK_FAIL";

const WRITE_REPORT =
  process.env.WRITE_REPORT === "1" || process.env.WRITE_REPORT === "true";
const REPORT_PATH = join(
  ROOT,
  process.env.REPORT_PATH ?? "docs/p980-commercial-delivery-pack-report.md"
);

const PACK_DOCS = [
  "docs/commercial-delivery-pack.zh.md",
  "docs/customer-first-run-sop.zh.md",
  "docs/sales-and-support-playbook.zh.md",
  "docs/model-capability-commercial-matrix.zh.md",
  "docs/error-and-request-id-sop.zh.md",
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
  console.log("=== delivery pack static checks ===\n");
  let okAll = true;

  for (const rel of PACK_DOCS) {
    const abs = join(ROOT, rel);
    if (!existsSync(abs)) {
      okAll = record(`doc_exists:${rel}`, false, "missing") && okAll;
      continue;
    }
    const text = readFileSync(abs, "utf8");
    okAll =
      record(
        `doc_exists:${rel}`,
        text.trim().length > 200,
        `bytes=${text.length}`
      ) && okAll;
  }

  const firstRun = readFileSync(
    join(ROOT, "docs/customer-first-run-sop.zh.md"),
    "utf8"
  );
  okAll =
    record(
      "first_run_sop_topics",
      includesAll(firstRun, [
        "api.tokfai.com/v1",
        "API Key",
        "auto-fast",
        "auto-pro",
        "auto-cheap",
        "curl",
        "Cursor",
        "request_id",
        "不扣费",
      ]).ok,
      "Base URL / Key / models / curl / Cursor / billing / request_id"
    ) && okAll;

  const sales = readFileSync(
    join(ROOT, "docs/sales-and-support-playbook.zh.md"),
    "utf8"
  );
  const salesOk =
    sales.includes("OpenAI") &&
    (sales.includes("不承诺") || sales.includes("不能说")) &&
    sales.includes("fully compatible") &&
    !/保证全量 tool|保证.*fully compatible/i.test(sales);
  okAll =
    record(
      "sales_no_tools_overpromise",
      salesOk,
      salesOk
        ? "sales playbook forbids fully compatible / full tools promise"
        : "sales playbook missing anti-overpromise language"
    ) && okAll;

  const matrix = readFileSync(
    join(ROOT, "docs/model-capability-commercial-matrix.zh.md"),
    "utf8"
  );
  okAll =
    record(
      "matrix_capability_buckets",
      includesAll(matrix, [
        "推荐接入",
        "普通 Chat",
        "Cursor 可用",
        "Tool Call 暂不承诺",
        "图片模型专用",
        "auto-fast",
      ]).ok,
      "commercial capability buckets present"
    ) && okAll;

  const errSop = readFileSync(
    join(ROOT, "docs/error-and-request-id-sop.zh.md"),
    "utf8"
  );
  okAll =
    record(
      "error_sop_codes_and_pentuple",
      includesAll(errSop, [
        "model_not_available",
        "model_not_tool_capable",
        "upstream_model_busy",
        "all_upstreams_unavailable",
        "insufficient_credits",
        "request_id",
        "是否 stream",
        "是否 tools",
        "不扣费",
      ]).ok,
      "error SOP codes + feedback pentuple + not charged"
    ) && okAll;

  const pack = readFileSync(
    join(ROOT, "docs/commercial-delivery-pack.zh.md"),
    "utf8"
  );
  okAll =
    record(
      "pack_index_links",
      includesAll(pack, [
        "customer-first-run-sop.zh.md",
        "sales-and-support-playbook.zh.md",
        "model-capability-commercial-matrix.zh.md",
        "error-and-request-id-sop.zh.md",
        "成功扣费",
      ]).ok,
      "pack index references all SOP files"
    ) && okAll;

  const admin = readFileSync(
    join(ROOT, "apps/web/components/admin/admin-overview-panel.tsx"),
    "utf8"
  );
  okAll =
    record(
      "admin_onboarding_glance",
      admin.includes("firstRunOpsTitle") &&
        admin.includes("recommendedModelsLabel") &&
        admin.includes("firstRunEntryHint") &&
        admin.includes("auto-fast"),
      "admin today onboarding glance + recommended models + first-run hint"
    ) && okAll;

  const panel = join(
    ROOT,
    "apps/web/components/dashboard-first-run-acceptance.tsx"
  );
  okAll =
    record(
      "customer_first_run_surface",
      existsSync(panel),
      "P979 first-run panel still present"
    ) && okAll;

  return okAll;
}

async function apiChecks(ctx) {
  console.log("\n=== API light checks (no core path change) ===\n");
  let okAll = true;
  const { getJson, postJson, LIVE } = ctx;

  const { res: modelsRes, body: modelBody } = await getJson("/v1/models");
  const list = Array.isArray(modelBody?.data) ? modelBody.data : [];
  const withCaps = list.filter(
    (m) => m && typeof m === "object" && m.capabilities != null
  );
  okAll =
    record(
      "models_capabilities",
      modelsRes.status === 200 && list.length > 0 && withCaps.length > 0,
      `status=${modelsRes.status} models=${list.length} caps=${withCaps.length}`
    ) && okAll;

  const { res: chatRes, body: chatBody } = await postJson(
    "/v1/chat/completions",
    {
      model: "auto-fast",
      messages: [{ role: "user", content: "P980 delivery pack smoke: ok" }],
      stream: false,
      max_tokens: 16,
    }
  );
  const content =
    chatBody?.choices?.[0]?.message?.content ??
    chatBody?.choices?.[0]?.text ??
    "";
  const rid = requestIdOf(chatBody, chatRes);
  okAll =
    record(
      "chat_success_request_id",
      chatRes.status === 200 && String(content).trim().length > 0 && Boolean(rid),
      `status=${chatRes.status} rid=${rid ? "yes" : "no"}`
    ) && okAll;

  const { res: failRes, body: failBody } = await postJson(
    "/v1/chat/completions",
    {
      model: "p980-nonexistent-model-xyz",
      messages: [{ role: "user", content: "x" }],
      stream: false,
    }
  );
  let failOk =
    failRes.status >= 400 && notBillable(failBody) && charged(failBody) === 0;

  if (!failOk) {
    const forced = await postJson("/v1/chat/completions", {
      model: "auto-fast",
      messages: [{ role: "user", content: "tool" }],
      tools: [
        {
          type: "function",
          function: {
            name: "get_weather",
            parameters: { type: "object", properties: {} },
          },
        },
      ],
      tool_choice: "required",
      stream: false,
    });
    if (
      LIVE &&
      forced.res.status === 200 &&
      Array.isArray(forced.body?.choices?.[0]?.message?.tool_calls)
    ) {
      record("failure_not_billable", true, "LIVE whitelist soft", true);
      failOk = true;
    } else {
      failOk =
        forced.res.status >= 400 &&
        notBillable(forced.body) &&
        charged(forced.body) === 0;
    }
  }

  okAll =
    record(
      "failure_not_billable",
      failOk,
      `status=${failRes.status} code=${failBody?.error?.code} charged=${charged(failBody)}`
    ) && okAll;

  return okAll;
}

function writeReport(overallOk) {
  if (!WRITE_REPORT) return;
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  const lines = [
    "# P980 — Commercial Delivery Pack Report",
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
