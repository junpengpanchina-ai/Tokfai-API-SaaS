#!/usr/bin/env node
/**
 * P985 — OpenAI-Compatible / Cursor-Compatible Compatibility Gap Audit.
 *
 * Audit only: does NOT claim fully compatible; does NOT fix gaps.
 * Marker TOKFAI_P985_COMPATIBILITY_GAP_AUDIT_PASS means the audit script
 * and report completed — not that every case is commercially green.
 *
 * Default: offline mock.
 * LIVE=1 TOKFAI_API_KEY=sk-tokfai_... for production probes (soft WARN on upstream noise).
 *
 * Usage:
 *   node scripts/p985-openai-cursor-compat-gap-smoke.mjs
 *   WRITE_REPORT=1 node scripts/p985-openai-cursor-compat-gap-smoke.mjs
 *   LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p985-openai-cursor-compat-gap-smoke.mjs
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bootstrapClientCompatSmoke,
  pass,
  fail,
} from "./lib/client-compat-smoke-bootstrap.mjs";
import { acceptanceFetch } from "./lib/acceptance-http.mjs";

const SCRIPT = "scripts/p985-openai-cursor-compat-gap-smoke.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS_MARKER = "TOKFAI_P985_COMPATIBILITY_GAP_AUDIT_PASS";
const FAIL_MARKER = "TOKFAI_P985_COMPATIBILITY_GAP_AUDIT_FAIL";

const WRITE_REPORT =
  process.env.WRITE_REPORT !== "0" && process.env.WRITE_REPORT !== "false";
const REPORT_PATH = join(
  ROOT,
  process.env.REPORT_PATH ?? "docs/p985-compatibility-gap-audit-report.md"
);
const SUMMARY_PATH = join(
  ROOT,
  process.env.SUMMARY_PATH ?? "tmp/p985-compat-gap-summary.json"
);

/** Cursor-like tools (names only — no filesystem side effects in API smoke). */
const CURSOR_TOOLS = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a project file",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_terminal_cmd",
      description: "Run a shell command",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string" },
          explanation: { type: "string" },
        },
        required: ["command"],
      },
    },
  },
];

const OPENAI_TOOLS = [
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Get weather",
      parameters: {
        type: "object",
        properties: { location: { type: "string" } },
        required: ["location"],
      },
    },
  },
];

/**
 * @typedef {'PASS'|'WARN'|'FAIL'|'BLOCKER'} Verdict
 * @typedef {{
 *   case_name: string,
 *   category: string,
 *   request_body: unknown,
 *   http_status: number|null,
 *   response_parse_ok: boolean,
 *   openai_shape_ok: boolean|null,
 *   cursor_likely_ok: boolean|null,
 *   billing_status: string|null,
 *   credits_charged: number|null,
 *   request_id: string|null,
 *   failure_reason: string|null,
 *   verdict: Verdict,
 *   notes?: string,
 * }} CaseRow
 */

/** @type {CaseRow[]} */
const cases = [];

/** @type {{ id: string, ok: boolean, soft?: boolean, detail?: string }[]} */
const harness = [];

