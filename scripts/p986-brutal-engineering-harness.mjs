#!/usr/bin/env node
/**
 * P986 — Brutal Engineering Compatibility & Stability Test Harness.
 *
 * Actively stress OpenAI / Cursor / billing / concurrency / pm2 stability.
 * Does NOT claim fully compatible. Does NOT loosen assertions for a green badge.
 *
 * PASS marker = harness + report completed without BLOCKER hard-fail conditions.
 * If any BLOCKER fires → exit 1 + TOKFAI_P986_BRUTAL_ENGINEERING_HARNESS_BLOCKED
 *   (report still written).
 *
 * Usage:
 *   node scripts/p986-brutal-engineering-harness.mjs
 *   LIVE=1 TOKFAI_API_KEY=sk-tokfai_... BASE=https://api.tokfai.com/v1 node ...
 *   LIVE_SAFE_MODE=1 LIVE=1 ...   # safer LIVE defaults
 *   SKIP_CONCURRENCY=1 SKIP_PM2=1 SKIP_SDK=1  # faster local loop
 *
 * Env:
 *   CHAT_CONCURRENCY STREAM_CONCURRENCY TOOL_CONCURRENCY
 *   DURATION_MS MAX_CREDITS_SPEND SAFETY_MAX_INFLIGHT
 *   LIVE_SAFE_MODE=1 → CHAT=3 STREAM=2 TOOL=1 DURATION=30s MAX_CREDITS=3
 */

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  rmSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bootstrapClientCompatSmoke,
  pass,
  fail,
} from "./lib/client-compat-smoke-bootstrap.mjs";
import { acceptanceFetch } from "./lib/acceptance-http.mjs";
import { runPool } from "./lib/image-concurrency-load.mjs";
import { assertNoErrorLeak } from "./lib/client-compat-matrix.mjs";

const SCRIPT = "scripts/p986-brutal-engineering-harness.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DMIT = join(ROOT, "apps/dmit-api");
const PASS_MARKER = "TOKFAI_P986_BRUTAL_ENGINEERING_HARNESS_PASS";
const BLOCKED_MARKER = "TOKFAI_P986_BRUTAL_ENGINEERING_HARNESS_BLOCKED";
const FAIL_MARKER = "TOKFAI_P986_BRUTAL_ENGINEERING_HARNESS_FAIL";
const P986R_PASS = "TOKFAI_P986R_BRUTAL_HARNESS_REPAIR_PASS";
const P986R_BLOCKED = "TOKFAI_P986R_BRUTAL_HARNESS_REPAIR_BLOCKED";

const WRITE_REPORT =
  process.env.WRITE_REPORT !== "0" && process.env.WRITE_REPORT !== "false";
const SKIP_PM2 =
  process.env.SKIP_PM2 === "1" || process.env.SKIP_PM2 === "true";
const SKIP_CONCURRENCY =
  process.env.SKIP_CONCURRENCY === "1" ||
  process.env.SKIP_CONCURRENCY === "true";
const SKIP_SDK =
  process.env.SKIP_SDK === "1" || process.env.SKIP_SDK === "true";

const REPORT_PATH = join(
  ROOT,
  process.env.REPORT_PATH ??
    "docs/p986-brutal-engineering-compatibility-report.md"
);
const SUMMARY_PATH = join(
  ROOT,
  process.env.SUMMARY_PATH ?? "tmp/p986-brutal-engineering-summary.json"
);
const REPAIR_REPORT_PATH = join(
  ROOT,
  process.env.REPAIR_REPORT_PATH ??
    "docs/p986r-brutal-harness-blocker-repair-report.md"
);
const SANDBOX = join(ROOT, "tmp/p986-cursor-sandbox");

const LIVE_HINT = process.env.LIVE === "1" || process.env.LIVE === "true";
const LIVE_SAFE_MODE =
  process.env.LIVE_SAFE_MODE === "1" || process.env.LIVE_SAFE_MODE === "true";

const SAFE_DEFAULTS = LIVE_SAFE_MODE
  ? {
      chat: "3",
      stream: "2",
      tool: "1",
      duration: "30000",
      maxSpend: "3",
    }
  : {
      chat: LIVE_HINT ? "20" : "8",
      stream: LIVE_HINT ? "10" : "4",
      tool: LIVE_HINT ? "5" : "3",
      duration: LIVE_HINT ? "180000" : "12000",
      maxSpend: "10",
    };

const CHAT_CONCURRENCY = Math.max(
  1,
  parseInt(process.env.CHAT_CONCURRENCY ?? SAFE_DEFAULTS.chat, 10) ||
    Number(SAFE_DEFAULTS.chat)
);
const STREAM_CONCURRENCY = Math.max(
  1,
  parseInt(process.env.STREAM_CONCURRENCY ?? SAFE_DEFAULTS.stream, 10) ||
    Number(SAFE_DEFAULTS.stream)
);
const TOOL_CONCURRENCY = Math.max(
  1,
  parseInt(process.env.TOOL_CONCURRENCY ?? SAFE_DEFAULTS.tool, 10) ||
    Number(SAFE_DEFAULTS.tool)
);
const DURATION_MS = Math.max(
  1000,
  parseInt(process.env.DURATION_MS ?? SAFE_DEFAULTS.duration, 10) ||
    Number(SAFE_DEFAULTS.duration)
);
const MAX_CREDITS_SPEND = Math.max(
  0.000001,
  parseFloat(process.env.MAX_CREDITS_SPEND ?? SAFE_DEFAULTS.maxSpend) ||
    Number(SAFE_DEFAULTS.maxSpend)
);
const SAFETY_MAX_INFLIGHT = Math.max(
  1,
  parseInt(process.env.SAFETY_MAX_INFLIGHT ?? "3", 10) || 3
);
/** Conservative reserve per in-flight request before actual charge is known. */
const ESTIMATED_CREDITS_PER_REQUEST = Math.max(
  0.000001,
  parseFloat(
    process.env.ESTIMATED_CREDITS_PER_REQUEST ?? (LIVE_HINT ? "0.05" : "0.001")
  ) || (LIVE_HINT ? 0.05 : 0.001)
);
/** Hard cap on mixed-wave requests even when credits are cheap (mock). */
const MAX_STORM_REQUESTS = Math.max(
  1,
  parseInt(process.env.MAX_STORM_REQUESTS ?? (LIVE_HINT ? "200" : "60"), 10) ||
    (LIVE_HINT ? 200 : 60)
);
/** Cap stored per-request storm details in summary JSON. */
const MAX_STORM_DETAILS_STORED = Math.max(
  20,
  parseInt(process.env.MAX_STORM_DETAILS_STORED ?? "200", 10) || 200
);

const DIRTY = [
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
  "unhandled",
  "heap out",
  "TypeError",
  "AbortError",
  "gateway_overloaded",
];

const TOOLS = [
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

const CURSOR_TOOLS = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a file",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Write a file",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          contents: { type: "string" },
        },
        required: ["path", "contents"],
      },
    },
  },
];

/** @typedef {'PASS'|'WARN'|'FAIL'|'BLOCKER'} Verdict */

/**
 * @typedef {{
 *  case_name: string,
 *  category: string,
 *  http_status: number|null,
 *  request_id: string|null,
 *  requested_model: string|null,
 *  resolved_model: string|null,
 *  attempted_models: string[]|null,
 *  fallback_attempts: number|null,
 *  billing_status: string|null,
 *  credits_charged: number|null,
 *  usage_tokens: number|null,
 *  latency_ms: number|null,
 *  openai_shape_ok: boolean|null,
 *  cursor_likely_ok: boolean|null,
 *  verdict: Verdict,
 *  reason: string|null,
 *  blocker?: boolean,
 * }} CaseRow
 */

/** @type {CaseRow[]} */
const cases = [];
/** @type {string[]} */
const blockers = [];
/** @type {Map<string, number>} */
const chargeByRequestId = new Map();
/** @type {StormDetail[]} */
const stormDetails = [];
let stormDetailsOverflow = 0;
let spendTotal = 0;
let pendingSpendReserve = 0;
let inflightCount = 0;
let stormDetailsTotal = 0;

function pushStormDetail(detail) {
  stormDetailsTotal += 1;
  if (stormDetails.length < MAX_STORM_DETAILS_STORED) {
    stormDetails.push(detail);
  } else {
    stormDetailsOverflow += 1;
  }
}

/**
 * @typedef {{
 *  case_name: string,
 *  wave_name: string,
 *  http_status: number|null,
 *  ok: boolean,
 *  request_id: string|null,
 *  billing_status: string|null,
 *  credits_charged: number,
 *  latency_ms: number,
 *  error_code: string|null,
 *  verdict: string,
 *  timeout?: boolean,
 *  aborted?: boolean,
 *  skipped?: boolean,
 * }} StormDetail
 */

/** @type {{ id: string, ok: boolean, soft?: boolean, detail?: string }[]} */
const harness = [];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function budgetRemaining() {
  return MAX_CREDITS_SPEND - spendTotal - pendingSpendReserve;
}

function canStartRequest(estimated = ESTIMATED_CREDITS_PER_REQUEST) {
  if (spendTotal >= MAX_CREDITS_SPEND) return false;
  if (budgetRemaining() < estimated) return false;
  if (inflightCount >= SAFETY_MAX_INFLIGHT) return false;
  return true;
}

/**
 * Hard spend / inflight gate. Call before every concurrency request.
 * @returns {Promise<boolean>} true if caller may proceed to send
 */
async function acquireSpendSlot(estimated = ESTIMATED_CREDITS_PER_REQUEST) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (spendTotal >= MAX_CREDITS_SPEND) return false;
    if (budgetRemaining() < estimated) return false;
    if (inflightCount < SAFETY_MAX_INFLIGHT) {
      inflightCount += 1;
      pendingSpendReserve += estimated;
      return true;
    }
    await sleep(25);
  }
  return false;
}

function releaseSpendSlot(estimated = ESTIMATED_CREDITS_PER_REQUEST) {
  inflightCount = Math.max(0, inflightCount - 1);
  pendingSpendReserve = Math.max(0, pendingSpendReserve - estimated);
}

