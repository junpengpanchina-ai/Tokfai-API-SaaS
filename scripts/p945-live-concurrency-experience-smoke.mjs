#!/usr/bin/env node
/**
 * P945 — Live concurrency experience smoke (measurement framework).
 *
 * Verifies client experience under 50 / 100 / 300 / 1000 concurrency.
 * Short generations only — real path latency, not long essays.
 *
 * Hard limits:
 *   - no production path / billing / alias / Cherry / image edits / Nginx
 *   - does not modify release gate
 *   - never print full API keys
 *   - 429 allowed only with standard envelope + not_billable
 *   - every request: fresh payload + fresh fetch init (no Request/body/Response reuse)
 *   - stream default = drain full SSE (never return after first frame)
 *   - transport_empty_400 is not an API-compat failure
 *
 * Env:
 *   CONCURRENCY          default 50 (single wave); or use LEVELS
 *   REQUESTS             default = CONCURRENCY
 *   MODEL                default gpt-5.5
 *   ROUTE                chat | responses | /v1/chat/completions | /v1/responses
 *   STREAM               true | false      (default true)
 *   STREAM_MODE          drain (default) | abort_after_first_sse
 *   KEEP_ALIVE           1 = allow connection reuse; default close for stream
 *   MAX_OUTPUT_TOKENS    default 16
 *   LEVELS               e.g. 50,100,300,1000
 *   CHAT_TIMEOUT_MS      client abort only
 *   CSV_DIR              default tmp
 *   RAW_DIAG             1 = per-request transport diagnostics
 *   P945_GHOST_RETRY_MAX retry transport_empty_400 (default 3)
 *
 * Usage:
 *   SELF_TEST=1 node scripts/p945-live-concurrency-experience-smoke.mjs
 *   LIVE=1 TOKFAI_API_KEY=sk-tokfai_... CONCURRENCY=50 \
 *     node scripts/p945-live-concurrency-experience-smoke.mjs
 *
 * Outputs:
 *   tmp/p945-concurrency-result.csv
 *   tmp/p945-concurrency-summary.csv
 *
 * Acceptance:
 *   TOKFAI_P945_CONCURRENCY_EXPERIENCE_PASS
 */

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bootstrapClientCompatSmoke,
  pass,
  fail,
} from "./lib/client-compat-smoke-bootstrap.mjs";
import {
  P945_RESULT_COLUMNS,
  P945_SUMMARY_COLUMNS,
  buildRequestBody,
  buildSyntheticP945Rows,
  createSseTimingScanner,
  extractExperienceRequestId,
  isHttpSuccess,
  judgeP945Rows,
  maskKey,
  roundMs,
  rowsToCsv,
  runPool,
  summarizeConcurrency,
} from "./lib/client-latency-experience.mjs";
import {
  extractCredits,
  extractErrorObject,
} from "./lib/public-beta-live-helpers.mjs";

const SCRIPT = "scripts/p945-live-concurrency-experience-smoke.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS_MARKER = "TOKFAI_P945_CONCURRENCY_EXPERIENCE_PASS";
const FAIL_MARKER = "TOKFAI_P945_CONCURRENCY_EXPERIENCE_FAIL";
const PROMPT = "Say ok only.";

const SELF_TEST =
  process.env.SELF_TEST === "1" ||
  process.env.SELF_TEST === "true" ||
  process.argv.includes("--self-test");

const RAW_DIAG =
  process.env.RAW_DIAG === "1" ||
  process.env.RAW_DIAG === "true" ||
  process.env.RAW_DIAG === "TRUE";

const KEEP_ALIVE =
  process.env.KEEP_ALIVE === "1" ||
  process.env.KEEP_ALIVE === "true" ||
  process.env.KEEP_ALIVE === "TRUE";

/** drain = normal experience (default). abort_after_first_sse = named early-cancel mode. */
const STREAM_MODE_RAW = (process.env.STREAM_MODE ?? "drain").trim().toLowerCase();
const STREAM_MODE =
  STREAM_MODE_RAW === "abort_after_first_sse" ? "abort_after_first_sse" : "drain";

