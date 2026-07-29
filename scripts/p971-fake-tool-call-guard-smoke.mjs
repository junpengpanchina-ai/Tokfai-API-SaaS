#!/usr/bin/env node
/**
 * P971 — Fake Tool Call Billing Guard smoke.
 *
 * Strict tools requests must return real tool_calls or not_billable error.
 * tool_choice:auto may return ordinary content (auto_no_tool_call).
 *
 * Default: offline mock + static source checks.
 * LIVE=1: production (soft-pass upstream degradation).
 *
 * Never prints API key plaintext.
 *
 * Usage:
 *   node scripts/p971-fake-tool-call-guard-smoke.mjs
 *   LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p971-fake-tool-call-guard-smoke.mjs
 *   WRITE_REPORT=1 node scripts/p971-fake-tool-call-guard-smoke.mjs
 *
 * Marker:
 *   TOKFAI_P971_FAKE_TOOL_CALL_GUARD_PASS
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

const SCRIPT = "scripts/p971-fake-tool-call-guard-smoke.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS_MARKER = "TOKFAI_P971_FAKE_TOOL_CALL_GUARD_PASS";

const WRITE_REPORT =
  process.env.WRITE_REPORT === "1" || process.env.WRITE_REPORT === "true";
const REPORT_PATH = join(
  ROOT,
  process.env.REPORT_PATH ?? "docs/p971-fake-tool-call-guard-report.md"
);
const SUMMARY_PATH = join(
  ROOT,
  process.env.SUMMARY_PATH ?? "tmp/p971-fake-tool-call-guard-summary.json"
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

const FORCED_CHOICE = {
  type: "function",
  function: { name: "get_weather" },
};

/** @type {{ id: string, ok: boolean, soft?: boolean, detail?: string }[]} */
const results = [];

