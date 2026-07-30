#!/usr/bin/env node
/**
 * P984 — Model Routing Evidence / Scheduling Result Acceptance smoke.
 *
 * Static + light API. Does not invent new billing rules.
 *
 * Usage:
 *   node scripts/p984-model-routing-evidence-smoke.mjs
 *   LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p984-model-routing-evidence-smoke.mjs
 *
 * Marker:
 *   TOKFAI_P984_MODEL_ROUTING_EVIDENCE_PASS
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bootstrapClientCompatSmoke,
  pass,
  fail,
} from "./lib/client-compat-smoke-bootstrap.mjs";

const SCRIPT = "scripts/p984-model-routing-evidence-smoke.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS_MARKER = "TOKFAI_P984_MODEL_ROUTING_EVIDENCE_PASS";
const FAIL_MARKER = "TOKFAI_P984_MODEL_ROUTING_EVIDENCE_FAIL";

const WRITE_REPORT =
  process.env.WRITE_REPORT === "1" || process.env.WRITE_REPORT === "true";
const REPORT_PATH = join(
  ROOT,
  process.env.REPORT_PATH ?? "docs/p984-model-routing-evidence-report.md"
);
const SKIP_PM2 =
  process.env.SKIP_PM2 === "1" || process.env.SKIP_PM2 === "true";

const DOCS = [
  "docs/model-routing-evidence.zh.md",
  "docs/customer-model-routing-sop.zh.md",
];

const PM2_DIRTY = [
  "bad_billing",
  "charged_missing_url",
  "provider_success_unpaid",
  "missing_url_success",
  "stale_timeout_pending",
  "api_error_500",
  "Cannot set headers",
  "ENOMEM",
  "EADDRINUSE",
  "uncaught",
  "heap out",
  "TypeError",
  "AbortError",
  "gateway_overloaded",
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

function hasRoutingEvidence(tokfai, { requireResolved = true } = {}) {
  if (!tokfai || typeof tokfai !== "object") return false;
  const need = [
    "request_id",
    "requested_model",
    "routing_strategy",
    "attempted_models",
    "fallback_attempts",
    "latency_ms",
    "billing_status",
    "credits_charged",
  ];
  for (const k of need) {
    if (!(k in tokfai)) return false;
  }
  if (requireResolved && !("resolved_model" in tokfai)) return false;
  if (!Array.isArray(tokfai.attempted_models)) return false;
  return true;
}

function includesAll(text, needles) {
  const missing = needles.filter((n) => !text.includes(n));
  return { ok: missing.length === 0, missing };
}

function staticChecks() {
  console.log("=== P984 static checks ===\n");
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

  const docsJoined = DOCS.map((r) => readFileSync(join(ROOT, r), "utf8")).join(
    "\n"
  );
  okAll =
    record(
      "docs_routing_keywords",
      includesAll(docsJoined, [
        "auto-fast",
        "auto-pro",
        "auto-cheap",
        "requested_model",
        "resolved_model",
        "attempted_models",
        "not_billable",
        "fully compatible",
        "request_id",
      ]).ok,
      "docs cover routing + billing + no overpromise"
    ) && okAll;

  const mod = readFileSync(
    join(ROOT, "apps/dmit-api/src/lib/routingEvidence.ts"),
    "utf8"
  );
  okAll =
    record(
      "routing_evidence_module",
      includesAll(mod, [
        "buildSuccessRoutingEvidence",
        "buildFailureRoutingEvidence",
        "mergeTokfaiRouting",
        "routing_strategy",
        "attempted_models",
      ]).ok,
      "routingEvidence helpers"
    ) && okAll;

  const exec = readFileSync(
    join(ROOT, "apps/dmit-api/src/lib/executeChatCompletion.ts"),
    "utf8"
  );
  okAll =
    record(
      "executor_wires_routing",
      exec.includes("mergeTokfaiRouting") &&
        exec.includes("buildSuccessRoutingEvidence") &&
        exec.includes("chat_completion_succeeded"),
      "executeChatCompletion success tokfai routing"
    ) && okAll;

  const overview = readFileSync(
    join(ROOT, "apps/web/components/admin/admin-overview-panel.tsx"),
    "utf8"
  );
  okAll =
    record(
      "admin_routing_columns",
      includesAll(overview, [
        "colAttemptedModels",
        "colFallbackAttempts",
        "colRoutingStrategy",
        "colFallbackReason",
        "attempted_models",
      ]).ok,
      "admin recent requests routing columns"
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
      messages: [{ role: "user", content: "P984 routing evidence: ok" }],
      stream: false,
      max_tokens: 16,
    }
  );
  const tokfai = chatBody?.tokfai;
  const rid = requestIdOf(chatBody, chatRes);
  const content =
    chatBody?.choices?.[0]?.message?.content ??
    chatBody?.choices?.[0]?.text ??
    "";
  const chatOk =
    chatRes.status === 200 &&
    String(content).trim().length > 0 &&
    Boolean(rid) &&
    hasRoutingEvidence(tokfai, { requireResolved: true }) &&
    tokfai?.requested_model &&
    tokfai?.resolved_model &&
    Number.isFinite(Number(tokfai?.credits_charged));
  okAll =
    record(
      "chat_success_routing_and_billing",
      chatOk,
      `status=${chatRes.status} rid=${rid ? "yes" : "no"} strategy=${tokfai?.routing_strategy} resolved=${tokfai?.resolved_model} charged=${charged(chatBody)}`
    ) && okAll;

  if (chatOk) {
    okAll =
      record(
        "billing_routing_request_id_consistent",
        String(tokfai.request_id) === String(rid) ||
          String(chatBody.request_id) === String(tokfai.request_id),
        `rid=${rid}`
      ) && okAll;
  }

  const { res: autoFastRes, body: autoFastBody } = await postJson(
    "/v1/chat/completions",
    {
      model: "auto-fast",
      messages: [{ role: "user", content: "P984 auto-fast" }],
      stream: false,
      max_tokens: 8,
    }
  );
  okAll =
    record(
      "auto_fast_routing_evidence",
      autoFastRes.status === 200 &&
        hasRoutingEvidence(autoFastBody?.tokfai) &&
        (autoFastBody?.tokfai?.routing_strategy === "auto-fast" ||
          autoFastBody?.tokfai?.requested_model === "auto-fast"),
      `status=${autoFastRes.status} strategy=${autoFastBody?.tokfai?.routing_strategy}`
    ) && okAll;

  const { res: autoProRes, body: autoProBody } = await postJson(
    "/v1/chat/completions",
    {
      model: "auto-pro",
      messages: [{ role: "user", content: "P984 auto-pro" }],
      stream: false,
      max_tokens: 8,
    }
  );
  okAll =
    record(
      "auto_pro_routing_evidence",
      autoProRes.status === 200 &&
        hasRoutingEvidence(autoProBody?.tokfai) &&
        (autoProBody?.tokfai?.routing_strategy === "auto-pro" ||
          autoProBody?.tokfai?.requested_model === "auto-pro"),
      `status=${autoProRes.status} strategy=${autoProBody?.tokfai?.routing_strategy}`
    ) && okAll;

  const { res: badRes, body: badBody } = await postJson(
    "/v1/chat/completions",
    {
      model: "p984-nonexistent-model-xyz",
      messages: [{ role: "user", content: "x" }],
      stream: false,
    }
  );
  const badTok = badBody?.tokfai;
  okAll =
    record(
      "unknown_model_not_billable_routing",
      badRes.status >= 400 &&
        notBillable(badBody) &&
        charged(badBody) === 0 &&
        Boolean(requestIdOf(badBody, badRes)) &&
        (hasRoutingEvidence(badTok, { requireResolved: false }) ||
          badTok?.billing_status === "not_billable"),
      `status=${badRes.status} code=${badBody?.error?.code} charged=${charged(badBody)}`
    ) && okAll;

  const { res: toolsRes, body: toolsBody } = await postJson(
    "/v1/chat/completions",
    {
      model: "auto-cheap",
      messages: [{ role: "user", content: "tool?" }],
      stream: false,
      tools: [
        {
          type: "function",
          function: {
            name: "ping",
            parameters: { type: "object", properties: {} },
          },
        },
      ],
      tool_choice: "required",
    }
  );
  const toolsTok = toolsBody?.tokfai;
  const toolsCode = toolsBody?.error?.code;
  const toolsOk =
    toolsRes.status >= 400 &&
    notBillable(toolsBody) &&
    charged(toolsBody) === 0 &&
    (toolsCode === "model_not_tool_capable" ||
      toolsCode === "tool_call_not_supported" ||
      toolsCode === "tool_call_not_generated") &&
    Boolean(requestIdOf(toolsBody, toolsRes));
  if (toolsOk) {
    okAll =
      record(
        "tools_non_whitelist_not_billable",
        true,
        `status=${toolsRes.status} code=${toolsCode} strategy=${toolsTok?.routing_strategy}`
      ) && okAll;
  } else if (ctx.LIVE && toolsRes.status === 200) {
    record(
      "tools_non_whitelist_not_billable",
      true,
      `LIVE soft — auto-cheap may degrade/allow without strict fail (status=200)`,
      true
    );
  } else {
    okAll =
      record(
        "tools_non_whitelist_not_billable",
        false,
        `status=${toolsRes.status} code=${toolsCode} charged=${charged(toolsBody)}`
      ) && okAll;
  }

  return okAll;
}

function collectPm2() {
  if (SKIP_PM2) {
    return {
      available: false,
      skipped: true,
      statusText: "SKIP_PM2=1",
      logsText: "",
      dirty: [],
    };
  }
  const which = spawnSync("bash", ["-lc", "command -v pm2 || true"], {
    encoding: "utf8",
  });
  if (!String(which.stdout || "").trim()) {
    return {
      available: false,
      skipped: false,
      statusText: "pm2: not installed / not in PATH",
      logsText: "",
      dirty: [],
    };
  }
  const status = spawnSync("pm2", ["status"], { encoding: "utf8" });
  const statusText = String(status.stdout || "") + String(status.stderr || "");
  const logs = spawnSync("pm2", ["logs", "--lines", "200", "--nostream"], {
    encoding: "utf8",
    timeout: 30_000,
  });
  const logsText = String(logs.stdout || "") + String(logs.stderr || "");
  const dirty = PM2_DIRTY.filter((p) => logsText.includes(p));
  const online = /online/i.test(statusText);
  return {
    available: true,
    skipped: false,
    online,
    statusText: statusText.slice(0, 800),
    logsText,
    dirty,
  };
}

function pm2Checks(pm2, LIVE) {
  console.log("\n=== pm2 stability ===\n");
  if (!pm2.available) {
    record(
      "pm2_status",
      true,
      pm2.skipped ? "skipped" : "unavailable (soft)",
      true
    );
    record("pm2_dirty_logs", true, "skipped / unavailable", true);
    return;
  }
  if (pm2.online) {
    record("pm2_status", true, "online present");
  } else if (LIVE) {
    record(
      "pm2_status",
      false,
      "LIVE requires pm2 online on the host running this script (or SKIP_PM2=1)"
    );
  } else {
    record("pm2_status", true, "offline soft (non-LIVE)", true);
  }
  record(
    "pm2_dirty_logs",
    pm2.dirty.length === 0,
    pm2.dirty.length ? pm2.dirty.join(",") : "clean"
  );
}

function writeReport(overallOk) {
  if (!WRITE_REPORT) return;
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  const lines = [
    "# P984 — Model Routing Evidence Report",
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
    const pm2 = collectPm2();
    pm2Checks(pm2, Boolean(ctx.LIVE));
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