const GHOST_RETRY_MAX = Math.max(
  1,
  parseInt(process.env.P945_GHOST_RETRY_MAX ?? "3", 10) || 3
);

const MODEL = (process.env.MODEL ?? "gpt-5.5").trim();
const ROUTE_RAW = (process.env.ROUTE ?? "chat").trim();
const ROUTE_NORM = ROUTE_RAW.toLowerCase();
const ROUTE =
  ROUTE_NORM === "responses" ||
  ROUTE_NORM === "/v1/responses" ||
  ROUTE_NORM.endsWith("/responses")
    ? "responses"
    : "chat";
const STREAM =
  process.env.STREAM === "0" ||
  process.env.STREAM === "false" ||
  process.env.STREAM === "FALSE"
    ? false
    : true;

const MAX_OUTPUT_TOKENS = Math.max(
  1,
  parseInt(process.env.MAX_OUTPUT_TOKENS ?? "16", 10) || 16
);

const PATH =
  ROUTE === "responses" ? "/v1/responses" : "/v1/chat/completions";
const ROUTE_LABEL =
  ROUTE === "responses"
    ? "POST /v1/responses"
    : "POST /v1/chat/completions";

const CSV_DIR = process.env.CSV_DIR
  ? join(ROOT, process.env.CSV_DIR.replace(/^\.\//, ""))
  : join(ROOT, "tmp");

function parseLevels() {
  if (process.env.LEVELS) {
    return process.env.LEVELS.split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n >= 1);
  }
  const concurrency = Math.max(
    1,
    parseInt(process.env.CONCURRENCY ?? "50", 10) || 50
  );
  return [concurrency];
}

function requestsFor(concurrency) {
  if (process.env.REQUESTS) {
    return Math.max(1, parseInt(process.env.REQUESTS, 10) || concurrency);
  }
  return concurrency;
}

function sha256Prefix12(text) {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 12);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractBillingStatus(body, frames = []) {
  const candidates = [
    body?.tokfai?.billing_status,
    body?.billing_status,
    ...frames.flatMap((f) => [
      f?.tokfai?.billing_status,
      f?.billing_status,
      f?.response?.tokfai?.billing_status,
    ]),
  ];
  for (const v of candidates) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function extractCreditsFromFrames(body, frames = []) {
  const direct = extractCredits(body);
  if (direct != null && !Number.isNaN(direct)) return direct;
  for (let i = frames.length - 1; i >= 0; i -= 1) {
    const c = extractCredits(frames[i]);
    if (c != null && !Number.isNaN(c)) return c;
  }
  return null;
}

function frameHasContent(obj) {
  if (!obj || typeof obj !== "object") return false;
  const choices = obj.choices;
  if (Array.isArray(choices)) {
    for (const ch of choices) {
      const delta = ch?.delta?.content ?? ch?.message?.content;
      if (typeof delta === "string" && delta.length) return true;
      if (Array.isArray(delta) && delta.length) return true;
    }
  }
  const output = obj.output_text ?? obj.output;
  if (typeof output === "string" && output.length) return true;
  if (Array.isArray(output) && output.length) return true;
  return false;
}

function printRawDiag(row, { index, stream }) {
  if (!RAW_DIAG) return;
  const preview = String(row.rawText ?? "").slice(0, 300);
  console.log(
    [
      `RAW_DIAG idx=${index}`,
      `status=${row.status}`,
      `route=${ROUTE_LABEL}`,
      `model=${row.model}`,
      `stream=${stream}`,
      `requestBodyBytes=${row.requestBodyBytes}`,
      `requestBodySha256=${row.requestBodySha12}`,
      `responseBodyBytes=${row.responseBodyBytes}`,
      `responseBody=${JSON.stringify(preview)}`,
      `x-request-id=${row.headerRequestId || row.requestId || "(none)"}`,
      `content-type=${row.contentType || "(none)"}`,
      `content-length=${row.contentLength || "(none)"}`,
      `connection=${row.connectionHeader || "(none)"}`,
      row.streamMode ? `stream_mode=${row.streamMode}` : "",
      row.transportEmpty400 ? "mark=transport_empty_400" : "",
      row.attempt != null ? `attempt=${row.attempt}` : "",
    ]
      .filter(Boolean)
      .join(" ")
  );
}

/**
 * Drain SSE with ReadableStream reader until done.
 * Records firstByte / firstSse / firstContent while never returning early
 * unless streamMode === abort_after_first_sse (explicit cancel).
 */
async function readSseResponseBody(res, t0, streamMode) {
  const scanner = createSseTimingScanner(t0);
  const reader = res.body?.getReader?.();
  const decoder = new TextDecoder();
  let fullText = "";
  let abortedAfterFirstSse = false;

  if (!reader) {
    // No streaming body — fall back to full text (still "drained").
    fullText = await res.text();
    scanner.onChunk(fullText);
    scanner.finish();
    return {
      fullText,
      frames: scanner.frames,
      firstSseMs: scanner.firstSseMs,
      firstContentMs: scanner.firstContentMs,
      abortedAfterFirstSse: false,
    };
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      fullText += chunk;
      scanner.onChunk(chunk);

      if (
        streamMode === "abort_after_first_sse" &&
        scanner.firstSseMs != null &&
        !abortedAfterFirstSse
      ) {
        abortedAfterFirstSse = true;
        try {
          await reader.cancel("abort_after_first_sse");
        } catch {
          // ignore cancel errors
        }
        break;
      }
    }
    fullText += decoder.decode();
    if (scanner.bufferText) scanner.onChunk("\n");
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // already released after cancel
    }
  }

  return {
    fullText,
    frames: scanner.frames,
    firstSseMs: scanner.firstSseMs,
    firstContentMs: scanner.firstContentMs,
    abortedAfterFirstSse,
  };
}

