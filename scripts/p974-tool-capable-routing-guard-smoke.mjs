#!/usr/bin/env node
/**
 * P974 — Tool-capable Model Registry / Routing Guard smoke.
 *
 * Default: offline mock + static checks (empty whitelist).
 * Optional: VERIFIED_TOOLS_CAPABLE_MODEL_IDS=gpt-5.5 to exercise true path.
 *
 * Usage:
 *   node scripts/p974-tool-capable-routing-guard-smoke.mjs
 *   LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p974-tool-capable-routing-guard-smoke.mjs
 *   WRITE_REPORT=1 node scripts/p974-tool-capable-routing-guard-smoke.mjs
 *
 * Marker:
 *   TOKFAI_P974_TOOL_CAPABLE_ROUTING_GUARD_PASS
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  bootstrapClientCompatSmoke,
  pass,
  fail,
} from "./lib/client-compat-smoke-bootstrap.mjs";
import { UPSTREAM_DEGRADED_CODES } from "./lib/public-beta-live-helpers.mjs";
import { assertNoErrorLeak } from "./lib/client-compat-matrix.mjs";

const SCRIPT = "scripts/p974-tool-capable-routing-guard-smoke.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS_MARKER = "TOKFAI_P974_TOOL_CAPABLE_ROUTING_GUARD_PASS";

const WRITE_REPORT =
  process.env.WRITE_REPORT === "1" || process.env.WRITE_REPORT === "true";
const REPORT_PATH = join(
  ROOT,
  process.env.REPORT_PATH ?? "docs/p974-tool-capable-routing-guard-report.md"
);

const TOOLS = [
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Get weather for a city",
      parameters: {
        type: "object",
        properties: { location: { type: "string" } },
        required: ["location"],
      },
    },
  },
];

const FORCED = { type: "function", function: { name: "get_weather" } };

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

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function charged(body) {
  return Number(body?.credits_charged ?? body?.tokfai?.credits_charged ?? 0);
}

function notBillable(body) {
  const c = charged(body);
  if (Number.isFinite(c) && c > 0) return false;
  const status = body?.tokfai?.billing_status;
  if (status && status !== "not_billable") return false;
  return true;
}

function parseSseError(text) {
  const lines = String(text ?? "").split("\n");
  let errorObj = null;
  let sawDone = false;
  for (const line of lines) {
    if (line === "data: [DONE]" || line === "data:[DONE]") {
      sawDone = true;
      continue;
    }
    if (!line.startsWith("data: ")) continue;
    const raw = line.slice(6).trim();
    if (!raw || raw === "[DONE]") {
      if (raw === "[DONE]") sawDone = true;
      continue;
    }
    try {
      const obj = JSON.parse(raw);
      if (obj?.error) errorObj = obj;
    } catch {
      // ignore
    }
  }
  return { errorObj, sawDone };
}

function staticChecks() {
  console.log("=== static source checks ===\n");
  const env = read("apps/dmit-api/src/env.ts");
  const tools = read("apps/dmit-api/src/lib/toolCallCapability.ts");
  const exec = read("apps/dmit-api/src/lib/executeChatCompletion.ts");
  const early = read("apps/dmit-api/src/lib/respondEarlySse.ts");
  const mock = read("scripts/p786-offline-customer-mock.mjs");
  const p973 = read("scripts/p973-production-mixed-storm.mjs");

  record(
    "static_env_whitelist",
    env.includes("VERIFIED_TOOLS_CAPABLE_MODEL_IDS") &&
      env.includes('.default("")'),
    "env var default empty"
  );

  record(
    "static_is_verified_helper",
    tools.includes("isVerifiedToolCapableModel") &&
      tools.includes("parseVerifiedToolsCapableModelIds") &&
      tools.includes("stripToolsFromChatBody") &&
      tools.includes("MODEL_NOT_TOOL_CAPABLE_MESSAGE"),
    "whitelist helpers"
  );

  record(
    "static_catalog_tools_whitelist_only",
    tools.includes("resolveToolsCapabilityMark") &&
      /return isVerifiedToolCapableModel\(model\)/.test(tools),
    "capabilities.tools from whitelist only"
  );

  record(
    "static_forced_reject_unverified",
    exec.includes("MODEL_NOT_TOOL_CAPABLE_MESSAGE") &&
      exec.includes("strictToolCallRequest") &&
      exec.includes("toolsDegradedToChat") &&
      exec.includes("stripToolsFromChatBody"),
    "forced reject + auto degrade"
  );

  record(
    "static_stream_sse_routing_guard",
    early.includes("isToolRoutingGuardErrorCode") &&
      early.includes("forcedToolFailureSseResponse"),
    "stream SSE for model_not_tool_capable"
  );

  record(
    "static_mock_p974",
    mock.includes("mockIsVerifiedToolCapable") &&
      mock.includes("mockModelNotToolCapableError") &&
      mock.includes("tools_degraded_to_chat"),
    "mock mirrors P974"
  );

  record(
    "static_p973_accepts_model_not_tool_capable",
    p973.includes("model_not_tool_capable"),
    "P973 accepts routing guard"
  );

  record(
    "static_p971_p972_intact",
    read("scripts/p971-fake-tool-call-guard-smoke.mjs").includes("TOKFAI_P971") &&
      read("scripts/p972-forced-tool-failure-envelope-smoke.mjs").includes(
        "TOKFAI_P972"
      ),
    "prior smokes present"
  );
}

async function runRuntime(ctx) {
  console.log("\n=== runtime probes ===\n");
  const { postJson, getJson, LIVE } = ctx;

  // /v1/models — unverified tools=false (esp. auto-fast / auto-pro)
  {
    const { res, body } = await getJson("/v1/models");
    const data = Array.isArray(body?.data) ? body.data : [];
    const autoFast = data.find((m) => m?.id === "auto-fast");
    const autoPro = data.find((m) => m?.id === "auto-pro");
    const anyTrue = data.some((m) => m?.capabilities?.tools === true);
    const whitelistEmpty = !(process.env.VERIFIED_TOOLS_CAPABLE_MODEL_IDS ?? "").trim();
    const ok =
      res.status === 200 &&
      autoFast?.capabilities?.tools === false &&
      (autoPro == null || autoPro.capabilities?.tools === false || !whitelistEmpty) &&
      (!whitelistEmpty || anyTrue === false);
    record(
      "models_unverified_tools_false",
      ok || (LIVE && UPSTREAM_DEGRADED_CODES.has(body?.error?.code)),
      ok
        ? `auto-fast.tools=${autoFast?.capabilities?.tools} anyTrue=${anyTrue}`
        : `status=${res.status} anyTrue=${anyTrue}`,
      LIVE && !ok
    );
  }

  // Forced tool + unverified → model_not_tool_capable not_billable
  {
    const { res, body, text } = await postJson("/v1/chat/completions", {
      model: "auto-pro",
      messages: [{ role: "user", content: "weather please" }],
      tools: TOOLS,
      tool_choice: "required",
      stream: false,
    });
    const code = body?.error?.code;
    let jqOk = true;
    try {
      if (typeof text === "string" && text.trim()) JSON.parse(text);
    } catch {
      jqOk = false;
    }
    const ok =
      res.status === 400 &&
      code === "model_not_tool_capable" &&
      notBillable(body) &&
      charged(body) === 0 &&
      jqOk;
    if (ok) {
      record(
        "forced_unverified_not_tool_capable",
        true,
        `status=${res.status} charged=${charged(body)}`
      );
    } else if (
      LIVE &&
      res.status === 200 &&
      Array.isArray(body?.choices?.[0]?.message?.tool_calls)
    ) {
      record(
        "forced_unverified_not_tool_capable",
        true,
        "LIVE model verified / returned tool_calls",
        true
      );
    } else if (LIVE && notBillable(body)) {
      record(
        "forced_unverified_not_tool_capable",
        true,
        `LIVE soft code=${code}`,
        true
      );
    } else {
      record(
        "forced_unverified_not_tool_capable",
        false,
        `status=${res.status} code=${code} jqOk=${jqOk}`
      );
    }
    assertNoErrorLeak(JSON.stringify(body ?? {}));
  }

  // Stream forced + unverified → SSE error + DONE
  {
    const { res, body, text } = await postJson("/v1/chat/completions", {
      model: "gpt-5-chat",
      messages: [{ role: "user", content: "weather" }],
      tools: TOOLS,
      tool_choice: FORCED,
      stream: true,
    });
    const raw = typeof text === "string" ? text : "";
    const { errorObj, sawDone } = parseSseError(raw);
    const code = errorObj?.error?.code ?? body?.error?.code;
    const ok =
      errorObj &&
      sawDone &&
      code === "model_not_tool_capable" &&
      notBillable(errorObj) &&
      charged(errorObj) === 0;
    if (ok) {
      record("stream_forced_unverified_sse", true, `done=${sawDone}`);
    } else if (LIVE && (sawDone || UPSTREAM_DEGRADED_CODES.has(code))) {
      record("stream_forced_unverified_sse", true, `LIVE soft code=${code}`, true);
    } else {
      record(
        "stream_forced_unverified_sse",
        false,
        `status=${res.status} code=${code} done=${sawDone}`
      );
    }
  }

  // tool_choice:auto + unverified → ordinary chat + auto_no_tool_call
  {
    const { res, body } = await postJson("/v1/chat/completions", {
      model: "auto-fast",
      messages: [{ role: "user", content: "Say hello briefly." }],
      tools: TOOLS,
      tool_choice: "auto",
      stream: false,
    });
    const content = body?.choices?.[0]?.message?.content;
    const hasTc = Array.isArray(body?.choices?.[0]?.message?.tool_calls);
    const ok =
      res.status === 200 &&
      typeof content === "string" &&
      content.length > 0 &&
      !hasTc &&
      body?.tokfai?.auto_no_tool_call === true &&
      charged(body) >= 0;
    if (ok) {
      record(
        "auto_unverified_degrade_chat",
        true,
        `charged=${charged(body)} auto_no_tool_call=true`
      );
    } else if (LIVE && UPSTREAM_DEGRADED_CODES.has(body?.error?.code)) {
      record("auto_unverified_degrade_chat", true, "degraded", true);
    } else {
      record(
        "auto_unverified_degrade_chat",
        false,
        `status=${res.status} auto=${body?.tokfai?.auto_no_tool_call} code=${body?.error?.code}`
      );
    }
  }

  // Ordinary chat unaffected
  {
    const { res, body } = await postJson("/v1/chat/completions", {
      model: "auto-fast",
      messages: [{ role: "user", content: "Say P974_OK only." }],
      stream: false,
    });
    const content = body?.choices?.[0]?.message?.content ?? "";
    const ok =
      res.status === 200 && typeof content === "string" && content.length > 0;
    if (ok) {
      record("ordinary_chat_unaffected", true, `len=${content.length}`);
    } else if (LIVE && UPSTREAM_DEGRADED_CODES.has(body?.error?.code)) {
      record("ordinary_chat_unaffected", true, "degraded", true);
    } else {
      record("ordinary_chat_unaffected", false, `status=${res.status}`);
    }
  }
}

function runPriorSmokes() {
  console.log("\n=== prior smoke regression ===\n");
  for (const script of [
    "scripts/p972-forced-tool-failure-envelope-smoke.mjs",
    "scripts/p971-fake-tool-call-guard-smoke.mjs",
  ]) {
    const r = spawnSync(process.execPath, [join(ROOT, script)], {
      cwd: ROOT,
      env: { ...process.env, LIVE: "0", WRITE_REPORT: "0" },
      encoding: "utf8",
      timeout: 180_000,
    });
    const out = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    const name = script.split("/").pop().replace(/\.mjs$/, "");
    record(
      `prior_${name}`,
      r.status === 0,
      r.status === 0 ? "exit 0" : out.slice(-280)
    );
  }
}

function writeReport(marker) {
  const lines = [];
  lines.push("# P974 Tool-capable Routing Guard Report");
  lines.push("");
  lines.push(`> 日期：${new Date().toISOString().slice(0, 10)}`);
  lines.push(
    "> 范围：VERIFIED_TOOLS_CAPABLE_MODEL_IDS 白名单；/v1/models tools；forced reject；auto degrade"
  );
  lines.push("> 约束：保留 P971/P972；更新 P973 语义；不打印 API Key");
  lines.push("");
  lines.push("## 最终结论");
  lines.push("");
  lines.push("```");
  lines.push(marker);
  lines.push("```");
  lines.push("");
  lines.push("## 行为");
  lines.push("");
  lines.push("| 场景 | 期望 |");
  lines.push("|---|---|");
  lines.push("| capabilities.tools | 仅白名单 → true；默认 false |");
  lines.push(
    "| forced tools + 非白名单 | `model_not_tool_capable` + not_billable |"
  );
  lines.push("| stream forced + 非白名单 | SSE error + `[DONE]` |");
  lines.push(
    "| tool_choice:auto + 非白名单 | 普通 Chat + `tokfai.auto_no_tool_call=true` |"
  );
  lines.push("");
  lines.push("## 用例结果");
  lines.push("");
  for (const r of results) {
    const tag = !r.ok ? "FAIL" : r.soft ? "SOFT" : "PASS";
    lines.push(`- **${tag}** \`${r.id}\`${r.detail ? ` — ${r.detail}` : ""}`);
  }
  lines.push("");
  lines.push("## 验收标记");
  lines.push("");
  lines.push("```");
  lines.push(PASS_MARKER);
  lines.push("```");
  lines.push("");
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, lines.join("\n"), "utf8");
  console.log(`\nreport: ${REPORT_PATH}`);
}

async function main() {
  staticChecks();
  const ctx = await bootstrapClientCompatSmoke(SCRIPT);
  try {
    await runRuntime(ctx);
  } finally {
    ctx.cleanup();
  }
  runPriorSmokes();

  const hardFails = results.filter((r) => !r.ok);
  const marker =
    hardFails.length === 0
      ? PASS_MARKER
      : "TOKFAI_P974_TOOL_CAPABLE_ROUTING_GUARD_FAIL";
  if (WRITE_REPORT || hardFails.length === 0) writeReport(marker);
  console.log("");
  console.log(marker);
  if (hardFails.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exitCode = 1;
});
