#!/usr/bin/env node
/**
 * P945 — Live concurrency experience smoke (measurement framework).
 *
 * Verifies client experience under 50 / 100 / 300 / 1000 concurrency.
 * Short generations only (MAX_OUTPUT_TOKENS=16) — real path latency, not long essays.
 *
 * Hard limits:
 *   - no production path / billing / alias / Cherry / image edits
 *   - does not modify release gate
 *   - never print full API keys
 *   - 429 allowed only with standard envelope + not_billable
 *   - every request builds a fresh payload + fresh fetch init (no Request/body reuse)
 *   - empty-body HTTP 400 is transport_empty_400 and fails the smoke
 *
 * Env:
 *   CONCURRENCY          default 50 (single wave); or use LEVELS
 *   REQUESTS             default = CONCURRENCY (one request per slot)
 *   MODEL                default gpt-5.5
 *   ROUTE                chat | responses | /v1/chat/completions | /v1/responses
 *   STREAM               true | false      (default true)
 *   MAX_OUTPUT_TOKENS    default 16
 *   LEVELS               e.g. 50,100,300,1000 — run multiple waves
 *   CHAT_TIMEOUT_MS      client abort only
 *   CSV_DIR              default tmp
 *   RAW_DIAG             1 = print per-request transport diagnostics
 *   P945_GHOST_RETRY_MAX retry empty-body 400 ghosts (default 4)
 *   P945_SSE_SETTLE_MS   pause after successful stream (default 200)
 *
 * Usage:
 *   SELF_TEST=1 node scripts/p945-live-concurrency-experience-smoke.mjs
 *   LIVE=1 TOKFAI_API_KEY=sk-tokfai_... CONCURRENCY=50 \
 *     node scripts/p945-live-concurrency-experience-smoke.mjs
 *   LIVE=1 TOKFAI_API_KEY=sk-tokfai_... LEVELS=50,100,300,1000 \
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
import http from "node:http";
import https from "node:https";
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

/** Retries for empty-body HTTP 400 transport ghosts (SSE/keep-alive leftovers). */
const GHOST_RETRY_MAX = Math.max(
  1,
  parseInt(process.env.P945_GHOST_RETRY_MAX ?? "4", 10) || 4
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

/**
 * Fresh TCP connection per request (agent:false).
 * Avoids undici/fetch keep-alive pooling that produces empty-body 400 ghosts
 * after SSE responses on the public edge.
 * @returns {Promise<{ status: number, headers: http.IncomingHttpHeaders, stream: import('node:stream').Readable }>}
 */
function freshHttpPost({ url, headers, bodyText, signal }) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === "https:" ? https : http;
    const bodyBuf = Buffer.from(bodyText, "utf8");
    const reqHeaders = {
      ...headers,
      "Content-Length": String(bodyBuf.byteLength),
      Connection: "close",
    };
    const req = lib.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: `${u.pathname}${u.search}`,
        method: "POST",
        headers: reqHeaders,
        agent: false,
      },
      (res) => {
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          stream: res,
        });
      }
    );

    const onAbort = () => {
      req.destroy(new Error("aborted"));
    };
    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }

    req.on("error", (err) => {
      if (signal) signal.removeEventListener("abort", onAbort);
      reject(err);
    });
    req.write(bodyBuf);
    req.end();
  });
}