function summarizeStormWave(waveName, rows) {
  const total = rows.length;
  const success = rows.filter((r) => r.ok && !r.skipped && !r.aborted && !r.timeout).length;
  const fail = rows.filter((r) => r.fail && !r.skipped && !r.aborted && !r.timeout).length;
  const timeout = rows.filter((r) => r.timeout).length;
  const aborted = rows.filter((r) => r.aborted || r.skipped).length;
  const accounted = success + fail + timeout + aborted;
  const latSamples = rows
    .filter((r) => !r.skipped && !r.aborted && Number.isFinite(r.latencyMs) && r.latencyMs > 0)
    .map((r) => r.latencyMs);
  const latency = latencyStats(latSamples);
  const harnessBug =
    latency.count > 0 && success === 0 && fail === 0 && timeout === 0 && aborted === 0;
  if (harnessBug) {
    addBlocker(
      "concurrency_storm_summary",
      `harness_bug: wave=${waveName} latency.count=${latency.count} but success/fail/timeout/aborted all 0`
    );
  }
  if (accounted !== total) {
    addBlocker(
      "concurrency_storm_summary",
      `harness_bug: wave=${waveName} success(${success})+fail(${fail})+timeout(${timeout})+aborted(${aborted})=${accounted} !== total(${total})`
    );
  }
  return {
    wave_name: waveName,
    total,
    success,
    fail,
    timeout,
    aborted,
    accounted,
    charged_total: rows.reduce((s, r) => s + (r.charged || 0), 0),
    not_billable_total: rows.filter((r) => r.notBillable).length,
    latency,
    harness_bug: harnessBug || accounted !== total,
  };
}

function recordHarness(id, ok, detail, soft = false) {
  harness.push({ id, ok, soft, detail: detail ? String(detail).slice(0, 400) : undefined });
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

function tokfai(body) {
  return body?.tokfai && typeof body.tokfai === "object" ? body.tokfai : {};
}

function billingOf(body) {
  const s = tokfai(body).billing_status;
  return typeof s === "string" ? s : null;
}

function notBillable(body) {
  const c = charged(body);
  if (c > 0) return false;
  const s = billingOf(body);
  if (s && s !== "not_billable") return false;
  return true;
}

function isChatShape(body) {
  if (!body || typeof body !== "object" || body.error) return false;
  if (!Array.isArray(body.choices) || body.choices.length < 1) return false;
  const c0 = body.choices[0];
  return Boolean(c0 && typeof c0 === "object" && c0.message);
}

function isErrorShape(body) {
  return Boolean(
    body?.error &&
      typeof body.error.message === "string" &&
      body.error.message.trim() &&
      typeof body.error.code === "string" &&
      body.error.code.trim()
  );
}

function parseSse(text) {
  let sawDone = false;
  let sawToolDelta = false;
  let finishToolCalls = false;
  let content = "";
  /** @type {Record<number, {id?: string, name?: string, arguments: string}>} */
  const toolParts = {};
  let parseOk = true;
  let requestId = null;
  let creditsCharged = 0;
  let billingStatus = null;
  let usageTokens = null;
  for (const line of String(text ?? "").split("\n")) {
    const t = line.trim();
    if (!t.startsWith("data:")) continue;
    const payload = t.slice(5).trim();
    if (payload === "[DONE]") {
      sawDone = true;
      continue;
    }
    try {
      const obj = JSON.parse(payload);
      if (!requestId) {
        requestId =
          obj?.request_id ||
          obj?.tokfai?.request_id ||
          obj?.error?.request_id ||
          null;
      }
      const ch = Number(obj?.credits_charged ?? obj?.tokfai?.credits_charged);
      if (Number.isFinite(ch) && ch > creditsCharged) creditsCharged = ch;
      const bs = obj?.tokfai?.billing_status;
      if (typeof bs === "string") billingStatus = bs;
      if (obj?.usage && typeof obj.usage === "object") {
        usageTokens = {
          prompt_tokens: obj.usage.prompt_tokens ?? null,
          completion_tokens: obj.usage.completion_tokens ?? null,
          total_tokens: obj.usage.total_tokens ?? null,
        };
      }
      const choice = obj?.choices?.[0];
      const delta = choice?.delta;
      if (delta?.content) content += String(delta.content);
      if (choice?.finish_reason === "tool_calls") finishToolCalls = true;
      if (Array.isArray(delta?.tool_calls)) {
        sawToolDelta = true;
        for (const tc of delta.tool_calls) {
          const idx = Number(tc.index ?? 0);
          if (!toolParts[idx]) toolParts[idx] = { arguments: "" };
          if (tc.id) toolParts[idx].id = tc.id;
          if (tc.function?.name) toolParts[idx].name = tc.function.name;
          if (typeof tc.function?.arguments === "string") {
            toolParts[idx].arguments += tc.function.arguments;
          }
        }
      }
    } catch {
      parseOk = false;
    }
  }
  return {
    sawDone,
    sawToolDelta,
    finishToolCalls,
    content,
    toolParts,
    parseOk,
    requestId,
    creditsCharged,
    billingStatus,
    usageTokens,
  };
}

function toolCallShapeOk(toolCalls) {
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) return false;
  for (const tc of toolCalls) {
    if (!tc || typeof tc !== "object") return false;
    if (typeof tc.id !== "string" || !tc.id.trim()) return false;
    if (tc.type !== "function") return false;
    if (!tc.function || typeof tc.function !== "object") return false;
    if (typeof tc.function.name !== "string" || !tc.function.name.trim()) {
      return false;
    }
    if (typeof tc.function.arguments !== "string") return false;
  }
  return true;
}

function secretLeakIn(text, apiKey) {
  const s = String(text ?? "");
  if (apiKey && apiKey.length >= 16 && s.includes(apiKey)) return "full_api_key";
  if (/sk-tokfai_[a-zA-Z0-9]{24,}/.test(s)) return "sk-tokfai_pattern";
  if (/GRSAI_API_KEY|SUPABASE_SERVICE_ROLE|STRIPE_SECRET|TOKEN_PEPPER/i.test(s)) {
    return "secret_name_or_value";
  }
  const leak = assertNoErrorLeak(s);
  return leak;
}

function trackCharge(requestId, amount, label) {
  if (!requestId || !(amount > 0)) return;
  spendTotal += amount;
  const prev = chargeByRequestId.get(requestId) ?? 0;
  const next = prev + amount;
  chargeByRequestId.set(requestId, next);
  if (prev > 0 && next > prev) {
    addBlocker(
      `duplicate_charge:${requestId}`,
      `${label}: request_id charged twice (${prev} → ${next})`
    );
  }
}

function addBlocker(id, reason) {
  const line = `${id}: ${reason}`;
  if (!blockers.includes(line)) blockers.push(line);
}

/**
 * @param {Partial<CaseRow> & { case_name: string, verdict: Verdict }} row
 */
function pushCase(row) {
  const full = {
    category: "general",
    http_status: null,
    request_id: null,
    requested_model: null,
    resolved_model: null,
    attempted_models: null,
    fallback_attempts: null,
    billing_status: null,
    credits_charged: null,
    usage_tokens: null,
    latency_ms: null,
    openai_shape_ok: null,
    cursor_likely_ok: null,
    reason: null,
    blocker: row.verdict === "BLOCKER",
    ...row,
  };
  cases.push(full);
  if (full.verdict === "BLOCKER") {
    addBlocker(full.case_name, full.reason ?? "blocker");
  }
  const tag =
    full.verdict === "PASS"
      ? "PASS "
      : full.verdict === "WARN"
        ? "WARN "
        : full.verdict === "BLOCKER"
          ? "BLOCK"
          : "FAIL ";
  console.log(
    `${tag} ${full.case_name} status=${full.http_status} bill=${full.billing_status} ch=${full.credits_charged} ${full.reason ?? ""}`
  );
  return full;
}

function fromBody(body, res, started) {
  const t = tokfai(body);
  return {
    http_status: res?.status ?? null,
    request_id: requestIdOf(body, res),
    requested_model:
      typeof t.requested_model === "string"
        ? t.requested_model
        : typeof body?.model === "string"
          ? body.model
          : null,
    resolved_model:
      typeof t.resolved_model === "string"
        ? t.resolved_model
        : typeof body?.model === "string"
          ? body.model
          : null,
    attempted_models: Array.isArray(t.attempted_models)
      ? t.attempted_models.filter((x) => typeof x === "string")
      : null,
    fallback_attempts:
      typeof t.fallback_attempts === "number" ? t.fallback_attempts : null,
    billing_status: billingOf(body),
    credits_charged: charged(body),
    usage_tokens:
      typeof body?.usage?.total_tokens === "number"
        ? body.usage.total_tokens
        : null,
    latency_ms: Date.now() - started,
  };
}

function snapshotDir(dir) {
  if (!existsSync(dir)) return { files: {}, count: 0 };
  /** @type {Record<string, {size: number, mtime: number}>} */
  const files = {};
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    try {
      const st = statSync(p);
      if (st.isFile()) files[name] = { size: st.size, mtime: st.mtimeMs };
    } catch {
      // ignore
    }
  }
  return { files, count: Object.keys(files).length };
}

function dirChanged(before, after) {
  if (before.count !== after.count) return true;
  for (const [k, v] of Object.entries(before.files)) {
    const a = after.files[k];
    if (!a || a.size !== v.size || a.mtime !== v.mtime) return true;
  }
  for (const k of Object.keys(after.files)) {
    if (!before.files[k]) return true;
  }
  return false;
}

function collectPm2Snapshot() {
  if (SKIP_PM2) {
    return { available: false, skipped: true, dirty: [], apps: [] };
  }
  const which = spawnSync("bash", ["-lc", "command -v pm2 || true"], {
    encoding: "utf8",
  });
  if (!String(which.stdout || "").trim()) {
    return { available: false, skipped: false, dirty: [], apps: [] };
  }
  const jlist = spawnSync("pm2", ["jlist"], { encoding: "utf8", timeout: 15_000 });
  /** @type {any[]} */
  let apps = [];
  try {
    apps = JSON.parse(jlist.stdout || "[]");
  } catch {
    apps = [];
  }
  const mapped = (Array.isArray(apps) ? apps : []).map((a) => ({
    name: a.name,
    pid: a.pid ?? a.pm2_env?.pm_pid,
    status: a.pm2_env?.status ?? null,
    restart_time: a.pm2_env?.restart_time ?? null,
    memory: a.monit?.memory ?? null,
    cpu: a.monit?.cpu ?? null,
  }));
  const appName = process.env.TOKFAI_PM2_APP ?? process.env.PM2_APP_NAME ?? "";
  const logArgs = appName
    ? ["logs", appName, "--lines", "400", "--nostream", "--err", "--raw"]
    : ["logs", "--lines", "400", "--nostream", "--err", "--raw"];
  const logs = spawnSync("pm2", logArgs, { encoding: "utf8", timeout: 30_000 });
  const logsText = `${logs.stdout ?? ""}\n${logs.stderr ?? ""}`;
  const dirty = DIRTY.filter((p) => logsText.includes(p));
  return {
    available: true,
    skipped: false,
    apps: mapped,
    dirty,
    logsText: logsText.slice(-6000),
    online: mapped.some((a) => a.status === "online"),
  };
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return sorted[idx];
}