function recordHarness(id, ok, detail, soft = false) {
  harness.push({
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
  const n = Number(body?.credits_charged ?? body?.tokfai?.credits_charged ?? 0);
  return Number.isFinite(n) ? n : 0;
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

function billingOf(body) {
  const s = body?.tokfai?.billing_status;
  return typeof s === "string" ? s : null;
}

function isOpenAiChatShape(body) {
  if (!body || typeof body !== "object") return false;
  if (body.error) return false;
  if (body.object !== "chat.completion" && body.object !== "chat.completion.chunk") {
    // Some paths omit object; require choices at minimum.
    if (!Array.isArray(body.choices) || body.choices.length < 1) return false;
  }
  if (!Array.isArray(body.choices) || body.choices.length < 1) return false;
  const c0 = body.choices[0];
  if (!c0 || typeof c0 !== "object") return false;
  // Non-stream: message; stream chunk may use delta — handled separately.
  if (c0.message && typeof c0.message === "object") {
    const role = c0.message.role;
    if (role && role !== "assistant") return false;
    return true;
  }
  return false;
}

function isOpenAiErrorShape(body) {
  return Boolean(
    body?.error &&
      typeof body.error === "object" &&
      typeof body.error.message === "string" &&
      body.error.message.trim() &&
      typeof body.error.code === "string" &&
      body.error.code.trim()
  );
}

function parseSseChat(text) {
  const chunks = [];
  let sawDone = false;
  let sawToolDelta = false;
  let content = "";
  let parseOk = true;
  for (const line of String(text ?? "").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (payload === "[DONE]") {
      sawDone = true;
      continue;
    }
    try {
      const obj = JSON.parse(payload);
      chunks.push(obj);
      const delta = obj?.choices?.[0]?.delta;
      if (delta?.content) content += String(delta.content);
      if (Array.isArray(delta?.tool_calls) && delta.tool_calls.length) {
        sawToolDelta = true;
      }
    } catch {
      parseOk = false;
    }
  }
  return { chunks, sawDone, sawToolDelta, content, parseOk };
}

/**
 * @param {object} args
 * @returns {CaseRow}
 */
function pushCase(args) {
  const row = {
    case_name: args.case_name,
    category: args.category ?? "openai",
    request_body: args.request_body ?? null,
    http_status: args.http_status ?? null,
    response_parse_ok: args.response_parse_ok === true,
    openai_shape_ok:
      args.openai_shape_ok == null ? null : Boolean(args.openai_shape_ok),
    cursor_likely_ok:
      args.cursor_likely_ok == null ? null : Boolean(args.cursor_likely_ok),
    billing_status: args.billing_status ?? null,
    credits_charged:
      args.credits_charged == null ? null : Number(args.credits_charged),
    request_id: args.request_id ?? null,
    failure_reason: args.failure_reason ?? null,
    verdict: args.verdict ?? "WARN",
    notes: args.notes,
  };
  cases.push(row);
  const mark =
    row.verdict === "PASS"
      ? "PASS"
      : row.verdict === "WARN"
        ? "WARN"
        : row.verdict === "BLOCKER"
          ? "BLOCK"
          : "FAIL";
  console.log(
    `${mark.padEnd(5)} ${row.case_name} — status=${row.http_status} billing=${row.billing_status} charged=${row.credits_charged} ${row.failure_reason ?? row.notes ?? ""}`
  );
  return row;
}

function staticSourceNotes() {
  const notes = [];
  try {
    const compat = readFileSync(
      join(ROOT, "apps/dmit-api/src/lib/chatCompletionCompat.ts"),
      "utf8"
    );
    if (
      compat.includes('rf.type === "json_object" || rf.type === "text"') &&
      !compat.includes("json_schema")
    ) {
      notes.push(
        "Source: response_format json_schema is accepted client-side but NOT forwarded upstream (only json_object/text)."
      );
    }
  } catch {
    // ignore
  }
  try {
    const schema = readFileSync(
      join(ROOT, "apps/dmit-api/src/lib/executeChatCompletion.ts"),
      "utf8"
    );
    if (
      schema.includes("ChatCompletionRequestSchema") &&
      !/^\s*n:\s/m.test(schema.split("ChatCompletionRequestSchema")[1]?.slice(0, 800) ?? "")
    ) {
      notes.push(
        "Source: OpenAI `n` (multi-choice) is not a first-class schema field; multi-completion not guaranteed."
      );
    }
  } catch {
    // ignore
  }
  notes.push(
    "Policy: tools only on VERIFIED_TOOLS_CAPABLE_MODEL_IDS whitelist — not all models; do not advertise fully compatible."
  );
  return notes;
}

async function runAudit(ctx) {
  const { BASE, API_KEY, TIMEOUT_MS, LIVE, postJson } = ctx;

  async function chat(body, headers = {}) {
    return acceptanceFetch(`${BASE}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
      timeoutMs: TIMEOUT_MS,
    });
  }

  async function chatRaw(rawBody, headers = {}) {
    return acceptanceFetch(`${BASE}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
        ...headers,
      },
      body: rawBody,
      timeoutMs: TIMEOUT_MS,
    });
  }

  // ─── OpenAI baseline ─────────────────────────────────────────────
  {
    const body = {
      model: "auto-fast",
      messages: [{ role: "user", content: "P985 non-stream hello" }],
      stream: false,
      max_tokens: 24,
    };
    const { res, body: out } = await chat(body);
    const rid = requestIdOf(out, res);
    const shape = isOpenAiChatShape(out);
    const bill = billingOf(out);
    const ch = charged(out);
    pushCase({
      case_name: "non_stream_chat",
      category: "openai",
      request_body: body,
      http_status: res.status,
      response_parse_ok: !out?._raw,
      openai_shape_ok: shape,
      cursor_likely_ok: shape && res.status === 200,
      billing_status: bill,
      credits_charged: ch,
      request_id: rid,
      failure_reason:
        res.status === 200 && shape
          ? null
          : `status=${res.status} shape=${shape}`,
      verdict:
        res.status === 200 && shape && rid
          ? ch > 0 || bill === "charged" || LIVE
            ? "PASS"
            : "WARN"
          : "FAIL",
      notes: "Ordinary chat success path",
    });
  }

  {
    const body = {
      model: "auto-fast",
      messages: [{ role: "user", content: "P985 stream hello" }],
      stream: true,
      max_tokens: 24,
    };
    const { res, text } = await chat(body);
    const sse = parseSseChat(text);
    const ok =
      res.status === 200 &&
      sse.parseOk &&
      sse.sawDone &&
      (sse.content.trim().length > 0 || sse.chunks.length > 0);
    pushCase({
      case_name: "stream_chat",
      category: "openai",
      request_body: body,
      http_status: res.status,
      response_parse_ok: sse.parseOk,
      openai_shape_ok: ok,
      cursor_likely_ok: ok,
      billing_status: null,
      credits_charged: null,
      request_id: null,
      failure_reason: ok
        ? null
        : `status=${res.status} done=${sse.sawDone} content_len=${sse.content.length}`,
      verdict: ok ? "PASS" : "FAIL",
      notes: "SSE data chunks + [DONE]",
    });
  }

  // Tools non-stream (whitelist model gpt-5.5 when env set)
  {
    const body = {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "What is the weather in Shanghai?" }],
      tools: OPENAI_TOOLS,
      tool_choice: "required",
      stream: false,
    };
    const { res, body: out } = await chat(body);
    const tc = out?.choices?.[0]?.message?.tool_calls;
    const hasTc = Array.isArray(tc) && tc.length > 0;
    const errOk = isOpenAiErrorShape(out) && notBillableish(out);
    const ok = res.status === 200 && hasTc;
    pushCase({
      case_name: "tool_calls_non_stream",
      category: "openai",
      request_body: body,
      http_status: res.status,
      response_parse_ok: !out?._raw,
      openai_shape_ok: ok || errOk,
      cursor_likely_ok: ok,
      billing_status: billingOf(out),
      credits_charged: charged(out),
      request_id: requestIdOf(out, res),
      failure_reason: ok
        ? null
        : errOk
          ? `graceful not_billable code=${out?.error?.code}`
          : `no tool_calls status=${res.status} code=${out?.error?.code}`,
      verdict: ok ? "PASS" : errOk ? "WARN" : "FAIL",
      notes: "Requires verified tools whitelist (gpt-5.5 offline)",
    });
  }

  {
    const body = {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "Weather tool stream" }],
      tools: OPENAI_TOOLS,
      tool_choice: "required",
      stream: true,
    };
    const { res, text, body: out } = await chat(body);
    const sse = parseSseChat(text);
    const ok = res.status === 200 && sse.parseOk && sse.sawDone && sse.sawToolDelta;
    const errFallback =
      !ok &&
      (String(text).includes("model_not_tool_capable") ||
        String(text).includes("not_billable") ||
        isOpenAiErrorShape(out));
    pushCase({
      case_name: "tool_calls_stream",
      category: "openai",
      request_body: body,
      http_status: res.status,
      response_parse_ok: sse.parseOk || Boolean(out && !out._raw),
      openai_shape_ok: ok || errFallback,
      cursor_likely_ok: ok,
      billing_status: billingOf(out),
      credits_charged: charged(out),
      request_id: requestIdOf(out, res),
      failure_reason: ok
        ? null
        : errFallback
          ? "stream tool failed gracefully / not_billable"
          : "missing tool_calls SSE deltas",
      verdict: ok ? "PASS" : errFallback ? "WARN" : "FAIL",
    });
  }

  // tool result second turn
  {
    const body = {
      model: "gpt-5.5",
      messages: [
        { role: "user", content: "Weather in Shanghai?" },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_p985_1",
              type: "function",
              function: {
                name: "get_weather",
                arguments: '{"location":"Shanghai"}',
              },
            },
          ],
        },
        {
          role: "tool",
          tool_call_id: "call_p985_1",
          content: '{"temp":22,"unit":"C"}',
        },
      ],
      tools: OPENAI_TOOLS,
      stream: false,
      max_tokens: 64,
    };
    const { res, body: out } = await chat(body);
    const shape = isOpenAiChatShape(out) || isOpenAiErrorShape(out);
    const content = out?.choices?.[0]?.message?.content;
    const ok =
      res.status === 200 &&
      isOpenAiChatShape(out) &&
      (typeof content === "string" || content === null);
    pushCase({
      case_name: "tool_result_second_turn",
      category: "openai",
      request_body: body,
      http_status: res.status,
      response_parse_ok: !out?._raw,
      openai_shape_ok: shape,
      cursor_likely_ok: ok,
      billing_status: billingOf(out),
      credits_charged: charged(out),
      request_id: requestIdOf(out, res),
      failure_reason: ok ? null : `status=${res.status} code=${out?.error?.code}`,
      verdict: ok ? "PASS" : shape ? "WARN" : "FAIL",
    });
  }

  // function role legacy
  {
    const body = {
      model: "auto-fast",
      messages: [
        { role: "user", content: "legacy function role" },
        {
          role: "assistant",
          content: null,
          function_call: {
            name: "get_weather",
            arguments: '{"location":"Paris"}',
          },
        },
        {
          role: "function",
          name: "get_weather",
          content: '{"temp":18}',
        },
      ],
      stream: false,
      max_tokens: 32,
    };
    const { res, body: out } = await chat(body);
    const ok = res.status === 200 && isOpenAiChatShape(out);
    const err = isOpenAiErrorShape(out);
    pushCase({
      case_name: "function_role_legacy",
      category: "openai",
      request_body: body,
      http_status: res.status,
      response_parse_ok: !out?._raw,
      openai_shape_ok: ok || err,
      cursor_likely_ok: ok,
      billing_status: billingOf(out),
      credits_charged: charged(out),
      request_id: requestIdOf(out, res),
      failure_reason: ok
        ? null
        : err
          ? `rejected code=${out.error.code}`
          : `status=${res.status}`,
      verdict: ok ? "PASS" : err ? "WARN" : "FAIL",
      notes: "Legacy OpenAI function role / function_call",
    });
  }

  // response_format
  for (const [name, rf, expect] of [
    [
      "response_format_json_object",
      { type: "json_object" },
      "PASS_OR_WARN",
    ],
    [
      "response_format_json_schema",
      {
        type: "json_schema",
        json_schema: {
          name: "answer",
          schema: {
            type: "object",
            properties: { ok: { type: "boolean" } },
            required: ["ok"],
          },
        },
      },
      "SCHEMA_GAP",
    ],
  ]) {
    const body = {
      model: "auto-fast",
      messages: [
        {
          role: "user",
          content:
            name === "response_format_json_object"
              ? 'Reply with JSON {"ok":true}'
              : "Reply structured",
        },
      ],
      response_format: rf,
      stream: false,
      max_tokens: 64,
    };
    const { res, body: out } = await chat(body);
    const ok = res.status === 200 && isOpenAiChatShape(out);
    let verdict = "WARN";
    let reason = null;
    if (expect === "SCHEMA_GAP") {
      // Known gap: schema not forwarded — if 200 still WARN (not enforced).
      verdict = ok ? "WARN" : "FAIL";
      reason = ok
        ? "json_schema likely stripped before upstream — structured guarantee not claimed"
        : `status=${res.status}`;
    } else {
      verdict = ok ? "PASS" : "FAIL";
      reason = ok ? null : `status=${res.status}`;
    }
    pushCase({
      case_name: name,
      category: "openai",
      request_body: body,
      http_status: res.status,
      response_parse_ok: !out?._raw,
      openai_shape_ok: ok || isOpenAiErrorShape(out),
      cursor_likely_ok: name === "response_format_json_object" ? ok : false,
      billing_status: billingOf(out),
      credits_charged: charged(out),
      request_id: requestIdOf(out, res),
      failure_reason: reason,
      verdict,
    });
  }

  // content array messages
  {
    const body = {
      model: "auto-fast",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "P985 content array: say ok" },
          ],
        },
      ],
      stream: false,
      max_tokens: 16,
    };
    const { res, body: out } = await chat(body);
    const ok = res.status === 200 && isOpenAiChatShape(out);
    pushCase({
      case_name: "content_array_messages",
      category: "openai",
      request_body: body,
      http_status: res.status,
      response_parse_ok: !out?._raw,
      openai_shape_ok: ok,
      cursor_likely_ok: ok,
      billing_status: billingOf(out),
      credits_charged: charged(out),
      request_id: requestIdOf(out, res),
      failure_reason: ok ? null : `status=${res.status}`,
      verdict: ok ? "PASS" : "FAIL",
    });
  }

  // roles mix
  {
    const body = {
      model: "auto-fast",
      messages: [
        { role: "system", content: "You are concise." },
        { role: "developer", content: "Prefer short answers." },
        { role: "user", content: "Say ok" },
        { role: "assistant", content: "ok" },
        { role: "user", content: "Again: ok" },
      ],
      stream: false,
      max_tokens: 16,
    };
    const { res, body: out } = await chat(body);
    const ok = res.status === 200 && isOpenAiChatShape(out);
    pushCase({
      case_name: "roles_system_developer_user_assistant",
      category: "openai",
      request_body: body,
      http_status: res.status,
      response_parse_ok: !out?._raw,
      openai_shape_ok: ok,
      cursor_likely_ok: ok,
      billing_status: billingOf(out),
      credits_charged: charged(out),
      request_id: requestIdOf(out, res),
      failure_reason: ok ? null : `status=${res.status}`,
      verdict: ok ? "PASS" : "WARN",
      notes: "developer role typically mapped to system",
    });
  }

  // sampling params
  {
    const body = {
      model: "auto-fast",
      messages: [{ role: "user", content: "params" }],
      stream: false,
      temperature: 0.2,
      top_p: 0.9,
      stop: ["\n\n"],
      max_tokens: 16,
      max_completion_tokens: 32,
    };
    const { res, body: out } = await chat(body);
    const ok = res.status === 200 && isOpenAiChatShape(out);
    pushCase({
      case_name: "sampling_stop_temperature_top_p_max_tokens",
      category: "openai",
      request_body: body,
      http_status: res.status,
      response_parse_ok: !out?._raw,
      openai_shape_ok: ok,
      cursor_likely_ok: ok,
      billing_status: billingOf(out),
      credits_charged: charged(out),
      request_id: requestIdOf(out, res),
      failure_reason: ok ? null : `status=${res.status}`,
      verdict: ok ? "PASS" : "FAIL",
      notes: "max_completion_tokens promoted to max_tokens server-side",
    });
  }

  // n parameter
  {
    const body = {
      model: "auto-fast",
      messages: [{ role: "user", content: "n=2" }],
      stream: false,
      n: 2,
      max_tokens: 8,
    };
    const { res, body: out } = await chat(body);
    const choices = Array.isArray(out?.choices) ? out.choices.length : 0;
    const ok = res.status === 200 && isOpenAiChatShape(out);
    pushCase({
      case_name: "n_parameter",
      category: "openai",
      request_body: body,
      http_status: res.status,
      response_parse_ok: !out?._raw,
      openai_shape_ok: ok,
      cursor_likely_ok: ok && choices >= 1,
      billing_status: billingOf(out),
      credits_charged: charged(out),
      request_id: requestIdOf(out, res),
      failure_reason:
        choices >= 2
          ? null
          : ok
            ? `accepted but choices=${choices} (OpenAI n=2 not fully honored)`
            : `status=${res.status}`,
      verdict: choices >= 2 ? "PASS" : ok ? "WARN" : "FAIL",
    });
  }

  // invalid / missing model / messages / malformed
  {
    const body = {
      model: "p985-totally-invalid-model",
      messages: [{ role: "user", content: "x" }],
      stream: false,
    };
    const { res, body: out } = await chat(body);
    const ok =
      res.status >= 400 &&
      isOpenAiErrorShape(out) &&
      notBillableish(out) &&
      charged(out) === 0;
    pushCase({
      case_name: "invalid_model",
      category: "openai",
      request_body: body,
      http_status: res.status,
      response_parse_ok: !out?._raw,
      openai_shape_ok: isOpenAiErrorShape(out),
      cursor_likely_ok: ok,
      billing_status: billingOf(out),
      credits_charged: charged(out),
      request_id: requestIdOf(out, res),
      failure_reason: ok ? null : `status=${res.status} code=${out?.error?.code}`,
      verdict: ok ? "PASS" : "FAIL",
    });
  }

  {
    const body = {
      messages: [{ role: "user", content: "missing model" }],
      stream: false,
      max_tokens: 8,
    };
    const { res, body: out } = await chat(body);
    // May default BOT_MODEL (200) or 400 — both documentable.
    const ok200 = res.status === 200 && isOpenAiChatShape(out);
    const ok400 = res.status >= 400 && isOpenAiErrorShape(out);
    pushCase({
      case_name: "missing_model",
      category: "openai",
      request_body: body,
      http_status: res.status,
      response_parse_ok: !out?._raw,
      openai_shape_ok: ok200 || ok400,
      cursor_likely_ok: ok200 || ok400,
      billing_status: billingOf(out),
      credits_charged: charged(out),
      request_id: requestIdOf(out, res),
      failure_reason: ok200
        ? "defaults to server BOT_MODEL (not strict OpenAI required-model)"
        : ok400
          ? null
          : `status=${res.status}`,
      verdict: ok400 ? "PASS" : ok200 ? "WARN" : "FAIL",
    });
  }

  {
    const body = { model: "auto-fast", stream: false };
    const { res, body: out } = await chat(body);
    // Cherry noop 200 empty vs OpenAI 400 — WARN if 200 noop.
    const noop =
      res.status === 200 &&
      billingOf(out) === "not_billable" &&
      charged(out) === 0;
    const strict = res.status >= 400 && isOpenAiErrorShape(out);
    pushCase({
      case_name: "missing_messages",
      category: "openai",
      request_body: body,
      http_status: res.status,
      response_parse_ok: !out?._raw,
      openai_shape_ok: noop || strict || isOpenAiChatShape(out),
      cursor_likely_ok: strict || noop,
      billing_status: billingOf(out),
      credits_charged: charged(out),
      request_id: requestIdOf(out, res),
      failure_reason: noop
        ? "Cherry-style empty_messages noop 200 not_billable (OpenAI clients may expect 400)"
        : strict
          ? null
          : `status=${res.status}`,
      verdict: strict ? "PASS" : noop ? "WARN" : "FAIL",
    });
  }

  {
    const { res, body: out, text } = await chatRaw("{not-json");
    const hasErrorHint =
      isOpenAiErrorShape(out) || /json|parse|invalid/i.test(text ?? "");
    const ok400 = res.status === 400 && hasErrorHint;
    const okOther = res.status >= 400 && hasErrorHint;
    pushCase({
      case_name: "malformed_json",
      category: "openai",
      request_body: "{not-json",
      http_status: res.status,
      response_parse_ok: Boolean(out && !out._raw) || okOther,
      openai_shape_ok: isOpenAiErrorShape(out) || okOther,
      cursor_likely_ok: okOther,
      billing_status: billingOf(out),
      credits_charged: charged(out),
      request_id: requestIdOf(out, res),
      failure_reason: ok400
        ? null
        : okOther
          ? `error returned but status=${res.status} (clients often expect 400)`
          : `status=${res.status}`,
      verdict: ok400 ? "PASS" : okOther ? "WARN" : "FAIL",
    });
  }

  // client abort
  {
    const body = {
      model: "auto-fast",
      messages: [{ role: "user", content: "abort me slowly" }],
      stream: true,
      max_tokens: 64,
    };
    let aborted = false;
    let status = null;
    const ac = new AbortController();
    const pending = fetch(`${BASE}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    await new Promise((r) => setTimeout(r, 5));
    ac.abort();
    try {
      const res = await pending;
      status = res.status;
    } catch (err) {
      aborted =
        err?.name === "AbortError" ||
        err?.code === "ABORT_ERR" ||
        /aborted/i.test(String(err?.message ?? err));
    }
    pushCase({
      case_name: "client_abort",
      category: "openai",
      request_body: body,
      http_status: status,
      response_parse_ok: true,
      openai_shape_ok: null,
      cursor_likely_ok: aborted || status != null,
      billing_status: null,
      credits_charged: null,
      request_id: null,
      failure_reason: aborted
        ? null
        : status != null
          ? "abort raced; response completed before cancel (environment-dependent)"
          : "client abort did not surface",
      verdict: aborted ? "PASS" : "WARN",
      notes:
        "Client-side cancel; incomplete requests must remain not_billable server-side",
    });
  }

  // upstream timeout mock
  {
    const body = {
      model: "__tokfai_mock_upstream_timeout",
      messages: [{ role: "user", content: "timeout" }],
      stream: false,
    };
    const { res, body: out } = await chat(body);
    const ok =
      (LIVE
        ? res.status >= 400 || res.status === 200
        : res.status === 504 || res.status >= 400) &&
      (LIVE || (notBillableish(out) && charged(out) === 0));
    pushCase({
      case_name: "upstream_timeout",
      category: "openai",
      request_body: body,
      http_status: res.status,
      response_parse_ok: !out?._raw,
      openai_shape_ok: isOpenAiErrorShape(out) || LIVE,
      cursor_likely_ok: ok,
      billing_status: billingOf(out),
      credits_charged: charged(out),
      request_id: requestIdOf(out, res),
      failure_reason: ok
        ? null
        : `status=${res.status} code=${out?.error?.code} charged=${charged(out)}`,
      verdict: LIVE
        ? "WARN"
        : ok
          ? "PASS"
          : "FAIL",
      notes: LIVE
        ? "LIVE soft — mock timeout model not routed"
        : "offline mock upstream_timeout",
    });
  }

  // idempotency / retry duplicate
  {
    const idem = `p985-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const body = {
      model: "auto-fast",
      messages: [{ role: "user", content: "idempotency probe" }],
      stream: false,
      max_tokens: 8,
    };
    const first = await chat(body, { "Idempotency-Key": idem });
    const second = await chat(body, { "Idempotency-Key": idem });
    const rid1 = requestIdOf(first.body, first.res);
    const rid2 = requestIdOf(second.body, second.res);
    const ch1 = charged(first.body);
    const ch2 = charged(second.body);
    const sameId = rid1 && rid2 && rid1 === rid2;
    const noDouble =
      first.res.status === 200 &&
      second.res.status === 200 &&
      (sameId || (LIVE && ch2 === 0) || ch1 === ch2);
    pushCase({
      case_name: "retry_duplicate_idempotency",
      category: "openai",
      request_body: { ...body, _idempotency_key: idem },
      http_status: second.res.status,
      response_parse_ok: true,
      openai_shape_ok: isOpenAiChatShape(second.body),
      cursor_likely_ok: noDouble,
      billing_status: billingOf(second.body),
      credits_charged: ch2,
      request_id: rid2,
      failure_reason: noDouble
        ? sameId
          ? null
          : "200 replay but request_id differs (check billing carefully)"
        : `rid1=${rid1} rid2=${rid2} ch1=${ch1} ch2=${ch2}`,
      verdict: sameId ? "PASS" : noDouble ? "WARN" : "FAIL",
    });
  }

  // request_id + usage/credits consistency
  {
    const body = {
      model: "auto-fast",
      messages: [{ role: "user", content: "consistency" }],
      stream: false,
      max_tokens: 8,
    };
    const { res, body: out } = await chat(body);
    const rid = requestIdOf(out, res);
    const top = out?.request_id;
    const nested = out?.tokfai?.request_id;
    const chTop = out?.credits_charged;
    const chNest = out?.tokfai?.credits_charged;
    const idOk =
      rid &&
      (!top || String(top) === String(rid)) &&
      (!nested || String(nested) === String(rid));
    const creditOk =
      chTop == null ||
      chNest == null ||
      Number(chTop) === Number(chNest);
    pushCase({
      case_name: "request_id_and_credits_consistency",
      category: "openai",
      request_body: body,
      http_status: res.status,
      response_parse_ok: !out?._raw,
      openai_shape_ok: isOpenAiChatShape(out),
      cursor_likely_ok: idOk && creditOk,
      billing_status: billingOf(out),
      credits_charged: charged(out),
      request_id: rid,
      failure_reason:
        idOk && creditOk
          ? null
          : `idOk=${idOk} creditOk=${creditOk} top=${top} nest=${nested}`,
      verdict: idOk && creditOk ? "PASS" : "FAIL",
    });
  }

  // ─── Cursor scenarios ────────────────────────────────────────────
  const cursorPrompts = [
    [
      "cursor_readonly_project_dir",
      "List the project directory. Do not modify any files.",
      "read",
    ],
    [
      "cursor_read_file_explain",
      "Read apps/dmit-api/package.json and explain the scripts briefly. Do not modify files.",
      "read",
    ],
    [
      "cursor_summarize_git_diff",
      "Summarize git diff --stat. Do not modify files.",
      "read",
    ],
    [
      "cursor_forbid_modify",
      "You must NOT edit or write any files. Only answer: OK_NO_EDIT",
      "read",
    ],
    [
      "cursor_allow_small_file_edit",
      "You may edit a small markdown file if needed. Confirm policy: ALLOW_SMALL_EDIT",
      "write",
    ],
  ];

  for (const [name, prompt] of cursorPrompts) {
    const body = {
      model: "auto-fast",
      messages: [{ role: "user", content: prompt }],
      stream: false,
      max_tokens: 64,
      temperature: 0,
    };
    const { res, body: out } = await chat(body);
    const ok = res.status === 200 && isOpenAiChatShape(out);
    pushCase({
      case_name: name,
      category: "cursor",
      request_body: body,
      http_status: res.status,
      response_parse_ok: !out?._raw,
      openai_shape_ok: ok,
      cursor_likely_ok: ok,
      billing_status: billingOf(out),
      credits_charged: charged(out),
      request_id: requestIdOf(out, res),
      failure_reason: ok ? null : `status=${res.status}`,
      verdict: ok ? "PASS" : "FAIL",
      notes: "Chat-only simulation of Cursor instruction; tools not attached",
    });
  }

  {
    const body = {
      model: "gpt-5.5",
      messages: [
        {
          role: "user",
          content:
            "Read package.json using tools. You must call a tool.",
        },
      ],
      tools: CURSOR_TOOLS,
      tool_choice: "required",
      stream: false,
    };
    const { res, body: out } = await chat(body);
    const hasTc =
      Array.isArray(out?.choices?.[0]?.message?.tool_calls) &&
      out.choices[0].message.tool_calls.length > 0;
    const errOk = isOpenAiErrorShape(out) && notBillableish(out);
    pushCase({
      case_name: "cursor_forced_tool_call",
      category: "cursor",
      request_body: body,
      http_status: res.status,
      response_parse_ok: !out?._raw,
      openai_shape_ok: hasTc || errOk,
      cursor_likely_ok: hasTc,
      billing_status: billingOf(out),
      credits_charged: charged(out),
      request_id: requestIdOf(out, res),
      failure_reason: hasTc
        ? null
        : errOk
          ? `not_billable ${out.error.code} — Cursor agent tool loop may break on non-whitelist models`
          : "no tool_calls",
      verdict: hasTc ? "PASS" : errOk ? "WARN" : "FAIL",
    });
  }

  {
    const body = {
      model: "gpt-5.5",
      messages: [
        { role: "user", content: "Read README.md" },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_cursor_1",
              type: "function",
              function: {
                name: "read_file",
                arguments: '{"path":"README.md"}',
              },
            },
          ],
        },
        {
          role: "tool",
          tool_call_id: "call_cursor_1",
          content: "# Tokfai\nOpenAI-compatible API",
        },
      ],
      tools: CURSOR_TOOLS,
      stream: false,
      max_tokens: 64,
    };
    const { res, body: out } = await chat(body);
    const ok = res.status === 200 && isOpenAiChatShape(out);
    pushCase({
      case_name: "cursor_tool_result_second_turn",
      category: "cursor",
      request_body: body,
      http_status: res.status,
      response_parse_ok: !out?._raw,
      openai_shape_ok: ok || isOpenAiErrorShape(out),
      cursor_likely_ok: ok,
      billing_status: billingOf(out),
      credits_charged: charged(out),
      request_id: requestIdOf(out, res),
      failure_reason: ok ? null : `status=${res.status} code=${out?.error?.code}`,
      verdict: ok ? "PASS" : "WARN",
    });
  }

  {
    const body = {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "Use a tool in stream mode" }],
      tools: CURSOR_TOOLS,
      tool_choice: "required",
      stream: true,
    };
    const { res, text, body: out } = await chat(body);
    const sse = parseSseChat(text);
    const ok = res.status === 200 && sse.sawDone && sse.sawToolDelta;
    const soft =
      !ok &&
      (String(text).includes("not_billable") ||
        String(text).includes("model_not_tool_capable"));
    pushCase({
      case_name: "cursor_stream_tool_call",
      category: "cursor",
      request_body: body,
      http_status: res.status,
      response_parse_ok: sse.parseOk || Boolean(out),
      openai_shape_ok: ok || soft,
      cursor_likely_ok: ok,
      billing_status: billingOf(out),
      credits_charged: charged(out),
      request_id: requestIdOf(out, res),
      failure_reason: ok
        ? null
        : soft
          ? "graceful tool failure envelope on stream"
          : "missing tool_calls stream deltas",
      verdict: ok ? "PASS" : soft ? "WARN" : "FAIL",
    });
  }

  // Non-whitelist tools (Cursor often starts with auto-*)
  {
    const body = {
      model: "auto-fast",
      messages: [{ role: "user", content: "Call a tool" }],
      tools: CURSOR_TOOLS,
      tool_choice: "required",
      stream: false,
    };
    const { res, body: out } = await chat(body);
    const hasTc =
      Array.isArray(out?.choices?.[0]?.message?.tool_calls) &&
      out.choices[0].message.tool_calls.length > 0;
    const rejected =
      res.status >= 400 &&
      notBillableish(out) &&
      charged(out) === 0 &&
      isOpenAiErrorShape(out);
    pushCase({
      case_name: "cursor_tools_on_auto_fast",
      category: "cursor",
      request_body: body,
      http_status: res.status,
      response_parse_ok: !out?._raw,
      openai_shape_ok: hasTc || rejected,
      cursor_likely_ok: hasTc,
      billing_status: billingOf(out),
      credits_charged: charged(out),
      request_id: requestIdOf(out, res),
      failure_reason: hasTc
        ? null
        : rejected
          ? `auto-fast not tools-verified — code=${out.error.code} (Cursor agents may need gpt-5.5 / whitelist)`
          : "unexpected response",
      verdict: hasTc ? "PASS" : rejected ? "WARN" : "FAIL",
      notes: "Commercial boundary: do not promise tools on all aliases",
    });
  }
}