/**
 * One probe: fresh payload, fresh fetch init, full SSE drain (default).
 * Never reuses Request / body / Response across calls.
 * Local exceptions → status=0 (never disguised as HTTP 400).
 */
async function runFreshTimedProbe({
  base,
  path,
  model,
  stream,
  maxTokens,
  authHeaders,
  timeoutMs,
  index,
  attempt = 1,
}) {
  // Fresh payload every request — identical shape for all indexes (no odd/even branch).
  const payload = buildRequestBody({
    path,
    model,
    stream,
    maxTokens,
  });
  if (path.includes("/responses")) {
    payload.input = PROMPT;
  } else {
    payload.messages = [{ role: "user", content: PROMPT }];
  }
  const bodyText = JSON.stringify(payload);
  const requestBodyBytes = Buffer.byteLength(bodyText, "utf8");
  const requestBodySha12 = sha256Prefix12(bodyText);

  const url = `${base}${path}`;
  const wantClose = stream && !KEEP_ALIVE;
  const connectionDirective = wantClose ? "close" : KEEP_ALIVE ? "keep-alive" : "";

  /** @type {Record<string, string>} */
  const freshHeaders = {
    ...authHeaders,
    "Content-Type": "application/json",
  };
  if (connectionDirective) {
    freshHeaders.Connection = connectionDirective;
  }

  const t0 = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const streamMode = stream ? STREAM_MODE : "n/a";

  /** @type {Record<string, unknown>} */
  const row = {
    model,
    route: path.includes("/responses")
      ? "POST /v1/responses"
      : "POST /v1/chat/completions",
    stream: stream ? "true" : "false",
    streamMode,
    status: 0,
    firstByteMs: "",
    firstSseMs: "",
    firstContentMs: "",
    totalMs: "",
    requestId: "",
    headerRequestId: "",
    creditsCharged: "",
    errorCode: "",
    errorMessage: "",
    billingStatus: "",
    emptyBody: false,
    rawText: "",
    transportEmpty400: false,
    requestBodyBytes,
    requestBodySha12,
    responseBodyBytes: 0,
    contentType: "",
    contentLength: "",
    connectionHeader: "",
    url,
    attempt,
  };

  try {
    // Fresh fetch init every time — never reuse Request / body / Response.
    const res = await fetch(url, {
      method: "POST",
      headers: freshHeaders,
      body: bodyText,
      signal: controller.signal,
    });

    const firstByteMs = performance.now() - t0;
    row.status = res.status;
    row.firstByteMs = roundMs(firstByteMs);
    row.contentType = res.headers.get("content-type") ?? "";
    row.contentLength = res.headers.get("content-length") ?? "";
    row.connectionHeader =
      res.headers.get("connection") || connectionDirective || "(none)";
    const headerRequestId = res.headers.get("x-request-id") ?? "";
    row.headerRequestId = headerRequestId;

    let fullText = "";
    /** @type {any[]} */
    let frames = [];

    if (stream) {
      const sse = await readSseResponseBody(res, t0, streamMode);
      fullText = sse.fullText;
      frames = sse.frames;
      row.firstSseMs =
        sse.firstSseMs == null ? "" : roundMs(sse.firstSseMs);
      row.firstContentMs =
        sse.firstContentMs == null ? "" : roundMs(sse.firstContentMs);
      if (sse.abortedAfterFirstSse) {
        row.errorCode = row.errorCode || "abort_after_first_sse";
      }
      // Ensure body is fully settled (drain mode already read to done;
      // abort mode cancelled — do not touch res.body again).
    } else {
      fullText = await res.text();
      row.firstSseMs = "";
    }

    const totalMs = performance.now() - t0;
    row.totalMs = roundMs(totalMs);
    row.rawText = fullText;
    row.responseBodyBytes = Buffer.byteLength(fullText, "utf8");
    const emptyBody = !fullText || !String(fullText).trim();
    row.emptyBody = emptyBody;

    let jsonBody = {};
    try {
      jsonBody =
        fullText && !fullText.includes("data:") ? JSON.parse(fullText) : {};
    } catch {
      jsonBody = { _raw: fullText };
    }

    const lastFrame = frames.length ? frames[frames.length - 1] : null;
    const errObj =
      extractErrorObject(jsonBody, fullText) ??
      extractErrorObject(lastFrame, fullText);

    const requestId =
      extractExperienceRequestId({
        body: jsonBody,
        frames,
        res,
        text: fullText,
      }) || headerRequestId;

    const credits = stream
      ? extractCreditsFromFrames(jsonBody, frames)
      : extractCredits(jsonBody);
    const billingStatus = extractBillingStatus(jsonBody, frames);

    row.requestId = requestId == null ? "" : String(requestId);
    row.creditsCharged =
      credits == null || Number.isNaN(credits) ? "" : credits;
    row.errorCode =
      errObj?.code == null && errObj?.type == null
        ? String(row.errorCode ?? "")
        : String(errObj.code ?? errObj.type ?? "");
    row.errorMessage =
      errObj?.message == null ? "" : String(errObj.message).slice(0, 240);
    row.billingStatus = billingStatus;

    if (!stream) {
      const hasContent = frameHasContent(jsonBody);
      row.firstContentMs = hasContent ? row.totalMs : "";
    }

    // Transport ghost: 400 + empty body + no x-request-id.
    // Not an API-compat failure — mark explicitly.
    if (
      Number(row.status) === 400 &&
      emptyBody &&
      !String(headerRequestId ?? "").trim()
    ) {
      row.transportEmpty400 = true;
      row.errorCode = "transport_empty_400";
      row.errorMessage =
        "status=400 empty body without x-request-id (keep-alive/transport ghost; not API compat)";
    }

    return row;
  } catch (err) {
    // Local exceptions stay status=0 — never masquerade as HTTP 400.
    const totalMs = performance.now() - t0;
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout =
      /timeout|abort|TimeoutError|AbortError/i.test(message) ||
      err?.name === "AbortError" ||
      err?.name === "TimeoutError";
    row.status = 0;
    row.totalMs = roundMs(totalMs);
    row.errorCode = isTimeout ? "network_timeout" : "network_error";
    row.errorMessage = message.slice(0, 240);
    row.emptyBody = true;
    row.responseBodyBytes = 0;
    return row;
  } finally {
    clearTimeout(timer);
    printRawDiag(row, { index, stream });
  }
}

