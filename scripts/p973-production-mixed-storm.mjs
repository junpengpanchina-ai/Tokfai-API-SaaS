#!/usr/bin/env node
/**
 * P973 — Production mixed storm / Cursor-compatible adversarial acceptance.
 *
 * SAFE default (offline mock): small mixed matrix — no new product features.
 * LIVE=1: production acceptance against api.tokfai.com.
 *
 * Default counts (SAFE):
 *   chat non-stream 50 | chat stream 20 | tool non-stream 10 | tool stream 10
 *   invalid/negative 10
 *
 * Env:
 *   LIVE=1
 *   BASE=https://api.tokfai.com/v1   (or TOKFAI_API_BASE)
 *   TOKFAI_API_KEY
 *   CHAT_COUNT / STREAM_COUNT / TOOL_COUNT / NEGATIVE_COUNT / CONCURRENCY
 *   CHAT_MODEL / WRITE_REPORT=1 / SKIP_PRIOR=1 / SKIP_PM2=1
 *
 * Outputs:
 *   tmp/p973-production-mixed-storm-summary.json
 *   docs/p973-production-mixed-storm-report.md (WRITE_REPORT=1 or PASS)
 *
 * Markers:
 *   TOKFAI_P973_PRODUCTION_MIXED_STORM_PASS
 *   TOKFAI_P973_PRODUCTION_MIXED_STORM_FAIL
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bootstrapClientCompatSmoke,
  pass,
  fail,
} from "./lib/client-compat-smoke-bootstrap.mjs";
import { runPool } from "./lib/image-concurrency-load.mjs";
import {
  UPSTREAM_DEGRADED_CODES,
  extractCredits,
  maskApiKey,
} from "./lib/public-beta-live-helpers.mjs";
import { assertNoErrorLeak } from "./lib/client-compat-matrix.mjs";
import { isLiveMode } from "./lib/acceptance-config.mjs";

const SCRIPT = "scripts/p973-production-mixed-storm.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS_MARKER = "TOKFAI_P973_PRODUCTION_MIXED_STORM_PASS";
const FAIL_MARKER = "TOKFAI_P973_PRODUCTION_MIXED_STORM_FAIL";

const WRITE_REPORT =
  process.env.WRITE_REPORT === "1" || process.env.WRITE_REPORT === "true";
const SKIP_PRIOR =
  process.env.SKIP_PRIOR === "1" || process.env.SKIP_PRIOR === "true";
const SKIP_PM2 =
  process.env.SKIP_PM2 === "1" || process.env.SKIP_PM2 === "true";

const REPORT_PATH = join(
  ROOT,
  process.env.REPORT_PATH ?? "docs/p973-production-mixed-storm-report.md"
);
const SUMMARY_PATH = join(
  ROOT,
  process.env.SUMMARY_PATH ?? "tmp/p973-production-mixed-storm-summary.json"
);

const CHAT_COUNT = Math.max(
  1,
  parseInt(process.env.CHAT_COUNT ?? "50", 10) || 50
);
const STREAM_COUNT = Math.max(
  1,
  parseInt(process.env.STREAM_COUNT ?? "20", 10) || 20
);
const TOOL_COUNT = Math.max(
  1,
  parseInt(process.env.TOOL_COUNT ?? "10", 10) || 10
);
const NEGATIVE_COUNT = Math.max(
  1,
  parseInt(process.env.NEGATIVE_COUNT ?? "10", 10) || 10
);
const CONCURRENCY = Math.max(
  1,
  parseInt(process.env.CONCURRENCY ?? "5", 10) || 5
);
const CHAT_MODEL = (process.env.CHAT_MODEL ?? "auto-fast").trim();
const TOOL_MODEL = (process.env.TOOL_MODEL ?? "auto-pro").trim();
const TIMEOUT_MS = Math.max(
  5_000,
  parseInt(process.env.CHAT_TIMEOUT_MS ?? "120000", 10) || 120_000
);
// Bootstrap client-compat smoke reads CHAT_TIMEOUT_MS for acceptanceFetch.
process.env.CHAT_TIMEOUT_MS = String(TIMEOUT_MS);

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

const ALLOWED_TOOL_FAIL_HTTP = new Set([400, 422, 502, 503]);
const TOOL_FAIL_CODES = new Set([
  "tool_call_not_generated",
  "provider_tool_call_not_supported",
]);

const BILLING_DIRTY = [
  "bad_billing",
  "charged_missing_url",
  "provider_success_unpaid",
  "stale_timeout_pending",
];

const PM2_DIRTY = [
  "Cannot set headers",
  "api_error_500",
  "ENOMEM",
  "uncaught",
  "TypeError",
  "heap out",
  "bad_billing",
  "charged_missing_url",
  "provider_success_unpaid",
];

/** @type {{ id: string, ok: boolean, soft?: boolean, detail?: string }[]} */
const checks = [];
/** @type {object[]} */
const rows = [];

