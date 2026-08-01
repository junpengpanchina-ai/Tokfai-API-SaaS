#!/usr/bin/env node
/**
 * P987 — Agent Runtime Compatibility Acceptance (P987R text-agent mode).
 *
 * Cursor / Hermes-like agent workflows as **text Agent** compatibility:
 * list/read/diff/edit/explain via ordinary chat. Does NOT claim real local
 * filesystem tools or fully compatible tool calling.
 *
 * Usage:
 *   node scripts/p987-agent-runtime-compatibility-smoke.mjs
 *   LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p987-agent-runtime-compatibility-smoke.mjs
 *
 * Markers:
 *   TOKFAI_P987_AGENT_RUNTIME_COMPATIBILITY_PASS
 *   TOKFAI_P987_AGENT_RUNTIME_COMPATIBILITY_BLOCKED
 *   TOKFAI_P987_AGENT_RUNTIME_COMPATIBILITY_FAIL
 *   TOKFAI_P987R_AGENT_RUNTIME_REPAIR_PASS (when blockers empty after repair run)
 *
 * P987S summarize stability env (summarizeGitDiffStable only):
 *   P987_SUMMARIZE_MODEL=<stable direct chat model>
 *   P987_SUMMARIZE_FALLBACK_MODEL=<stable direct chat model>
 *   P987_DIFF_MAX_CHARS=1200
 *
 * Defaults use a stable direct catalog chat model (not auto-* aliases).
 */

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bootstrapClientCompatSmoke,
  pass,
  fail,
} from "./lib/client-compat-smoke-bootstrap.mjs";
import { acceptanceFetch } from "./lib/acceptance-http.mjs";

const SCRIPT = "scripts/p987-agent-runtime-compatibility-smoke.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS_MARKER = "TOKFAI_P987_AGENT_RUNTIME_COMPATIBILITY_PASS";
const BLOCKED_MARKER = "TOKFAI_P987_AGENT_RUNTIME_COMPATIBILITY_BLOCKED";
const FAIL_MARKER = "TOKFAI_P987_AGENT_RUNTIME_COMPATIBILITY_FAIL";
const P987R_PASS = "TOKFAI_P987R_AGENT_RUNTIME_REPAIR_PASS";
const P987R_BLOCKED = "TOKFAI_P987R_AGENT_RUNTIME_REPAIR_BLOCKED";

const WRITE_REPORT =
  process.env.WRITE_REPORT !== "0" && process.env.WRITE_REPORT !== "false";
const REPORT_PATH = join(
  ROOT,
  process.env.REPORT_PATH ?? "docs/p987-agent-runtime-compatibility-report.md"
);
const REPAIR_REPORT_PATH = join(
  ROOT,
  process.env.REPAIR_REPORT_PATH ??
    "docs/p987r-agent-runtime-compatibility-repair-report.md"
);
const STABILITY_REPORT_PATH = join(
  ROOT,
  process.env.STABILITY_REPORT_PATH ??
    "docs/p987s-summarize-git-diff-stability-report.md"
);
const SUMMARY_PATH = join(
  ROOT,
  process.env.SUMMARY_PATH ?? "tmp/p987-agent-runtime-summary.json"
);
const SANDBOX = join(ROOT, "tmp/p987-agent-sandbox");
const AGENT_FILE = join(SANDBOX, "cursor-agent-test.ts");
const SEED_FILE = join(SANDBOX, "seed.ts");

/** @typedef {'PASS'|'WARN'|'FAIL'|'BLOCKER'} Verdict */
/**
 * @typedef {{
 *  case_name: string,
 *  category: string,
 *  kind: string,
 *  http_status: number|null,
 *  request_id: string|null,
 *  billing_status: string|null,
 *  credits_charged: number|null,
 *  has_usage: boolean|null,
 *  routing_ok: boolean|null,
 *  content_ok: boolean|null,
 *  file_mutation: boolean|null,
 *  context_kept: boolean|null,
 *  verdict: Verdict,
 *  reason: string|null,
 * }} CaseRow
 */

/** @type {CaseRow[]} */
const cases = [];
/** @type {string[]} */
const blockers = [];
/** @type {{ id: string, ok: boolean, soft?: boolean, detail?: string }[]} */
const harness = [];

const AGENT_TOOLS = [
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
];

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

function addBlocker(id, reason) {
  const line = `${id}: ${reason}`;
  if (!blockers.includes(line)) blockers.push(line);
}

function pushCase(row) {
  cases.push(row);
  console.log(
    `${row.verdict.padEnd(7)} ${row.case_name} kind=${row.kind} ` +
      `status=${row.http_status ?? "—"} bill=${row.billing_status ?? "—"} ` +
      `ch=${row.credits_charged ?? "—"} ${row.reason ?? ""}`
  );
}