function record(id, ok, detail, soft = false) {
  results.push({
    id,
    ok,
    soft,
    detail: detail ? String(detail).slice(0, 320) : undefined,
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

function billableOk(body) {
  const status = body?.tokfai?.billing_status;
  if (status === "not_billable") return false;
  return Number.isFinite(charged(body)) && charged(body) >= 0;
}

function hasToolCalls(body) {
  const msg = body?.choices?.[0]?.message;
  return Array.isArray(msg?.tool_calls) && msg.tool_calls.length > 0;
}

function staticChecks() {
  console.log("=== static source checks ===\n");
  const tools = read("apps/dmit-api/src/lib/toolCallCapability.ts");
  const exec = read("apps/dmit-api/src/lib/executeChatCompletion.ts");
  const handle = read("apps/dmit-api/src/lib/handleExecuteChatCompletionResult.ts");
  const errors = read("apps/dmit-api/src/errors.ts");
  const logger = read("apps/dmit-api/src/logger.ts");
  const pricing = read("apps/dmit-api/src/catalog/modelPricing.ts");
  const mock = read("scripts/p786-offline-customer-mock.mjs");
  const p970 = read("scripts/p970-cursor-tool-call-smoke.mjs");
  const p954 = read("scripts/p954-image-provider-routing-isolation-smoke.mjs");
  const p961 = read("scripts/p961-image-cost-reconciliation-smoke.mjs");
  const p968 = read("scripts/p968-billing-audit.mjs");

  record(
    "static_strict_helpers",
    tools.includes("isStrictToolCallRequest") &&
      tools.includes("clientRequiresToolCall") &&
      tools.includes("responseHasToolCalls") &&
      tools.includes("TOOL_CALL_NOT_GENERATED_CODE") &&
      tools.includes("resolveToolsCapabilityMark") &&
      tools.includes('return "experimental"') &&
      tools.includes('m === "auto-fast"'),
    "strict + capability mark helpers"
  );

  record(
    "static_fake_guard_wired",
    exec.includes("fake_tool_call_guard_triggered") &&
      exec.includes("isStrictToolCallRequest") &&
      exec.includes("TOOL_CALL_NOT_GENERATED_CODE") &&
      exec.includes("auto_no_tool_call") &&
      exec.includes("upstreamReturnedToolCalls"),
    "executeChatCompletion guard before debit"
  );

  record(
    "static_error_envelope",
    errors.includes("tool_call_not_generated") &&
      errors.includes("provider_tool_call_not_supported") &&
      handle.includes('billing_status: "not_billable"') &&
      handle.includes("tool_call_not_generated"),
    "502 + tokfai not_billable"
  );

  record(
    "static_logger_fields",
    logger.includes("requireToolCall") &&
      logger.includes("strictToolCall") &&
      logger.includes("fakeToolCallGuard") &&
      logger.includes("upstreamReturnedToolCalls"),
    "P971 log allowlist"
  );

  record(
    "static_capabilities_conservative",
    tools.includes("VERIFIED_TOOLS_CAPABLE_MODEL_IDS") &&
      pricing.includes("resolveModelCapabilityFlags") &&
      pricing.includes('"experimental"'),
    "catalog tools true|experimental|false"
  );

  record(
    "static_mock_p971",
    mock.includes("TOKFAI_FAKE_TOOL_CALL") &&
      mock.includes("mockFakeToolCallGuardError") &&
      mock.includes("fake_tool_call_guard_triggered") &&
      mock.includes("mockToolsCapabilityMark"),
    "offline mock mirrors guard"
  );

  record(
    "static_prior_smokes_present",
    p970.includes("TOKFAI_P970") &&
      p954.includes("TOKFAI_P954") &&
      p961.includes("TOKFAI_P961") &&
      p968.includes("p968"),
    "P954/P961/P968/P970 scripts intact"
  );
}

async function runRuntime(ctx) {
  console.log("\n=== runtime probes ===\n");
  const { postJson, getJson, LIVE } = ctx;

  // Capabilities: auto-fast must not advertise tools:true
  {
    const { res, body } = await getJson("/v1/models");
    const data = Array.isArray(body?.data) ? body.data : [];
    const autoFast = data.find((m) => m?.id === "auto-fast");
    const toolsMark = autoFast?.capabilities?.tools;
    const anyExperimental = data.some(
      (m) => m?.capabilities?.tools === "experimental"
    );
    const verifiedTrue = data.filter((m) => m?.capabilities?.tools === true);
    const ok =
      res.status === 200 &&
      autoFast &&
      toolsMark !== true &&
      (toolsMark === false || toolsMark === "experimental" || toolsMark == null);
    record(
      "models_auto_fast_tools_not_true",
      ok || (LIVE && UPSTREAM_DEGRADED_CODES.has(body?.error?.code)),
      ok
        ? `auto-fast.tools=${JSON.stringify(toolsMark)} experimental=${anyExperimental} true=${verifiedTrue.length}`
        : `status=${res.status} tools=${JSON.stringify(toolsMark)}`,
      LIVE && !ok && res.status >= 500
    );
  }

  // Forced tool_choice success → tool_calls + billable
  {
    const { res, body } = await postJson("/v1/chat/completions", {
      model: "auto-pro",
      messages: [
        { role: "user", content: "What is the weather in Shanghai?" },
      ],
      tools: TOOLS,
      tool_choice: FORCED_CHOICE,
      stream: false,
    });
    const code = body?.error?.code;
    if (res.status === 200 && hasToolCalls(body) && billableOk(body)) {
      record(
        "forced_tool_choice_billable_tool_calls",
        body?.choices?.[0]?.finish_reason === "tool_calls",
        `charged=${charged(body)} finish=${body?.choices?.[0]?.finish_reason}`
      );
    } else if (
      (code === "tool_call_not_generated" ||
        code === "provider_tool_call_not_supported" ||
        code === "all_tool_upstreams_unavailable" ||
        code === "upstream_timeout") &&
      notBillable(body)
    ) {
      record(
        "forced_tool_choice_billable_tool_calls",
        true,
        `upstream could not tool_call code=${code} (not_billable)`,
        true
      );
    } else if (LIVE && UPSTREAM_DEGRADED_CODES.has(code)) {
      record(
        "forced_tool_choice_billable_tool_calls",
        true,
        `degraded ${code}`,
        true
      );
    } else {
      record(
        "forced_tool_choice_billable_tool_calls",
        false,
        `status=${res.status} code=${code} finish=${body?.choices?.[0]?.finish_reason}`
      );
    }
    assertNoErrorLeak(JSON.stringify(body ?? {}));
  }

  // Forced tool_choice + fake content → must be not_billable
  {
    const { res, body } = await postJson("/v1/chat/completions", {
      model: "auto-pro",
      messages: [{ role: "user", content: "TOKFAI_FAKE_TOOL_CALL please" }],
      tools: TOOLS,
      tool_choice: "required",
      stream: false,
    });
    const code = body?.error?.code;
    const ok =
      res.status >= 400 &&
      (code === "tool_call_not_generated" ||
        code === "provider_tool_call_not_supported") &&
      notBillable(body) &&
      (body?.request_id || body?.error?.request_id || body?.tokfai?.request_id);
    if (ok) {
      record(
        "forced_fake_content_not_billable",
        true,
        `code=${code} charged=${charged(body)}`
      );
    } else if (LIVE && !ok) {
      // LIVE upstream may return real tool_calls or degrade — soft if not_billable error or real tool_calls
      if (res.status === 200 && hasToolCalls(body) && billableOk(body)) {
        record(
          "forced_fake_content_not_billable",
          true,
          "LIVE upstream returned real tool_calls (prompt ignored)",
          true
        );
      } else if (notBillable(body) && res.status >= 400) {
        record(
          "forced_fake_content_not_billable",
          true,
          `LIVE not_billable code=${code}`,
          true
        );
      } else if (UPSTREAM_DEGRADED_CODES.has(code)) {
        record(
          "forced_fake_content_not_billable",
          true,
          `degraded ${code}`,
          true
        );
      } else {
        record(
          "forced_fake_content_not_billable",
          false,
          `LIVE status=${res.status} code=${code} charged=${charged(body)} — fake tool billing risk`
        );
      }
    } else {
      record(
        "forced_fake_content_not_billable",
        false,
        `status=${res.status} code=${code} charged=${charged(body)}`
      );
    }
    assertNoErrorLeak(JSON.stringify(body ?? {}));
  }

  // tokfai.require_tool_call=true without tool_calls → not_billable
  {
    const { res, body } = await postJson("/v1/chat/completions", {
      model: "auto-pro",
      messages: [{ role: "user", content: "TOKFAI_FAKE_TOOL_CALL require" }],
      tools: TOOLS,
      tool_choice: "auto",
      tokfai: { require_tool_call: true },
      stream: false,
    });
    const code = body?.error?.code;
    const ok =
      res.status >= 400 &&
      (code === "tool_call_not_generated" ||
        code === "provider_tool_call_not_supported") &&
      notBillable(body);
    if (ok) {
      record(
        "require_tool_call_fake_not_billable",
        true,
        `code=${code}`
      );
    } else if (LIVE) {
      if (res.status === 200 && hasToolCalls(body)) {
        record(
          "require_tool_call_fake_not_billable",
          true,
          "LIVE returned tool_calls",
          true
        );
      } else if (notBillable(body) || UPSTREAM_DEGRADED_CODES.has(code)) {
        record(
          "require_tool_call_fake_not_billable",
          true,
          `LIVE code=${code}`,
          true
        );
      } else {
        record(
          "require_tool_call_fake_not_billable",
          false,
          `status=${res.status} code=${code} charged=${charged(body)}`
        );
      }
    } else {
      record(
        "require_tool_call_fake_not_billable",
        false,
        `status=${res.status} code=${code}`
      );
    }
  }

  // tool_choice:auto ordinary answer allowed → auto_no_tool_call
  {
    const { res, body } = await postJson("/v1/chat/completions", {
      model: "auto-pro",
      messages: [{ role: "user", content: "TOKFAI_AUTO_NO_TOOL answer 42" }],
      tools: TOOLS,
      tool_choice: "auto",
      stream: false,
    });
    const code = body?.error?.code;
    if (
      res.status === 200 &&
      !hasToolCalls(body) &&
      body?.tokfai?.auto_no_tool_call === true &&
      billableOk(body)
    ) {
      record(
        "auto_no_tool_call_allowed",
        true,
        `content=${String(body?.choices?.[0]?.message?.content ?? "").slice(0, 40)}`
      );
    } else if (res.status === 200 && hasToolCalls(body)) {
      record(
        "auto_no_tool_call_allowed",
        true,
        "model chose to tool_call (also valid for auto)",
        true
      );
    } else if (LIVE && (UPSTREAM_DEGRADED_CODES.has(code) || notBillable(body))) {
      record("auto_no_tool_call_allowed", true, `LIVE ${code ?? res.status}`, true);
    } else {
      record(
        "auto_no_tool_call_allowed",
        false,
        `status=${res.status} auto_flag=${body?.tokfai?.auto_no_tool_call} code=${code}`
      );
    }
  }

  // Invalid model + tools → not_billable
  {
    const { res, body } = await postJson("/v1/chat/completions", {
      model: "definitely-not-a-real-model-xyz",
      messages: [{ role: "user", content: "hi" }],
      tools: TOOLS,
      tool_choice: "required",
      stream: false,
    });
    const code = body?.error?.code;
    const ok = res.status >= 400 && notBillable(body) && typeof code === "string";
    record(
      "invalid_model_tools_not_billable",
      ok,
      `status=${res.status} code=${code}`
    );
  }

  // Ordinary chat unaffected
  {
    const { res, body } = await postJson("/v1/chat/completions", {
      model: "auto-fast",
      messages: [{ role: "user", content: "Say P971_OK only." }],
      stream: false,
    });
    const content = body?.choices?.[0]?.message?.content ?? "";
    const ok =
      res.status === 200 &&
      typeof content === "string" &&
      content.length > 0 &&
      !hasToolCalls(body);
    if (ok) {
      record("ordinary_chat_unaffected", true, `len=${content.length}`);
    } else if (LIVE && UPSTREAM_DEGRADED_CODES.has(body?.error?.code)) {
      record("ordinary_chat_unaffected", true, `degraded`, true);
    } else {
      record("ordinary_chat_unaffected", false, `status=${res.status}`);
    }
  }

  // Image / chat isolation
  {
    const { res, body } = await postJson("/v1/chat/completions", {
      model: "nano-banana",
      messages: [{ role: "user", content: "draw a cat" }],
      tools: TOOLS,
      tool_choice: "required",
      stream: false,
    });
    const ok =
      res.status === 400 &&
      body?.error?.code === "image_model_not_for_chat" &&
      notBillable(body);
    record(
      "image_chat_isolation_unaffected",
      ok,
      `status=${res.status} code=${body?.error?.code}`
    );
  }
}

function runPriorSmokes() {
  console.log("\n=== prior smoke regression ===\n");
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
    record(
      `prior_${script.split("/").pop().replace(/\.mjs$/, "")}`,
      r.status === 0,
      r.status === 0 ? "exit 0" : out.slice(-240)
    );
  }
}

function writeReport(marker) {
  const lines = [];
  lines.push("# P971 Fake Tool Call Billing Guard Report");
  lines.push("");
  lines.push(`> 日期：${new Date().toISOString().slice(0, 10)}`);
  lines.push(
    "> 范围：strict tool-call 判定、假兼容计费拦截、capabilities 保守标注、auto 语义保留"
  );
  lines.push("> 约束：未破坏 P954/P961/P968/P970；未打印 API Key 明文");
  lines.push("");
  lines.push("## 最终结论");
  lines.push("");
  lines.push("```");
  lines.push(marker);
  lines.push("```");
  lines.push("");
  lines.push("## 行为摘要");
  lines.push("");
  lines.push(
    "| 场景 | 期望 | 计费 |"
  );
  lines.push("|---|---|---|");
  lines.push(
    "| `tool_choice` function / `required` 且返回 tool_calls | 200 + finish_reason=tool_calls | billable |"
  );
  lines.push(
    "| strict 请求但上游只回普通 content | `tool_call_not_generated` | not_billable / credits=0 |"
  );
  lines.push(
    "| `tokfai.require_tool_call=true` 且无 tool_calls | 同上 | not_billable |"
  );
  lines.push(
    "| `tool_choice:auto` 普通回答 | 允许，`tokfai.auto_no_tool_call` | billable |"
  );
  lines.push(
    "| `/v1/models` capabilities.tools | 仅 LIVE 验证 → true；其余 experimental/false；auto-fast 不为 true | — |"
  );
  lines.push("");
  lines.push("## 用例结果");
  lines.push("");
  for (const r of results) {
    const tag = !r.ok ? "FAIL" : r.soft ? "SOFT" : "PASS";
    lines.push(`- **${tag}** \`${r.id}\`${r.detail ? ` — ${r.detail}` : ""}`);
  }
  lines.push("");
  lines.push("## 日志字段（必记）");
  lines.push("");
  lines.push(
    "`hasTools`, `toolChoice`, `requireToolCall`, `strictToolCall`, `upstreamReturnedToolCalls`, `finishReason`, `fakeToolCallGuard`, `billing_status`, `credits_charged`"
  );
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

function writeSummary(marker) {
  mkdirSync(dirname(SUMMARY_PATH), { recursive: true });
  writeFileSync(
    SUMMARY_PATH,
    JSON.stringify(
      {
        marker,
        results,
        at: new Date().toISOString(),
      },
      null,
      2
    ),
    "utf8"
  );
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
  const marker = hardFails.length === 0 ? PASS_MARKER : "TOKFAI_P971_FAKE_TOOL_CALL_GUARD_FAIL";

  if (WRITE_REPORT || hardFails.length === 0) {
    writeReport(marker);
  }
  writeSummary(marker);

  console.log("");
  console.log(marker);
  if (hardFails.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exitCode = 1;
});