function record(id, ok, detail, soft = false) {
  checks.push({
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

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function charged(body) {
  const c = extractCredits(body);
  return c == null ? 0 : c;
}

function notBillable(body) {
  const c = charged(body);
  if (Number.isFinite(c) && c > 0) return false;
  const status = body?.tokfai?.billing_status;
  if (status && status !== "not_billable") return false;
  return true;
}

function hasContent(body) {
  const content = body?.choices?.[0]?.message?.content;
  return typeof content === "string" && content.trim().length > 0;
}

function hasToolCalls(body) {
  const tc = body?.choices?.[0]?.message?.tool_calls;
  return Array.isArray(tc) && tc.length > 0;
}

function hasUsage(body) {
  const u = body?.usage;
  if (!u || typeof u !== "object") return false;
  const total = Number(u.total_tokens);
  return Number.isFinite(total) && total >= 0;
}

function parseSse(text) {
  const lines = String(text ?? "").split("\n");
  let sawDone = false;
  let errorObj = null;
  let sawRoleOrDelta = false;
  let sawToolDelta = false;
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
      const delta = obj?.choices?.[0]?.delta;
      if (delta && typeof delta === "object") {
        sawRoleOrDelta = true;
        if (Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0) {
          sawToolDelta = true;
        }
      }
    } catch {
      // ignore
    }
  }
  return { sawDone, errorObj, sawRoleOrDelta, sawToolDelta };
}

function looksHtml(text, contentType) {
  const ct = String(contentType ?? "");
  if (/html/i.test(ct)) return true;
  return /^\s*</.test(String(text ?? ""));
}

function softDegraded(code, LIVE) {
  return LIVE && typeof code === "string" && UPSTREAM_DEGRADED_CODES.has(code);
}

function staticChecks() {
  console.log("=== static prior surface ===\n");
  const priors = [
    ["p954", "scripts/p954-image-provider-routing-isolation-smoke.mjs", "TOKFAI_P954"],
    ["p961", "scripts/p961-image-cost-reconciliation-smoke.mjs", "TOKFAI_P961"],
    ["p970", "scripts/p970-cursor-tool-call-smoke.mjs", "TOKFAI_P970"],
    ["p971", "scripts/p971-fake-tool-call-guard-smoke.mjs", "TOKFAI_P971"],
    ["p972", "scripts/p972-forced-tool-failure-envelope-smoke.mjs", "TOKFAI_P972"],
  ];
  for (const [id, rel, marker] of priors) {
    const src = read(rel);
    record(`static_${id}_present`, src.includes(marker), rel);
  }
  const exec = read("apps/dmit-api/src/lib/executeChatCompletion.ts");
  const envelope = read("apps/dmit-api/src/lib/toolCallFailureEnvelope.ts");
  record(
    "static_p971_p972_guards",
    exec.includes("fake_tool_call_guard_triggered") &&
      envelope.includes("forcedToolFailureToSseBody"),
    "billing guard + graceful envelope present"
  );
}

/**
 * @param {{ postJson: Function, getJson?: Function, LIVE: boolean }} ctx
 */
async function runStorm(ctx) {
  const { postJson, LIVE } = ctx;
  console.log("\n=== mixed storm waves ===\n");
  console.log(
    JSON.stringify({
      LIVE,
      CHAT_COUNT,
      STREAM_COUNT,
      TOOL_COUNT,
      NEGATIVE_COUNT,
      CONCURRENCY,
      CHAT_MODEL,
      TOOL_MODEL,
      TIMEOUT_MS,
    })
  );

  // 1) Ordinary non-stream chat
  {
    const items = Array.from({ length: CHAT_COUNT }, (_, i) => i);
    const batch = await runPool(items, CONCURRENCY, async (i) => {
      const started = Date.now();
      const { res, body, text } = await postJson("/v1/chat/completions", {
        model: CHAT_MODEL,
        messages: [
          {
            role: "user",
            content: `P973 chat #${i}. Reply with OK only.`,
          },
        ],
        max_tokens: 16,
        stream: false,
      });
      const code = body?.error?.code ?? null;
      const raw = typeof text === "string" ? text : JSON.stringify(body ?? {});
      let jqOk = true;
      try {
        if (typeof text === "string" && text.trim()) JSON.parse(text);
      } catch {
        jqOk = false;
      }
      const ok =
        res.status === 200 &&
        jqOk &&
        hasContent(body) &&
        hasUsage(body) &&
        Number.isFinite(charged(body)) &&
        charged(body) >= 0 &&
        !looksHtml(raw, res.headers?.get?.("content-type"));
      const soft =
        !ok &&
        softDegraded(code, LIVE) &&
        notBillable(body);
      rows.push({
        wave: "chat_nonstream",
        i,
        ok: ok || soft,
        soft,
        http: res.status,
        code,
        credits: charged(body),
        latencyMs: Date.now() - started,
      });
      return { ok, soft, code, http: res.status, credits: charged(body) };
    });
    const hardFail = batch.filter((r) => !r.ok && !r.soft).length;
    const softN = batch.filter((r) => r.soft).length;
    const okN = batch.filter((r) => r.ok).length;
    record(
      "wave_chat_nonstream",
      hardFail === 0,
      `ok=${okN}/${CHAT_COUNT} soft=${softN} fail=${hardFail}`,
      softN > 0 && hardFail === 0
    );
  }

  // 2) Ordinary stream chat
  {
    const items = Array.from({ length: STREAM_COUNT }, (_, i) => i);
    const batch = await runPool(items, CONCURRENCY, async (i) => {
      const started = Date.now();
      const { res, body, text } = await postJson("/v1/chat/completions", {
        model: CHAT_MODEL,
        messages: [
          { role: "user", content: `P973 stream #${i}. Say hi.` },
        ],
        max_tokens: 16,
        stream: true,
      });
      const raw = typeof text === "string" ? text : "";
      const parsed = parseSse(raw);
      const code = parsed.errorObj?.error?.code ?? body?.error?.code ?? null;
      const ok =
        res.status === 200 &&
        raw.includes("data:") &&
        parsed.sawDone &&
        !parsed.errorObj;
      const soft =
        !ok &&
        ((parsed.errorObj &&
          notBillable(parsed.errorObj) &&
          softDegraded(code, LIVE)) ||
          softDegraded(code, LIVE));
      rows.push({
        wave: "chat_stream",
        i,
        ok: ok || soft,
        soft,
        http: res.status,
        code,
        credits: charged(parsed.errorObj ?? body),
        latencyMs: Date.now() - started,
        sawDone: parsed.sawDone,
      });
      return { ok, soft, code };
    });
    const hardFail = batch.filter((r) => !r.ok && !r.soft).length;
    const softN = batch.filter((r) => r.soft).length;
    record(
      "wave_chat_stream",
      hardFail === 0,
      `ok=${batch.filter((r) => r.ok).length}/${STREAM_COUNT} soft=${softN} fail=${hardFail}`,
      softN > 0 && hardFail === 0
    );
  }

  // 3) tool_choice:auto — content or tool_calls OK; no fake overcharge on empty
  {
    const items = Array.from({ length: TOOL_COUNT }, (_, i) => i);
    const batch = await runPool(items, CONCURRENCY, async (i) => {
      const started = Date.now();
      const { res, body, text } = await postJson("/v1/chat/completions", {
        model: TOOL_MODEL,
        messages: [
          {
            role: "user",
            content:
              i % 2 === 0
                ? "What is the weather in Shanghai?"
                : "TOKFAI_AUTO_NO_TOOL answer briefly.",
          },
        ],
        tools: TOOLS,
        tool_choice: "auto",
        stream: false,
      });
      const code = body?.error?.code ?? null;
      const raw = typeof text === "string" ? text : JSON.stringify(body ?? {});
      let jqOk = true;
      try {
        if (typeof text === "string" && text.trim()) JSON.parse(text);
      } catch {
        jqOk = false;
      }

      let ok = false;
      let soft = false;
      if (res.status === 200 && jqOk) {
        const tools = hasToolCalls(body);
        const content = hasContent(body);
        const c = charged(body);
        // Fake billing: charged > 0 with neither content nor tool_calls
        if (c > 0 && !tools && !content) {
          ok = false;
        } else if (tools || content) {
          ok = true;
        } else if (body?.tokfai?.auto_no_tool_call === true && c >= 0) {
          ok = true;
        }
      } else if (
        TOOL_FAIL_CODES.has(code) &&
        notBillable(body) &&
        ALLOWED_TOOL_FAIL_HTTP.has(res.status)
      ) {
        // Unexpected for auto but still safe billing
        soft = true;
        ok = true;
      } else if (softDegraded(code, LIVE) && notBillable(body)) {
        soft = true;
        ok = true;
      }

      rows.push({
        wave: "tool_auto",
        i,
        ok,
        soft,
        http: res.status,
        code,
        credits: charged(body),
        latencyMs: Date.now() - started,
        toolCalls: hasToolCalls(body),
        autoNoTool: body?.tokfai?.auto_no_tool_call === true,
      });
      assertNoErrorLeak(raw.slice(0, 2000));
      return { ok, soft };
    });
    const hardFail = batch.filter((r) => !r.ok).length;
    record(
      "wave_tool_auto",
      hardFail === 0,
      `ok=${batch.filter((r) => r.ok).length}/${TOOL_COUNT} fail=${hardFail}`
    );
  }

  // 4a) tool forced non-stream — billable tool_calls OR graceful not_billable JSON
  {
    const items = Array.from({ length: TOOL_COUNT }, (_, i) => i);
    const batch = await runPool(items, CONCURRENCY, async (i) => {
      const started = Date.now();
      const forceFake = i % 3 === 0; // mix real force + fake guard
      const { res, body, text } = await postJson("/v1/chat/completions", {
        model: TOOL_MODEL,
        messages: [
          {
            role: "user",
            content: forceFake
              ? "TOKFAI_FAKE_TOOL_CALL forced"
              : "What is the weather in Shanghai? Use the tool.",
          },
        ],
        tools: TOOLS,
        tool_choice: i % 2 === 0 ? "required" : FORCED_CHOICE,
        stream: false,
      });
      const raw = typeof text === "string" ? text : JSON.stringify(body ?? {});
      let jqOk = true;
      try {
        if (typeof text === "string" && text.trim()) JSON.parse(text);
        else if (!body) jqOk = false;
      } catch {
        jqOk = false;
      }
      const code = body?.error?.code ?? null;
      const html = looksHtml(raw, res.headers?.get?.("content-type"));
      const is504 = res.status === 504;

      let ok = false;
      let soft = false;
      if (
        res.status === 200 &&
        jqOk &&
        hasToolCalls(body) &&
        charged(body) >= 0 &&
        !html
      ) {
        ok = true;
      } else if (
        jqOk &&
        !html &&
        !is504 &&
        ALLOWED_TOOL_FAIL_HTTP.has(res.status) &&
        TOOL_FAIL_CODES.has(code) &&
        notBillable(body) &&
        charged(body) === 0
      ) {
        ok = true;
      } else if (softDegraded(code, LIVE) && notBillable(body)) {
        soft = true;
        ok = true;
      } else if (
        LIVE &&
        forceFake &&
        res.status === 200 &&
        hasToolCalls(body)
      ) {
        soft = true;
        ok = true;
      }

      rows.push({
        wave: "tool_forced_nonstream",
        i,
        ok,
        soft,
        http: res.status,
        code,
        credits: charged(body),
        latencyMs: Date.now() - started,
        jqOk,
        forceFake,
      });
      return { ok, soft, jqOk, is504, html };
    });
    const hardFail = batch.filter((r) => !r.ok).length;
    const jqFails = batch.filter((r) => r.jqOk === false).length;
    const html504 = batch.filter((r) => r.is504 || r.html).length;
    record(
      "wave_tool_forced_nonstream",
      hardFail === 0 && jqFails === 0 && html504 === 0,
      `ok=${batch.filter((r) => r.ok).length}/${TOOL_COUNT} jqFail=${jqFails} html504=${html504}`
    );
  }

  // 4b) tool forced stream — tool_calls SSE OR error SSE + DONE, not_billable on fail
  {
    const items = Array.from({ length: TOOL_COUNT }, (_, i) => i);
    const batch = await runPool(items, CONCURRENCY, async (i) => {
      const started = Date.now();
      const forceFake = i % 3 === 0;
      const { res, body, text } = await postJson("/v1/chat/completions", {
        model: TOOL_MODEL,
        messages: [
          {
            role: "user",
            content: forceFake
              ? "TOKFAI_FAKE_TOOL_CALL stream forced"
              : "What is the weather in Shanghai? Use the tool.",
          },
        ],
        tools: TOOLS,
        tool_choice: "required",
        stream: true,
      });
      const raw = typeof text === "string" ? text : "";
      const parsed = parseSse(raw);
      const errBody = parsed.errorObj;
      const code = errBody?.error?.code ?? body?.error?.code ?? null;

      let ok = false;
      let soft = false;
      if (
        res.status === 200 &&
        parsed.sawDone &&
        (parsed.sawToolDelta || raw.includes("tool_calls")) &&
        !errBody
      ) {
        ok = true;
      } else if (
        errBody &&
        parsed.sawDone &&
        TOOL_FAIL_CODES.has(code) &&
        notBillable(errBody) &&
        charged(errBody) === 0
      ) {
        ok = true;
      } else if (softDegraded(code, LIVE) && notBillable(errBody ?? body)) {
        soft = true;
        ok = true;
      } else if (LIVE && forceFake && parsed.sawToolDelta && parsed.sawDone) {
        soft = true;
        ok = true;
      }

      rows.push({
        wave: "tool_forced_stream",
        i,
        ok,
        soft,
        http: res.status,
        code,
        credits: charged(errBody ?? body),
        latencyMs: Date.now() - started,
        sawDone: parsed.sawDone,
        hasErr: !!errBody,
      });
      return { ok, soft };
    });
    const hardFail = batch.filter((r) => !r.ok).length;
    record(
      "wave_tool_forced_stream",
      hardFail === 0,
      `ok=${batch.filter((r) => r.ok).length}/${TOOL_COUNT} fail=${hardFail}`
    );
  }

  // 5–8) negative / isolation / timeout-shaped probes (cycled)
  {
    const probes = [
      {
        id: "invalid_model",
        path: "/v1/chat/completions",
        body: {
          model: "definitely-not-a-real-model-xyz",
          messages: [{ role: "user", content: "hi" }],
          stream: false,
        },
        expect: (res, body) => {
          const code = body?.error?.code;
          const type = body?.error?.type;
          return (
            res.status >= 400 &&
            notBillable(body) &&
            charged(body) === 0 &&
            (code === "model_not_available" ||
              code === "invalid_request_error" ||
              type === "validation_error" ||
              type === "invalid_request_error")
          );
        },
      },
      {
        id: "image_model_on_chat",
        path: "/v1/chat/completions",
        body: {
          model: "nano-banana",
          messages: [{ role: "user", content: "draw a cat" }],
          stream: false,
        },
        expect: (res, body) =>
          res.status === 400 &&
          body?.error?.code === "image_model_not_for_chat" &&
          notBillable(body),
      },
      {
        id: "text_model_on_image",
        path: "/v1/images/generations",
        body: {
          model: "auto-fast",
          prompt: "a red circle",
          n: 1,
        },
        expect: (res, body) =>
          res.status >= 400 &&
          body?.error?.code === "model_not_image_capable" &&
          notBillable(body) &&
          charged(body) === 0,
      },
      {
        id: "tools_invalid_model",
        path: "/v1/chat/completions",
        body: {
          model: "no-such-model-p973",
          messages: [{ role: "user", content: "hi" }],
          tools: TOOLS,
          tool_choice: "required",
          stream: false,
        },
        expect: (res, body) =>
          res.status >= 400 && notBillable(body) && charged(body) === 0,
      },
      {
        id: "upstream_timeout_not_billable",
        path: "/v1/chat/completions",
        body: {
          // Offline mock trigger; LIVE → soft if model_not_available
          model: "__tokfai_mock_upstream_timeout",
          messages: [{ role: "user", content: "hi" }],
          stream: false,
        },
        expect: (res, body, LIVE) => {
          const code = body?.error?.code;
          if (
            (code === "upstream_timeout" ||
              code === "all_upstreams_unavailable") &&
            notBillable(body) &&
            charged(body) === 0
          ) {
            return true;
          }
          if (
            LIVE &&
            (code === "model_not_available" ||
              code === "invalid_request_error") &&
            notBillable(body)
          ) {
            return "soft";
          }
          return false;
        },
      },
    ];

    const items = Array.from({ length: NEGATIVE_COUNT }, (_, i) => i);
    const batch = await runPool(items, Math.min(CONCURRENCY, 4), async (i) => {
      const probe = probes[i % probes.length];
      const started = Date.now();
      const { res, body, text } = await postJson(probe.path, probe.body);
      const raw = typeof text === "string" ? text : JSON.stringify(body ?? {});
      const code = body?.error?.code ?? null;
      let ok = false;
      let soft = false;
      try {
        const result = probe.expect(res, body, LIVE);
        if (result === "soft") {
          soft = true;
          ok = true;
        } else {
          ok = result === true;
        }
      } catch {
        ok = false;
      }
      if (!ok && softDegraded(code, LIVE) && notBillable(body)) {
        soft = true;
        ok = true;
      }
      rows.push({
        wave: "negative",
        probe: probe.id,
        i,
        ok,
        soft,
        http: res.status,
        code,
        credits: charged(body),
        latencyMs: Date.now() - started,
      });
      assertNoErrorLeak(raw.slice(0, 1500));
      return { ok, soft, probe: probe.id, code };
    });
    const hardFail = batch.filter((r) => !r.ok).length;
    record(
      "wave_negative_routes",
      hardFail === 0,
      `ok=${batch.filter((r) => r.ok).length}/${NEGATIVE_COUNT} fail=${hardFail}`
    );
  }
}

function billingAuditFromRows() {
  console.log("\n=== billing audit (response-level) ===\n");
  const failures = rows.filter((r) => {
    const failedHttp = typeof r.http === "number" && r.http >= 400;
    const hasErr = typeof r.code === "string" && r.code;
    return failedHttp || hasErr;
  });
  const chargedFailures = failures.filter(
    (r) => Number.isFinite(r.credits) && r.credits > 0
  );
  record(
    "billing_failures_credits_zero",
    chargedFailures.length === 0,
    chargedFailures.length
      ? `charged_failures=${chargedFailures.length} sample=${JSON.stringify(chargedFailures[0]).slice(0, 160)}`
      : `failures_checked=${failures.length}`
  );

  // Response bodies never carry orphan image dirty markers in chat storm.
  const joined = JSON.stringify(rows);
  const dirtyHits = BILLING_DIRTY.filter((k) => joined.includes(k));
  record(
    "billing_no_orphan_markers_in_results",
    dirtyHits.length === 0,
    dirtyHits.length ? dirtyHits.join(",") : "clean"
  );

  const success = rows.filter(
    (r) =>
      r.ok &&
      r.http === 200 &&
      (r.wave === "chat_nonstream" ||
        (r.wave === "tool_auto" && !r.code) ||
        (r.wave === "tool_forced_nonstream" && !r.code))
  );
  const inconsistent = success.filter(
    (r) => !Number.isFinite(r.credits) || r.credits < 0
  );
  record(
    "billing_success_credits_consistent",
    inconsistent.length === 0,
    `success_rows=${success.length} bad=${inconsistent.length}`
  );
}

function collectPm2() {
  if (SKIP_PM2) {
    return { available: false, skipped: true, statusText: "SKIP_PM2=1", logsText: "", dirty: [] };
  }
  const which = spawnSync("bash", ["-lc", "command -v pm2 || true"], {
    encoding: "utf8",
  });
  if (!which.stdout?.trim()) {
    return {
      available: false,
      skipped: false,
      statusText: "pm2: not installed / not in PATH",
      logsText: "",
      dirty: [],
    };
  }
  const app = process.env.TOKFAI_PM2_APP ?? process.env.PM2_APP_NAME ?? "";
  const status = spawnSync("pm2", ["status"], { encoding: "utf8" });
  const logArgs = app
    ? ["logs", app, "--lines", "800", "--nostream", "--err", "--raw"]
    : ["logs", "--lines", "800", "--nostream", "--err", "--raw"];
  const logs = spawnSync("pm2", logArgs, { encoding: "utf8", timeout: 30_000 });
  const statusText = `${status.stdout ?? ""}\n${status.stderr ?? ""}`.trim();
  const logsText = `${logs.stdout ?? ""}\n${logs.stderr ?? ""}`;
  const dirty = PM2_DIRTY.filter((p) => logsText.includes(p));
  const online = /online/i.test(statusText);
  return {
    available: true,
    skipped: false,
    statusText: statusText.slice(0, 4000),
    logsText: logsText.slice(-8000),
    dirty,
    online,
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
    record(
      "pm2_status",
      true,
      "no online process (soft offline)",
      true
    );
  }
  record(
    "pm2_dirty_logs",
    pm2.dirty.length === 0,
    pm2.dirty.length ? pm2.dirty.join(",") : "clean"
  );
}

function runPriorSmokes() {
  if (SKIP_PRIOR) {
    record("prior_smokes", true, "SKIP_PRIOR=1", true);
    return;
  }
  console.log("\n=== prior smoke regression ===\n");
  for (const script of [
    // Umbrella: p972 already regresses p971/p970/p954/p961 offline.
    "scripts/p972-forced-tool-failure-envelope-smoke.mjs",
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

function summarize() {
  const byWave = {};
  for (const r of rows) {
    const w = r.wave ?? "unknown";
    byWave[w] = byWave[w] ?? { n: 0, ok: 0, soft: 0, fail: 0 };
    byWave[w].n += 1;
    if (r.ok && r.soft) byWave[w].soft += 1;
    else if (r.ok) byWave[w].ok += 1;
    else byWave[w].fail += 1;
  }
  const lat = rows
    .map((r) => r.latencyMs)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  const p = (q) =>
    lat.length
      ? lat[Math.min(lat.length - 1, Math.max(0, Math.ceil((q / 100) * lat.length) - 1))]
      : null;
  return {
    byWave,
    latency: {
      n: lat.length,
      min: lat[0] ?? null,
      p50: p(50),
      p95: p(95),
      max: lat[lat.length - 1] ?? null,
    },
  };
}

function writeOutputs(marker, pm2, LIVE, baseHint) {
  const summary = {
    marker,
    LIVE,
    base: baseHint,
    counts: {
      CHAT_COUNT,
      STREAM_COUNT,
      TOOL_COUNT,
      NEGATIVE_COUNT,
      CONCURRENCY,
    },
    models: { CHAT_MODEL, TOOL_MODEL },
    checks,
    waves: summarize(),
    row_count: rows.length,
    pm2: {
      available: pm2.available,
      online: pm2.online ?? null,
      dirty: pm2.dirty ?? [],
      skipped: pm2.skipped ?? false,
    },
    at: new Date().toISOString(),
  };

  mkdirSync(dirname(SUMMARY_PATH), { recursive: true });
  writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2), "utf8");
  console.log(`\nsummary: ${SUMMARY_PATH}`);

  if (WRITE_REPORT || marker === PASS_MARKER) {
    const lines = [];
    lines.push("# P973 Production Mixed Storm Report");
    lines.push("");
    lines.push(`> 日期：${new Date().toISOString().slice(0, 10)}`);
    lines.push(
      "> 范围：生产混合风暴 / Cursor-compatible adversarial acceptance（无新功能）"
    );
    lines.push(
      "> 约束：不破坏 P954/P961/P970/P971/P972；不打印 API Key 明文"
    );
    lines.push("");
    lines.push("## 最终结论");
    lines.push("");
    lines.push("```");
    lines.push(marker);
    lines.push("```");
    lines.push("");
    lines.push("## 配置");
    lines.push("");
    lines.push(`- LIVE: \`${LIVE}\``);
    lines.push(`- base: \`${baseHint}\``);
    lines.push(
      `- counts: chat=${CHAT_COUNT} stream=${STREAM_COUNT} tool=${TOOL_COUNT} negative=${NEGATIVE_COUNT} concurrency=${CONCURRENCY}`
    );
    lines.push(`- models: chat=\`${CHAT_MODEL}\` tool=\`${TOOL_MODEL}\``);
    lines.push("");
    lines.push("## 波次汇总");
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify(summary.waves, null, 2));
    lines.push("```");
    lines.push("");
    lines.push("## 检查结果");
    lines.push("");
    for (const c of checks) {
      const tag = !c.ok ? "FAIL" : c.soft ? "SOFT" : "PASS";
      lines.push(
        `- **${tag}** \`${c.id}\`${c.detail ? ` — ${c.detail}` : ""}`
      );
    }
    lines.push("");
    lines.push("## PM2");
    lines.push("");
    if (!pm2.available) {
      lines.push(pm2.skipped ? "- skipped (`SKIP_PM2=1`)" : "- unavailable");
    } else {
      lines.push(`- online: ${pm2.online ? "yes" : "no"}`);
      lines.push(
        `- dirty: ${pm2.dirty?.length ? pm2.dirty.join(", ") : "none"}`
      );
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
    console.log(`report: ${REPORT_PATH}`);
  }
}

async function main() {
  staticChecks();

  // Support BASE= as alias for TOKFAI_API_BASE (LIVE).
  if (process.env.BASE && !process.env.TOKFAI_API_BASE) {
    process.env.TOKFAI_API_BASE = process.env.BASE;
  }

  const LIVE = isLiveMode();
  const ctx = await bootstrapClientCompatSmoke(SCRIPT);

  console.log(
    `\nkey: ${maskApiKey(ctx.API_KEY)} base: ${ctx.BASE} LIVE=${LIVE}\n`
  );

  try {
    await runStorm({ postJson: ctx.postJson, LIVE, BASE: ctx.BASE });
    billingAuditFromRows();
    const pm2 = collectPm2();
    pm2Checks(pm2, LIVE);
  } finally {
    ctx.cleanup();
  }

  // Prior smokes start their own mock after we release the port.
  runPriorSmokes();

  const hardFails = checks.filter((c) => !c.ok);
  const marker = hardFails.length === 0 ? PASS_MARKER : FAIL_MARKER;
  const pm2 = collectPm2();
  writeOutputs(marker, pm2, LIVE, ctx.BASE);

  if (hardFails.length) {
    console.error("\nFAIL reasons:");
    for (const f of hardFails) {
      console.error(`  - ${f.id}: ${f.detail ?? ""}`);
    }
  }

  console.log("");
  console.log(marker);
  if (hardFails.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err?.message ?? err);
  try {
    mkdirSync(dirname(SUMMARY_PATH), { recursive: true });
    writeFileSync(
      SUMMARY_PATH,
      JSON.stringify(
        {
          marker: FAIL_MARKER,
          error: String(err?.message ?? err),
          at: new Date().toISOString(),
        },
        null,
        2
      ),
      "utf8"
    );
  } catch {
    // ignore
  }
  console.log(FAIL_MARKER);
  process.exitCode = 1;
});
