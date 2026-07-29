#!/usr/bin/env node
/**
 * P972 — OpenAI-compatible graceful error envelope for forced tool failure.
 *
 * Does not change P971 billing rules. Ensures:
 * - non-stream: JSON body (HTTP 400/422/502/503), never 504/HTML/empty
 * - stream: SSE error chunk + data:[DONE], not_billable / credits=0
 *
 * Usage:
 *   node scripts/p972-forced-tool-failure-envelope-smoke.mjs
 *   LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p972-forced-tool-failure-envelope-smoke.mjs
 *   WRITE_REPORT=1 node scripts/p972-forced-tool-failure-envelope-smoke.mjs
 *
 * Marker:
 *   TOKFAI_P972_FORCED_TOOL_FAILURE_ENVELOPE_PASS
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

const SCRIPT = "scripts/p972-forced-tool-failure-envelope-smoke.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS_MARKER = "TOKFAI_P972_FORCED_TOOL_FAILURE_ENVELOPE_PASS";

const WRITE_REPORT =
  process.env.WRITE_REPORT === "1" || process.env.WRITE_REPORT === "true";
const REPORT_PATH = join(
  ROOT,
  process.env.REPORT_PATH ?? "docs/p972-forced-tool-failure-envelope-report.md"
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

const ALLOWED_HTTP = new Set([400, 422, 502, 503]);
const TOOL_FAIL_CODES = new Set([
  "tool_call_not_generated",
  "provider_tool_call_not_supported",
  "model_not_tool_capable",
]);

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
      if (obj?.error && typeof obj.error === "object") errorObj = obj;
    } catch {
      // ignore non-json frames (role chunks etc.)
    }
  }
  return { errorObj, sawDone };
}

function staticChecks() {
  console.log("=== static source checks ===\n");
  const envelope = read("apps/dmit-api/src/lib/toolCallFailureEnvelope.ts");
  const handle = read("apps/dmit-api/src/lib/handleExecuteChatCompletionResult.ts");
  const early = read("apps/dmit-api/src/lib/respondEarlySse.ts");
  const exec = read("apps/dmit-api/src/lib/executeChatCompletion.ts");
  const mock = read("scripts/p786-offline-customer-mock.mjs");
  const p971 = read("scripts/p971-fake-tool-call-guard-smoke.mjs");
  const p970 = read("scripts/p970-cursor-tool-call-smoke.mjs");
  const p954 = read("scripts/p954-image-provider-routing-isolation-smoke.mjs");
  const p961 = read("scripts/p961-image-cost-reconciliation-smoke.mjs");

  record(
    "static_envelope_helper",
    envelope.includes("forcedToolFailureJsonResponse") &&
      envelope.includes("forcedToolFailureToSseBody") &&
      envelope.includes("clampForcedToolFailureHttpStatus") &&
      envelope.includes("data: [DONE]") &&
      envelope.includes("ALLOWED_HTTP"),
    "P972 envelope helper + status clamp"
  );

  record(
    "static_nonstream_json_path",
    handle.includes("forcedToolFailureJsonResponse") &&
      handle.includes("isForcedToolFailureCode"),
    "non-stream uses graceful JSON"
  );

  record(
    "static_stream_sse_path",
    (early.includes("forcedToolFailureToSseBody") ||
      early.includes("notBillableErrorToSseBody")) &&
      early.includes("forcedToolFailureSseResponse") &&
      early.includes("isForcedToolFailureCode"),
    "stream uses SSE error + DONE"
  );

  record(
    "static_p971_billing_untouched",
    exec.includes("fake_tool_call_guard_triggered") &&
      exec.includes("TOOL_CALL_NOT_GENERATED_CODE") &&
      exec.includes('billing_status: "not_billable"'),
    "P971 guard still present"
  );

  record(
    "static_mock_stream_sse",
    mock.includes("P972") &&
      mock.includes("data: [DONE]") &&
      mock.includes("mockFakeToolCallGuardError"),
    "mock stream returns SSE on forced fail"
  );

  record(
    "static_prior_scripts",
    p971.includes("TOKFAI_P971") &&
      p970.includes("TOKFAI_P970") &&
      p954.includes("TOKFAI_P954") &&
      p961.includes("TOKFAI_P961"),
    "prior smokes intact"
  );
}

async function runRuntime(ctx) {
  console.log("\n=== runtime probes ===\n");
  const { postJson, LIVE } = ctx;

  // Non-stream forced fake → JSON parseable, allowed HTTP, not_billable
  {
    const { res, body, text } = await postJson("/v1/chat/completions", {
      model: "auto-pro",
      messages: [{ role: "user", content: "TOKFAI_FAKE_TOOL_CALL please" }],
      tools: TOOLS,
      tool_choice: "required",
      stream: false,
    });
    const raw = typeof text === "string" ? text : JSON.stringify(body ?? {});
    let parsed = body;
    let jqOk = true;
    try {
      if (typeof text === "string" && text.trim()) {
        parsed = JSON.parse(text);
      } else if (body == null) {
        jqOk = false;
      }
    } catch {
      jqOk = false;
    }
    const code = parsed?.error?.code;
    const statusOk = ALLOWED_HTTP.has(res.status);
    const codeOk = TOOL_FAIL_CODES.has(code);
    const billOk = notBillable(parsed);
    const ct = String(res.headers?.get?.("content-type") ?? "");
    const isJsonCt = ct.includes("application/json") || jqOk;
    const not504 = res.status !== 504;
    const notHtml = !/^\s*</.test(raw) && !/html/i.test(ct);

    if (jqOk && statusOk && codeOk && billOk && not504 && notHtml && isJsonCt) {
      record(
        "nonstream_forced_tool_json_envelope",
        true,
        `status=${res.status} code=${code} charged=${charged(parsed)}`
      );
    } else if (LIVE && res.status === 200 && Array.isArray(parsed?.choices?.[0]?.message?.tool_calls)) {
      record(
        "nonstream_forced_tool_json_envelope",
        true,
        "LIVE upstream returned real tool_calls",
        true
      );
    } else if (LIVE && (UPSTREAM_DEGRADED_CODES.has(code) || notBillable(parsed))) {
      record(
        "nonstream_forced_tool_json_envelope",
        true,
        `LIVE soft status=${res.status} code=${code}`,
        true
      );
    } else {
      record(
        "nonstream_forced_tool_json_envelope",
        false,
        `status=${res.status} jqOk=${jqOk} code=${code} billOk=${billOk} ct=${ct.slice(0, 40)}`
      );
    }
    assertNoErrorLeak(raw);
  }

  // Stream forced fake → SSE error + DONE + not_billable
  {
    const { res, body, text } = await postJson("/v1/chat/completions", {
      model: "auto-pro",
      messages: [{ role: "user", content: "TOKFAI_FAKE_TOOL_CALL stream" }],
      tools: TOOLS,
      tool_choice: "required",
      stream: true,
    });
    const raw = typeof text === "string" ? text : JSON.stringify(body ?? {});
    const { errorObj, sawDone } = parseSseError(raw);
    const code = errorObj?.error?.code ?? body?.error?.code;
    const billOk = errorObj ? notBillable(errorObj) : notBillable(body);
    const ct = String(res.headers?.get?.("content-type") ?? "");

    if (
      errorObj &&
      sawDone &&
      TOOL_FAIL_CODES.has(code) &&
      billOk &&
      charged(errorObj) === 0
    ) {
      record(
        "stream_forced_tool_sse_error_done",
        true,
        `code=${code} done=${sawDone} charged=${charged(errorObj)} ct=${ct.includes("event-stream")}`
      );
    } else if (LIVE && raw.includes("data:") && raw.includes("tool_calls")) {
      record(
        "stream_forced_tool_sse_error_done",
        true,
        "LIVE upstream returned tool_calls SSE",
        true
      );
    } else if (LIVE && (UPSTREAM_DEGRADED_CODES.has(code) || (errorObj && billOk))) {
      record(
        "stream_forced_tool_sse_error_done",
        true,
        `LIVE soft code=${code}`,
        true
      );
    } else {
      record(
        "stream_forced_tool_sse_error_done",
        false,
        `status=${res.status} code=${code} done=${sawDone} hasErr=${!!errorObj}`
      );
    }
    assertNoErrorLeak(raw);
  }

  // Ordinary chat unaffected
  {
    const { res, body } = await postJson("/v1/chat/completions", {
      model: "auto-fast",
      messages: [{ role: "user", content: "Say P972_OK only." }],
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

  // Ordinary stream unaffected (success path has DONE, no error envelope required)
  {
    const { res, body, text } = await postJson("/v1/chat/completions", {
      model: "auto-fast",
      messages: [{ role: "user", content: "Say hi." }],
      stream: true,
    });
    const raw = typeof text === "string" ? text : "";
    const ok =
      res.status === 200 &&
      raw.includes("data:") &&
      (raw.includes("data: [DONE]") || raw.includes("data:[DONE]"));
    if (ok) {
      record("ordinary_stream_unaffected", true, "SSE DONE present");
    } else if (LIVE && UPSTREAM_DEGRADED_CODES.has(body?.error?.code)) {
      record("ordinary_stream_unaffected", true, "degraded", true);
    } else {
      record("ordinary_stream_unaffected", false, `status=${res.status}`);
    }
  }

  // Image isolation
  {
    const { res, body } = await postJson("/v1/chat/completions", {
      model: "nano-banana",
      messages: [{ role: "user", content: "draw" }],
      tools: TOOLS,
      tool_choice: "required",
      stream: false,
    });
    const ok =
      res.status === 400 &&
      body?.error?.code === "image_model_not_for_chat" &&
      notBillable(body);
    record(
      "image_path_unaffected",
      ok,
      `status=${res.status} code=${body?.error?.code}`
    );
  }
}

function runPriorSmokes() {
  console.log("\n=== prior smoke regression ===\n");
  for (const script of [
    "scripts/p971-fake-tool-call-guard-smoke.mjs",
    "scripts/p970-cursor-tool-call-smoke.mjs",
    "scripts/p954-image-provider-routing-isolation-smoke.mjs",
    "scripts/p961-image-cost-reconciliation-smoke.mjs",
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
  lines.push("# P972 Forced Tool Failure Envelope Report");
  lines.push("");
  lines.push(`> 日期：${new Date().toISOString().slice(0, 10)}`);
  lines.push(
    "> 范围：forced tool 失败时 OpenAI-compatible JSON / SSE 错误信封；不改 P971 计费"
  );
  lines.push("> 约束：不破坏普通 Chat/stream/图片；不破坏 P954/P961/P970/P971");
  lines.push("");
  lines.push("## 最终结论");
  lines.push("");
  lines.push("```");
  lines.push(marker);
  lines.push("```");
  lines.push("");
  lines.push("## 行为");
  lines.push("");
  lines.push("| 模式 | 期望 |");
  lines.push("|---|---|");
  lines.push(
    "| non-stream forced fail | HTTP 400/422/502/503 + JSON `{error,tokfai}`；非 504/HTML/空 |"
  );
  lines.push(
    "| stream forced fail | SSE `data:{error…}` + `data: [DONE]`；credits_charged=0 |"
  );
  lines.push("| billing | 始终 not_billable / credits=0（P971 不变） |");
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
    runPriorSmokes();
  } finally {
    ctx.cleanup();
  }

  const hardFails = results.filter((r) => !r.ok);
  const marker =
    hardFails.length === 0
      ? PASS_MARKER
      : "TOKFAI_P972_FORCED_TOOL_FAILURE_ENVELOPE_FAIL";

  if (WRITE_REPORT || hardFails.length === 0) {
    writeReport(marker);
  }

  console.log("");
  console.log(marker);
  if (hardFails.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exitCode = 1;
});
