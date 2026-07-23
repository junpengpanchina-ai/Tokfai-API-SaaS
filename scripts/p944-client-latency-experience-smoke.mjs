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
 *
 * Optional:
 *   MODELS=gpt-5.5,gemini-2.5-flash
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
  buildRequestBody,
  buildSyntheticP944Rows,
  judgeP944Rows,
  maskKey,
  rowsToCsv,
  summarizeLatencyGroups,
  timedExperienceProbe,
} from "./lib/client-latency-experience.mjs";

const SCRIPT = "scripts/p944-client-latency-experience-smoke.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS_MARKER = "TOKFAI_P944_CLIENT_LATENCY_EXPERIENCE_PASS";
const FAIL_MARKER = "TOKFAI_P944_CLIENT_LATENCY_EXPERIENCE_FAIL";

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

const CSV_DIR = process.env.CSV_DIR
  ? join(ROOT, process.env.CSV_DIR.replace(/^\.\//, ""))
  : join(ROOT, "tmp");

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

async function probeMatrix(ctx) {
  const rows = [];
  for (const model of MODELS) {
    for (const spec of DEFAULT_EXPERIENCE_ROUTES) {
      const body = buildRequestBody({
        path: spec.path,
        model,
        stream: spec.stream,
        maxTokens: MAX_OUTPUT_TOKENS,
      });
      const probe = await timedExperienceProbe({
        base: ctx.BASE,
        path: spec.path,
        model,
        stream: spec.stream,
        body,
        headers: ctx.authHeaders(),
        timeoutMs: ctx.TIMEOUT_MS,
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
        })
      );
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
  const judgment = judgeP944Rows(probes);

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