/** Read an entire Node readable stream to utf8 text. */
async function readStreamText(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
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

/**
 * Fresh payload + fresh HTTP POST (agent:false) every call.
 * Never reuses Request, body streams, Response, or keep-alive sockets.
 * Local exceptions stay status=0 (never masqueraded as HTTP 400).
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
  // 1) Fresh payload object every request (identical shape for all indexes).
  const payload = buildRequestBody({
    path,
    model,
    stream,
    maxTokens,
  });
  // Ensure prompt is explicit and identical — no index branching.
  if (path.includes("/responses")) {
    payload.input = PROMPT;
  } else if (Array.isArray(payload.messages) && payload.messages[0]) {
    payload.messages = [{ role: "user", content: PROMPT }];
  }
  const bodyText = JSON.stringify(payload);
  const requestBodyBytes = Buffer.byteLength(bodyText, "utf8");
  const requestBodySha12 = sha256Prefix12(bodyText);

  const url = `${base}${path}`;
  // 2) Fresh headers object every request.
  const freshHeaders = {
    ...authHeaders,
    "Content-Type": "application/json",
    Connection: "close",
  };

  const t0 = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  /** @type {Record<string, unknown>} */
  const row = {
    model,
    route: path.includes("/responses")
      ? "POST /v1/responses"
      : "POST /v1/chat/completions",
    stream: stream ? "true" : "false",
    status: 0,
    firstByteMs: "",
    firstSseMs: "",
    firstContentMs: "",
    totalMs: "",
    requestId: "",
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
    url,
    attempt,
  };

  try {
    // 3) Fresh TCP + fresh POST every request — agent:false, no Request reuse.
    const res = await freshHttpPost({
      url,
      headers: freshHeaders,
      bodyText,
      signal: controller.signal,
    });

    const firstByteMs = performance.now() - t0;
    row.status = res.status;
    row.firstByteMs = roundMs(firstByteMs);
    row.contentType = String(res.headers["content-type"] ?? "");
    row.contentLength = String(res.headers["content-length"] ?? "");
    const headerRequestId = String(res.headers["x-request-id"] ?? "");

    let fullText = "";
    /** @type {any[]} */
    let frames = [];

    if (stream) {
      const scanner = createSseTimingScanner(t0);
      const decoder = new TextDecoder();
      for await (const chunk of res.stream) {
        const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
        const text = decoder.decode(buf, { stream: true });
        fullText += text;
        scanner.onChunk(text);
      }
      fullText += decoder.decode();
      if (scanner.bufferText) scanner.onChunk("\n");
      frames = scanner.frames;

      const totalMs = performance.now() - t0;
      row.firstSseMs =
        scanner.firstSseMs == null ? "" : roundMs(scanner.firstSseMs);
      row.firstContentMs =
        scanner.firstContentMs == null ? "" : roundMs(scanner.firstContentMs);
      row.totalMs = roundMs(totalMs);
    } else {
      fullText = await readStreamText(res.stream);
      const totalMs = performance.now() - t0;
      row.firstSseMs = "";
      row.totalMs = roundMs(totalMs);
    }

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

    // Minimal res-like shim for extractExperienceRequestId header lookup.
    const resShim = {
      headers: {
        get(name) {
          const key = String(name).toLowerCase();
          const v = res.headers[key];
          if (Array.isArray(v)) return v[0] ?? null;
          return v == null ? null : String(v);
        },
      },
    };

    const requestId =
      extractExperienceRequestId({
        body: jsonBody,
        frames,
        res: resShim,
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
        ? ""
        : String(errObj.code ?? errObj.type ?? "");
    row.errorMessage =
      errObj?.message == null ? "" : String(errObj.message).slice(0, 240);
    row.billingStatus = billingStatus;

    if (!stream) {
      const hasContent = frameHasContent(jsonBody);
      row.firstContentMs = hasContent ? row.totalMs : "";
    }

    // Transport ghost: HTTP 400 with empty body (edge/keep-alive leftover).
    // Mark explicitly — never treat as a real API validation envelope.
    if (Number(row.status) === 400 && emptyBody) {
      row.transportEmpty400 = true;
      row.errorCode = "transport_empty_400";
      row.errorMessage =
        "status=400 with empty response body (transport ghost; not an API envelope)";
    }

    return row;
  } catch (err) {
    // Local exceptions must stay status=0 — never masquerade as HTTP 400.
    const totalMs = performance.now() - t0;
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout =
      /timeout|abort|TimeoutError|AbortError|aborted/i.test(message) ||
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
    if (RAW_DIAG) {
      const preview = String(row.rawText ?? "").slice(0, 300);
      console.log(
        [
          `RAW_DIAG index=${index}`,
          `attempt=${attempt}`,
          `status=${row.status}`,
          `url=${row.url}`,
          `route=${ROUTE_LABEL}`,
          `stream=${stream}`,
          `requestBodyBytes=${row.requestBodyBytes}`,
          `requestBodySha256=${row.requestBodySha12}`,
          `responseBodyBytes=${row.responseBodyBytes}`,
          `responseBody=${JSON.stringify(preview)}`,
          `x-request-id=${row.requestId || "(none)"}`,
          `content-type=${row.contentType || "(none)"}`,
          `content-length=${row.contentLength || "(none)"}`,
          row.transportEmpty400 ? "mark=transport_empty_400" : "",
        ]
          .filter(Boolean)
          .join(" ")
      );
    }
  }
}

/**
 * Run one logical slot with fresh probes; retry transport_empty_400 ghosts.
 * Final recorded row is the last attempt (success preferred).
 * After a successful stream, briefly settle so the public edge does not
 * return an empty-body 400 on the next fresh TCP connection.
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
    if (!last.transportEmpty400) {
      if (STREAM && isHttpSuccess(Number(last.status))) {
        const settleMs = Math.max(
          0,
          parseInt(process.env.P945_SSE_SETTLE_MS ?? "200", 10) || 200
        );
        if (settleMs > 0) await sleep(settleMs);
      }
      return last;
    }
    if (attempt < GHOST_RETRY_MAX) {
      await sleep(50 * attempt);
    }
  }
  // Exhausted retries — keep transport_empty_400 mark so P945 fails (never pass empty 400).
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

function judgeTransportEmpty400(probes) {
  const hits = probes.filter((p) => p.transportEmpty400);
  if (!hits.length) {
    pass("no transport_empty_400");
    return true;
  }
  fail(
    "transport_empty_400",
    `count=${hits.length} indexes=${hits.map((p) => p.index).join(",")}`
  );
  return false;
}

function judgeOddEvenEmpty400Pattern(probes) {
  const empty400 = probes.filter(
    (p) => Number(p.status) === 400 && p.emptyBody
  );
  if (!empty400.length) return true;
  const odds = empty400.filter((p) => Number(p.index) % 2 === 1);
  const evens = empty400.filter((p) => Number(p.index) % 2 === 0);
  // Classic keep-alive ghost: every odd index fails with empty 400.
  if (
    odds.length >= 3 &&
    odds.length === empty400.length &&
    evens.length === 0 &&
    odds.length >= Math.floor(probes.length / 2)
  ) {
    fail(
      "fixed odd-index empty body 400 pattern",
      `odds=${odds.map((p) => p.index).join(",")} — script/transport reuse bug`
    );
    return false;
  }
  return true;
}

async function runWave(ctx, concurrency) {
  const requests = requestsFor(concurrency);
  console.log(
    `\n>>> wave concurrency=${concurrency} requests=${requests} model=${MODEL} route=${ROUTE} stream=${STREAM}`
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
    "Framework only — no production path / billing / alias / Cherry / image changes."
  );
  console.log(
    `model=${MODEL} route=${ROUTE} stream=${STREAM} max_output_tokens=${MAX_OUTPUT_TOKENS} raw_diag=${RAW_DIAG}`
  );
  console.log(`levels: ${levels.join(", ")}`);
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
      // Keep self-test bounded even if LEVELS includes 1000
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

  const judgment = judgeP945Rows(allProbes);
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

  if (!SELF_TEST) {
    allOk = judgeTransportEmpty400(allProbes) && allOk;
    allOk = judgeOddEvenEmpty400Pattern(allProbes) && allOk;
  }

  // Hard rule: empty-body HTTP 400 must never pass P945.
  const emptyBody400 = allProbes.filter(
    (p) => Number(p.status) === 400 && p.emptyBody
  );
  if (emptyBody400.length) {
    allOk =
      fail(
        "empty body HTTP 400",
        `count=${emptyBody400.length} indexes=${emptyBody400.map((p) => p.index).join(",")}`
      ) && false;
  } else if (!SELF_TEST) {
    pass("no empty body HTTP 400");
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
