#!/usr/bin/env node
/**
 * P940 — Model randomness tendency eval (live, non-production-path).
 *
 * Hits Tokfai POST /v1/chat/completions with a fixed 1–100 random-integer
 * prompt and summarizes distribution stats per model. Does not change
 * billing, aliases, timeouts, or Cherry compat in apps/dmit-api.
 *
 * Usage:
 *   TOKFAI_API_KEY=sk-tokfai_... node scripts/p940-model-randomness-eval.mjs
 *
 * Self-test (no upstream; validates parse/stats/CSV + PASS marker):
 *   SELF_TEST=1 node scripts/p940-model-randomness-eval.mjs
 *
 * Optional env:
 *   TOKFAI_API_BASE      default https://api.tokfai.com/v1
 *   MODELS               comma-separated model IDs (overrides defaults)
 *   REQUESTS_PER_MODEL   default 100
 *   CONCURRENCY          default 2 (per-model request pool; models run serially)
 *   TIMEOUT_MS           default 120000 (request abort only; does not change server)
 *   CSV_PATH             default tmp/model-randomness-eval.csv
 *
 * Acceptance marker on success:
 *   TOKFAI_P940_MODEL_RANDOMNESS_EVAL_PASS
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const BASE = (process.env.TOKFAI_API_BASE ?? "https://api.tokfai.com/v1").replace(
  /\/+$/,
  ""
);
const API_KEY = (process.env.TOKFAI_API_KEY ?? "").trim();
const SELF_TEST =
  process.env.SELF_TEST === "1" ||
  process.env.SELF_TEST === "true" ||
  process.argv.includes("--self-test");

const DEFAULT_MODELS = [
  "gpt-5.5",
  "gpt-5-pro",
  "gpt-5.4-pro",
  "gemini-3-pro",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
];

const MODELS = (process.env.MODELS ?? DEFAULT_MODELS.join(","))
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

const REQUESTS_PER_MODEL = Math.max(
  1,
  parseInt(process.env.REQUESTS_PER_MODEL ?? "100", 10) || 100
);
const CONCURRENCY = Math.max(
  1,
  parseInt(process.env.CONCURRENCY ?? "2", 10) || 2
);
const TIMEOUT_MS = Math.max(
  1000,
  parseInt(process.env.TIMEOUT_MS ?? "120000", 10) || 120_000
);

const PROMPT = "请只返回 1 到 100 之间的一个随机整数，不要解释。";
const ENDPOINT = `${BASE}/chat/completions`;
const CSV_PATH = process.env.CSV_PATH
  ? join(ROOT, process.env.CSV_PATH.replace(/^\.\//, ""))
  : join(ROOT, "tmp", "model-randomness-eval.csv");

const PASS_MARKER = "TOKFAI_P940_MODEL_RANDOMNESS_EVAL_PASS";
const FAIL_MARKER = "TOKFAI_P940_MODEL_RANDOMNESS_EVAL_FAIL";

function maskKey(key) {
  if (!key || key.length <= 12) return "(not set)";
  return `${key.slice(0, 12)}…${key.slice(-4)} (len=${key.length})`;
}

function extractMessageContent(body) {
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part.text === "string") return part.text;
        return "";
      })
      .join("");
  }
  if (typeof body?.choices?.[0]?.text === "string") {
    return body.choices[0].text;
  }
  return "";
}

/**
 * Parse a single integer in [1, 100] from model output.
 * Prefers a lone integer; otherwise first in-range integer token.
 */
function parseRandomInt(text) {
  if (text == null) return null;
  const raw = String(text).trim();
  if (!raw) return null;

  const lone = /^(-?\d+)\s*$/.exec(raw);
  if (lone) {
    const n = Number(lone[1]);
    if (Number.isInteger(n) && n >= 1 && n <= 100) return n;
    return null;
  }

  const tokens = raw.match(/-?\d+/g);
  if (!tokens) return null;
  for (const tok of tokens) {
    const n = Number(tok);
    if (Number.isInteger(n) && n >= 1 && n <= 100) return n;
  }
  return null;
}