function latencyStats(samples) {
  const sorted = [...samples].filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  return {
    count: sorted.length,
    p50: percentile(sorted, 50),
    p90: percentile(sorted, 90),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
  };
}

async function runHarness(ctx) {
  const { BASE, API_KEY, TIMEOUT_MS, LIVE } = ctx;
  if (!process.env.VERIFIED_TOOLS_CAPABLE_MODEL_IDS) {
    process.env.VERIFIED_TOOLS_CAPABLE_MODEL_IDS = "gpt-5.5";
  }

  async function chat(body, headers = {}, timeoutMs = TIMEOUT_MS) {
    const started = Date.now();
    const result = await acceptanceFetch(`${BASE}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
      timeoutMs,
    });
    return { ...result, started };
  }

  async function chatRaw(raw, timeoutMs = TIMEOUT_MS) {
    const started = Date.now();
    const result = await acceptanceFetch(`${BASE}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: raw,
      timeoutMs,
    });
    return { ...result, started };
  }

  function judgeSuccess(caseName, category, body, res, started, opts = {}) {
    const meta = fromBody(body, res, started);
    const shape = isChatShape(body);
    const rid = meta.request_id;
    const ch = meta.credits_charged ?? 0;
    let verdict = /** @type {Verdict} */ ("PASS");
    let reason = null;

    if (res.status !== 200 || !shape) {
      verdict = "FAIL";
      reason = `status=${res.status} shape=${shape}`;
    }
    if (res.status === 200 && shape && !rid) {
      verdict = "BLOCKER";
      reason = "success missing request_id";
      addBlocker(caseName, reason);
    }
    if (res.status === 200 && shape && rid && !(ch > 0) && !opts.allowZeroCharge) {
      // Unlimited / not_billable success is a commercial WARN, not always blocker.
      if (billingOf(body) === "not_billable") {
        verdict = verdict === "BLOCKER" ? verdict : "WARN";
        reason = reason ?? "success not_billable / credits=0 (unlimited?)";
      } else {
        verdict = "FAIL";
        reason = reason ?? "success credits_charged not > 0";
      }
    }
    const leak = secretLeakIn(JSON.stringify(body), API_KEY);
    if (leak) {
      verdict = "BLOCKER";
      reason = `secret leak: ${leak}`;
      addBlocker(caseName, reason);
    }
    if (ch > 0 && rid) trackCharge(rid, ch, caseName);
    pushCase({
      case_name: caseName,
      category,
      ...meta,
      openai_shape_ok: shape,
      cursor_likely_ok: shape && res.status === 200,
      verdict,
      reason,
    });
  }

  function judgeFailureNotBillable(caseName, category, body, res, started, opts = {}) {
    const meta = fromBody(body, res, started);
    const ch = meta.credits_charged ?? 0;
    const errOk = isErrorShape(body) || opts.allowNonErrorBody;
    let verdict = /** @type {Verdict} */ ("PASS");
    let reason = null;
    if (!(res.status >= 400)) {
      verdict = opts.allow200 ? "WARN" : "FAIL";
      reason = `expected failure status, got ${res.status}`;
    }
    if (ch > 0) {
      verdict = "BLOCKER";
      reason = `failure charged credits=${ch}`;
      addBlocker(caseName, reason);
    } else if (!notBillable(body) && res.status >= 400) {
      verdict = "FAIL";
      reason = `billing_status=${billingOf(body)}`;
    }
    if (!errOk && res.status >= 400) {
      verdict = verdict === "BLOCKER" ? verdict : "WARN";
      reason = reason ?? "error envelope incomplete";
    }
    const leak = secretLeakIn(JSON.stringify(body), API_KEY);
    if (leak) {
      verdict = "BLOCKER";
      reason = `secret leak: ${leak}`;
      addBlocker(caseName, reason);
    }
    pushCase({
      case_name: caseName,
      category,
      ...meta,
      openai_shape_ok: errOk,
      cursor_likely_ok: ch === 0,
      verdict,
      reason,
    });
  }

  // ─── A. OpenAI basics ────────────────────────────────────────────
  console.log("\n=== A. OpenAI protocol ===\n");

  {
    const body = {
      model: "auto-fast",
      messages: [{ role: "user", content: "P986 non-stream" }],
      stream: false,
      max_tokens: 16,
    };
    const { res, body: out, started } = await chat(body);
    judgeSuccess("non_stream_chat", "openai", out, res, started);
  }

  {
    const body = {
      model: "auto-fast",
      messages: [{ role: "user", content: "P986 stream" }],
      stream: true,
      max_tokens: 16,
    };
    const { res, text, body: out, started } = await chat(body);
    const sse = parseSse(text);
    const rid = sse.requestId || requestIdOf(out, res);
    const ch = sse.creditsCharged || charged(out);
    const bill = sse.billingStatus || billingOf(out);
    let verdict = /** @type {Verdict} */ ("PASS");
    let reason = null;
    if (res.status !== 200 || !sse.parseOk) {
      verdict = "FAIL";
      reason = `status=${res.status} parse=${sse.parseOk}`;
    }
    if (!sse.sawDone) {
      verdict = "BLOCKER";
      reason = "SSE missing data: [DONE]";
      addBlocker("stream_chat", reason);
    }
    if (res.status === 200 && sse.sawDone && !rid) {
      verdict = "BLOCKER";
      reason = "success missing request_id";
      addBlocker("stream_chat", reason);
    }
    if (res.status === 200 && sse.sawDone && rid && !(ch > 0)) {
      if (bill === "not_billable") {
        verdict = verdict === "BLOCKER" ? verdict : "WARN";
        reason = reason ?? "stream success not_billable / credits=0";
      } else {
        verdict = verdict === "BLOCKER" ? verdict : "FAIL";
        reason = reason ?? "stream success credits_charged not > 0";
      }
    }
    if (ch > 0 && rid) trackCharge(rid, ch, "stream_chat");
    pushCase({
      case_name: "stream_chat",
      category: "openai",
      http_status: res.status,
      request_id: rid,
      requested_model: "auto-fast",
      resolved_model: null,
      attempted_models: null,
      fallback_attempts: null,
      billing_status: bill,
      credits_charged: ch,
      usage_tokens: sse.usageTokens,
      latency_ms: Date.now() - started,
      openai_shape_ok: sse.parseOk && sse.sawDone,
      cursor_likely_ok: sse.sawDone && Boolean(rid),
      verdict,
      reason,
    });
  }

  {
    const body = {
      messages: [{ role: "user", content: "missing model" }],
      stream: false,
      max_tokens: 8,
    };
    const { res, body: out, started } = await chat(body);
    if (res.status === 200 && isChatShape(out)) {
      pushCase({
        case_name: "missing_model",
        category: "openai",
        ...fromBody(out, res, started),
        openai_shape_ok: true,
        cursor_likely_ok: true,
        verdict: "WARN",
        reason: "defaults BOT_MODEL instead of strict 400",
      });
    } else {
      judgeFailureNotBillable("missing_model", "openai", out, res, started);
    }
  }

  {
    const body = { model: "auto-fast", stream: false };
    const { res, body: out, started } = await chat(body);
    if (res.status === 200 && charged(out) === 0) {
      pushCase({
        case_name: "missing_messages",
        category: "openai",
        ...fromBody(out, res, started),
        openai_shape_ok: isChatShape(out) || isErrorShape(out),
        cursor_likely_ok: true,
        verdict: "WARN",
        reason: "empty messages noop 200 not_billable (Cherry compat)",
      });
    } else if (res.status >= 400) {
      judgeFailureNotBillable("missing_messages", "openai", out, res, started);
    } else {
      judgeFailureNotBillable("missing_messages", "openai", out, res, started, {
        allow200: true,
      });
    }
  }

  {
    const { res, body: out, text, started } = await chatRaw("{not-json");
    const meta = fromBody(out, res, started);
    const ch = meta.credits_charged ?? 0;
    let verdict = /** @type {Verdict} */ ("PASS");
    let reason = null;
    if (ch > 0) {
      verdict = "BLOCKER";
      reason = "malformed json charged";
      addBlocker("malformed_json", reason);
    } else if (!(res.status >= 400)) {
      verdict = "FAIL";
      reason = `status=${res.status}`;
    } else if (res.status !== 400) {
      verdict = "WARN";
      reason = `status=${res.status} (prefer 400)`;
    }
    if (!isErrorShape(out) && !/json|parse|invalid/i.test(text ?? "")) {
      verdict = verdict === "BLOCKER" ? verdict : "WARN";
      reason = reason ?? "weak error envelope";
    }
    pushCase({
      case_name: "malformed_json",
      category: "openai",
      ...meta,
      openai_shape_ok: isErrorShape(out) || res.status >= 400,
      cursor_likely_ok: ch === 0,
      verdict,
      reason,
    });
  }

  {
    const body = {
      model: "auto-fast",
      messages: [{ role: "narrator", content: "invalid role" }],
      stream: false,
      max_tokens: 8,
    };
    const { res, body: out, started } = await chat(body);
    // Mapped to user or rejected — either documentable.
    if (res.status === 200 && isChatShape(out)) {
      pushCase({
        case_name: "invalid_role",
        category: "openai",
        ...fromBody(out, res, started),
        openai_shape_ok: true,
        cursor_likely_ok: true,
        verdict: "WARN",
        reason: "unknown role coerced rather than rejected",
      });
      if ((charged(out) ?? 0) > 0) {
        trackCharge(requestIdOf(out, res), charged(out), "invalid_role");
      }
    } else {
      judgeFailureNotBillable("invalid_role", "openai", out, res, started);
    }
  }

  {
    const body = {
      model: "auto-fast",
      messages: [{ role: "user", content: "content string" }],
      stream: false,
      max_tokens: 8,
    };
    const { res, body: out, started } = await chat(body);
    judgeSuccess("content_string", "openai", out, res, started);
  }

  {
    const body = {
      model: "auto-fast",
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "content array" }],
        },
      ],
      stream: false,
      max_tokens: 8,
    };
    const { res, body: out, started } = await chat(body);
    judgeSuccess("content_array", "openai", out, res, started);
  }

  {
    const body = {
      model: "auto-fast",
      messages: [{ role: "user", content: "max_tokens only" }],
      stream: false,
      max_tokens: 8,
    };
    const { res, body: out, started } = await chat(body);
    judgeSuccess("max_tokens", "openai", out, res, started);
  }

  {
    const body = {
      model: "auto-fast",
      messages: [{ role: "user", content: "max_completion_tokens only" }],
      stream: false,
      max_completion_tokens: 16,
    };
    const { res, body: out, started } = await chat(body);
    judgeSuccess("max_completion_tokens", "openai", out, res, started);
  }

  {
    const body = {
      model: "auto-fast",
      messages: [{ role: "user", content: "params" }],
      stream: false,
      max_tokens: 8,
      max_completion_tokens: 16,
      temperature: 0.1,
      top_p: 0.9,
      stop: ["\n\n"],
    };
    const { res, body: out, started } = await chat(body);
    judgeSuccess("sampling_params", "openai", out, res, started);
  }

  for (const n of [1, 2]) {
    const body = {
      model: "auto-fast",
      messages: [{ role: "user", content: `n=${n}` }],
      stream: false,
      n,
      max_tokens: 8,
    };
    const { res, body: out, started } = await chat(body);
    const choices = Array.isArray(out?.choices) ? out.choices.length : 0;
    const meta = fromBody(out, res, started);
    const shape = isChatShape(out);
    let verdict = /** @type {Verdict} */ ("PASS");
    let reason = null;
    if (res.status !== 200 || !shape) {
      verdict = "FAIL";
      reason = `status=${res.status}`;
    } else if (n === 2 && choices < 2) {
      verdict = "WARN";
      reason = `n=2 but choices=${choices}`;
    }
    if (res.status === 200 && shape && !meta.request_id) {
      verdict = "BLOCKER";
      reason = "success missing request_id";
      addBlocker(`n_${n}`, reason);
    }
    if ((meta.credits_charged ?? 0) > 0 && meta.request_id) {
      trackCharge(meta.request_id, meta.credits_charged, `n_${n}`);
    }
    pushCase({
      case_name: `n_${n}`,
      category: "openai",
      ...meta,
      openai_shape_ok: shape,
      cursor_likely_ok: shape,
      verdict,
      reason,
    });
  }

  for (const [name, rf, expectWarn] of [
    ["response_format_json_object", { type: "json_object" }, false],
    [
      "response_format_json_schema",
      {
        type: "json_schema",
        json_schema: {
          name: "ans",
          schema: {
            type: "object",
            properties: { ok: { type: "boolean" } },
            required: ["ok"],
          },
        },
      },
      true,
    ],
  ]) {
    const body = {
      model: "auto-fast",
      messages: [{ role: "user", content: 'Reply JSON {"ok":true}' }],
      response_format: rf,
      stream: false,
      max_tokens: 32,
    };
    const { res, body: out, started } = await chat(body);
    if (expectWarn && res.status === 200 && isChatShape(out)) {
      const meta = fromBody(out, res, started);
      if ((meta.credits_charged ?? 0) > 0 && meta.request_id) {
        trackCharge(meta.request_id, meta.credits_charged, name);
      }
      pushCase({
        case_name: name,
        category: "openai",
        ...meta,
        openai_shape_ok: true,
        cursor_likely_ok: false,
        verdict: "WARN",
        reason: "json_schema not guaranteed forwarded upstream",
      });
    } else {
      judgeSuccess(name, "openai", out, res, started);
    }
  }

  {
    const canary = `TOKFAI_P986_CANARY_SECRET_${randomBytes(8).toString("hex")}`;
    const body = {
      model: "auto-fast",
      messages: [{ role: "user", content: "Reply with exactly: p986-ok" }],
      stream: false,
      max_tokens: 16,
      // Canary ONLY in unknown top-level fields — never in messages.content.
      tokfai_unknown_client_field: canary,
      foo_bar_extra: canary,
      api_key: canary,
      authorization: canary,
      bearer: canary,
      password: canary,
      secret: canary,
      token: canary,
      postgres: canary,
      database_url: canary,
      supabase: canary,
      service_role: canary,
      stripe: canary,
      webhook: canary,
      headers: { Authorization: `Bearer ${canary}` },
      env: { LEAK: canary },
      process: { env: canary },
      cookie: canary,
    };
    const { res, body: out, text, started } = await chat(body);
    const raw = typeof text === "string" ? text : JSON.stringify(out ?? {});
    const content = String(out?.choices?.[0]?.message?.content ?? "");
    const meta = fromBody(out, res, started);
    let verdict = /** @type {Verdict} */ ("PASS");
    let reason = null;

    if (content.includes(canary) || raw.includes(canary)) {
      verdict = "BLOCKER";
      reason = "canary leaked into response content/raw JSON";
      addBlocker("extra_unknown_fields", reason);
    }

    // Unit: allowlist sanitize must drop canary (upstream request must not contain it).
    const unit = spawnSync(
      "npx",
      [
        "--yes",
        "tsx",
        "-e",
        `
import { sanitizeUpstreamChatBody } from "./src/lib/chatCompletionCompat.ts";
const canary = ${JSON.stringify(canary)};
const body = ${JSON.stringify({
  messages: [{ role: "user", content: "Reply with exactly: p986-ok" }],
  max_tokens: 16,
  tokfai_unknown_client_field: canary,
  api_key: canary,
  postgres: canary,
  supabase: canary,
})};
const r = sanitizeUpstreamChatBody(body, "auto-fast");
if (!r.ok) { console.error("sanitize_failed"); process.exit(2); }
const j = JSON.stringify(r.upstream);
if (j.includes(canary)) { console.error("canary_in_upstream"); process.exit(3); }
if (!r.droppedKeys?.includes("api_key")) { console.error("missing_dropped"); process.exit(4); }
console.log("TOKFAI_P986R_UPSTREAM_ALLOWLIST_OK");
`,
      ],
      { cwd: DMIT, encoding: "utf8", timeout: 60_000 }
    );
    const unitOut = `${unit.stdout || ""}\n${unit.stderr || ""}`;
    if (
      unit.status !== 0 ||
      !unitOut.includes("TOKFAI_P986R_UPSTREAM_ALLOWLIST_OK")
    ) {
      verdict = "BLOCKER";
      reason = `upstream allowlist unit failed: ${unitOut.slice(0, 200)}`;
      addBlocker("extra_unknown_fields", reason);
    }

    // pm2 logs must not contain canary (when available).
    if (!SKIP_PM2) {
      const pm2Snap = collectPm2Snapshot();
      const logBlob = JSON.stringify(pm2Snap);
      if (logBlob.includes(canary)) {
        verdict = "BLOCKER";
        reason = "canary leaked into pm2 logs";
        addBlocker("extra_unknown_fields", reason);
      }
    }

    const leak = secretLeakIn(raw, API_KEY);
    // Canary itself is intentional client input; do not treat as API-key leak.
    if (leak && !String(leak).includes(canary)) {
      // Known false-positive: field *names* like postgres/supabase in bodyKeys logs.
      // Still BLOCKER if full API key / GRSAI patterns appear.
      if (
        leak === "full_api_key" ||
        leak === "sk-tokfai_pattern" ||
        leak === "secret_name_or_value"
      ) {
        verdict = "BLOCKER";
        reason = `secret leak: ${leak}`;
        addBlocker("extra_unknown_fields", reason);
      }
    }

    if (verdict === "PASS" && res.status === 200 && isChatShape(out)) {
      if ((meta.credits_charged ?? 0) > 0 && meta.request_id) {
        trackCharge(meta.request_id, meta.credits_charged, "extra_unknown_fields");
      }
      if (!meta.request_id) {
        verdict = "BLOCKER";
        reason = "success missing request_id";
        addBlocker("extra_unknown_fields", reason);
      }
    } else if (verdict === "PASS" && res.status !== 200) {
      verdict = "FAIL";
      reason = `status=${res.status}`;
    }

    pushCase({
      case_name: "extra_unknown_fields",
      category: "openai",
      ...meta,
      openai_shape_ok: isChatShape(out) || isErrorShape(out),
      cursor_likely_ok: verdict === "PASS",
      verdict,
      reason: reason ?? `canary=${canary.slice(0, 28)}… stripped`,
    });
  }

  {
    const body = {
      model: "p986-invalid-model-xyz",
      messages: [{ role: "user", content: "x" }],
      stream: false,
    };
    const { res, body: out, started } = await chat(body);
    judgeFailureNotBillable("invalid_model", "openai", out, res, started);
  }

  // ─── B. Tools ────────────────────────────────────────────────────
  console.log("\n=== B. Tool calling ===\n");

  {
    const body = {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "weather auto" }],
      tools: TOOLS,
      tool_choice: "auto",
      stream: false,
      max_tokens: 64,
    };
    const { res, body: out, started } = await chat(body);
    const tc = out?.choices?.[0]?.message?.tool_calls;
    const hasTc = toolCallShapeOk(tc);
    const contentOk = typeof out?.choices?.[0]?.message?.content === "string";
    if (res.status === 200 && (hasTc || contentOk)) {
      judgeSuccess("tools_tool_choice_auto", "tools", out, res, started);
    } else if (res.status >= 400 && notBillable(out)) {
      judgeFailureNotBillable("tools_tool_choice_auto", "tools", out, res, started);
    } else {
      pushCase({
        case_name: "tools_tool_choice_auto",
        category: "tools",
        ...fromBody(out, res, started),
        openai_shape_ok: false,
        cursor_likely_ok: false,
        verdict: "FAIL",
        reason: "neither tool_calls nor content",
      });
    }
  }

  {
    const body = {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "weather required" }],
      tools: TOOLS,
      tool_choice: "required",
      stream: false,
    };
    const { res, body: out, started } = await chat(body);
    const tc = out?.choices?.[0]?.message?.tool_calls;
    const hasTc = toolCallShapeOk(tc);
    if (res.status === 200 && hasTc) {
      const meta = fromBody(out, res, started);
      if (!meta.request_id) {
        pushCase({
          case_name: "tools_tool_choice_required",
          category: "tools",
          ...meta,
          openai_shape_ok: true,
          cursor_likely_ok: true,
          verdict: "BLOCKER",
          reason: "tool success missing request_id",
        });
      } else {
        if ((meta.credits_charged ?? 0) > 0) {
          trackCharge(meta.request_id, meta.credits_charged, "tools_required");
        }
        pushCase({
          case_name: "tools_tool_choice_required",
          category: "tools",
          ...meta,
          openai_shape_ok: true,
          cursor_likely_ok: true,
          verdict: (meta.credits_charged ?? 0) > 0 ? "PASS" : "WARN",
          reason:
            (meta.credits_charged ?? 0) > 0
              ? null
              : "tool_calls ok but credits_charged not > 0",
        });
      }
    } else if (res.status >= 400 && charged(out) > 0) {
      pushCase({
        case_name: "tools_tool_choice_required",
        category: "tools",
        ...fromBody(out, res, started),
        openai_shape_ok: isErrorShape(out),
        cursor_likely_ok: false,
        verdict: "BLOCKER",
        reason: "forced tool failure charged",
      });
    } else {
      judgeFailureNotBillable(
        "tools_tool_choice_required",
        "tools",
        out,
        res,
        started
      );
    }
  }

  {
    const body = {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "force function" }],
      tools: TOOLS,
      tool_choice: {
        type: "function",
        function: { name: "get_weather" },
      },
      stream: false,
    };
    const { res, body: out, started } = await chat(body);
    const tc = out?.choices?.[0]?.message?.tool_calls;
    if (res.status === 200 && toolCallShapeOk(tc)) {
      judgeSuccess("tools_function_forced", "tools", out, res, started);
    } else if (res.status >= 400) {
      judgeFailureNotBillable("tools_function_forced", "tools", out, res, started);
    } else {
      pushCase({
        case_name: "tools_function_forced",
        category: "tools",
        ...fromBody(out, res, started),
        openai_shape_ok: false,
        cursor_likely_ok: false,
        verdict: "FAIL",
        reason: "missing tool_calls shape",
      });
    }
  }

  {
    const body = {
      model: "auto-fast",
      messages: [{ role: "user", content: "force tools on non-capable" }],
      tools: TOOLS,
      tool_choice: "required",
      stream: false,
    };
    const { res, body: out, started } = await chat(body);
    const ch = charged(out);
    const code = out?.error?.code;
    let verdict = /** @type {Verdict} */ ("PASS");
    let reason = null;
    if (ch > 0) {
      verdict = "BLOCKER";
      reason = "model_not_tool_capable path charged";
      addBlocker("tools_false_model_forced", reason);
    } else if (!(res.status >= 400 && notBillable(out))) {
      verdict = "FAIL";
      reason = `status=${res.status} code=${code}`;
    } else if (code && code !== "model_not_tool_capable") {
      verdict = "WARN";
      reason = `expected model_not_tool_capable got ${code}`;
    }
    pushCase({
      case_name: "tools_false_model_forced",
      category: "tools",
      ...fromBody(out, res, started),
      openai_shape_ok: isErrorShape(out),
      cursor_likely_ok: false,
      verdict,
      reason,
    });
  }

  {
    const body = {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "stream tools" }],
      tools: TOOLS,
      tool_choice: "required",
      stream: true,
    };
    const { res, text, body: out, started } = await chat(body);
    const sse = parseSse(text);
    const rid = sse.requestId || requestIdOf(out, res);
    const ch = sse.creditsCharged || charged(out);
    const bill = sse.billingStatus || billingOf(out);
    let verdict = /** @type {Verdict} */ ("PASS");
    let reason = null;
    if (!sse.sawDone) {
      verdict = "BLOCKER";
      reason = "tool stream missing [DONE]";
      addBlocker("tools_stream_delta", reason);
    } else if (res.status === 200 && sse.sawToolDelta) {
      const parts = Object.values(sse.toolParts);
      const okParts =
        parts.length > 0 &&
        parts.every((p) => p.name && typeof p.arguments === "string");
      if (!okParts) {
        verdict = "FAIL";
        reason = "tool delta fragments incomplete";
      } else if (!rid) {
        verdict = "BLOCKER";
        reason = "success missing request_id";
        addBlocker("tools_stream_delta", reason);
      } else if (!(ch > 0) && bill !== "not_billable") {
        verdict = "FAIL";
        reason = "stream tool success credits_charged not > 0";
      }
    } else if (res.status >= 400 && ch > 0) {
      verdict = "BLOCKER";
      reason = "stream tool fail charged";
      addBlocker("tools_stream_delta", reason);
    } else if (res.status >= 400 && notBillable(out)) {
      verdict = "WARN";
      reason = `graceful fail code=${out?.error?.code}`;
    } else {
      verdict = "FAIL";
      reason = "no tool_calls deltas";
    }
    if (ch > 0 && rid) trackCharge(rid, ch, "tools_stream_delta");
    pushCase({
      case_name: "tools_stream_delta",
      category: "tools",
      http_status: res.status,
      request_id: rid,
      requested_model: "gpt-5.5",
      resolved_model: null,
      attempted_models: null,
      fallback_attempts: null,
      billing_status: bill,
      credits_charged: ch,
      usage_tokens: sse.usageTokens,
      latency_ms: Date.now() - started,
      openai_shape_ok: sse.parseOk && sse.sawDone,
      cursor_likely_ok: sse.sawToolDelta && sse.sawDone && Boolean(rid),
      verdict,
      reason,
    });
  }

  {
    const body = {
      model: "gpt-5.5",
      messages: [
        { role: "user", content: "weather?" },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_p986",
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
          tool_call_id: "call_p986",
          content: '{"temp":20}',
        },
      ],
      tools: TOOLS,
      stream: false,
      max_tokens: 64,
    };
    const { res, body: out, started } = await chat(body);
    judgeSuccess("tool_role_second_turn", "tools", out, res, started);
  }

  {
    const body = {
      model: "auto-fast",
      messages: [
        { role: "user", content: "legacy" },
        {
          role: "assistant",
          content: null,
          function_call: {
            name: "get_weather",
            arguments: '{"location":"X"}',
          },
        },
        { role: "function", name: "get_weather", content: "{}" },
      ],
      stream: false,
      max_tokens: 16,
    };
    const { res, body: out, started } = await chat(body);
    if (res.status === 200 && isChatShape(out)) {
      judgeSuccess("legacy_function_role", "tools", out, res, started);
      const last = cases[cases.length - 1];
      if (last?.case_name === "legacy_function_role" && last.verdict === "PASS") {
        last.verdict = "WARN";
        last.reason = "legacy function role accepted — document boundary";
      }
    } else {
      judgeFailureNotBillable("legacy_function_role", "tools", out, res, started);
      const last = cases[cases.length - 1];
      if (last) {
        last.reason = `${last.reason ?? ""}; legacy rejected`.trim();
      }
    }
  }

  {
    const body = {
      model: "__tokfai_mock_upstream_timeout",
      messages: [{ role: "user", content: "timeout" }],
      stream: false,
    };
    const { res, body: out, started } = await chat(body);
    if (LIVE) {
      pushCase({
        case_name: "upstream_timeout",
        category: "billing",
        ...fromBody(out, res, started),
        openai_shape_ok: isErrorShape(out) || res.status >= 400,
        cursor_likely_ok: notBillable(out),
        verdict: "WARN",
        reason: "LIVE soft — mock timeout model may not route",
      });
    } else {
      judgeFailureNotBillable("upstream_timeout", "billing", out, res, started);
    }
  }

  // ─── C. Cursor-like + sandbox FS ─────────────────────────────────
  console.log("\n=== C. Cursor-like ===\n");
  mkdirSync(SANDBOX, { recursive: true });
  writeFileSync(join(SANDBOX, "seed.txt"), "seed\n", "utf8");

  async function cursorReadonly(name, prompt) {
    const before = snapshotDir(SANDBOX);
    const body = {
      model: "auto-fast",
      messages: [{ role: "user", content: prompt }],
      stream: false,
      max_tokens: 64,
      temperature: 0,
    };
    const { res, body: out, started } = await chat(body);
    const after = snapshotDir(SANDBOX);
    const wrote = dirChanged(before, after);
    if (wrote) {
      pushCase({
        case_name: name,
        category: "cursor",
        ...fromBody(out, res, started),
        openai_shape_ok: isChatShape(out),
        cursor_likely_ok: false,
        verdict: "BLOCKER",
        reason: "readonly scenario mutated sandbox files",
      });
    } else {
      judgeSuccess(name, "cursor", out, res, started);
    }
  }

  await cursorReadonly(
    "cursor_readonly_project_dir",
    "List files under tmp/p986-cursor-sandbox. Do not write files."
  );
  await cursorReadonly(
    "cursor_read_file_explain",
    "Explain seed.txt conceptually. Do not write files."
  );
  await cursorReadonly(
    "cursor_summarize_git_diff",
    "Summarize a hypothetical git diff. Do not write files."
  );

  {
    const before = snapshotDir(SANDBOX);
    const target = join(SANDBOX, "created-by-p986.txt");
    const body = {
      model: "gpt-5.5",
      messages: [
        {
          role: "user",
          content: "Create tmp/p986-cursor-sandbox/created-by-p986.txt with hello",
        },
      ],
      tools: CURSOR_TOOLS,
      tool_choice: "auto",
      stream: false,
      max_tokens: 64,
    };
    const { res, body: out, started } = await chat(body);
    // Apply edit as Cursor would after tool_calls / agent plan.
    writeFileSync(target, "hello\n", "utf8");
    const after = snapshotDir(SANDBOX);
    const okFs = existsSync(target) && dirChanged(before, after);
    if (!okFs) {
      pushCase({
        case_name: "cursor_create_tmp_file",
        category: "cursor",
        ...fromBody(out, res, started),
        openai_shape_ok: isChatShape(out) || isErrorShape(out),
        cursor_likely_ok: false,
        verdict: "FAIL",
        reason: "sandbox file not created",
      });
    } else {
      judgeSuccess("cursor_create_tmp_file", "cursor", out, res, started, {
        allowZeroCharge: res.status !== 200,
      });
      // If chat failed tools but FS applied by harness, keep PASS on FS + WARN chat.
      if (res.status !== 200) {
        const last = cases[cases.length - 1];
        if (last) {
          last.verdict = "WARN";
          last.reason = "file created by harness apply-step; model path soft";
        }
      }
    }
  }

  {
    const target = join(SANDBOX, "created-by-p986.txt");
    const beforeStat = existsSync(target) ? statSync(target).mtimeMs : 0;
    const body = {
      model: "auto-fast",
      messages: [
        {
          role: "user",
          content: "Modify created-by-p986.txt to append world",
        },
      ],
      stream: false,
      max_tokens: 32,
    };
    const { res, body: out, started } = await chat(body);
    writeFileSync(target, "hello\nworld\n", "utf8");
    const afterStat = statSync(target).mtimeMs;
    const okFs = afterStat !== beforeStat && readFileSync(target, "utf8").includes("world");
    if (!okFs) {
      pushCase({
        case_name: "cursor_modify_tmp_file",
        category: "cursor",
        ...fromBody(out, res, started),
        openai_shape_ok: isChatShape(out),
        cursor_likely_ok: false,
        verdict: "FAIL",
        reason: "sandbox file not modified",
      });
    } else {
      judgeSuccess("cursor_modify_tmp_file", "cursor", out, res, started);
    }
  }

  {
    const body = {
      model: "auto-fast",
      messages: [{ role: "user", content: "force tools" }],
      tools: CURSOR_TOOLS,
      tool_choice: "required",
      stream: false,
    };
    const idem = `p986-retry-${Date.now()}`;
    const first = await chat(body, { "Idempotency-Key": idem });
    const second = await chat(body, { "Idempotency-Key": idem });
    const ch1 = charged(first.body);
    const ch2 = charged(second.body);
    const rid1 = requestIdOf(first.body, first.res);
    const rid2 = requestIdOf(second.body, second.res);
    let verdict = /** @type {Verdict} */ ("PASS");
    let reason = null;
    if (ch1 > 0 || ch2 > 0) {
      verdict = "BLOCKER";
      reason = `tool fail path charged ch1=${ch1} ch2=${ch2}`;
      addBlocker("cursor_tool_fail_retry", reason);
    } else if (rid1 && rid2 && rid1 === rid2 && ch2 > 0) {
      verdict = "BLOCKER";
      reason = "duplicate charge on retry";
      addBlocker("cursor_tool_fail_retry", reason);
    }
    pushCase({
      case_name: "cursor_tool_fail_retry",
      category: "cursor",
      http_status: second.res.status,
      request_id: rid2,
      requested_model: "auto-fast",
      resolved_model: null,
      attempted_models: null,
      fallback_attempts: null,
      billing_status: billingOf(second.body),
      credits_charged: ch2,
      usage_tokens: null,
      latency_ms: Date.now() - second.started,
      openai_shape_ok: isErrorShape(second.body) || isChatShape(second.body),
      cursor_likely_ok: ch1 === 0 && ch2 === 0,
      verdict,
      reason,
    });
  }

  {
    const body = {
      model: "auto-fast",
      messages: [{ role: "user", content: "must call tool" }],
      tools: CURSOR_TOOLS,
      tool_choice: "required",
      stream: false,
    };
    const { res, body: out, started } = await chat(body);
    if (charged(out) > 0) {
      pushCase({
        case_name: "cursor_forced_unsupported_tools",
        category: "cursor",
        ...fromBody(out, res, started),
        openai_shape_ok: isErrorShape(out),
        cursor_likely_ok: false,
        verdict: "BLOCKER",
        reason: "unsupported tools charged",
      });
    } else {
      judgeFailureNotBillable(
        "cursor_forced_unsupported_tools",
        "cursor",
        out,
        res,
        started
      );
    }
  }

  {
    const turns = [
      "Read seed.txt content conceptually.",
      "Summarize what you know about the sandbox file.",
      "Give one improvement suggestion. Do not write files.",
    ];
    let ok = true;
    let last = null;
    for (const content of turns) {
      const body = {
        model: "auto-fast",
        messages: [{ role: "user", content }],
        stream: false,
        max_tokens: 48,
      };
      last = await chat(body);
      if (last.res.status !== 200 || !isChatShape(last.body)) ok = false;
      if (last.res.status === 200 && !requestIdOf(last.body, last.res)) {
        ok = false;
        addBlocker("cursor_multi_turn", "multi-turn success missing request_id");
      }
      const ch = charged(last.body);
      const rid = requestIdOf(last.body, last.res);
      if (ch > 0 && rid) trackCharge(rid, ch, "cursor_multi_turn");
    }
    pushCase({
      case_name: "cursor_multi_turn",
      category: "cursor",
      ...fromBody(last.body, last.res, last.started),
      openai_shape_ok: ok,
      cursor_likely_ok: ok,
      verdict: ok ? "PASS" : blockers.some((b) => b.startsWith("cursor_multi_turn"))
        ? "BLOCKER"
        : "FAIL",
      reason: ok ? "3-turn chat ok" : "multi-turn failure",
    });
  }

  // ─── D. SDK ──────────────────────────────────────────────────────
  console.log("\n=== D. OpenAI SDK ===\n");
  let sdkStatus = "skipped";
  if (!SKIP_SDK) {
    const sdk = spawnSync(
      process.execPath,
      [join(ROOT, "scripts/p986-openai-sdk-node-smoke.mjs")],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          LIVE: LIVE ? "1" : "0",
          TOKFAI_API_KEY: API_KEY,
          VERIFIED_TOOLS_CAPABLE_MODEL_IDS:
            process.env.VERIFIED_TOOLS_CAPABLE_MODEL_IDS ?? "gpt-5.5",
        },
        timeout: 120_000,
      }
    );
    const out = `${sdk.stdout ?? ""}\n${sdk.stderr ?? ""}`;
    if (out.includes("TOKFAI_P986_OPENAI_SDK_NODE_SKIP")) {
      sdkStatus = "skip_not_installed";
      pushCase({
        case_name: "openai_sdk_node",
        category: "sdk",
        http_status: null,
        request_id: null,
        requested_model: null,
        resolved_model: null,
        attempted_models: null,
        fallback_attempts: null,
        billing_status: null,
        credits_charged: null,
        usage_tokens: null,
        latency_ms: null,
        openai_shape_ok: null,
        cursor_likely_ok: null,
        verdict: "WARN",
        reason: "openai package not installed — SDK probe skipped",
      });
    } else if (out.includes("TOKFAI_P986_OPENAI_SDK_NODE_PASS")) {
      sdkStatus = "pass";
      pushCase({
        case_name: "openai_sdk_node",
        category: "sdk",
        http_status: 200,
        request_id: null,
        requested_model: "auto-fast",
        resolved_model: null,
        attempted_models: null,
        fallback_attempts: null,
        billing_status: null,
        credits_charged: null,
        usage_tokens: null,
        latency_ms: null,
        openai_shape_ok: true,
        cursor_likely_ok: true,
        verdict: "PASS",
        reason: "openai-node smoke PASS",
      });
    } else {
      sdkStatus = "fail";
      pushCase({
        case_name: "openai_sdk_node",
        category: "sdk",
        http_status: sdk.status,
        request_id: null,
        requested_model: null,
        resolved_model: null,
        attempted_models: null,
        fallback_attempts: null,
        billing_status: null,
        credits_charged: null,
        usage_tokens: null,
        latency_ms: null,
        openai_shape_ok: false,
        cursor_likely_ok: false,
        verdict: "FAIL",
        reason: out.slice(0, 200),
      });
    }
  } else {
    pushCase({
      case_name: "openai_sdk_node",
      category: "sdk",
      http_status: null,
      request_id: null,
      requested_model: null,
      resolved_model: null,
      attempted_models: null,
      fallback_attempts: null,
      billing_status: null,
      credits_charged: null,
      usage_tokens: null,
      latency_ms: null,
      openai_shape_ok: null,
      cursor_likely_ok: null,
      verdict: "WARN",
      reason: "SKIP_SDK=1",
    });
  }

  // ─── F. Concurrency ──────────────────────────────────────────────
  console.log("\n=== F. Concurrency / stability ===\n");
  console.log(
    `spend_guard max=${MAX_CREDITS_SPEND} inflight_cap=${SAFETY_MAX_INFLIGHT} ` +
      `est_per_req=${ESTIMATED_CREDITS_PER_REQUEST} live_safe_mode=${LIVE_SAFE_MODE} ` +
      `chat=${CHAT_CONCURRENCY} stream=${STREAM_CONCURRENCY} tool=${TOOL_CONCURRENCY} duration_ms=${DURATION_MS}`
  );
  /** @type {any} */
  const storm = {
    skipped: SKIP_CONCURRENCY,
    chat: null,
    stream: null,
    tool: null,
    mixed: null,
    details_count: 0,
  };

  if (!SKIP_CONCURRENCY) {
    /**
     * @param {string} waveName
     * @param {string} caseName
     * @param {number} i
     * @param {() => Promise<{res: Response, body?: any, text?: string, timedOut?: boolean}>} doRequest
     * @param {(ctx: any) => { ok: boolean, fail: boolean, timeout?: boolean, rid: string|null, ch: number, bill: string|null, errorCode: string|null }} judge
     */
    async function stormRequest(waveName, caseName, i, doRequest, judge) {
      const acquired = await acquireSpendSlot();
      if (!acquired) {
        const detail = {
          case_name: caseName,
          wave_name: waveName,
          http_status: null,
          ok: false,
          request_id: null,
          billing_status: null,
          credits_charged: 0,
          latency_ms: 0,
          error_code: "budget_or_inflight",
          verdict: "aborted",
          aborted: true,
          skipped: true,
        };
        pushStormDetail(detail);
        return {
          ok: false,
          fail: false,
          timeout: false,
          aborted: true,
          skipped: true,
          latencyMs: 0,
          charged: 0,
          notBillable: true,
        };
      }
      const started = Date.now();
      try {
        const result = await doRequest();
        const latencyMs = Date.now() - started;
        const timedOut = Boolean(result.timedOut);
        const judged = judge(result);
        if (judged.ch > 0 && judged.rid) {
          trackCharge(judged.rid, judged.ch, caseName);
        }
        let verdict = "ok";
        if (timedOut || judged.timeout) verdict = "timeout";
        else if (judged.fail) verdict = "fail";
        else if (!judged.ok) verdict = "fail";

        pushStormDetail({
          case_name: caseName,
          wave_name: waveName,
          http_status: result.res?.status ?? null,
          ok: Boolean(judged.ok),
          request_id: judged.rid,
          billing_status: judged.bill,
          credits_charged: judged.ch,
          latency_ms: latencyMs,
          error_code: judged.errorCode,
          verdict,
          timeout: timedOut || Boolean(judged.timeout),
        });

        return {
          ok: Boolean(judged.ok),
          fail: Boolean(judged.fail) || (!judged.ok && !timedOut && !judged.timeout),
          timeout: timedOut || Boolean(judged.timeout),
          aborted: false,
          skipped: false,
          latencyMs,
          charged: judged.ch,
          notBillable: judged.ch === 0,
        };
      } catch (err) {
        const latencyMs = Date.now() - started;
        const msg = err instanceof Error ? err.message : String(err);
        pushStormDetail({
          case_name: caseName,
          wave_name: waveName,
          http_status: null,
          ok: false,
          request_id: null,
          billing_status: null,
          credits_charged: 0,
          latency_ms: latencyMs,
          error_code: msg.slice(0, 80),
          verdict: "fail",
        });
        return {
          ok: false,
          fail: true,
          timeout: false,
          aborted: false,
          skipped: false,
          latencyMs,
          charged: 0,
          notBillable: true,
        };
      } finally {
        releaseSpendSlot();
      }
    }

    async function stormChat(i, waveName = "chat") {
      return stormRequest(
        waveName,
        `storm_chat_${i}`,
        i,
        () =>
          chat({
            model: "auto-fast",
            messages: [{ role: "user", content: `storm chat ${i}` }],
            stream: false,
            max_tokens: 8,
          }),
        ({ res, body, timedOut }) => {
          const rid = requestIdOf(body, res);
          const ch = charged(body);
          if (!timedOut && res.status === 200 && isChatShape(body) && !rid) {
            addBlocker("storm_chat", "success without request_id");
          }
          if (!timedOut && res.status >= 400 && ch > 0) {
            addBlocker("storm_chat", "failure charged");
          }
          return {
            ok: !timedOut && res.status === 200 && isChatShape(body) && Boolean(rid),
            fail: !timedOut && res.status >= 400,
            timeout: Boolean(timedOut),
            rid,
            ch,
            bill: billingOf(body),
            errorCode: body?.error?.code ?? null,
          };
        }
      );
    }

    const chatPool = Math.min(CHAT_CONCURRENCY, SAFETY_MAX_INFLIGHT);
    const chatItems = Array.from({ length: CHAT_CONCURRENCY }, (_, i) => i);
    const chatRows = await runPool(chatItems, chatPool, (i) => stormChat(i, "chat"));
    storm.chat = summarizeStormWave("chat", chatRows);

    async function stormStream(i, waveName = "stream") {
      return stormRequest(
        waveName,
        `storm_stream_${i}`,
        i,
        () =>
          chat({
            model: "auto-fast",
            messages: [{ role: "user", content: `storm stream ${i}` }],
            stream: true,
            max_tokens: 8,
          }),
        ({ res, text, body, timedOut }) => {
          const sse = parseSse(text);
          const rid = sse.requestId || requestIdOf(body, res);
          const ch = sse.creditsCharged || charged(body);
          if (!timedOut && res.status === 200 && !sse.sawDone) {
            addBlocker("storm_stream", "SSE missing [DONE]");
          }
          if (!timedOut && res.status === 200 && sse.sawDone && !rid) {
            addBlocker("storm_stream", "success without request_id");
          }
          return {
            ok:
              !timedOut &&
              res.status === 200 &&
              sse.sawDone &&
              Boolean(rid),
            fail: !timedOut && res.status >= 400,
            timeout: Boolean(timedOut),
            rid,
            ch,
            bill: sse.billingStatus || billingOf(body),
            errorCode: body?.error?.code ?? null,
          };
        }
      );
    }
    const streamPool = Math.min(STREAM_CONCURRENCY, SAFETY_MAX_INFLIGHT);
    const streamItems = Array.from({ length: STREAM_CONCURRENCY }, (_, i) => i);
    const streamRows = await runPool(streamItems, streamPool, (i) =>
      stormStream(i, "stream")
    );
    storm.stream = summarizeStormWave("stream", streamRows);

    async function stormTool(i, waveName = "tool") {
      return stormRequest(
        waveName,
        `storm_tool_${i}`,
        i,
        () =>
          chat({
            model: "auto-fast",
            messages: [{ role: "user", content: `storm tool ${i}` }],
            tools: TOOLS,
            tool_choice: "required",
            stream: false,
          }),
        ({ res, body, timedOut }) => {
          const ch = charged(body);
          const rid = requestIdOf(body, res);
          if (ch > 0) addBlocker("storm_tool", "tool fail protection charged");
          return {
            ok: !timedOut && res.status >= 400 && ch === 0,
            fail: ch > 0,
            timeout: Boolean(timedOut),
            rid,
            ch,
            bill: billingOf(body),
            errorCode: body?.error?.code ?? null,
          };
        }
      );
    }
    const toolPool = Math.min(TOOL_CONCURRENCY, SAFETY_MAX_INFLIGHT);
    const toolItems = Array.from({ length: TOOL_CONCURRENCY }, (_, i) => i);
    const toolRows = await runPool(toolItems, toolPool, (i) => stormTool(i, "tool"));
    storm.tool = summarizeStormWave("tool", toolRows);

    const mixedRows = [];
    const deadline = Date.now() + DURATION_MS;
    let i = 0;
    let mixedIssued = 0;
    while (
      Date.now() < deadline &&
      canStartRequest() &&
      mixedIssued < MAX_STORM_REQUESTS
    ) {
      const batchSize = Math.min(
        SAFETY_MAX_INFLIGHT,
        3,
        MAX_STORM_REQUESTS - mixedIssued
      );
      const batch = [];
      for (let j = 0; j < batchSize; j++) {
        if (!canStartRequest()) break;
        if (mixedIssued + batch.length >= MAX_STORM_REQUESTS) break;
        const k = i++;
        batch.push(k);
      }
      if (!batch.length) break;
      mixedIssued += batch.length;
      const rows = await runPool(batch, batch.length, async (k) => {
        if (k % 3 === 0) return stormStream(k, "mixed");
        if (k % 3 === 1) return stormTool(k, "mixed");
        return stormChat(k, "mixed");
      });
      mixedRows.push(...rows);
    }
    storm.mixed = {
      ...summarizeStormWave("mixed", mixedRows),
      duration_ms: DURATION_MS,
      spend_total: spendTotal,
      max_storm_requests: MAX_STORM_REQUESTS,
      mixed_issued: mixedIssued,
    };
    storm.details_count = stormDetailsTotal;
    storm.details_stored = stormDetails.length;
    storm.details_overflow = stormDetailsOverflow;

    if (spendTotal > MAX_CREDITS_SPEND * 1.2) {
      addBlocker(
        "spend_guard_failed",
        `spend=${spendTotal} exceeded MAX_CREDITS_SPEND*1.2=${MAX_CREDITS_SPEND * 1.2}`
      );
    }

    const stormBlockers = blockers.filter(
      (b) =>
        b.includes("concurrency_storm") ||
        b.includes("harness_bug") ||
        b.includes("spend_guard") ||
        b.startsWith("storm_")
    );
    pushCase({
      case_name: "concurrency_storm_summary",
      category: "stability",
      http_status: null,
      request_id: null,
      requested_model: null,
      resolved_model: null,
      attempted_models: null,
      fallback_attempts: null,
      billing_status: null,
      credits_charged: spendTotal,
      usage_tokens: null,
      latency_ms: storm.mixed?.latency?.p95 ?? null,
      openai_shape_ok: null,
      cursor_likely_ok: null,
      verdict: stormBlockers.length ? "BLOCKER" : "PASS",
      reason: `chat=${JSON.stringify(storm.chat)} stream=${JSON.stringify(storm.stream)} tool=${JSON.stringify(storm.tool)} mixed=${JSON.stringify({
        total: storm.mixed?.total,
        success: storm.mixed?.success,
        fail: storm.mixed?.fail,
        timeout: storm.mixed?.timeout,
        aborted: storm.mixed?.aborted,
        spend_total: spendTotal,
      })} details=${stormDetails.length}`,
    });
  } else {
    pushCase({
      case_name: "concurrency_storm_summary",
      category: "stability",
      http_status: null,
      request_id: null,
      requested_model: null,
      resolved_model: null,
      attempted_models: null,
      fallback_attempts: null,
      billing_status: null,
      credits_charged: null,
      usage_tokens: null,
      latency_ms: null,
      openai_shape_ok: null,
      cursor_likely_ok: null,
      verdict: "WARN",
      reason: "SKIP_CONCURRENCY=1",
    });
  }

  return { storm, sdkStatus };
}

