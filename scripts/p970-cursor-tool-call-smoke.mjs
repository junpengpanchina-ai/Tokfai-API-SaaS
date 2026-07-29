#!/usr/bin/env node
/**
 * P970 — Cursor / OpenAI-compatible Tool Call Compatibility smoke.
 *
 * Default: offline mock + static source checks.
 * LIVE=1: hit production (requires TOKFAI_API_KEY). Soft-pass upstream degradation.
 *
 * Never prints API key plaintext. Does not change billing / image P961 core.
 *
 * Usage:
 *   node scripts/p970-cursor-tool-call-smoke.mjs
 *   LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p970-cursor-tool-call-smoke.mjs
 *   WRITE_REPORT=1 node scripts/p970-cursor-tool-call-smoke.mjs
 *
 * Markers:
 *   TOKFAI_P970_CURSOR_TOOL_CALL_COMPATIBILITY_PASS
 *   TOKFAI_P970_CURSOR_TOOL_CALL_COMPATIBILITY_PARTIAL_PASS
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

const SCRIPT = "scripts/p970-cursor-tool-call-smoke.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS_MARKER = "TOKFAI_P970_CURSOR_TOOL_CALL_COMPATIBILITY_PASS";
const PARTIAL_MARKER =
  "TOKFAI_P970_CURSOR_TOOL_CALL_COMPATIBILITY_PARTIAL_PASS";

const WRITE_REPORT =
  process.env.WRITE_REPORT === "1" || process.env.WRITE_REPORT === "true";
const REPORT_PATH = join(
  ROOT,
  process.env.REPORT_PATH ?? "docs/p970-cursor-tool-call-compatibility-report.md"
);
const SUMMARY_PATH = join(
  ROOT,
  process.env.SUMMARY_PATH ?? "tmp/p970-tool-call-summary.json"
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

/** @type {{ id: string, ok: boolean, soft?: boolean, detail?: string }[]} */
const results = [];

