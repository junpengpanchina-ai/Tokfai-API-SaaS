#!/usr/bin/env node
/**
 * P981 — Hermes-like Developer Agent Commercial Replication smoke.
 *
 * Static docs + light API. No production data mutation. No core billing changes.
 *
 * Usage:
 *   node scripts/p981-hermes-commercial-replication-smoke.mjs
 *   LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p981-hermes-commercial-replication-smoke.mjs
 *
 * Marker:
 *   TOKFAI_P981_HERMES_COMMERCIAL_REPLICATION_PASS
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bootstrapClientCompatSmoke,
  pass,
  fail,
} from "./lib/client-compat-smoke-bootstrap.mjs";

const SCRIPT = "scripts/p981-hermes-commercial-replication-smoke.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS_MARKER = "TOKFAI_P981_HERMES_COMMERCIAL_REPLICATION_PASS";
const FAIL_MARKER = "TOKFAI_P981_HERMES_COMMERCIAL_REPLICATION_FAIL";

const WRITE_REPORT =
  process.env.WRITE_REPORT === "1" || process.env.WRITE_REPORT === "true";
const REPORT_PATH = join(
  ROOT,
  process.env.REPORT_PATH ?? "docs/p981-hermes-commercial-replication-report.md"
);

const DOCS = [
  "docs/hermes-developer-agent-customer-profile.zh.md",
  "docs/cursor-codex-commercial-sop.zh.md",
  "docs/developer-agent-model-routing.zh.md",
  "docs/hermes-objection-handling.zh.md",
  "docs/developer-agent-delivery-checklist.zh.md",
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
  console.log("=== Hermes commercial pack static checks ===\n");
  let okAll = true;

  for (const rel of DOCS) {
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

  const joined = DOCS.map((rel) =>
    readFileSync(join(ROOT, rel), "utf8")
  ).join("\n");

  const keywords = [
    "Base URL",
    "api.tokfai.com/v1",
    "API Key",
    "Cursor",
    "Codex",
    "request_id",
    "not_billable",
    "capabilities",
    "auto-fast",
    "auto-pro",
    "Tool Call",
    "不扣费",
  ];
  const { ok, missing } = includesAll(joined, keywords);
  okAll =
    record(
      "pack_keywords",
      ok,
      ok ? "core Hermes keywords present" : `missing=${missing.join(",")}`
    ) && okAll;

  const routing = readFileSync(
    join(ROOT, "docs/developer-agent-model-routing.zh.md"),
    "utf8"
  );
  okAll =
    record(
      "routing_layers_a_to_e",
      includesAll(routing, [
        "推荐 Cursor",
        "普通 Chat",
        "不承诺工具",
        "Tool Call 暂不承诺",
        "图片模型专用",
      ]).ok,
      "A–E commercial layers present"
    ) && okAll;

  const objections = readFileSync(
    join(ROOT, "docs/hermes-objection-handling.zh.md"),
    "utf8"
  );
  okAll =
    record(
      "objection_topics",
      includesAll(objections, [
        "原生 API",
        "不稳定",
        "Cursor",
        "工具调用",
        "扣费",
        "商业化复制",
      ]).ok,
      "six core objections covered"
    ) && okAll;

  const checklist = readFileSync(
    join(ROOT, "docs/developer-agent-delivery-checklist.zh.md"),
    "utf8"
  );
  okAll =
    record(
      "delivery_checklists",
      includesAll(checklist, [
        "销售交付",
        "客户接入",
        "售后排障",
        "技术验收",
        "商业复盘",
      ]).ok,
      "five checklist sections present"
    ) && okAll;

  const noOverpromise =
    (joined.includes("不宣传比官方原生") ||
      joined.includes("不宣传强于官方") ||
      joined.includes("不宣传 Tokfai 强于官方")) &&
    (joined.includes("不承诺") || joined.includes("暂不承诺")) &&
    joined.includes("fully compatible");
  okAll =
    record(
      "no_native_superiority_promise",
      noOverpromise,
      noOverpromise
        ? "explicit no-native-superiority + tools caveats"
        : "missing no-superiority / tools caveats"
    ) && okAll;

  const admin = readFileSync(
    join(ROOT, "apps/web/components/admin/admin-overview-panel.tsx"),
    "utf8"
  );
  okAll =
    record(
      "admin_developer_cursor_tip",
      admin.includes("developerCursorTipTitle") &&
        admin.includes("developerCursorTipTools") &&
        admin.includes("developerCursorTipRequestId"),
      "admin developer/Cursor tip module present"
    ) && okAll;

  return okAll;
}

async function apiChecks(ctx) {
  console.log("\n=== API light checks ===\n");
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
      messages: [{ role: "user", content: "P981 Hermes smoke: reply ok" }],
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
      chatRes.status === 200 &&
        String(content).trim().length > 0 &&
        Boolean(rid),
      `status=${chatRes.status} rid=${rid ? "yes" : "no"} charged=${charged(chatBody)}`
    ) && okAll;

  const { res: failRes, body: failBody } = await postJson(
    "/v1/chat/completions",
    {
      model: "p981-nonexistent-model-xyz",
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
    "# P981 — Hermes Commercial Replication Report",
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