function notBillableish(body) {
  const c = charged(body);
  if (Number.isFinite(c) && c > 0) return false;
  const s = billingOf(body);
  if (s && s !== "not_billable") return false;
  return true;
}

function matrixFromCases() {
  /** @type {Record<Verdict, CaseRow[]>} */
  const buckets = { PASS: [], WARN: [], FAIL: [], BLOCKER: [] };
  for (const c of cases) {
    buckets[c.verdict]?.push(c);
  }
  return buckets;
}

function writeOutputs(LIVE) {
  mkdirSync(dirname(SUMMARY_PATH), { recursive: true });
  const buckets = matrixFromCases();
  const sourceNotes = staticSourceNotes();

  const summary = {
    marker: PASS_MARKER,
    live: LIVE,
    generated_at: new Date().toISOString(),
    counts: {
      total: cases.length,
      PASS: buckets.PASS.length,
      WARN: buckets.WARN.length,
      FAIL: buckets.FAIL.length,
      BLOCKER: buckets.BLOCKER.length,
    },
    cases,
    source_notes: sourceNotes,
  };
  writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2), "utf8");

  if (!WRITE_REPORT) {
    console.log(`\n(summary) ${SUMMARY_PATH}`);
    return;
  }

  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  const lines = [];
  lines.push("# P985 — OpenAI / Cursor Compatibility Gap Audit Report");
  lines.push("");
  lines.push(
    "> Audit only. **Does not claim fully compatible.** Marker means audit completed, not that all gaps are fixed."
  );
  lines.push("");
  lines.push(`## Result: **AUDIT COMPLETE**`);
  lines.push("");
  lines.push(`Marker: \`${PASS_MARKER}\``);
  lines.push("");
  lines.push(`Mode: ${LIVE ? "LIVE" : "offline mock"}`);
  lines.push(`Generated: ${summary.generated_at}`);
  lines.push("");
  lines.push("## Compatibility matrix summary");
  lines.push("");
  lines.push("| Verdict | Meaning | Count |");
  lines.push("|---|---|---|");
  lines.push(`| PASS | 可商用 | ${buckets.PASS.length} |`);
  lines.push(`| WARN | 可用但有边界 | ${buckets.WARN.length} |`);
  lines.push(`| FAIL | 必须修 | ${buckets.FAIL.length} |`);
  lines.push(`| BLOCKER | 商业前必须修 | ${buckets.BLOCKER.length} |`);
  lines.push("");
  lines.push("## Source notes (static)");
  lines.push("");
  for (const n of sourceNotes) lines.push(`- ${n}`);
  lines.push("");
  lines.push("## Case results");
  lines.push("");
  lines.push(
    "| case_name | verdict | http | parse | openai shape | cursor likely | billing | credits | request_id | failure reason |"
  );
  lines.push("|---|---|---|---|---|---|---|---|---|---|");
  for (const c of cases) {
    lines.push(
      `| \`${c.case_name}\` | ${c.verdict} | ${c.http_status ?? "—"} | ${c.response_parse_ok} | ${c.openai_shape_ok ?? "—"} | ${c.cursor_likely_ok ?? "—"} | ${c.billing_status ?? "—"} | ${c.credits_charged ?? "—"} | \`${String(c.request_id ?? "—").slice(0, 24)}\` | ${escapeMd(c.failure_reason ?? c.notes ?? "")} |`
    );
  }
  lines.push("");
  lines.push("## Case request bodies (abbreviated)");
  lines.push("");
  for (const c of cases) {
    lines.push(`### ${c.case_name} (\`${c.verdict}\`)`);
    lines.push("");
    lines.push("```json");
    lines.push(
      JSON.stringify(c.request_body, null, 2).slice(0, 1200)
    );
    lines.push("```");
    lines.push("");
  }
  lines.push("## Gap highlights for product");
  lines.push("");
  const highlights = cases.filter((c) =>
    ["WARN", "FAIL", "BLOCKER"].includes(c.verdict)
  );
  if (highlights.length === 0) {
    lines.push("- No WARN/FAIL/BLOCKER in this run.");
  } else {
    for (const c of highlights) {
      lines.push(
        `- **${c.verdict}** \`${c.case_name}\`: ${c.failure_reason ?? c.notes ?? ""}`
      );
    }
  }
  lines.push("");
  lines.push("## How to re-run");
  lines.push("");
  lines.push("```bash");
  lines.push("node scripts/p985-openai-cursor-compat-gap-smoke.mjs");
  lines.push(
    "# LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p985-openai-cursor-compat-gap-smoke.mjs"
  );
  lines.push("```");
  lines.push("");

  writeFileSync(REPORT_PATH, lines.join("\n"), "utf8");
  console.log(`\nWrote ${REPORT_PATH}`);
  console.log(`Wrote ${SUMMARY_PATH}`);
}