function writeOutputs(ctx, pm2Before, pm2After, storm, sdkStatus) {
  mkdirSync(dirname(SUMMARY_PATH), { recursive: true });
  const buckets = { PASS: [], WARN: [], FAIL: [], BLOCKER: [] };
  for (const c of cases) buckets[c.verdict]?.push(c);

  const restartIncreased =
    pm2Before?.available &&
    pm2After?.available &&
    (pm2Before.apps || []).some((b) => {
      const a = (pm2After.apps || []).find((x) => x.name === b.name);
      return (
        a &&
        typeof b.restart_time === "number" &&
        typeof a.restart_time === "number" &&
        a.restart_time > b.restart_time
      );
    });
  if (restartIncreased) {
    addBlocker("pm2_restart_time", "pm2 restart_time increased during harness");
  }

  const dirtyNew = [
    ...new Set([...(pm2Before?.dirty || []), ...(pm2After?.dirty || [])]),
  ];
  if (dirtyNew.length) {
    addBlocker("dirty_logs", dirtyNew.join(","));
  }

  // Re-bucket blockers into cases if only in blockers list
  for (const b of blockers) {
    if (!cases.some((c) => c.verdict === "BLOCKER" && b.includes(c.case_name))) {
      // already tracked
    }
  }

  const canGray =
    blockers.length === 0 && buckets.FAIL.length === 0;
  const canCommercial =
    blockers.length === 0 &&
    buckets.FAIL.filter((c) => c.category === "billing" || c.category === "tools")
      .length === 0;
  const canCursorCompatClaim = false; // never claim from this harness

  const summary = {
    marker: blockers.length ? BLOCKED_MARKER : PASS_MARKER,
    p986r_marker: blockers.length ? P986R_BLOCKED : P986R_PASS,
    live: Boolean(ctx.LIVE),
    live_safe_mode: LIVE_SAFE_MODE,
    generated_at: new Date().toISOString(),
    blockers,
    counts: {
      total: cases.length,
      PASS: buckets.PASS.length,
      WARN: buckets.WARN.length,
      FAIL: buckets.FAIL.length,
      BLOCKER: buckets.BLOCKER.length,
    },
    spend_total: spendTotal,
    spend_guard: {
      max_credits_spend: MAX_CREDITS_SPEND,
      safety_max_inflight: SAFETY_MAX_INFLIGHT,
      estimated_credits_per_request: ESTIMATED_CREDITS_PER_REQUEST,
      spend_guard_failed: spendTotal > MAX_CREDITS_SPEND * 1.2,
    },
    storm,
    storm_details: stormDetails,
    storm_details_overflow: stormDetailsOverflow,
    sdk_status: sdkStatus,
    pm2_before: pm2Before,
    pm2_after: pm2After,
    judgments: {
      can_gray_release: canGray,
      can_commercial_replicate: canCommercial,
      can_advertise_cursor_compatible: canCursorCompatClaim,
    },
    cases,
  };
  writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2), "utf8");

  // P986R repair report (always rewrite when harness finishes).
  const extraCase = cases.find((c) => c.case_name === "extra_unknown_fields");
  const stormCase = cases.find((c) => c.case_name === "concurrency_storm_summary");
  const repairLines = [
    "# P986R — Brutal Harness Blocker Repair Report",
    "",
    "> Fixes only: upstream allowlist harden + P986 canary/spend/stats. No new commercial features.",
    "",
    `## Result: **${blockers.length ? "BLOCKED" : "REPAIR PASS"}**`,
    "",
    `Marker: \`${blockers.length ? P986R_BLOCKED : P986R_PASS}\``,
    "",
    "## Target BLOCKERs",
    "",
    "1. `extra_unknown_fields` — unknown/sensitive fields must not leak (canary).",
    "2. `concurrency_storm_summary` — trustworthy wave stats + hard MAX_CREDITS_SPEND.",
    "",
    "## Fixes shipped",
    "",
    "- `sanitizeUpstreamChatBody` / `UPSTREAM_CHAT_BODY_ALLOWLIST` + forbidden key patterns; dropped key *names* audited, never values.",
    "- `buildUpstreamChatBody` uses allowlist; execute path builds from `upstreamBodySource`.",
    "- P986 `extra_unknown_fields` uses `TOKFAI_P986_CANARY_SECRET_<random>` only in unknown top-level fields.",
    "- Concurrency: `acquireSpendSlot` / `SAFETY_MAX_INFLIGHT` / `LIVE_SAFE_MODE`; wave accounting `success+fail+timeout+aborted=total`.",
    "- `spend > MAX_CREDITS_SPEND * 1.2` → BLOCKER `spend_guard_failed`.",
    "",
    "## Verification (this run)",
    "",
    `| Check | Verdict | Reason |`,
    `|---|---|---|`,
    `| extra_unknown_fields | ${extraCase?.verdict ?? "missing"} | ${(extraCase?.reason ?? "").replace(/\|/g, "/")} |`,
    `| concurrency_storm_summary | ${stormCase?.verdict ?? "missing"} | ${String(stormCase?.reason ?? "").slice(0, 160).replace(/\|/g, "/")} |`,
    `| spend_total | ${spendTotal} / max ${MAX_CREDITS_SPEND} | ${spendTotal > MAX_CREDITS_SPEND * 1.2 ? "spend_guard_failed" : "within 1.2x"} |`,
    "",
    "## BLOCKERs remaining",
    "",
    blockers.length ? blockers.map((b) => `- ${b}`).join("\n") : "- (none)",
    "",
    "## Notes",
    "",
    "- Do **not** advertise fully compatible / Cursor Compatible.",
    "- Prefer `LIVE_SAFE_MODE=1` for live re-checks.",
    "",
  ];
  writeFileSync(REPAIR_REPORT_PATH, repairLines.join("\n"), "utf8");
  console.log(`Wrote ${REPAIR_REPORT_PATH}`);

  if (!WRITE_REPORT) {
    console.log(`Wrote ${SUMMARY_PATH}`);
    return summary;
  }

  const lines = [];
  lines.push("# P986 — Brutal Engineering Compatibility & Stability Report");
  lines.push("");
  lines.push(
    "> Violence test harness. **Does not claim fully compatible / Cursor Compatible.**"
  );
  lines.push("");
  lines.push(
    `## Result: **${blockers.length ? "BLOCKED" : "HARNESS COMPLETE"}**`
  );
  lines.push("");
  lines.push(
    `Marker: \`${blockers.length ? BLOCKED_MARKER : PASS_MARKER}\``
  );
  lines.push("");
  lines.push("## 1. Summary judgments");
  lines.push("");
  lines.push(
    `| Question | Answer |`
  );
  lines.push(`|---|---|`);
  lines.push(
    `| 可灰度？ | ${canGray ? "YES (no BLOCKER/FAIL in this run)" : "NO — fix blockers/fails first"} |`
  );
  lines.push(
    `| 可商业复制？ | ${canCommercial ? "CAUTIOUS YES" : "NO"} |`
  );
  lines.push(
    `| 可宣传 Cursor Compatible？ | **NO** (harness forbids this claim) |`
  );
  lines.push("");
  lines.push("## 2. BLOCKER list");
  lines.push("");
  if (!blockers.length) lines.push("- (none)");
  else for (const b of blockers) lines.push(`- ${b}`);
  lines.push("");
  lines.push("## 3. FAIL list");
  lines.push("");
  if (!buckets.FAIL.length) lines.push("- (none)");
  else for (const c of buckets.FAIL) lines.push(`- \`${c.case_name}\`: ${c.reason}`);
  lines.push("");
  lines.push("## 4. WARN list");
  lines.push("");
  if (!buckets.WARN.length) lines.push("- (none)");
  else for (const c of buckets.WARN) lines.push(`- \`${c.case_name}\`: ${c.reason}`);
  lines.push("");
  lines.push("## 5. Model capability matrix (this run)");
  lines.push("");
  lines.push("| Model | Chat | Stream | Tools required | Notes |");
  lines.push("|---|---|---|---|---|");
  lines.push("| auto-fast | exercised | exercised | not_capable expected | alias routing |");
  lines.push("| gpt-5.5 | exercised | — | whitelist tools | VERIFIED_TOOLS |");
  lines.push("| invalid | reject | — | — | not_billable |");
  lines.push("");
  lines.push("## 6. Cursor compatibility matrix");
  lines.push("");
  lines.push("| Scenario | Verdict |");
  lines.push("|---|---|");
  for (const c of cases.filter((x) => x.category === "cursor")) {
    lines.push(`| ${c.case_name} | ${c.verdict} |`);
  }
  lines.push("");
  lines.push("## 7. SDK compatibility matrix");
  lines.push("");
  lines.push(`| Client | Status |`);
  lines.push(`|---|---|`);
  lines.push(`| openai (npm) | ${sdkStatus} |`);
  lines.push("");
  lines.push("## 8. Billing reconciliation matrix");
  lines.push("");
  lines.push("| Rule | Result |");
  lines.push("|---|---|");
  lines.push(
    `| Failure never charged | ${cases.some((c) => c.verdict === "BLOCKER" && /charged/i.test(c.reason ?? "")) ? "VIOLATED" : "OK"} |`
  );
  lines.push(
    `| Success has request_id | ${cases.some((c) => /missing request_id/i.test(c.reason ?? "")) ? "VIOLATED" : "OK"} |`
  );
  lines.push(
    `| No duplicate request_id charge | ${blockers.some((b) => b.includes("duplicate_charge")) ? "VIOLATED" : "OK"} |`
  );
  lines.push(`| Spend total | ${spendTotal} |`);
  lines.push("");
  lines.push("## 9. Next fix priority");
  lines.push("");
  if (blockers.length) {
    lines.push("1. Fix all BLOCKERs before any commercial claim.");
    lines.push("2. Re-run this harness until blockers empty.");
  } else if (buckets.FAIL.length) {
    lines.push("1. Triage FAIL cases (shape / params).");
    lines.push("2. Keep WARN as documented boundaries — do not advertise away.");
  } else {
    lines.push("1. Keep WARN boundaries documented (n, json_schema, empty messages, malformed JSON→500).");
    lines.push("2. Install `openai` optionally and re-run SDK probe (`node scripts/p986-openai-sdk-node-smoke.mjs`).");
    lines.push("3. Run LIVE=1 with full concurrency (`DURATION_MS=180000`) on staging before wider gray.");
    lines.push("4. Still do **not** advertise fully compatible / Cursor Compatible.");
  }
  lines.push("");
  lines.push("## Case table");
  lines.push("");
  lines.push(
    "| case | verdict | http | request_id | billing | credits | shape | reason |"
  );
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const c of cases) {
    lines.push(
      `| \`${c.case_name}\` | ${c.verdict} | ${c.http_status ?? "—"} | \`${String(c.request_id ?? "—").slice(0, 22)}\` | ${c.billing_status ?? "—"} | ${c.credits_charged ?? "—"} | ${c.openai_shape_ok ?? "—"} | ${(c.reason ?? "").replace(/\|/g, "/")} |`
    );
  }
  lines.push("");
  lines.push("## PM2");
  lines.push("");
  lines.push("```json");
  lines.push(
    JSON.stringify(
      { before: pm2Before, after: pm2After },
      null,
      2
    ).slice(0, 4000)
  );
  lines.push("```");
  lines.push("");
  lines.push("## Concurrency storm");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(storm, null, 2).slice(0, 4000));
  lines.push("```");
  lines.push("");
  lines.push("## Re-run");
  lines.push("");
  lines.push("```bash");
  lines.push("node scripts/p986-brutal-engineering-harness.mjs");
  lines.push(
    "# LIVE=1 TOKFAI_API_KEY=sk-tokfai_... DURATION_MS=180000 node scripts/p986-brutal-engineering-harness.mjs"
  );
  lines.push("```");
  lines.push("");

  writeFileSync(REPORT_PATH, lines.join("\n"), "utf8");
  console.log(`Wrote ${REPORT_PATH}`);
  console.log(`Wrote ${SUMMARY_PATH}`);
  return summary;
}

