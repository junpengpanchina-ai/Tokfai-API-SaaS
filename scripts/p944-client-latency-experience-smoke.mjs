#!/usr/bin/env node
/**
 * P944 — Client latency experience smoke (measurement framework).
 *
 * Captures end-to-end client experience timings across models × routes × stream
 * modes so we can tell whether slowness is model / upstream / SSE buffering /
 * Node flush / first-content wait — without changing production paths.
 *
 * Hard limits:
 *   - no production path / billing / alias / Cherry / image edits
 *   - does not modify release gate
 *   - never print full API keys
 *
 * Dimensions (CSV columns):
 *   model, route, stream, status, firstByteMs, firstSseMs, firstContentMs,
 *   totalMs, requestId, creditsCharged, errorCode, billingStatus
 *
 * Coverage:
 *   Models: gpt-5.5, gpt-5-pro, gpt-5.4-pro, gemini-3-pro, gemini-2.5-pro,
 *           gemini-2.5-flash
 *   Routes: POST /v1/chat/completions stream=true|false
 *           POST /v1/responses stream=true|false
 *
 * Usage:
 *   node scripts/p944-client-latency-experience-smoke.mjs
 *   SELF_TEST=1 node scripts/p944-client-latency-experience-smoke.mjs
 *   LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p944-client-latency-experience-smoke.mjs
 *   LIVE=1 TOKFAI_API_KEY=... REQUESTS_PER_MODEL=5 node scripts/p944-client-latency-experience-smoke.mjs
 *
 * Optional:
 *   MODELS=gpt-5.5,gemini-2.5-flash
 *   REQUESTS_PER_MODEL=1
 *   MAX_OUTPUT_TOKENS=16
 *   CHAT_TIMEOUT_MS=120000
 *   CSV_DIR=tmp
 *
 * Outputs:
 *   tmp/p944-client-latency.csv
 *   tmp/p944-client-latency-summary.csv
 *
 * Acceptance:
 *   TOKFAI_P944_CLIENT_LATENCY_EXPERIENCE_PASS
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bootstrapClientCompatSmoke,
  pass,
  fail,
} from "./lib/client-compat-smoke-bootstrap.mjs";
import {
  DEFAULT_EXPERIENCE_MODELS,
  DEFAULT_EXPERIENCE_ROUTES,
  P944_RESULT_COLUMNS,
  P944_SUMMARY_COLUMNS,
  buildSyntheticP944Rows,
  extractExperienceRequestId,
  isHttpSuccess,
  isFailureRow,
  judgeEarlySse,
  hasCharge,
  looksLikeChargedTimeout,
  maskKey,
  rowsToCsv,
  summarizeLatencyGroups,
  timedExperienceProbe,
} from "./lib/client-latency-experience.mjs";
import { extractCredits, extractErrorObject } from "./lib/public-beta-live-helpers.mjs";

const SCRIPT = "scripts/p944-client-latency-experience-smoke.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS_MARKER = "TOKFAI_P944_CLIENT_LATENCY_EXPERIENCE_PASS";
const FAIL_MARKER = "TOKFAI_P944_CLIENT_LATENCY_EXPERIENCE_FAIL";

/** Exact prompt used by known-good public curl probes. */
const CURL_PROMPT = "reply only ok";

const SELF_TEST =
  process.env.SELF_TEST === "1" ||
  process.env.SELF_TEST === "true" ||
  process.argv.includes("--self-test");

const MODELS = (process.env.MODELS ?? DEFAULT_EXPERIENCE_MODELS.join(","))
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

const MAX_OUTPUT_TOKENS = Math.max(
  1,
  parseInt(process.env.MAX_OUTPUT_TOKENS ?? "16", 10) || 16
);

const REQUESTS_PER_MODEL = Math.max(
  1,
  parseInt(process.env.REQUESTS_PER_MODEL ?? "1", 10) || 1
);