function escapeMd(s) {
  return String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

async function main() {
  // Offline tools paths need at least one verified model id.
  if (!process.env.VERIFIED_TOOLS_CAPABLE_MODEL_IDS) {
    process.env.VERIFIED_TOOLS_CAPABLE_MODEL_IDS = "gpt-5.5";
  }

  let ctx = null;
  let auditOk = true;
  try {
    recordHarness(
      "audit_script_present",
      existsSync(join(ROOT, SCRIPT)),
      SCRIPT
    );
    ctx = await bootstrapClientCompatSmoke(SCRIPT);
    console.log("=== P985 compatibility gap cases ===\n");
    await runAudit(ctx);
    recordHarness(
      "cases_executed",
      cases.length >= 20,
      `cases=${cases.length}`
    );
    writeOutputs(Boolean(ctx.LIVE));
    recordHarness(
      "report_written",
      !WRITE_REPORT || existsSync(REPORT_PATH),
      REPORT_PATH
    );
  } catch (err) {
    auditOk = false;
    const message = err instanceof Error ? err.message : String(err);
    recordHarness("audit_runtime", false, message);
  } finally {
    ctx?.cleanup?.();
  }

  const hardFail = harness.some((r) => !r.ok && !r.soft);
  auditOk = auditOk && !hardFail;

  console.log("");
  const buckets = matrixFromCases();
  console.log(
    `Matrix: PASS=${buckets.PASS.length} WARN=${buckets.WARN.length} FAIL=${buckets.FAIL.length} BLOCKER=${buckets.BLOCKER.length}`
  );
  console.log(
    "(Audit marker reflects harness completion, not zero-gap compatibility.)"
  );
  console.log("");

  if (auditOk) {
    console.log(PASS_MARKER);
    process.exit(0);
  }
  console.error(FAIL_MARKER);
  process.exit(1);
}

main();