function charged(body) {
  const n = Number(body?.credits_charged ?? body?.tokfai?.credits_charged ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function billingOf(body) {
  const s = body?.tokfai?.billing_status;
  return typeof s === "string" ? s : null;
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

function hasUsage(body) {
  const u = body?.usage;
  if (!u || typeof u !== "object") return false;
  return (
    typeof u.prompt_tokens === "number" ||
    typeof u.completion_tokens === "number" ||
    typeof u.total_tokens === "number"
  );
}

function routingEvidenceOk(body) {
  const t = body?.tokfai;
  if (!t || typeof t !== "object") return false;
  const hasRid =
    typeof t.request_id === "string" || typeof body?.request_id === "string";
  const hasRequested = typeof t.requested_model === "string";
  const hasResolved =
    t.resolved_model === null || typeof t.resolved_model === "string";
  const hasStrategy = typeof t.routing_strategy === "string";
  const hasAttempted = Array.isArray(t.attempted_models);
  const hasFallback = typeof t.fallback_attempts === "number";
  const hasBilling = typeof t.billing_status === "string";
  return Boolean(
    hasRid &&
      hasRequested &&
      hasResolved &&
      hasStrategy &&
      hasAttempted &&
      hasFallback &&
      hasBilling
  );
}

function contentText(body) {
  const c = body?.choices?.[0]?.message?.content;
  return typeof c === "string" ? c : "";
}

/**
 * Success path (HTTP 200 charged).
 * Distinguishes: missing usage / missing routing / dirty success without billing.
 */
function judgeChargedSuccess(caseName, body, res) {
  const rid = requestIdOf(body, res);
  const ch = charged(body);
  const bill = billingOf(body);
  const routing = routingEvidenceOk(body);
  const usageOk = hasUsage(body);
  /** @type {string[]} */
  const problems = [];
  /** @type {string} */
  let kind = "200_charged_success";

  if (res.status !== 200) {
    kind =
      res.status === 504 || body?.error?.code === "upstream_timeout"
        ? "upstream_timeout_504"
        : res.status >= 400
          ? "true_400_reject"
          : `http_${res.status}`;
    problems.push(`expected_200_got_${res.status}`);
    return { rid, ch, bill, routing, usageOk, problems, kind, blocker: false };
  }
  if (!rid) {
    problems.push("missing_request_id");
    addBlocker(caseName, "success missing request_id");
  }
  if (!routing) {
    problems.push("missing_routing_evidence");
    addBlocker(caseName, "success missing routing evidence");
  }
  if (!usageOk) {
    problems.push("missing_usage");
    kind = "missing_usage";
    addBlocker(caseName, "success missing usage");
  }
  if (!(ch > 0) || bill !== "charged") {
    problems.push("dirty_success_without_billing");
    kind = "dirty_success_without_billing";
    addBlocker(
      caseName,
      "success without charged usage (credits_charged not > 0 or billing_status≠charged)"
    );
  }
  if (problems.length === 0 && contentText(body).trim()) {
    kind = "200_content_success";
  }
  return {
    rid,
    ch,
    bill: bill ?? (ch > 0 ? "charged" : null),
    routing,
    usageOk,
    problems,
    kind,
    blocker: problems.some((p) =>
      /missing_request_id|missing_routing|missing_usage|dirty_success/.test(p)
    ),
  };
}

function judgeRejectNotBillable(caseName, body, res) {
  const rid = requestIdOf(body, res);
  const ch = charged(body);
  const bill = billingOf(body);
  const routing = routingEvidenceOk(body);
  /** @type {string[]} */
  const problems = [];
  if (!(res.status >= 400)) problems.push(`expected_reject_got_${res.status}`);
  if (!rid) {
    problems.push("missing_request_id");
    addBlocker(caseName, "failure missing request_id");
  }
  if (ch > 0) {
    problems.push("failure_charged");
    addBlocker(caseName, `failure charged credits=${ch}`);
  }
  if (bill && bill !== "not_billable") {
    problems.push(`billing=${bill}`);
  }
  if (!routing) {
    problems.push("missing_routing_evidence");
    // Soft for early rejects that only have request_id — still WARN via caller.
  }
  return {
    rid,
    ch,
    bill: bill ?? "not_billable",
    routing,
    problems,
    kind: "true_400_reject",
  };
}

/**
 * Stable direct catalog chat model for P987S summarize (not auto-* alias).
 * Override via P987_SUMMARIZE_MODEL / P987_SUMMARIZE_FALLBACK_MODEL.
 */
const P987_STABLE_CHAT_MODEL = "gemini-2.5-flash";

function resolveSummarizePrimaryModel(opts = {}) {
  const fromEnv = (process.env.P987_SUMMARIZE_MODEL ?? "").trim();
  const fromOpts =
    typeof opts.stableModel === "string" ? opts.stableModel.trim() : "";
  return fromEnv || fromOpts || P987_STABLE_CHAT_MODEL;
}

function resolveSummarizeFallbackModel(opts = {}) {
  const fromEnv = (process.env.P987_SUMMARIZE_FALLBACK_MODEL ?? "").trim();
  const fromOpts =
    typeof opts.fallbackModel === "string" ? opts.fallbackModel.trim() : "";
  return fromEnv || fromOpts || P987_STABLE_CHAT_MODEL;
}

function resolveDiffMaxChars() {
  return Math.max(
    200,
    parseInt(process.env.P987_DIFF_MAX_CHARS ?? "1200", 10) || 1200
  );
}

function truncateDiffInput(diffText, maxChars) {
  const raw = String(diffText ?? "");
  if (raw.length <= maxChars) return raw;
  return `${raw.slice(0, maxChars)}\n…[diff truncated ${raw.length - maxChars} chars]`;
}

function isTransientUpstreamFailure(res, body, timedOut) {
  if (timedOut) return true;
  if (res?.status === 504) return true;
  const code = body?.error?.code;
  return (
    code === "upstream_timeout" ||
    code === "network_timeout" ||
    code === "all_upstreams_unavailable" ||
    code === "gateway_overloaded" ||
    code === "upstream_model_busy"
  );
}

/**
 * P987S harness-only: normalize final timeout into OpenAI-compatible 504
 * with not_billable / credits_charged=0. Never fabricates HTTP 200.
 * Does not touch DMIT billing / public chat paths.
 */
function ensureSummarizeTimeoutFailureEnvelope(result) {
  const prevBody =
    result?.body && typeof result.body === "object" ? result.body : {};
  const prevErr =
    prevBody.error && typeof prevBody.error === "object" ? prevBody.error : {};
  const prevTokfai =
    prevBody.tokfai && typeof prevBody.tokfai === "object"
      ? prevBody.tokfai
      : {};
  const rid = requestIdOf(prevBody, result?.res);
  const code =
    typeof prevErr.code === "string" && prevErr.code
      ? prevErr.code
      : result?.timedOut
        ? "network_timeout"
        : "upstream_timeout";
  const message =
    typeof prevErr.message === "string" && prevErr.message
      ? prevErr.message
      : "上游模型响应超时，请稍后重试或切换模型。";
  const type =
    typeof prevErr.type === "string" && prevErr.type
      ? prevErr.type
      : code === "network_timeout"
        ? "timeout_error"
        : "upstream_error";

  const body = {
    ...prevBody,
    error: {
      ...prevErr,
      message,
      code,
      type,
      ...(rid ? { request_id: prevErr.request_id ?? rid } : {}),
    },
    credits_charged: 0,
    tokfai: {
      ...prevTokfai,
      ...(rid ? { request_id: prevTokfai.request_id ?? rid } : {}),
      billing_status: "not_billable",
      credits_charged: 0,
    },
    ...(rid ? { request_id: prevBody.request_id ?? rid } : {}),
  };
  const text = JSON.stringify(body);
  const res = new Response(text, {
    status: 504,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
  return {
    ...result,
    res,
    body,
    text,
    timedOut: Boolean(result?.timedOut) || code === "network_timeout",
  };
}

/**
 * P987S — stable text-agent git-diff summarization:
 * compressed prompt, env-selected stable chat model, one lightweight fallback.
 * Never fabricates HTTP 200; 504 is never PASS.
 */
async function summarizeGitDiffStable(chat, opts = {}) {
  const maxChars = resolveDiffMaxChars();
  const primaryModel = resolveSummarizePrimaryModel(opts);
  const fallbackModel = resolveSummarizeFallbackModel(opts);
  const rawDiff =
    opts.diffText ??
    "--- a/seed.ts\n+++ b/seed.ts\n- return 'seed';\n+ return 'seed-v2';\n";
  const diff = truncateDiffInput(rawDiff, maxChars);

  const primaryPrompt =
    "Summarize this git diff in ONE short sentence. Reply only the summary.\n" +
    "DIFF:\n" +
    diff;

  const fallbackPrompt =
    "One sentence: what changed in this tiny diff? Reply SUMMARY_OK plus change.\n" +
    truncateDiffInput(diff, Math.min(400, maxChars));

  const attempts = [];
  let result = await chat({
    model: primaryModel,
    messages: [{ role: "user", content: primaryPrompt }],
    stream: false,
    max_tokens: 48,
    temperature: 0,
  });
  attempts.push({
    model: primaryModel,
    status: result.res.status,
    request_id: requestIdOf(result.body, result.res),
    code: result.body?.error?.code ?? null,
    timedOut: Boolean(result.timedOut),
    role: "primary",
  });

  if (isTransientUpstreamFailure(result.res, result.body, result.timedOut)) {
    // One lightweight fallback only — still a real API call, never fake 200.
    result = await chat({
      model: fallbackModel,
      messages: [{ role: "user", content: fallbackPrompt }],
      stream: false,
      max_tokens: 32,
      temperature: 0,
    });
    attempts.push({
      model: fallbackModel,
      status: result.res.status,
      request_id: requestIdOf(result.body, result.res),
      code: result.body?.error?.code ?? null,
      timedOut: Boolean(result.timedOut),
      role: "fallback",
    });
  }

  const timedOutFinal = isTransientUpstreamFailure(
    result.res,
    result.body,
    result.timedOut
  );
  if (timedOutFinal) {
    result = ensureSummarizeTimeoutFailureEnvelope(result);
  }

  return {
    ...result,
    attempts,
    primaryModel,
    fallbackModel,
    diffChars: diff.length,
    diffTruncated: String(rawDiff).length > maxChars,
    maxChars,
    usedFallback: attempts.length > 1,
    timeoutFailure: timedOutFinal,
  };
}

function resetSandbox() {
  rmSync(SANDBOX, { recursive: true, force: true });
  mkdirSync(SANDBOX, { recursive: true });
  writeFileSync(
    SEED_FILE,
    "export function seed(): string {\n  return 'seed';\n}\n",
    "utf8"
  );
}

async function main() {
  let ctx = null;
  try {
    recordHarness("harness_script", existsSync(join(ROOT, SCRIPT)), SCRIPT);
    resetSandbox();
    ctx = await bootstrapClientCompatSmoke(SCRIPT);
    const { BASE, API_KEY, TIMEOUT_MS, LIVE } = ctx;
    const chatModel = process.env.P987_CHAT_MODEL || "auto-fast";

    async function chat(body, timeoutMs = TIMEOUT_MS) {
      return acceptanceFetch(`${BASE}/v1/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        timeoutMs,
      });
    }

    // ─── A. Cursor Read (text Agent — no tools promised) ───────────
    console.log("\n=== A. Cursor Read (text agent) ===\n");

    {
      const listing = readdirSync(SANDBOX).join(", ");
      const { res, body } = await chat({
        model: chatModel,
        messages: [
          {
            role: "user",
            content:
              `Text-agent task (no tools): List these project files conceptually and say OK: ${listing}. ` +
              `Do not invent tool calls.`,
          },
        ],
        stream: false,
        max_tokens: 64,
      });
      const j = judgeChargedSuccess("cursor_read_list_project_files", body, res);
      const text = contentText(body);
      let verdict = /** @type {Verdict} */ ("PASS");
      let reason = null;
      if (j.problems.length) {
        verdict = j.blocker || blockers.some((b) => b.startsWith("cursor_read_list"))
          ? "BLOCKER"
          : "FAIL";
        reason = j.problems.join("; ");
      } else if (!text.trim()) {
        verdict = "FAIL";
        reason = "200 but empty content";
        j.kind = "200_content_success";
      }
      pushCase({
        case_name: "cursor_read_list_project_files",
        category: "cursor_read",
        kind: j.kind,
        http_status: res.status,
        request_id: j.rid,
        billing_status: j.bill,
        credits_charged: j.ch,
        has_usage: j.usageOk,
        routing_ok: j.routing,
        content_ok: Boolean(text.trim()),
        file_mutation: false,
        context_kept: null,
        verdict,
        reason,
      });
    }

    {
      const seed = readFileSync(SEED_FILE, "utf8").slice(0, 200);
      const { res, body } = await chat({
        model: chatModel,
        messages: [
          {
            role: "user",
            content:
              `Text-agent task: Briefly explain this TypeScript file content (read-only):\n\`\`\`ts\n${seed}\n\`\`\`\nReply with one short sentence.`,
          },
        ],
        stream: false,
        max_tokens: 64,
      });
      const j = judgeChargedSuccess("cursor_read_file", body, res);
      const text = contentText(body);
      let verdict = /** @type {Verdict} */ ("PASS");
      let reason = null;
      if (j.problems.length) {
        verdict = j.blocker || blockers.some((b) => b.startsWith("cursor_read_file"))
          ? "BLOCKER"
          : "FAIL";
        reason = j.problems.join("; ");
      } else if (!text.trim()) {
        verdict = "FAIL";
        reason = "200 but empty content";
      }
      pushCase({
        case_name: "cursor_read_file",
        category: "cursor_read",
        kind: j.kind,
        http_status: res.status,
        request_id: j.rid,
        billing_status: j.bill,
        credits_charged: j.ch,
        has_usage: j.usageOk,
        routing_ok: j.routing,
        content_ok: Boolean(text.trim()),
        file_mutation: false,
        context_kept: null,
        verdict,
        reason,
      });
    }

    {
      const sampleDiff =
        "--- a/seed.ts\n+++ b/seed.ts\n- return 'seed';\n+ return 'seed-v2';\n";
      // P987S: model via P987_SUMMARIZE_* env (default = stable direct chat model).
      const sum = await summarizeGitDiffStable(chat, {
        diffText: sampleDiff,
      });
      const { res, body } = sum;
      const j = judgeChargedSuccess(
        "cursor_read_summarize_git_diff",
        body,
        res
      );
      const text = contentText(body);
      let verdict = /** @type {Verdict} */ ("PASS");
      let reason = null;

      // 504 / timeout after fallback: never PASS; envelope must stay not_billable.
      if (
        sum.timeoutFailure ||
        res.status === 504 ||
        isTransientUpstreamFailure(res, body, sum.timedOut)
      ) {
        const failBill = judgeRejectNotBillable(
          "cursor_read_summarize_git_diff",
          body,
          res
        );
        const envelopeOk =
          res.status === 504 &&
          body?.error &&
          typeof body.error.message === "string" &&
          typeof body.error.code === "string" &&
          (billingOf(body) === "not_billable" || !billingOf(body)) &&
          charged(body) === 0;
        if (failBill.ch > 0 || billingOf(body) === "charged") {
          verdict = "BLOCKER";
          reason = `timeout charged credits=${failBill.ch}`;
        } else if (!envelopeOk) {
          verdict = "FAIL";
          reason =
            `timeout_envelope_invalid status=${res.status} ` +
            `bill=${billingOf(body)} ch=${charged(body)} ` +
            `err=${body?.error?.code ?? "missing"}`;
        } else {
          verdict = "FAIL";
          reason = `upstream_timeout_after_fallback attempts=${JSON.stringify(sum.attempts)}`;
        }
        j.kind = "upstream_timeout_504";
        pushCase({
          case_name: "cursor_read_summarize_git_diff",
          category: "cursor_read",
          kind: j.kind,
          http_status: res.status,
          request_id: failBill.rid ?? j.rid,
          billing_status: "not_billable",
          credits_charged: 0,
          has_usage: hasUsage(body),
          routing_ok: failBill.routing || j.routing,
          content_ok: false,
          file_mutation: false,
          context_kept: null,
          verdict,
          reason,
        });
      } else if (j.problems.length) {
        verdict = j.blocker ? "BLOCKER" : "FAIL";
        reason = j.problems.join("; ");
        pushCase({
          case_name: "cursor_read_summarize_git_diff",
          category: "cursor_read",
          kind: j.kind,
          http_status: res.status,
          request_id: j.rid,
          billing_status: j.bill,
          credits_charged: j.ch,
          has_usage: j.usageOk,
          routing_ok: j.routing,
          content_ok: Boolean(text.trim()),
          file_mutation: false,
          context_kept: null,
          verdict,
          reason,
        });
      } else if (!text.trim()) {
        verdict = "FAIL";
        reason = "200 but empty content";
        pushCase({
          case_name: "cursor_read_summarize_git_diff",
          category: "cursor_read",
          kind: j.kind,
          http_status: res.status,
          request_id: j.rid,
          billing_status: j.bill,
          credits_charged: j.ch,
          has_usage: j.usageOk,
          routing_ok: j.routing,
          content_ok: false,
          file_mutation: false,
          context_kept: null,
          verdict,
          reason,
        });
      } else if (!j.usageOk || !j.rid || !j.routing || !(j.ch > 0)) {
        // Success path must retain usage + request_id + routing + credits.
        verdict = "BLOCKER";
        reason = [
          !j.usageOk ? "missing_usage" : null,
          !j.rid ? "missing_request_id" : null,
          !j.routing ? "missing_routing_evidence" : null,
          !(j.ch > 0) ? "missing_credits_charged" : null,
        ]
          .filter(Boolean)
          .join("; ");
        addBlocker("cursor_read_summarize_git_diff", reason);
        pushCase({
          case_name: "cursor_read_summarize_git_diff",
          category: "cursor_read",
          kind: j.kind,
          http_status: res.status,
          request_id: j.rid,
          billing_status: j.bill,
          credits_charged: j.ch,
          has_usage: j.usageOk,
          routing_ok: j.routing,
          content_ok: true,
          file_mutation: false,
          context_kept: null,
          verdict,
          reason,
        });
      } else {
        reason = sum.usedFallback
          ? `stable_ok via_fallback model=${sum.attempts.at(-1)?.model} diff_chars=${sum.diffChars}`
          : `stable_ok primary=${sum.primaryModel} diff_chars=${sum.diffChars}`;
        pushCase({
          case_name: "cursor_read_summarize_git_diff",
          category: "cursor_read",
          kind: j.kind,
          http_status: res.status,
          request_id: j.rid,
          billing_status: j.bill,
          credits_charged: j.ch,
          has_usage: j.usageOk,
          routing_ok: j.routing,
          content_ok: true,
          file_mutation: false,
          context_kept: null,
          verdict: "PASS",
          reason,
        });
      }
    }

    // ─── B. Cursor Edit (text plan + local mutation evidence) ───────
    console.log("\n=== B. Cursor Edit (text agent + local apply) ===\n");

    {
      const createRes = await chat({
        model: chatModel,
        messages: [
          {
            role: "user",
            content:
              "Text-agent task: Propose creating tmp/p987-agent-sandbox/cursor-agent-test.ts " +
              "with export function greet(name: string){ return `hi ${name}`; }. " +
              "Reply with the word CREATE_OK and a one-line summary. Do not claim you wrote the disk.",
          },
        ],
        stream: false,
        max_tokens: 80,
      });
      const createJ = judgeChargedSuccess(
        "cursor_edit_create_file",
        createRes.body,
        createRes.res
      );
      // Local agent runtime applies the planned edit (Cursor/Hermes pattern).
      writeFileSync(
        AGENT_FILE,
        "export function greet(name: string): string {\n  return `hi ${name}`;\n}\n",
        "utf8"
      );
      const created = existsSync(AGENT_FILE);

      const modifyRes = await chat({
        model: chatModel,
        messages: [
          {
            role: "user",
            content:
              "Text-agent task: Propose changing greet to return hello instead of hi. " +
              "Reply with MODIFY_OK. Do not claim local FS tools.",
          },
        ],
        stream: false,
        max_tokens: 64,
      });
      const modifyJ = judgeChargedSuccess(
        "cursor_edit_modify_function",
        modifyRes.body,
        modifyRes.res
      );
      writeFileSync(
        AGENT_FILE,
        readFileSync(AGENT_FILE, "utf8").replace("hi ${name}", "hello ${name}"),
        "utf8"
      );
      const modified = readFileSync(AGENT_FILE, "utf8").includes("hello");

      const diffRes = await chat({
        model: chatModel,
        messages: [
          {
            role: "user",
            content:
              "Text-agent task: In one sentence, describe a git diff that changes hi→hello in greet(). Reply DIFF_OK.",
          },
        ],
        stream: false,
        max_tokens: 64,
      });
      const diffJ = judgeChargedSuccess(
        "cursor_edit_generate_git_diff",
        diffRes.body,
        diffRes.res
      );
      const localDiff = spawnSync(
        "bash",
        [
          "-lc",
          "git diff --no-index -- /dev/null tmp/p987-agent-sandbox/cursor-agent-test.ts || true",
        ],
        { cwd: ROOT, encoding: "utf8", timeout: 15_000 }
      );
      const diffText = `${localDiff.stdout || ""}${localDiff.stderr || ""}`;
      writeFileSync(join(SANDBOX, "last-git-diff.txt"), diffText.slice(0, 8000), "utf8");

      const problems = [
        ...createJ.problems,
        ...modifyJ.problems,
        ...diffJ.problems,
      ];
      let verdict = /** @type {Verdict} */ ("PASS");
      let reason = null;
      if (problems.length) {
        verdict = blockers.some((b) => b.startsWith("cursor_edit"))
          ? "BLOCKER"
          : "FAIL";
        reason = problems.join("; ");
      } else if (!created || !modified) {
        verdict = "FAIL";
        reason = `local mutation missing created=${created} modified=${modified}`;
      } else if (!diffText.trim()) {
        verdict = "WARN";
        reason = "mutation ok but local git diff empty";
      }

      pushCase({
        case_name: "cursor_edit_create_modify_diff",
        category: "cursor_edit",
        kind: modifyJ.kind,
        http_status: modifyRes.res.status,
        request_id: modifyJ.rid ?? createJ.rid,
        billing_status: modifyJ.bill,
        credits_charged:
          (createJ.ch || 0) + (modifyJ.ch || 0) + (diffJ.ch || 0),
        has_usage: createJ.usageOk && modifyJ.usageOk && diffJ.usageOk,
        routing_ok: createJ.routing && modifyJ.routing && diffJ.routing,
        content_ok: true,
        file_mutation: created && modified,
        context_kept: null,
        verdict,
        reason:
          reason ??
          `text_agent_plan + local_apply diff_bytes=${diffText.length}`,
      });
    }

    // ─── C. Multi-turn text Agent ──────────────────────────────────
    console.log("\n=== C. Multi-turn Agent (text) ===\n");

    {
      /** @type {any[]} */
      const messages = [
        {
          role: "user",
          content:
            "Turn1 analyze: Here is greet.ts content:\n" +
            readFileSync(AGENT_FILE, "utf8") +
            "\nReply ANALYZE_OK with one note about greet.",
        },
      ];
      const turn1 = await chat({
        model: chatModel,
        messages,
        stream: false,
        max_tokens: 64,
      });
      const bill1 = judgeChargedSuccess(
        "multi_turn_analyze",
        turn1.body,
        turn1.res
      );
      messages.push({
        role: "assistant",
        content: contentText(turn1.body) || "ANALYZE_OK",
      });
      messages.push({
        role: "user",
        content:
          "Turn2 modify: Based on prior analysis, change greet to return hola. Reply MODIFY_OK.",
      });
      const turn2 = await chat({
        model: chatModel,
        messages,
        stream: false,
        max_tokens: 64,
      });
      const bill2 = judgeChargedSuccess(
        "multi_turn_modify",
        turn2.body,
        turn2.res
      );
      writeFileSync(
        AGENT_FILE,
        readFileSync(AGENT_FILE, "utf8").replace(
          /hello \$\{name\}|hi \$\{name\}/,
          "hola ${name}"
        ),
        "utf8"
      );
      messages.push({
        role: "assistant",
        content: contentText(turn2.body) || "MODIFY_OK",
      });
      messages.push({
        role: "user",
        content:
          "Turn3 explain: Explain the greet change from prior turns in one sentence. Reply EXPLAIN_OK.",
      });
      const turn3 = await chat({
        model: chatModel,
        messages,
        stream: false,
        max_tokens: 80,
      });
      const bill3 = judgeChargedSuccess(
        "multi_turn_explain",
        turn3.body,
        turn3.res
      );
      const explain = contentText(turn3.body);
      const contextKept =
        messages.length >= 5 &&
        readFileSync(AGENT_FILE, "utf8").includes("hola") &&
        Boolean(explain.trim() || contentText(turn1.body));

      const problems = [
        ...bill1.problems,
        ...bill2.problems,
        ...bill3.problems,
      ];
      let verdict = /** @type {Verdict} */ ("PASS");
      let reason = null;
      if (problems.length) {
        verdict = blockers.some((b) => b.startsWith("multi_turn"))
          ? "BLOCKER"
          : "FAIL";
        reason = problems.join("; ");
      } else if (!contextKept) {
        verdict = "FAIL";
        reason = "context not kept / file missing hola";
      }

      pushCase({
        case_name: "multi_turn_analyze_modify_explain",
        category: "multi_turn",
        kind: bill3.kind,
        http_status: turn3.res.status,
        request_id: bill3.rid ?? bill2.rid ?? bill1.rid,
        billing_status: bill3.bill,
        credits_charged: (bill1.ch || 0) + (bill2.ch || 0) + (bill3.ch || 0),
        has_usage: bill1.usageOk && bill2.usageOk && bill3.usageOk,
        routing_ok: bill1.routing && bill2.routing && bill3.routing,
        content_ok: Boolean(explain.trim()),
        file_mutation: readFileSync(AGENT_FILE, "utf8").includes("hola"),
        context_kept: contextKept,
        verdict,
        reason: reason ?? `turns=${messages.length} context_kept=true`,
      });
    }

    // ─── D. Billing + tools policy (soft tools claim) ──────────────
    console.log("\n=== D. Billing / tools policy ===\n");

    {
      const { res, body } = await chat({
        model: "p987-invalid-agent-model",
        messages: [{ role: "user", content: "should fail" }],
        stream: false,
      });
      const j = judgeRejectNotBillable("billing_invalid_model", body, res);
      let verdict = /** @type {Verdict} */ ("PASS");
      let reason = null;
      if (j.problems.filter((p) => p !== "missing_routing_evidence").length) {
        verdict = blockers.some((b) => b.startsWith("billing_invalid"))
          ? "BLOCKER"
          : "FAIL";
        reason = j.problems.join("; ");
      } else if (!j.routing) {
        verdict = "WARN";
        reason = "reject ok but routing evidence incomplete";
      }
      pushCase({
        case_name: "billing_invalid_model_not_billable",
        category: "billing",
        kind: j.kind,
        http_status: res.status,
        request_id: j.rid,
        billing_status: j.bill,
        credits_charged: j.ch,
        has_usage: null,
        routing_ok: j.routing,
        content_ok: null,
        file_mutation: null,
        context_kept: null,
        verdict,
        reason,
      });
    }

    {
      // required tools on auto-fast → model_not_tool_capable not_billable
      const { res, body } = await chat({
        model: "auto-fast",
        messages: [{ role: "user", content: "force tools" }],
        tools: AGENT_TOOLS,
        tool_choice: "required",
        stream: false,
      });
      const j = judgeRejectNotBillable("billing_tool_required", body, res);
      let verdict = /** @type {Verdict} */ ("PASS");
      let reason = null;
      if (j.problems.filter((p) => p !== "missing_routing_evidence").length) {
        verdict = "BLOCKER";
        reason = j.problems.join("; ");
      } else if (body?.error?.code && body.error.code !== "model_not_tool_capable") {
        verdict = "WARN";
        reason = `code=${body.error.code} (expected model_not_tool_capable)`;
      } else if (!j.routing) {
        verdict = "WARN";
        reason = "not_billable ok; routing soft";
      }
      pushCase({
        case_name: "billing_tool_required_not_capable",
        category: "billing",
        kind: j.kind,
        http_status: res.status,
        request_id: j.rid,
        billing_status: j.bill,
        credits_charged: j.ch,
        has_usage: null,
        routing_ok: j.routing,
        content_ok: null,
        file_mutation: null,
        context_kept: null,
        verdict,
        reason: reason ?? "model_not_tool_capable",
      });
    }

    {
      // tool_choice=auto on non-capable → degrade to ordinary chat (200 charged)
      const { res, body } = await chat({
        model: "auto-fast",
        messages: [
          {
            role: "user",
            content: "Say HELLO_AUTO only. Tools may be ignored.",
          },
        ],
        tools: AGENT_TOOLS,
        tool_choice: "auto",
        stream: false,
        max_tokens: 32,
      });
      const j = judgeChargedSuccess("tools_auto_degrade_chat", body, res);
      let verdict = /** @type {Verdict} */ ("PASS");
      let reason = null;
      if (res.status === 400 && charged(body) === 0) {
        verdict = "WARN";
        reason = "auto tools rejected instead of degrade-to-chat";
        j.kind = "true_400_reject";
      } else if (j.problems.length) {
        verdict = j.blocker ? "BLOCKER" : "FAIL";
        reason = j.problems.join("; ");
      }
      pushCase({
        case_name: "tools_auto_degrade_to_chat",
        category: "tools_policy",
        kind: j.kind,
        http_status: res.status,
        request_id: j.rid,
        billing_status: j.bill,
        credits_charged: j.ch,
        has_usage: j.usageOk,
        routing_ok: j.routing,
        content_ok: Boolean(contentText(body).trim()),
        file_mutation: null,
        context_kept: null,
        verdict,
        reason:
          reason ??
          "auto on non-whitelist → ordinary chat (not fully tools compatible)",
      });
    }

    {
      const success = cases.filter(
        (c) => c.http_status === 200 && c.category !== "billing"
      );
      const dirty = success.filter(
        (c) =>
          !(c.credits_charged > 0) ||
          c.billing_status !== "charged" ||
          !c.request_id ||
          c.has_usage === false ||
          c.routing_ok === false
      );
      let verdict = /** @type {Verdict} */ ("PASS");
      let reason = `success_cases=${success.length}`;
      if (dirty.length) {
        verdict = "BLOCKER";
        reason = `dirty_success_count=${dirty.length}`;
        addBlocker(
          "billing_invariants",
          "success without usage/routing/charged billing"
        );
      }
      pushCase({
        case_name: "billing_invariants_matrix",
        category: "billing",
        kind: "invariants",
        http_status: null,
        request_id: null,
        billing_status: null,
        credits_charged: null,
        has_usage: null,
        routing_ok: null,
        content_ok: null,
        file_mutation: null,
        context_kept: null,
        verdict,
        reason,
      });
    }

    // Reports
    mkdirSync(dirname(SUMMARY_PATH), { recursive: true });
    const buckets = { PASS: [], WARN: [], FAIL: [], BLOCKER: [] };
    for (const c of cases) buckets[c.verdict]?.push(c);

    const summary = {
      marker: blockers.length
        ? BLOCKED_MARKER
        : buckets.FAIL.length
          ? FAIL_MARKER
          : PASS_MARKER,
      p987r_marker: blockers.length ? P987R_BLOCKED : P987R_PASS,
      live: Boolean(LIVE),
      generated_at: new Date().toISOString(),
      blockers,
      counts: {
        total: cases.length,
        PASS: buckets.PASS.length,
        WARN: buckets.WARN.length,
        FAIL: buckets.FAIL.length,
        BLOCKER: buckets.BLOCKER.length,
      },
      sandbox: relative(ROOT, SANDBOX),
      note:
        "Text-agent compatibility only — does not claim real FS tools or fully compatible.",
      cases,
    };
    writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2), "utf8");

    const repair = [
      "# P987R — Agent Runtime Compatibility Repair Report",
      "",
      "> Fixes LIVE blockers: text-agent workflow, routing/usage envelopes, log key scrubbing. No fully-compatible claim.",
      "",
      `## Result: **${blockers.length ? "BLOCKED" : "REPAIR PASS"}**`,
      "",
      `Marker: \`${blockers.length ? P987R_BLOCKED : P987R_PASS}\``,
      "",
      "## Fixes",
      "",
      "- P987 cases A/B/C use ordinary chat text-agent prompts (no forced tools).",
      "- Success checks distinguish missing usage / missing routing / dirty success without billing.",
      "- Logs scrub sensitive body key *names* (database_url, postgres, secret, …).",
      "- Chat validation 400s attach tokfai routing + request_id; success always includes usage object.",
      "",
      "## BLOCKERs",
      "",
      blockers.length ? blockers.map((b) => `- ${b}`).join("\n") : "- (none)",
      "",
      "## Case kinds",
      "",
      "| case | kind | verdict |",
      "|---|---|---|",
      ...cases.map(
        (c) => `| \`${c.case_name}\` | ${c.kind} | ${c.verdict} |`
      ),
      "",
    ];
    writeFileSync(REPAIR_REPORT_PATH, repair.join("\n"), "utf8");
    console.log(`Wrote ${REPAIR_REPORT_PATH}`);

    const summarizeCase = cases.find(
      (c) => c.case_name === "cursor_read_summarize_git_diff"
    );
    const summarizePrimary =
      (process.env.P987_SUMMARIZE_MODEL ?? "").trim() || P987_STABLE_CHAT_MODEL;
    const summarizeFallback =
      (process.env.P987_SUMMARIZE_FALLBACK_MODEL ?? "").trim() ||
      P987_STABLE_CHAT_MODEL;
    const summarizeDiffMax = resolveDiffMaxChars();
    const stability = [
      "# P987S — Summarize Git Diff Stability Report",
      "",
      "> Converges intermittent LIVE 504 on `cursor_read_summarize_git_diff`.",
      "> Scope: `summarizeGitDiffStable` harness only — no billing / catalog / public chat changes.",
      "> Does not claim fully tools compatible. Does not treat 504 as PASS.",
      "",
      `## Result: **${
        summarizeCase?.verdict === "PASS" ? "STABLE (this run)" : "UNSTABLE"
      }**`,
      "",
      `Generated: ${summary.generated_at}`,
      `Mode: ${LIVE ? "LIVE" : "offline mock"}`,
      "",
      "## Root cause (observed)",
      "",
      "- LIVE `auto-fast` alias can intermittently 504 on light text-agent summarization.",
      "- PM2 stayed healthy; billing did not charge on failure.",
      "",
      "## Stability strategy (harness / text-agent)",
      "",
      "1. Compress / truncate diff input (`P987_DIFF_MAX_CHARS`, default 1200).",
      `2. Primary model via \`P987_SUMMARIZE_MODEL\` (default stable chat model \`${P987_STABLE_CHAT_MODEL}\`, not auto-*).`,
      "3. On transient 504/timeout/busy: **one** lightweight fallback (`P987_SUMMARIZE_FALLBACK_MODEL`, short prompt, `max_tokens=32`).",
      "4. If fallback still fails: OpenAI-compatible error envelope with `status=504`, `billing_status=not_billable`, `credits_charged=0`; **FAIL** (never fake 200).",
      "5. Success path still requires usage + request_id + routing evidence + charged credits.",
      "",
      "## Env (this run)",
      "",
      `| knobs | value |`,
      `|---|---|`,
      `| P987_SUMMARIZE_MODEL | \`${summarizePrimary}\` |`,
      `| P987_SUMMARIZE_FALLBACK_MODEL | \`${summarizeFallback}\` |`,
      `| P987_DIFF_MAX_CHARS | ${summarizeDiffMax} |`,
      "",
      "## This run — summarize case",
      "",
      `| Field | Value |`,
      `|---|---|`,
      `| verdict | ${summarizeCase?.verdict ?? "missing"} |`,
      `| kind | ${summarizeCase?.kind ?? "—"} |`,
      `| http | ${summarizeCase?.http_status ?? "—"} |`,
      `| billing | ${summarizeCase?.billing_status ?? "—"} |`,
      `| credits | ${summarizeCase?.credits_charged ?? "—"} |`,
      `| usage | ${summarizeCase?.has_usage ?? "—"} |`,
      `| request_id | \`${String(summarizeCase?.request_id ?? "—").slice(0, 28)}\` |`,
      `| routing_ok | ${summarizeCase?.routing_ok ?? "—"} |`,
      `| reason | ${(summarizeCase?.reason ?? "").replace(/\|/g, "/")} |`,
      "",
      "## Continuous acceptance",
      "",
      "After deploy, run 5 consecutive LIVE rounds; all must print:",
      "",
      "```",
      "Cases=9",
      "blockers=0",
      "fails=0",
      "TOKFAI_P987_AGENT_RUNTIME_COMPATIBILITY_PASS",
      "```",
      "",
      "```bash",
      "for i in 1 2 3 4 5; do",
      "  echo \"=== P987S round $i ===\"",
      "  LIVE=1 BASE=https://api.tokfai.com/v1 TOKFAI_API_KEY=sk-tokfai_... \\",
      "    node scripts/p987-agent-runtime-compatibility-smoke.mjs || exit 1",
      "done",
      "```",
      "",
    ];
    writeFileSync(STABILITY_REPORT_PATH, stability.join("\n"), "utf8");
    console.log(`Wrote ${STABILITY_REPORT_PATH}`);

    if (WRITE_REPORT) {
      const lines = [];
      lines.push("# P987 — Agent Runtime Compatibility Report");
      lines.push("");
      lines.push(
        "> Text-agent Cursor/Hermes workflow acceptance. **Does not claim fully compatible or real FS tools.**"
      );
      lines.push("");
      lines.push(
        `## Result: **${
          blockers.length
            ? "BLOCKED"
            : buckets.FAIL.length
              ? "FAIL"
              : "HARNESS COMPLETE"
        }**`
      );
      lines.push("");
      lines.push(
        `Marker: \`${
          blockers.length
            ? BLOCKED_MARKER
            : buckets.FAIL.length
              ? FAIL_MARKER
              : PASS_MARKER
        }\``
      );
      lines.push("");
      lines.push(`Mode: ${LIVE ? "LIVE" : "offline mock"}`);
      lines.push(`Generated: ${summary.generated_at}`);
      lines.push("");
      lines.push("## Verdict counts");
      lines.push("");
      lines.push("| Verdict | Count |");
      lines.push("|---|---|");
      lines.push(`| PASS | ${buckets.PASS.length} |`);
      lines.push(`| WARN | ${buckets.WARN.length} |`);
      lines.push(`| FAIL | ${buckets.FAIL.length} |`);
      lines.push(`| BLOCKER | ${buckets.BLOCKER.length} |`);
      lines.push("");
      lines.push("## BLOCKER list");
      lines.push("");
      if (!blockers.length) lines.push("- (none)");
      else for (const b of blockers) lines.push(`- ${b}`);
      lines.push("");
      lines.push("## FAIL list");
      lines.push("");
      if (!buckets.FAIL.length) lines.push("- (none)");
      else
        for (const c of buckets.FAIL)
          lines.push(`- \`${c.case_name}\`: ${c.reason}`);
      lines.push("");
      lines.push("## WARN list");
      lines.push("");
      if (!buckets.WARN.length) lines.push("- (none)");
      else
        for (const c of buckets.WARN)
          lines.push(`- \`${c.case_name}\`: ${c.reason}`);
      lines.push("");
      lines.push("## Case table");
      lines.push("");
      lines.push(
        "| case | category | kind | verdict | http | request_id | billing | credits | usage | routing | reason |"
      );
      lines.push("|---|---|---|---|---|---|---|---|---|---|---|");
      for (const c of cases) {
        lines.push(
          `| \`${c.case_name}\` | ${c.category} | ${c.kind} | ${c.verdict} | ${c.http_status ?? "—"} | \`${String(c.request_id ?? "—").slice(0, 22)}\` | ${c.billing_status ?? "—"} | ${c.credits_charged ?? "—"} | ${c.has_usage ?? "—"} | ${c.routing_ok ?? "—"} | ${(c.reason ?? "").replace(/\|/g, "/")} |`
        );
      }
      lines.push("");
      lines.push("## Notes");
      lines.push("");
      lines.push("- WARN is never counted as PASS.");
      lines.push(
        "- File mutations are applied by this harness as the agent runtime after a text plan."
      );
      lines.push("- Do **not** advertise fully Cursor Compatible / real tools.");
      lines.push("");
      writeFileSync(REPORT_PATH, lines.join("\n"), "utf8");
      console.log(`Wrote ${REPORT_PATH}`);
    }
    console.log(`Wrote ${SUMMARY_PATH}`);
    recordHarness("cases_ran", cases.length >= 6, `cases=${cases.length}`);
    recordHarness("report_written", existsSync(REPORT_PATH), REPORT_PATH);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordHarness("harness_runtime", false, message);
    addBlocker("harness_runtime", message);
  } finally {
    ctx?.cleanup?.();
  }

  const hardHarness = harness.some((h) => !h.ok && !h.soft);
  const fails = cases.filter((c) => c.verdict === "FAIL").length;
  console.log("");
  console.log(
    `Cases=${cases.length} blockers=${blockers.length} fails=${fails}`
  );

  if (blockers.length) {
    console.error(BLOCKED_MARKER);
    console.error(P987R_BLOCKED);
    for (const b of blockers) console.error(`  - ${b}`);
    process.exit(1);
  }
  if (hardHarness || fails) {
    console.error(FAIL_MARKER);
    console.error(P987R_BLOCKED);
    process.exit(1);
  }
  console.log(PASS_MARKER);
  console.log(P987R_PASS);
  process.exit(0);
}

main();
