#!/usr/bin/env node
/**
 * P943 — Industry benchmark / competitor baseline framework.
 *
 * Builds reusable probe CSV + five-metric comparison against a synthetic
 * competitor baseline. Does NOT live-fetch competitor APIs.
 *
 * Hard limits:
 *   - no production path / billing / alias / Cherry / image edits
 *   - does not modify release gate judgment
 *   - never print full API keys
 *   - never call competitor hosts
 *
 * Usage:
 *   node scripts/p943-industry-benchmark-framework.mjs
 *   SELF_TEST=1 node scripts/p943-industry-benchmark-framework.mjs
 *   LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p943-industry-benchmark-framework.mjs
 *
 * Acceptance:
 *   TOKFAI_P943_INDUSTRY_BENCHMARK_FRAMEWORK_PASS
 */

import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bootstrapClientCompatSmoke,
  pass,
  fail,
} from "./lib/client-compat-smoke-bootstrap.mjs";
import { acceptanceFetch } from "./lib/acceptance-http.mjs";
import {
  BENCHMARK_CSV_COLUMNS,
  COMPETITOR_METRIC_BASELINE,
  REQUIRED_MODELS,
  TOKFAI_CLIENT_COMPAT_SCORE,
  aggregateProbeMetrics,
  buildSyntheticCompetitorProbes,
  buildSyntheticTokfaiProbes,
  compareMetrics,
  metricsSummaryToCsv,
  normalizeProbeRow,
  parseBenchmarkCsv,
  probesToCsv,
} from "./lib/industry-benchmark.mjs";

const SCRIPT = "scripts/p943-industry-benchmark-framework.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS_MARKER = "TOKFAI_P943_INDUSTRY_BENCHMARK_FRAMEWORK_PASS";
const FAIL_MARKER = "TOKFAI_P943_INDUSTRY_BENCHMARK_FRAMEWORK_FAIL";

const SELF_TEST =
  process.env.SELF_TEST === "1" ||
  process.env.SELF_TEST === "true" ||
  process.argv.includes("--self-test");

const PROMPT = "Say ok only.";

const MODELS = (process.env.MODELS ?? REQUIRED_MODELS.join(","))
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

