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
 *
 * Env:
 *   CONCURRENCY          default 50 (single wave); or use LEVELS
 *   REQUESTS             default = CONCURRENCY (one request per slot)
 *   MODEL                default gpt-5.5
 *   ROUTE                chat | responses  (default chat)
 *   STREAM               true | false      (default true)
 *   MAX_OUTPUT_TOKENS    default 16
 *   LEVELS               e.g. 50,100,300,1000 — run multiple waves
 *   CHAT_TIMEOUT_MS      client abort only
 *   CSV_DIR              default tmp
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
  isHttpSuccess,
  judgeP945Rows,
  maskKey,
  rowsToCsv,
  runPool,
  summarizeConcurrency,
  timedExperienceProbe,
} from "./lib/client-latency-experience.mjs";

const SCRIPT = "scripts/p945-live-concurrency-experience-smoke.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS_MARKER = "TOKFAI_P945_CONCURRENCY_EXPERIENCE_PASS";
const FAIL_MARKER = "TOKFAI_P945_CONCURRENCY_EXPERIENCE_FAIL";

const SELF_TEST =
  process.env.SELF_TEST === "1" ||
  process.env.SELF_TEST === "true" ||
  process.argv.includes("--self-test");

const MODEL = (process.env.MODEL ?? "gpt-5.5").trim();
const ROUTE_RAW = (process.env.ROUTE ?? "chat").trim().toLowerCase();
const ROUTE =
  ROUTE_RAW === "responses" || ROUTE_RAW === "chat" ? ROUTE_RAW : "chat";
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

async function runWave(ctx, concurrency) {
  const requests = requestsFor(concurrency);
  console.log(
    `\n>>> wave concurrency=${concurrency} requests=${requests} model=${MODEL} route=${ROUTE} stream=${STREAM}`
  );

  const body = buildRequestBody({
    path: PATH,
    model: MODEL,
    stream: STREAM,
    maxTokens: MAX_OUTPUT_TOKENS,
  });

  const probes = await runPool(requests, concurrency, async (index) => {
    const probe = await timedExperienceProbe({
      base: ctx.BASE,
      path: PATH,
      model: MODEL,
      stream: STREAM,
      body,
      headers: ctx.authHeaders(),
      timeoutMs: ctx.TIMEOUT_MS,
    });
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
      ` emptyBody=${summary.emptyBodyN} chargedTimeout=${summary.chargedTimeoutN}`
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
    `model=${MODEL} route=${ROUTE} stream=${STREAM} max_output_tokens=${MAX_OUTPUT_TOKENS}`
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