/**
 * Retry only transport_empty_400 ghosts with a fresh request each attempt.
 * Final row is the last non-ghost (or last attempt if exhausted).
 */
async function runSlotWithGhostRetry(ctx, index) {
  let last = null;
  for (let attempt = 1; attempt <= GHOST_RETRY_MAX; attempt += 1) {
    const authHeaders = ctx.authHeaders();
    last = await runFreshTimedProbe({
      base: ctx.BASE,
      path: PATH,
      model: MODEL,
      stream: STREAM,
      maxTokens: MAX_OUTPUT_TOKENS,
      authHeaders,
      timeoutMs: ctx.TIMEOUT_MS,
      index,
      attempt,
    });
    if (!last.transportEmpty400) return last;
    if (attempt < GHOST_RETRY_MAX) await sleep(40 * attempt);
  }
  return last;
}

function toResultRow(probe) {
  return {
    index: probe.index,
    concurrency: probe.concurrency,
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
    errorMessage: probe.errorMessage,
    billingStatus: probe.billingStatus,
    emptyBody: probe.emptyBody ? "true" : "false",
    ok: probe.ok ? "true" : "false",
  };
}

function printJudgmentBanner(judgment) {
  if (judgment.ok) {
    pass(
      "P945 judgments (no empty body / no undefined / no charged timeout / no 500 / 429 envelope+not_billable)"
    );
    return;
  }
  fail("P945 judgments");
  for (const detail of judgment.failures.slice(0, 40)) {
    console.error(`      - ${detail}`);
  }
  if (judgment.failures.length > 40) {
    console.error(`      … ${judgment.failures.length - 40} more`);
  }
}