const CSV_DIR = process.env.CSV_DIR
  ? join(ROOT, process.env.CSV_DIR.replace(/^\.\//, ""))
  : join(ROOT, "tmp");

const DEFAULT_FIXTURE = join(
  ROOT,
  "scripts/fixtures/p943-competitor-baseline.csv"
);
const COMPETITOR_CSV_SRC = process.env.COMPETITOR_BASELINE_CSV
  ? join(ROOT, process.env.COMPETITOR_BASELINE_CSV.replace(/^\.\//, ""))
  : DEFAULT_FIXTURE;

const FORBIDDEN_COMPETITOR_HOST_RE =
  /api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com|openrouter\.ai|together\.xyz|fireworks\.ai|groq\.com|deepseek\.com/i;

function maskKey(key) {
  if (!key || key.length <= 12) return "(not set)";
  return `${key.slice(0, 12)}…${key.slice(-4)} (len=${key.length})`;
}

function extractMeta(body, text, headers) {
  let requestId =
    body?.request_id ??
    body?.tokfai?.request_id ??
    body?.error?.request_id ??
    headers?.get?.("x-request-id") ??
    null;

  if ((!requestId || requestId === "") && typeof text === "string") {
    for (const line of text.split(/\n/)) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const parsed = JSON.parse(payload);
        requestId =
          parsed?.request_id ??
          parsed?.tokfai?.request_id ??
          parsed?.error?.request_id ??
          requestId;
        if (requestId) break;
      } catch {
        // ignore
      }
    }
  }

  const creditsRaw =
    body?.credits_charged ?? body?.tokfai?.credits_charged ?? null;
  const credits =
    typeof creditsRaw === "number"
      ? creditsRaw
      : creditsRaw == null || creditsRaw === ""
        ? ""
        : Number(creditsRaw);

  return {
    requestId: requestId == null ? "" : String(requestId),
    creditsCharged:
      credits === "" || Number.isNaN(credits) ? "" : credits,
    errorCode:
      body?.error?.code == null ? "" : String(body.error.code),
  };
}

async function loadCompetitorRows() {
  try {
    const text = await readFile(COMPETITOR_CSV_SRC, "utf8");
    if (FORBIDDEN_COMPETITOR_HOST_RE.test(text)) {
      throw new Error(
        "competitor baseline CSV must not contain live competitor hosts"
      );
    }
    return parseBenchmarkCsv(text);
  } catch (err) {
    if (err && err.code === "ENOENT") {
      console.log(
        "fixture missing — using built-in synthetic competitor probes"
      );
      return buildSyntheticCompetitorProbes();
    }
    throw err;
  }
}

async function probeTokfaiLiveOrMock(ctx) {
  const rows = [];

  async function once({ route, model, path, body, stream }) {
    const started = performance.now();
    try {
      const { res, body: json, text } = await acceptanceFetch(
        `${ctx.BASE}${path}`,
        {
          method: body == null ? "GET" : "POST",
          headers: ctx.authHeaders(),
          body: body == null ? undefined : JSON.stringify(body),
          timeoutMs: ctx.TIMEOUT_MS,
        }
      );
      const latencyMs = Math.round(performance.now() - started);
      const meta = extractMeta(json, text, res.headers);
      rows.push(
        normalizeProbeRow({
          model: model ?? "",
          route,
          stream: stream == null ? "" : stream ? "true" : "false",
          status: res.status,
          latencyMs,
          creditsCharged: meta.creditsCharged,
          errorCode: meta.errorCode,
          requestId: meta.requestId,
        })
      );
    } catch (err) {
      const latencyMs = Math.round(performance.now() - started);
      const message = err instanceof Error ? err.message : String(err);
      rows.push(
        normalizeProbeRow({
          model: model ?? "",
          route,
          stream: stream == null ? "" : stream ? "true" : "false",
          status: 0,
          latencyMs,
          creditsCharged: "",
          errorCode: /timeout|abort/i.test(message)
            ? "network_timeout"
            : "network_error",
          requestId: "",
        })
      );
    }
  }

  await once({
    route: "GET /v1/models",
    model: "",
    path: "/v1/models",
    body: null,
    stream: null,
  });

  for (const model of MODELS) {
    await once({
      route: "POST /v1/chat/completions",
      model,
      path: "/v1/chat/completions",
      stream: false,
      body: {
        model,
        messages: [{ role: "user", content: PROMPT }],
        stream: false,
      },
    });
    await once({
      route: "POST /v1/chat/completions",
      model,
      path: "/v1/chat/completions",
      stream: true,
      body: {
        model,
        messages: [{ role: "user", content: PROMPT }],
        stream: true,
      },
    });
    await once({
      route: "POST /v1/responses",
      model,
      path: "/v1/responses",
      stream: false,
      body: { model, input: PROMPT, stream: false },
    });
    await once({
      route: "POST /v1/responses",
      model,
      path: "/v1/responses",
      stream: true,
      body: { model, input: PROMPT, stream: true },
    });
  }

  return rows;
}

function assertSchema(rows, label) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return fail(label, "no rows");
  }
  for (const row of rows) {
    for (const col of BENCHMARK_CSV_COLUMNS) {
      if (!(col in row)) {
        return fail(label, `missing column ${col}`);
      }
      if (row[col] === undefined) {
        return fail(label, `${col} is undefined`);
      }
    }
  }
  return pass(label);
}