function average(nums) {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function median(sorted) {
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function modeValue(nums) {
  if (!nums.length) return null;
  const counts = new Map();
  for (const n of nums) counts.set(n, (counts.get(n) ?? 0) + 1);
  let best = null;
  let bestCount = -1;
  for (const [n, c] of counts) {
    if (c > bestCount || (c === bestCount && n < best)) {
      best = n;
      bestCount = c;
    }
  }
  return best;
}

/** Sample standard deviation (n−1); null when n < 2. */
function stddev(nums, avg) {
  if (nums.length < 2 || avg == null) return null;
  let sumSq = 0;
  for (const n of nums) {
    const d = n - avg;
    sumSq += d * d;
  }
  return Math.sqrt(sumSq / (nums.length - 1));
}

function top10Numbers(nums) {
  if (!nums.length) return "";
  const counts = new Map();
  for (const n of nums) counts.set(n, (counts.get(n) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, 10)
    .map(([n, c]) => `${n}:${c}`)
    .join("|");
}

function round(n, digits = 4) {
  if (n == null || Number.isNaN(n)) return null;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function summarizeModel(model, results) {
  const numbers = [];
  const latencies = [];
  let successCount = 0;
  let invalidCount = 0;

  for (const r of results) {
    latencies.push(r.latencyMs);
    if (r.ok && r.value != null) {
      successCount += 1;
      numbers.push(r.value);
    } else {
      invalidCount += 1;
    }
  }

  const sorted = [...numbers].sort((a, b) => a - b);
  const avg = average(numbers);
  const avgLatency = average(latencies);

  return {
    model,
    success_count: successCount,
    invalid_count: invalidCount,
    avg: round(avg),
    median: round(median(sorted)),
    mode: modeValue(numbers),
    stddev: round(stddev(numbers, avg)),
    top10_numbers: top10Numbers(numbers),
    avg_latency_ms: round(avgLatency, 2),
  };
}

function csvEscape(value) {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows) {
  const headers = [
    "model",
    "success_count",
    "invalid_count",
    "avg",
    "median",
    "mode",
    "stddev",
    "top10_numbers",
    "avg_latency_ms",
  ];
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

async function runPool(total, concurrency, worker) {
  const results = new Array(total);
  let next = 0;

  async function workerLoop() {
    while (true) {
      const i = next;
      next += 1;
      if (i >= total) return;
      results[i] = await worker(i);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, total) },
    () => workerLoop()
  );
  await Promise.all(workers);
  return results;
}

async function runOne(model, index) {
  const started = performance.now();
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: PROMPT }],
        stream: false,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const latencyMs = performance.now() - started;
    const text = await res.text();
    let body = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { parse_error: true, raw: text.slice(0, 200) };
    }

    if (!res.ok) {
      return {
        index,
        ok: false,
        value: null,
        latencyMs,
        status: res.status,
        error: body?.error?.code ?? `http_${res.status}`,
      };
    }

    const content = extractMessageContent(body);
    const value = parseRandomInt(content);
    return {
      index,
      ok: value != null,
      value,
      latencyMs,
      status: res.status,
      error: value == null ? "invalid_integer" : null,
      rawPreview: value == null ? String(content).slice(0, 80) : null,
    };
  } catch (err) {
    return {
      index,
      ok: false,
      value: null,
      latencyMs: performance.now() - started,
      status: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function printSummary(row) {
  console.log(`\n--- ${row.model} ---`);
  console.log(`success_count:   ${row.success_count}`);
  console.log(`invalid_count:   ${row.invalid_count}`);
  console.log(`avg:             ${row.avg ?? "n/a"}`);
  console.log(`median:          ${row.median ?? "n/a"}`);
  console.log(`mode:            ${row.mode ?? "n/a"}`);
  console.log(`stddev:          ${row.stddev ?? "n/a"}`);
  console.log(`top10_numbers:   ${row.top10_numbers || "(none)"}`);
  console.log(`avg_latency_ms:  ${row.avg_latency_ms ?? "n/a"}`);
}

function assertSelfTestHelpers() {
  const cases = [
    ["42", 42],
    ["  7  ", 7],
    ["随机数：88", 88],
    ["101", null],
    ["0", null],
    ["abc", null],
    ["The answer is 13.", 13],
  ];
  for (const [input, expected] of cases) {
    const got = parseRandomInt(input);
    if (got !== expected) {
      throw new Error(`parseRandomInt(${JSON.stringify(input)}) => ${got}, expected ${expected}`);
    }
  }

  const synthetic = [
    { ok: true, value: 10, latencyMs: 100 },
    { ok: true, value: 20, latencyMs: 200 },
    { ok: true, value: 10, latencyMs: 150 },
    { ok: false, value: null, latencyMs: 50 },
  ];
  const row = summarizeModel("self-test-model", synthetic);
  if (row.success_count !== 3 || row.invalid_count !== 1) {
    throw new Error("self-test summarize counts mismatch");
  }
  if (row.mode !== 10) throw new Error("self-test mode mismatch");
  if (row.median !== 10) throw new Error("self-test median mismatch");
  if (row.avg !== 13.3333) throw new Error(`self-test avg mismatch: ${row.avg}`);
  return row;
}

async function runSelfTest() {
  console.log("=== P940 model randomness eval (SELF_TEST) ===\n");
  const baseRow = assertSelfTestHelpers();

  const rows = DEFAULT_MODELS.map((model, i) => {
    const values = Array.from({ length: 8 }, (_, j) => ((i * 7 + j * 13) % 100) + 1);
    const results = values.map((value, j) => ({
      ok: true,
      value,
      latencyMs: 80 + j * 5 + i,
    }));
    results.push({ ok: false, value: null, latencyMs: 40 });
    return summarizeModel(model, results);
  });
  rows[0] = { ...baseRow, model: DEFAULT_MODELS[0] };

  for (const row of rows) printSummary(row);

  await mkdir(dirname(CSV_PATH), { recursive: true });
  await writeFile(CSV_PATH, toCsv(rows), "utf8");
  console.log(`\nCSV: ${CSV_PATH}`);
  console.log(`\n${PASS_MARKER}`);
}

async function runLive() {
  if (!API_KEY.startsWith("sk-tokfai_")) {
    console.error("Set TOKFAI_API_KEY=sk-tokfai_... before running this script.");
    console.error("Or run offline: SELF_TEST=1 node scripts/p940-model-randomness-eval.mjs");
    console.log(FAIL_MARKER);
    process.exit(1);
  }

  console.log("=== P940 model randomness eval ===\n");
  console.log(`endpoint:            ${ENDPOINT}`);
  console.log(`api_key:             ${maskKey(API_KEY)}`);
  console.log(`models:              ${MODELS.join(", ")}`);
  console.log(`requests_per_model:  ${REQUESTS_PER_MODEL}`);
  console.log(`concurrency:         ${CONCURRENCY} (models serial)`);
  console.log(`prompt:              ${PROMPT}`);
  console.log(`csv:                 ${CSV_PATH}`);

  const summaries = [];

  for (const model of MODELS) {
    console.log(
      `\n>>> ${model}: ${REQUESTS_PER_MODEL} requests (concurrency ${CONCURRENCY})`
    );
    const results = await runPool(REQUESTS_PER_MODEL, CONCURRENCY, (i) =>
      runOne(model, i)
    );
    const summary = summarizeModel(model, results);
    summaries.push(summary);
    printSummary(summary);

    const invalidSamples = results
      .filter((r) => !r.ok)
      .slice(0, 3)
      .map((r) => r.error ?? r.rawPreview ?? "unknown");
    if (invalidSamples.length) {
      console.log(`invalid_samples: ${invalidSamples.join(" | ")}`);
    }
  }

  await mkdir(dirname(CSV_PATH), { recursive: true });
  await writeFile(CSV_PATH, toCsv(summaries), "utf8");
  console.log(`\nCSV: ${CSV_PATH}`);
  console.log(`\n${PASS_MARKER}`);
}

async function main() {
  if (SELF_TEST) {
    await runSelfTest();
    return;
  }
  await runLive();
}

main().catch((err) => {
  console.error(err);
  console.log(FAIL_MARKER);
  process.exit(1);
});