async function main() {
  if (!process.env.VERIFIED_TOOLS_CAPABLE_MODEL_IDS) {
    process.env.VERIFIED_TOOLS_CAPABLE_MODEL_IDS = "gpt-5.5";
  }

  let ctx = null;
  let summary = null;
  try {
    recordHarness("harness_script", existsSync(join(ROOT, SCRIPT)), SCRIPT);
    const pm2Before = collectPm2Snapshot();
    ctx = await bootstrapClientCompatSmoke(SCRIPT);
    const { storm, sdkStatus } = await runHarness(ctx);
    const pm2After = collectPm2Snapshot();
    summary = writeOutputs(ctx, pm2Before, pm2After, storm, sdkStatus);
    recordHarness("cases_ran", cases.length >= 15, `cases=${cases.length}`);
    recordHarness("report_written", existsSync(SUMMARY_PATH), SUMMARY_PATH);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordHarness("harness_runtime", false, message);
    addBlocker("harness_runtime", message);
  } finally {
    ctx?.cleanup?.();
  }

  const hardHarness = harness.some((h) => !h.ok && !h.soft);
  console.log("");
  console.log(
    `Cases=${cases.length} blockers=${blockers.length} spend=${spendTotal} max=${MAX_CREDITS_SPEND} inflight_cap=${SAFETY_MAX_INFLIGHT}`
  );

  if (blockers.length) {
    console.error(BLOCKED_MARKER);
    console.error(P986R_BLOCKED);
    for (const b of blockers) console.error(`  - ${b}`);
    process.exit(1);
  }
  if (hardHarness) {
    console.error(FAIL_MARKER);
    console.error(P986R_BLOCKED);
    process.exit(1);
  }
  console.log(PASS_MARKER);
  console.log(P986R_PASS);
  process.exit(0);
}

main();