/**
 * API-compat judgment excludes transport_empty_400 rows
 * (those are keep-alive/transport ghosts, not model/API failures).
 */
function judgeApiCompat(probes) {
  const apiRows = probes.filter((p) => !p.transportEmpty400);
  return judgeP945Rows(apiRows);
}

async function runWave(ctx, concurrency) {
  const requests = requestsFor(concurrency);
  console.log(
    `\n>>> wave concurrency=${concurrency} requests=${requests} model=${MODEL} route=${ROUTE} stream=${STREAM}` +
      ` stream_mode=${STREAM ? STREAM_MODE : "n/a"} keep_alive=${KEEP_ALIVE}`
  );

  const probes = await runPool(requests, concurrency, async (index) => {
    const probe = await runSlotWithGhostRetry(ctx, index);
    const ok =
      isHttpSuccess(Number(probe.status)) || Number(probe.status) === 429;
    return {
      ...probe,
      index,
      concurrency,
      route: ROUTE_LABEL,
      ok,
    };
  });

  const summary = summarizeConcurrency(probes, concurrency);
  console.log(
    `    success=${summary.successN} fail=${summary.failN} 429=${summary.status429N} 5xx=${summary.status5xxN}` +
      ` emptyBody=${summary.emptyBodyN} chargedTimeout=${summary.chargedTimeoutN}` +
      ` transportEmpty400=${probes.filter((p) => p.transportEmpty400).length}`
  );
  console.log(
    `    firstByte p50/p95/p99=${summary.p50FirstByteMs}/${summary.p95FirstByteMs}/${summary.p99FirstByteMs}` +
      ` | firstSse p50/p95/p99=${summary.p50FirstSseMs}/${summary.p95FirstSseMs}/${summary.p99FirstSseMs}` +
      ` | total p50/p95/p99=${summary.p50TotalMs}/${summary.p95TotalMs}/${summary.p99TotalMs}`
  );

  return { probes, summary };
}