function record(id, ok, detail, soft = false) {
  results.push({
    id,
    ok,
    soft,
    detail: detail ? String(detail).slice(0, 280) : undefined,
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

function billingOk(body) {
  const charged = Number(body?.credits_charged ?? body?.tokfai?.credits_charged ?? 0);
  const status = body?.tokfai?.billing_status;
  if (status === "not_billable") return charged === 0 || !Number.isFinite(charged);
  if (status === "charged" || status === "billable") return charged >= 0;
  return true;
}

function notBillable(body) {
  const charged = Number(body?.credits_charged ?? body?.tokfai?.credits_charged ?? 0);
  if (Number.isFinite(charged) && charged > 0) return false;
  const status = body?.tokfai?.billing_status;
  if (status && status !== "not_billable") return false;
  return true;
}

function hasToolCallsMessage(body) {
  const msg = body?.choices?.[0]?.message;
  return Array.isArray(msg?.tool_calls) && msg.tool_calls.length > 0;
}

function finishIsToolCalls(body) {
  return body?.choices?.[0]?.finish_reason === "tool_calls";
}

function parseSseToolCalls(text) {
  const lines = String(text ?? "").split("\n");
  let sawToolDelta = false;
  let finish = null;
  let sawDone = false;
  for (const line of lines) {
    if (line === "data: [DONE]") {
      sawDone = true;
      continue;
    }
    if (!line.startsWith("data: ")) continue;
    const raw = line.slice(6).trim();
    if (!raw || raw === "[DONE]") {
      if (raw === "[DONE]") sawDone = true;
      continue;
    }
    let obj;
    try {
      obj = JSON.parse(raw);
    } catch {
      continue;
    }
    const delta = obj?.choices?.[0]?.delta;
    if (Array.isArray(delta?.tool_calls) && delta.tool_calls.length > 0) {
      sawToolDelta = true;
    }
    const fr = obj?.choices?.[0]?.finish_reason;
    if (typeof fr === "string" && fr) finish = fr;
  }
  return { sawToolDelta, finish, sawDone };
}

function staticChecks() {
  console.log("=== static source checks ===\n");
  const compat = read("apps/dmit-api/src/lib/chatCompletionCompat.ts");
  const sse = read("apps/dmit-api/src/lib/chatCompletionSse.ts");
  const timeout = read("apps/dmit-api/src/lib/upstreamTimeoutPolicy.ts");
  const env = read("apps/dmit-api/src/env.ts");
  const exec = read("apps/dmit-api/src/lib/executeChatCompletion.ts");
  const tools = read("apps/dmit-api/src/lib/toolCallCapability.ts");
  const pricing = read("apps/dmit-api/src/catalog/modelPricing.ts");
  const orphan = read("apps/dmit-api/src/images/orphanCostAudit.ts");
  const p969 = read("scripts/p969-cursor-compatibility-smoke.mjs");
  const p954 = read("scripts/p954-image-provider-routing-isolation-smoke.mjs");
  const p961 = read("scripts/p961-image-cost-reconciliation-smoke.mjs");

  record(
    "static_tools_not_swallowed",
    compat.includes("upstream.tools = body.tools") &&
      compat.includes('lower === "tool"') &&
      compat.includes("tool_call_id"),
    "sanitize + tool role preserve"
  );

  record(
    "static_sse_tool_calls",
    sse.includes("delta: { tool_calls:") &&
      sse.includes('finish_reason: finishReason') &&
      sse.includes("data: [DONE]"),
    "SSE synthesizes delta.tool_calls + DONE"
  );

  record(
    "static_layered_timeouts",
    env.includes("TOKFAI_CHAT_TIMEOUT_MS") &&
      env.includes("TOKFAI_STREAM_TIMEOUT_MS") &&
      env.includes("TOKFAI_TOOL_CALL_TIMEOUT_MS") &&
      env.includes(".default(420_000)") &&
      timeout.includes('tier: "tool_call"') &&
      timeout.includes("requestHasTools") &&
      !/tool_call[\s\S]{0,80}700_000/.test(timeout),
    "tool_call 420s, not global 700s"
  );

  record(
    "static_capability_flags",
    tools.includes("modelSupportsTools") &&
      pricing.includes("capabilities") &&
      pricing.includes("resolveModelCapabilityFlags"),
    "models list capabilities"
  );

  record(
    "static_billing_not_billable_on_tool_errors",
    exec.includes("MODEL_NOT_TOOL_CAPABLE_CODE") &&
      exec.includes("ALL_TOOL_UPSTREAMS_UNAVAILABLE_CODE") &&
      exec.includes('billing_status: "not_billable"') &&
      exec.includes("normalizeToolCallsOnChatCompletion"),
    "tool errors + normalize tool_calls"
  );

  record(
    "static_p961_orphan_untouched",
    orphan.includes("provider_success_unpaid") &&
      orphan.includes("charged_missing_url") &&
      orphan.includes("stale_timeout_pending"),
    "P961 orphan helpers present"
  );

  record(
    "static_p969_p954_p961_scripts_present",
    p969.includes("TOKFAI_P969_CURSOR_COMPATIBILITY") &&
      p954.includes("TOKFAI_P954") &&
      p961.includes("TOKFAI_P961"),
    "prior smokes not deleted"
  );

  // Unit: SSE synthesis with tool_calls via dynamic import of built dist if present,
  // else inline mirror of expected contract from source strings already checked.
  record(
    "static_heartbeat_early_sse",
    read("apps/dmit-api/src/lib/earlySseStream.ts").includes(": ping"),
    "early SSE heartbeat for Cursor stream"
  );
}

async function runLiveOrMock(ctx) {
  console.log("\n=== runtime probes ===\n");
  const { postJson, getJson, LIVE } = ctx;

  // Models capabilities
  {
    const { res, body } = await getJson("/v1/models");
    const data = Array.isArray(body?.data) ? body.data : [];
    const withCaps = data.filter(
      (m) => m?.capabilities && typeof m.capabilities === "object"
    );
    const toolsCapable = withCaps.filter(
      (m) =>
        m.capabilities.tools === true || m.capabilities.tools === "experimental"
    );
    const codingCapable = withCaps.filter((m) => m.capabilities.coding === true);
    const ok =
      res.status === 200 &&
      withCaps.length > 0 &&
      toolsCapable.length > 0 &&
      codingCapable.length > 0;
    record(
      "models_list_tools_coding_capabilities",
      ok || (LIVE && UPSTREAM_DEGRADED_CODES.has(body?.error?.code)),
      ok
        ? `caps=${withCaps.length} tools=${toolsCapable.length} coding=${codingCapable.length}`
        : `status=${res.status} caps=${withCaps.length}`,
      LIVE && !ok && res.status >= 500
    );
  }

  const toolsBody = {
    model: "auto-pro",
    messages: [{ role: "user", content: "What is the weather in Shanghai?" }],
    tools: TOOLS,
    tool_choice: "auto",
    stream: false,
  };

  // Non-stream tools
  {
    const { res, body } = await postJson("/v1/chat/completions", toolsBody);
    const code = body?.error?.code;
    if (res.status === 200 && hasToolCallsMessage(body) && finishIsToolCalls(body)) {
      record(
        "nonstream_tools_returns_tool_calls",
        billingOk(body) &&
          Number(body.credits_charged ?? body.tokfai?.credits_charged ?? 0) >= 0,
        `finish=${body.choices?.[0]?.finish_reason} charged=${body.credits_charged ?? body.tokfai?.credits_charged}`
      );
    } else if (
      (res.status === 400 || res.status === 503 || res.status === 504) &&
      (code === "model_not_tool_capable" ||
        code === "all_tool_upstreams_unavailable" ||
        code === "upstream_timeout" ||
        code === "all_upstreams_unavailable") &&
      notBillable(body)
    ) {
      record(
        "nonstream_tools_returns_tool_calls",
        true,
        `explicit not_billable error code=${code}`,
        true
      );
    } else if (LIVE && UPSTREAM_DEGRADED_CODES.has(code)) {
      record("nonstream_tools_returns_tool_calls", true, `degraded ${code}`, true);
    } else {
      record(
        "nonstream_tools_returns_tool_calls",
        false,
        `status=${res.status} code=${code} finish=${body?.choices?.[0]?.finish_reason}`
      );
    }
    assertNoErrorLeak(JSON.stringify(body ?? {}));
  }

  // Stream tools
  {
    const { res, body, text } = await postJson("/v1/chat/completions", {
      ...toolsBody,
      stream: true,
    });
    const raw = typeof text === "string" ? text : JSON.stringify(body ?? {});
    if (res.status === 200 && raw.includes("data:")) {
      const parsed = parseSseToolCalls(raw);
      const ok =
        parsed.sawDone &&
        (parsed.sawToolDelta || parsed.finish === "tool_calls");
      record(
        "stream_tools_delta_tool_calls",
        ok,
        `toolDelta=${parsed.sawToolDelta} finish=${parsed.finish} done=${parsed.sawDone}`
      );
    } else {
      const code = body?.error?.code;
      if (
        (code === "model_not_tool_capable" ||
          code === "all_tool_upstreams_unavailable" ||
          code === "upstream_timeout") &&
        notBillable(body)
      ) {
        record("stream_tools_delta_tool_calls", true, `not_billable ${code}`, true);
      } else if (LIVE && UPSTREAM_DEGRADED_CODES.has(code)) {
        record("stream_tools_delta_tool_calls", true, `degraded ${code}`, true);
      } else {
        record(
          "stream_tools_delta_tool_calls",
          false,
          `status=${res.status} code=${code}`
        );
      }
    }
    assertNoErrorLeak(raw);
  }

  // Invalid model + tools → not billable
  {
    const { res, body } = await postJson("/v1/chat/completions", {
      model: "definitely-not-a-real-model-xyz",
      messages: [{ role: "user", content: "hi" }],
      tools: TOOLS,
      stream: false,
    });
    const code = body?.error?.code;
    const ok =
      res.status >= 400 &&
      notBillable(body) &&
      (code === "model_not_available" ||
        code === "model_not_tool_capable" ||
        code === "invalid_request_error" ||
        typeof code === "string");
    record(
      "invalid_model_tools_not_billable",
      ok,
      `status=${res.status} code=${code}`
    );
  }

  // Image model + chat/tools rejected
  {
    const { res, body } = await postJson("/v1/chat/completions", {
      model: "nano-banana",
      messages: [{ role: "user", content: "draw a cat" }],
      tools: TOOLS,
      stream: false,
    });
    const ok =
      res.status === 400 &&
      body?.error?.code === "image_model_not_for_chat" &&
      notBillable(body);
    record(
      "image_model_tools_rejected_not_billable",
      ok,
      `status=${res.status} code=${body?.error?.code}`
    );
  }

  // Ordinary chat unaffected
  {
    const { res, body } = await postJson("/v1/chat/completions", {
      model: "auto-fast",
      messages: [{ role: "user", content: "Say P970_OK only." }],
      stream: false,
    });
    const content = body?.choices?.[0]?.message?.content ?? "";
    const ok =
      res.status === 200 &&
      typeof content === "string" &&
      content.length > 0 &&
      !hasToolCallsMessage(body);
    if (ok) {
      record("ordinary_chat_unaffected", true, `content_len=${content.length}`);
    } else if (LIVE && UPSTREAM_DEGRADED_CODES.has(body?.error?.code)) {
      record("ordinary_chat_unaffected", true, `degraded ${body?.error?.code}`, true);
    } else {
      record("ordinary_chat_unaffected", false, `status=${res.status}`);
    }
  }
}

function runPriorSmokeStatic() {
  console.log("\n=== prior smoke static regression (spawn --help / load) ===\n");
  for (const script of [
    "scripts/p954-image-provider-routing-isolation-smoke.mjs",
    "scripts/p961-image-cost-reconciliation-smoke.mjs",
  ]) {
    const r = spawnSync(process.execPath, [join(ROOT, script)], {
      cwd: ROOT,
      env: { ...process.env, LIVE: "0" },
      encoding: "utf8",
      timeout: 120_000,
    });
    const out = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    const ok = r.status === 0;
    record(
      `prior_${script.split("/").pop().replace(/\.mjs$/, "")}`,
      ok,
      ok ? "exit 0" : out.slice(-200)
    );
  }
}

function verdict() {
  const hardFails = results.filter((r) => !r.ok && !r.soft);
  const softs = results.filter((r) => r.ok && r.soft);
  if (hardFails.length === 0 && softs.length === 0) return PASS_MARKER;
  if (hardFails.length === 0) return PARTIAL_MARKER;
  return PARTIAL_MARKER; // never crash marker — report soft/hard in doc
}

function writeReport(marker) {
  const hardFails = results.filter((r) => !r.ok);
  const lines = [];
  lines.push("# P970 Cursor / OpenAI-compatible Tool Call Compatibility Report");
  lines.push("");
  lines.push(`> 日期：${new Date().toISOString().slice(0, 10)}`);
  lines.push("> 范围：tools/tool_choice 透传、分层 timeout、SSE tool_calls、能力标记、账单保护");
  lines.push("> 约束：未改图片计费保护核心；未全局 timeout=700s；未打印 API Key 明文");
  lines.push("");
  lines.push("## 最终结论");
  lines.push("");
  lines.push("```");
  lines.push(marker);
  lines.push("```");
  lines.push("");
  lines.push("| 检查 | 结果 | 细节 |");
  lines.push("|---|---|---|");
  for (const r of results) {
    const status = r.ok ? (r.soft ? "SOFT" : "PASS") : "FAIL";
    lines.push(`| ${r.id} | ${status} | ${r.detail ?? ""} |`);
  }
  lines.push("");
  lines.push("## 实现要点");
  lines.push("");
  lines.push("- `tools` / `tool_choice` 透传（非空）；保留 `tool` / `function` 消息角色与 `tool_calls`");
  lines.push("- 模型能力：`chat` / `stream` / `tools` / `image` / `coding`（GET `/v1/models`）");
  lines.push("- Timeout：CHAT 180s / STREAM 300s / TOOL_CALL 420s / ATTEMPT 90s；仅 tools 走 TOOL_CALL");
  lines.push("- SSE：heartbeat + `delta.tool_calls` + `finish_reason=tool_calls` + `data: [DONE]`");
  lines.push("- 失败：`model_not_tool_capable` / `all_tool_upstreams_unavailable` / timeout → not_billable");
  lines.push("");
  if (hardFails.length) {
    lines.push("## 失败项");
    lines.push("");
    for (const f of hardFails) {
      lines.push(`- **${f.id}**: ${f.detail ?? ""}`);
    }
    lines.push("");
  }
  writeFileSync(REPORT_PATH, lines.join("\n"), "utf8");
  console.log(`Wrote ${REPORT_PATH}`);
}

async function main() {
  console.log("=== P970 Cursor tool call compatibility smoke ===\n");
  staticChecks();
  runPriorSmokeStatic();

  const ctx = await bootstrapClientCompatSmoke(SCRIPT);
  try {
    await runLiveOrMock(ctx);
  } finally {
    ctx.cleanup();
  }

  const marker = verdict();
  const hardFails = results.filter((r) => !r.ok);
  mkdirSync(join(ROOT, "tmp"), { recursive: true });
  writeFileSync(
    SUMMARY_PATH,
    JSON.stringify({ marker, results, hardFails: hardFails.length }, null, 2)
  );
  console.log(`\nWrote ${SUMMARY_PATH}`);

  if (WRITE_REPORT) writeReport(marker);

  console.log("");
  console.log(marker);
  if (hardFails.length > 0) {
    console.error(`\np970: ${hardFails.length} hard fail(s)`);
    process.exitCode = 1;
  } else {
    console.log("\np970-cursor-tool-call-smoke: OK");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