const CSV_DIR = process.env.CSV_DIR
  ? join(ROOT, process.env.CSV_DIR.replace(/^\.\//, ""))
  : join(ROOT, "tmp");

/**
 * Probe order: non-stream first, then stream.
 * Avoids Node fetch / nginx keep-alive reuse after SSE that yields empty HTTP 400
 * (no Content-Type, no x-request-id, empty body) — not a real API validation error.
 */
const P944_ROUTE_ORDER = [
  ...DEFAULT_EXPERIENCE_ROUTES.filter((r) => !r.stream),
  ...DEFAULT_EXPERIENCE_ROUTES.filter((r) => r.stream),
];

const GHOST_RETRY_MAX = Math.max(
  1,
  parseInt(process.env.P944_GHOST_RETRY_MAX ?? "4", 10) || 4
);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Build request bodies matching successful public curl.
 * stream=false shapes are fixed; stream=true keeps the same prompt/token caps
 * so latency comparisons stay apples-to-apples (early SSE path unchanged).
 */
function buildP944RequestBody({ path, model, stream, maxTokens }) {
  const isResponses = path.includes("/responses");
  if (isResponses) {
    return {
      model,
      stream: Boolean(stream),
      input: CURL_PROMPT,
      max_output_tokens: maxTokens,
    };
  }
  return {
    model,
    stream: Boolean(stream),
    messages: [{ role: "user", content: CURL_PROMPT }],
    max_tokens: maxTokens,
  };
}

/**
 * Empty 4xx/5xx with no body / request_id / error.code — connection reuse artifact,
 * not a real Tokfai error envelope. Safe to retry.
 */
function isGhostEmptyHttpError(probe) {
  const status = Number(probe.status);
  if (!Number.isFinite(status) || status < 400) return false;
  const text = String(probe.rawText ?? "").trim();
  if (text) return false;
  if (String(probe.requestId ?? "").trim()) return false;
  if (String(probe.errorCode ?? "").trim()) return false;
  return true;
}

/**
 * Re-normalize probe fields from the raw JSON body.
 * - HTTP 2xx: never carry a synthetic errorCode; extract request_id / credits.
 * - HTTP 4xx/5xx: keep real error envelope fields only.
 */
function normalizeProbeFromBody(probe) {
  const status = Number(probe.status);
  const text = typeof probe.rawText === "string" ? probe.rawText : "";
  let body = {};
  if (text && !text.includes("data:")) {
    try {
      body = JSON.parse(text);
    } catch {
      body = {};
    }
  }

  const requestId =
    extractExperienceRequestId({
      body,
      frames: [],
      res: null,
      text,
    }) || String(probe.requestId ?? "");

  if (requestId) probe.requestId = requestId;

  const credits = extractCredits(body);
  if (credits != null && !Number.isNaN(credits)) {
    probe.creditsCharged = credits;
  } else if (
    body?.tokfai &&
    typeof body.tokfai === "object" &&
    body.tokfai.credits_charged != null
  ) {
    const n = Number(body.tokfai.credits_charged);
    if (Number.isFinite(n)) probe.creditsCharged = n;
  }

  if (typeof body?.tokfai?.billing_status === "string" && body.tokfai.billing_status) {
    probe.billingStatus = body.tokfai.billing_status;
  }

  if (isHttpSuccess(status)) {
    // Success JSON must not be treated as an error envelope.
    probe.errorCode = "";
    probe.errorMessage = "";
    return probe;
  }

  if (status >= 400) {
    const errObj = extractErrorObject(body, text);
    if (errObj) {
      probe.errorCode =
        errObj.code == null && errObj.type == null
          ? String(probe.errorCode ?? "")
          : String(errObj.code ?? errObj.type ?? "");
      if (typeof errObj.message === "string" && errObj.message.trim()) {
        probe.errorMessage = errObj.message.slice(0, 240);
      }
      if (
        !probe.requestId &&
        typeof errObj.request_id === "string" &&
        errObj.request_id.trim()
      ) {
        probe.requestId = errObj.request_id.trim();
      }
    }
  }

  return probe;
}

/**
 * P944 judgments:
 * - Only real 4xx/5xx (or network status=0) count as failures.
 * - HTTP 200/2xx must never be failed for error-envelope reasons.
 * - Keep early-SSE checks for stream=true successes only.
 */
function judgeP944RowsLocal(rows) {
  const failures = [];

  for (const row of rows) {
    const status = Number(row.status);
    const label = `${row.model} ${row.route} stream=${row.stream} status=${row.status}`;

    // Never misclassify HTTP success as a failure row.
    if (isHttpSuccess(status)) {
      if (!String(row.requestId ?? "").trim()) {
        failures.push(`${label}: missing request_id`);
      }
      // Spurious errorCode on 200 is a script bug — clear and ignore.
      if (String(row.errorCode ?? "").trim()) {
        row.errorCode = "";
        row.errorMessage = "";
      }
      const sse = judgeEarlySse(row);
      if (!sse.ok) failures.push(`${label}: ${sse.detail}`);
      continue;
    }

    // Real transport / HTTP failures only.
    if (!isFailureRow(row)) {
      continue;
    }

    if (status > 0 && !String(row.requestId ?? "").trim()) {
      failures.push(`${label}: missing request_id`);
    }
    if (!String(row.errorCode ?? "").trim()) {
      failures.push(`${label}: failure missing error.code`);
    }
    if (!String(row.errorMessage ?? "").trim()) {
      failures.push(`${label}: failure missing error.message`);
    }
    if (hasCharge(row)) {
      failures.push(`${label}: failure/timeout/429 charged credits`);
    }
    if (looksLikeChargedTimeout(row)) {
      failures.push(`${label}: charged timeout`);
    }
    if (status === 429 && hasCharge(row)) {
      failures.push(`${label}: 429 charged`);
    }
  }

  return { ok: failures.length === 0, failures };
}

function toResultRow(probe) {
  return {
    model: probe.model,
    route: probe.route,
    stream: probe.stream,
    status: probe.status,
    firstByteMs: probe.firstByteMs,
    firstSseMs: probe.firstSseMs,
    firstContentMs: probe.firstContentMs,
    totalMs: probe.totalMs,
    requestId: probe.requestId,
    creditsCharged: probe.creditsCharged,
    errorCode: probe.errorCode,
    billingStatus: probe.billingStatus,
  };
}

function printJudgmentBanner(judgment) {
  if (judgment.ok) {
    pass("P944 judgments (request_id / error envelope / no charge on fail / early SSE)");
    return;
  }
  fail("P944 judgments");
  for (const detail of judgment.failures.slice(0, 40)) {
    console.error(`      - ${detail}`);
  }
  if (judgment.failures.length > 40) {
    console.error(`      … ${judgment.failures.length - 40} more`);
  }
}

function printSummaryTable(summaryRows) {
  console.log("");
  console.log("── Latency percentiles (success rows) ──");
  for (const row of summaryRows) {
    if (row.group !== "ALL" && !String(row.group).includes("stream=true")) {
      continue;
    }
    console.log(
      `${row.group} n=${row.n} ok=${row.successN} fail=${row.failN}` +
        ` | firstByte p50/p95/p99=${row.p50FirstByteMs}/${row.p95FirstByteMs}/${row.p99FirstByteMs}` +
        ` | firstSse p50/p95/p99=${row.p50FirstSseMs}/${row.p95FirstSseMs}/${row.p99FirstSseMs}` +
        ` | total p50/p95/p99=${row.p50TotalMs}/${row.p95TotalMs}/${row.p99TotalMs}`
    );
  }
  const all = summaryRows.find((r) => r.group === "ALL");
  if (all) {
    console.log("");
    console.log(
      `ALL firstContent p50/p95/p99=${all.p50FirstContentMs}/${all.p95FirstContentMs}/${all.p99FirstContentMs}`
    );
  }
}

async function runOneProbe(ctx, { path, model, stream }) {
  const body = buildP944RequestBody({
    path,
    model,
    stream,
    maxTokens: MAX_OUTPUT_TOKENS,
  });
  // Match plain curl: Auth + Content-Type only; Connection:close avoids SSE keep-alive ghosts.
  const headers = ctx.authHeaders({ Connection: "close" });

  let probe = null;
  for (let attempt = 1; attempt <= GHOST_RETRY_MAX; attempt += 1) {
    probe = await timedExperienceProbe({
      base: ctx.BASE,
      path,
      model,
      stream,
      body,
      headers,
      timeoutMs: ctx.TIMEOUT_MS,
      curlCompatible: true,
    });
    normalizeProbeFromBody(probe);
    if (!isGhostEmptyHttpError(probe)) return probe;
    if (attempt < GHOST_RETRY_MAX) {
      await sleep(50 * attempt);
    }
  }
  // Exhausted ghost retries — mark as transport failure, not API 400.
  if (probe && isGhostEmptyHttpError(probe)) {
    probe.status = 0;
    probe.errorCode = "network_error";
    probe.errorMessage =
      "empty HTTP error body after SSE/keep-alive (retried; not a real API 4xx envelope)";
  }
  return probe;
}

async function probeMatrix(ctx) {
  const rows = [];
  for (const model of MODELS) {
    for (let rep = 0; rep < REQUESTS_PER_MODEL; rep += 1) {
      for (const spec of P944_ROUTE_ORDER) {
        const probe = await runOneProbe(ctx, {
          path: spec.path,
          model,
          stream: spec.stream,
        });
        rows.push(probe);
        console.log(
          JSON.stringify({
            model: probe.model,
            route: probe.route,
            stream: probe.stream,
            status: probe.status,
            firstByteMs: probe.firstByteMs,
            firstSseMs: probe.firstSseMs,
            firstContentMs: probe.firstContentMs,
            totalMs: probe.totalMs,
            requestId: probe.requestId || null,
            creditsCharged: probe.creditsCharged === "" ? null : probe.creditsCharged,
            errorCode: probe.errorCode || null,
            billingStatus: probe.billingStatus || null,
            rep: REQUESTS_PER_MODEL > 1 ? rep + 1 : undefined,
          })
        );
      }
    }
  }
  return rows;
}

async function main() {
  console.log("=== P944 Client latency experience smoke ===");
  console.log(
    "Framework only — no production path / billing / alias / Cherry / image changes."
  );
  console.log(`models: ${MODELS.join(", ")}`);
  console.log(`max_output_tokens: ${MAX_OUTPUT_TOKENS}`);
  console.log(`requests_per_model: ${REQUESTS_PER_MODEL}`);
  console.log(`stream=false body prompt: ${JSON.stringify(CURL_PROMPT)}`);
  console.log("");

  await mkdir(CSV_DIR, { recursive: true });
  const resultPath = join(CSV_DIR, "p944-client-latency.csv");
  const summaryPath = join(CSV_DIR, "p944-client-latency-summary.csv");

  let ctx = null;
  /** @type {ReturnType<typeof buildSyntheticP944Rows>} */
  let probes;

  if (SELF_TEST) {
    console.log("mode: SELF_TEST (synthetic timings; no network)");
    probes = buildSyntheticP944Rows(MODELS);
  } else {
    ctx = await bootstrapClientCompatSmoke(SCRIPT);
    console.log(`api_key_masked: ${maskKey(ctx.API_KEY)}`);
    probes = await probeMatrix(ctx);
  }

  const resultRows = probes.map(toResultRow);
  const summaryRows = summarizeLatencyGroups(probes);
  const judgment = judgeP944RowsLocal(probes);

  await writeFile(resultPath, rowsToCsv(P944_RESULT_COLUMNS, resultRows), "utf8");
  await writeFile(
    summaryPath,
    rowsToCsv(P944_SUMMARY_COLUMNS, summaryRows),
    "utf8"
  );

  printSummaryTable(summaryRows);
  console.log("");
  console.log(`wrote: ${resultPath}`);
  console.log(`wrote: ${summaryPath}`);
  console.log(`schema: ${P944_RESULT_COLUMNS.join(",")}`);
  console.log("");

  let allOk = true;
  if (!resultRows.length) {
    allOk = fail("result rows", "empty") && false;
  } else {
    pass(`result rows (${resultRows.length})`);
  }
  if (!summaryRows.length) {
    allOk = fail("summary rows", "empty") && false;
  } else {
    pass(`summary rows (${summaryRows.length}) + p50/p95/p99`);
  }

  printJudgmentBanner(judgment);
  allOk = judgment.ok && allOk;

  if (ctx) ctx.cleanup();

  console.log("");
  console.log(allOk ? PASS_MARKER : FAIL_MARKER);
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  console.log(FAIL_MARKER);
  process.exit(1);
});