async function main() {
  const levels = parseLevels();
  console.log("=== P945 Live concurrency experience smoke ===");
  console.log(
    "Framework only — no production path / billing / alias / Cherry / image / Nginx changes."
  );
  console.log(
    `model=${MODEL} route=${ROUTE} stream=${STREAM} stream_mode=${STREAM ? STREAM_MODE : "n/a"}` +
      ` keep_alive=${KEEP_ALIVE} max_output_tokens=${MAX_OUTPUT_TOKENS} raw_diag=${RAW_DIAG}`
  );
  console.log(`levels: ${levels.join(", ")}`);
  if (STREAM && STREAM_MODE === "abort_after_first_sse") {
    console.log(
      "NOTE: STREAM_MODE=abort_after_first_sse — early cancel mode (not normal experience)."
    );
  }
  console.log("");

  await mkdir(CSV_DIR, { recursive: true });
  const resultPath = join(CSV_DIR, "p945-concurrency-result.csv");
  const summaryPath = join(CSV_DIR, "p945-concurrency-summary.csv");

  /** @type {any[]} */
  let allProbes = [];
  /** @type {any[]} */
  const summaries = [];
  let ctx = null;

  if (SELF_TEST) {
    console.log("mode: SELF_TEST (synthetic concurrency rows; no network)");
    for (const concurrency of levels) {
      const requests = requestsFor(concurrency);
      const n = Math.min(requests, concurrency <= 50 ? 20 : 12);
      const probes = buildSyntheticP945Rows({
        concurrency,
        requests: n,
        model: MODEL,
        route: ROUTE_LABEL,
        stream: STREAM,
      });
      allProbes = allProbes.concat(probes);
      summaries.push(summarizeConcurrency(probes, concurrency));
      console.log(
        `>>> synthetic wave concurrency=${concurrency} n=${n} 429≈${probes.filter((r) => r.status === 429).length}`
      );
    }
  } else {
    ctx = await bootstrapClientCompatSmoke(SCRIPT);
    console.log(`api_key_masked: ${maskKey(ctx.API_KEY)}`);
    for (const concurrency of levels) {
      const { probes, summary } = await runWave(ctx, concurrency);
      allProbes = allProbes.concat(probes);
      summaries.push(summary);
    }
  }

  const judgment = judgeApiCompat(allProbes);
  await writeFile(
    resultPath,
    rowsToCsv(P945_RESULT_COLUMNS, allProbes.map(toResultRow)),
    "utf8"
  );
  await writeFile(
    summaryPath,
    rowsToCsv(P945_SUMMARY_COLUMNS, summaries),
    "utf8"
  );

  console.log("");
  console.log(`wrote: ${resultPath}`);
  console.log(`wrote: ${summaryPath}`);
  console.log(`schema: ${P945_RESULT_COLUMNS.join(",")}`);
  console.log("");

  let allOk = true;
  if (!allProbes.length) {
    allOk = fail("result rows", "empty") && false;
  } else {
    pass(`result rows (${allProbes.length})`);
  }
  if (!summaries.length) {
    allOk = fail("summary rows", "empty") && false;
  } else {
    pass(`summary rows (${summaries.length})`);
  }

  printJudgmentBanner(judgment);
  allOk = judgment.ok && allOk;

  // Experience acceptance: recorded rows must be clean (retries resolve ghosts).
  if (!SELF_TEST) {
    const summary = summarizeConcurrency(allProbes, allProbes[0]?.concurrency ?? 0);
    if (summary.successN !== allProbes.length && summary.failN !== 0) {
      // allow 429 as ok in ok flag, but still require no emptyBody
    }
    const leftoverTransport = allProbes.filter((p) => p.transportEmpty400);
    if (leftoverTransport.length) {
      // Transport ghosts remaining after retries → experience FAIL (not API-compat label).
      allOk =
        fail(
          "transport_empty_400 remaining after retries",
          `count=${leftoverTransport.length} indexes=${leftoverTransport.map((p) => p.index).join(",")}`
        ) && false;
    } else {
      pass("no transport_empty_400 in final rows");
    }

    if (summary.emptyBodyN > 0) {
      allOk =
        fail("emptyBody", `emptyBody=${summary.emptyBodyN} (want 0)`) && false;
    } else {
      pass(`emptyBody=0`);
    }

    if (summary.failN > 0) {
      allOk =
        fail("fail count", `fail=${summary.failN} success=${summary.successN}`) &&
        false;
    } else {
      pass(`success=${summary.successN} fail=0`);
    }
  }

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