async function main() {
  console.log("=== P943 Industry benchmark / competitor baseline ===");
  console.log(
    "Goal: Tokfai core metrics 5%–15% sharper than peers — not blindly cheaper."
  );
  console.log("Competitor live fetch: DISABLED (fixture / synthetic only)");
  console.log(`models: ${MODELS.join(", ")}`);
  console.log("");

  await mkdir(CSV_DIR, { recursive: true });

  const tokfaiCsvPath = join(CSV_DIR, "p943-tokfai-benchmark.csv");
  const competitorCsvPath = join(CSV_DIR, "p943-competitor-baseline.csv");
  const summaryCsvPath = join(CSV_DIR, "p943-metrics-summary.csv");

  let allOk = true;
  let ctx = null;
  let tokfaiRows;

  if (SELF_TEST) {
    console.log("mode: SELF_TEST (synthetic Tokfai rows; no network)");
    tokfaiRows = buildSyntheticTokfaiProbes();
  } else {
    ctx = await bootstrapClientCompatSmoke(SCRIPT);
    console.log(`api_key_masked: ${maskKey(ctx.API_KEY)}`);
    tokfaiRows = await probeTokfaiLiveOrMock(ctx);
  }

  const competitorRows = await loadCompetitorRows();

  // Ensure fixture on disk for reuse / audit.
  try {
    await copyFile(COMPETITOR_CSV_SRC, competitorCsvPath);
  } catch {
    await writeFile(competitorCsvPath, probesToCsv(competitorRows), "utf8");
  }

  await writeFile(tokfaiCsvPath, probesToCsv(tokfaiRows), "utf8");

  allOk = assertSchema(tokfaiRows, "tokfai CSV schema") && allOk;
  allOk = assertSchema(competitorRows, "competitor CSV schema") && allOk;

  // Never allow competitor host strings in outputs we just wrote.
  const tokfaiCsvText = await readFile(tokfaiCsvPath, "utf8");
  const competitorCsvText = await readFile(competitorCsvPath, "utf8");
  if (
    FORBIDDEN_COMPETITOR_HOST_RE.test(tokfaiCsvText) ||
    FORBIDDEN_COMPETITOR_HOST_RE.test(competitorCsvText)
  ) {
    allOk =
      fail("host leak", "CSV contains forbidden competitor host pattern") &&
      false;
  } else {
    pass("no competitor host leak in CSV");
  }

  const tokfaiMetrics = aggregateProbeMetrics(tokfaiRows, {
    requiredModels: REQUIRED_MODELS,
    clientCompatScore: TOKFAI_CLIENT_COMPAT_SCORE,
  });

  // Prefer aggregate-from-fixture competitor metrics when rows exist;
  // fall back to published synthetic aggregates for clientCompat/risk bands.
  const competitorFromRows = aggregateProbeMetrics(competitorRows, {
    requiredModels: REQUIRED_MODELS,
    clientCompatScore: COMPETITOR_METRIC_BASELINE.clientCompatScore,
  });

  const competitorMetrics = {
    modelCoverage: competitorFromRows.modelCoverage,
    successRate: competitorFromRows.successRate,
    p95LatencyMs:
      competitorFromRows.p95LatencyMs ??
      COMPETITOR_METRIC_BASELINE.p95LatencyMs,
    clientCompatScore: COMPETITOR_METRIC_BASELINE.clientCompatScore,
    billingRiskRate: Math.max(
      competitorFromRows.billingRiskRate,
      COMPETITOR_METRIC_BASELINE.billingRiskRate * 0.25
    ),
  };

  const compareRows = compareMetrics(tokfaiMetrics, competitorMetrics);
  await writeFile(summaryCsvPath, metricsSummaryToCsv(compareRows), "utf8");

  console.log("");
  console.log("── Five core metrics (Tokfai vs competitor baseline) ──");
  console.log(
    JSON.stringify(
      {
        tokfai: tokfaiMetrics,
        competitorBaseline: competitorMetrics,
        publishedSyntheticBaseline: COMPETITOR_METRIC_BASELINE,
        target: "5%–15% sharper (not blindly cheaper)",
      },
      null,
      2
    )
  );
  console.log("");
  for (const row of compareRows) {
    console.log(
      `${row.targetBand.toUpperCase().padEnd(7)} ${row.metric} tokfai=${row.tokfai} baseline=${row.competitorBaseline} edgePct=${row.edgePct} (betterWhen=${row.betterWhen})`
    );
  }

  console.log("");
  console.log(`wrote: ${tokfaiCsvPath}`);
  console.log(`wrote: ${competitorCsvPath}`);
  console.log(`wrote: ${summaryCsvPath}`);
  console.log(`schema: ${BENCHMARK_CSV_COLUMNS.join(",")}`);

  if (ctx) ctx.cleanup();

  // Framework acceptance: schema + CSV + comparison wiring — not release gate.
  if (!tokfaiRows.length || !competitorRows.length || !compareRows.length) {
    allOk = fail("framework outputs", "missing rows or summary") && false;
  } else {
    pass("framework outputs (CSV + metrics summary)");
  }

  console.log("");
  console.log(allOk ? PASS_MARKER : FAIL_MARKER);
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  console.log(FAIL_MARKER);
  process.exit(1);
});
