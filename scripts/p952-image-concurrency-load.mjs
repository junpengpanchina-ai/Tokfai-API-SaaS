#!/usr/bin/env node
/**
 * P952 — Image concurrency load runner (summary-focused).
 *
 * Hard limits:
 *   - does not modify Nano Banana / Chat / GPT / Gemini / billing / Nginx
 *   - default concurrency is conservative (2–3); high concurrency is opt-in
 *   - SELF_TEST never hits the network
 *
 * Env:
 *   COUNT            default 20
 *   CONCURRENCY      default 3 (production policy recommendation)
 *   MODEL            default nano-banana
 *   TOKFAI_API_BASE  default https://api.tokfai.com
 *   TOKFAI_API_KEY   required for LIVE
 *   POLL_MS          per-task poll budget (default 180000)
 *   PROMPT           image prompt
 *   CSV_DIR          default tmp
 *   SELF_TEST=1      synthetic summary only (no LIVE)
 *   LIVE=1           real public image load
 *
 * Usage:
 *   SELF_TEST=1 node scripts/p952-image-concurrency-load.mjs
 *   LIVE=1 TOKFAI_API_KEY=sk-tokfai_... COUNT=20 CONCURRENCY=3 \
 *     node scripts/p952-image-concurrency-load.mjs
 *
 * Summary keys:
 *   total_done, completed, failed, timeout, billable_success,
 *   bad_billing_failures, missing_url_success, error_codes,
 *   min/p50/p90/p95/max latency
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildSyntheticImageLoadRows,
  formatImageConcurrencySummary,
  judgeSyntheticImageSummary,
  runPool,
  summarizeImageConcurrencyLoad,
} from "./lib/image-concurrency-load.mjs";
import {
  extractCredits,
  maskApiKey,
  normalizeApiBase,
} from "./lib/public-beta-live-helpers.mjs";

const SCRIPT = "scripts/p952-image-concurrency-load.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SELF_TEST = process.env.SELF_TEST === "1" || process.env.SELF_TEST === "true";
const LIVE = process.env.LIVE === "1" || process.env.LIVE === "true";

const COUNT = Math.max(1, parseInt(process.env.COUNT ?? "20", 10) || 20);
const CONCURRENCY = Math.max(
  1,
  parseInt(process.env.CONCURRENCY ?? "3", 10) || 3
);
const MODEL = (process.env.MODEL ?? "nano-banana").trim();
const PROMPT =
  process.env.PROMPT ??
  "A simple product photo on a plain white background, studio light";
const POLL_MS = Math.max(
  30_000,
  parseInt(process.env.POLL_MS ?? "180000", 10) || 180_000
);
const POLL_INTERVAL_MS = Math.max(
  500,
  parseInt(process.env.POLL_INTERVAL_MS ?? "2500", 10) || 2500
);
const CSV_DIR = join(ROOT, process.env.CSV_DIR ?? "tmp");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isTerminal(status) {
  const s = String(status ?? "").toLowerCase();
  return (
    s === "completed" ||
    s === "succeeded" ||
    s === "failed" ||
    s === "retryable_timeout" ||
    s === "timeout"
  );
}

function extractUrl(body) {
  const u = body?.data?.[0]?.url ?? body?.results?.[0]?.url ?? null;
  return typeof u === "string" && u.trim() ? u.trim() : null;
}

function extractBillingStatus(body) {
  return (
    body?.tokfai?.billing_status ??
    body?.billing_status ??
    (Number(body?.credits_charged) > 0 ? "billable" : "not_billable")
  );
}

function extractErrorCode(body, status) {
  const err = body?.error && typeof body.error === "object" ? body.error : null;
  if (typeof err?.code === "string" && err.code.trim()) return err.code.trim();
  if (status === "failed" || status === "retryable_timeout") {
    return String(status);
  }
  return null;
}

async function api(base, key, method, path, body, timeoutMs) {
  const headers = { Authorization: `Bearer ${key}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { _raw: text.slice(0, 400) };
    }
    return { res, body: json, text };
  } finally {
    clearTimeout(timer);
  }
}

async function runOneImageJob(base, key, index) {
  const started = Date.now();
  /** @type {import('./lib/image-concurrency-load.mjs').ImageLoadRow} */
  const row = {
    status: "unknown",
    credits: 0,
    billingStatus: "not_billable",
    url: null,
    errorCode: null,
    latencyMs: null,
    clientTimeout: false,
    index,
  };

  try {
    const create = await api(
      base,
      key,
      "POST",
      "/v1/images/generations",
      {
        model: MODEL,
        prompt: `${PROMPT} (#${index + 1})`,
        size: "1024x1024",
        n: 1,
        response_format: "url",
      },
      Math.min(POLL_MS, 60_000)
    );

    const taskId =
      create.body?.id ??
      create.body?.task_id ??
      create.body?.request_id ??
      null;

    if (
      !(create.res.status === 202 || create.res.status === 200) ||
      !taskId
    ) {
      row.status = "failed";
      row.errorCode =
        create.body?.error?.code ?? `http_${create.res.status}`;
      row.credits = extractCredits(create.body) ?? 0;
      row.billingStatus = extractBillingStatus(create.body);
      row.latencyMs = Date.now() - started;
      return row;
    }

    let latest = create.body;
    const deadline = Date.now() + POLL_MS;
    while (Date.now() < deadline && !isTerminal(latest?.status)) {
      await sleep(POLL_INTERVAL_MS);
      const poll = await api(
        base,
        key,
        "GET",
        `/v1/images/generations/${encodeURIComponent(taskId)}`,
        undefined,
        Math.min(60_000, deadline - Date.now() + 1_000)
      );
      if (!poll.res.ok) {
        row.status = "failed";
        row.errorCode =
          poll.body?.error?.code ?? `http_${poll.res.status}`;
        row.credits = extractCredits(poll.body) ?? 0;
        row.billingStatus = extractBillingStatus(poll.body);
        row.latencyMs = Date.now() - started;
        return row;
      }
      latest = poll.body;
    }

    if (!isTerminal(latest?.status)) {
      const stillProcessing =
        latest?.processing === true ||
        latest?.task_timeout === true ||
        ["queued", "validating", "billing_check", "requesting_model", "generating", "saving_result"].includes(
          String(latest?.status ?? "").toLowerCase()
        );
      if (stillProcessing) {
        // P957: client wait window exceeded while upstream still in-flight
        row.status = "processing_timeout";
        row.processingTimeout = true;
        row.errorCode =
          latest?.task_timeout || latest?.tokfai?.task_timeout
            ? "image_task_timeout"
            : "processing_timeout";
      } else {
        row.status = "timeout";
        row.clientTimeout = true;
        row.errorCode = "client_poll_timeout";
      }
      row.credits = extractCredits(latest) ?? 0;
      row.billingStatus = extractBillingStatus(latest);
      row.latencyMs = Date.now() - started;
      row.requestId = taskId;
      return row;
    }

    const status = String(latest.status).toLowerCase();
    row.status =
      status === "succeeded"
        ? "completed"
        : status === "retryable_timeout"
          ? "timeout"
          : status;
    row.url = extractUrl(latest);
    row.credits = extractCredits(latest) ?? 0;
    row.billingStatus = extractBillingStatus(latest);
    row.errorCode = extractErrorCode(latest, row.status);
    row.latencyMs = Date.now() - started;
    row.requestId = taskId;
    return row;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    row.status = message.toLowerCase().includes("abort")
      ? "timeout"
      : "failed";
    row.clientTimeout = row.status === "timeout";
    row.errorCode = row.status === "timeout" ? "client_abort" : "client_error";
    row.latencyMs = Date.now() - started;
    return row;
  }
}

async function writeOutputs(rows, summary) {
  await mkdir(CSV_DIR, { recursive: true });
  const resultPath = join(CSV_DIR, "p952-image-concurrency-result.json");
  const summaryPath = join(CSV_DIR, "p952-image-concurrency-summary.json");
  await writeFile(resultPath, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
  await writeFile(
    summaryPath,
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8"
  );
  return { resultPath, summaryPath };
}

async function main() {
  console.log("=== P952 Image concurrency load ===");
  console.log(`script: ${SCRIPT}`);

  if (SELF_TEST || !LIVE) {
    console.log("mode: SELF_TEST / synthetic (no network)");
    const rows = buildSyntheticImageLoadRows();
    const summary = summarizeImageConcurrencyLoad(rows);
    console.log("");
    console.log(formatImageConcurrencySummary(summary));
    const judged = judgeSyntheticImageSummary(summary);
    if (!judged.ok) {
      for (const f of judged.failures) console.error(`FAIL  ${f}`);
      process.exit(1);
    }
    console.log("");
    console.log("SELF_TEST summary judgment: PASS");
    await writeOutputs(rows, summary);
    process.exit(0);
  }

  const apiKey = (process.env.TOKFAI_API_KEY ?? "").trim();
  const base = normalizeApiBase(process.env.TOKFAI_API_BASE);
  if (!apiKey.startsWith("sk-tokfai_")) {
    console.error("LIVE=1 requires TOKFAI_API_KEY=sk-tokfai_...");
    process.exit(1);
  }

  console.log(`mode: LIVE`);
  console.log(`base: ${base}`);
  console.log(`api_key: ${maskApiKey(apiKey)} (len=${apiKey.length})`);
  console.log(`model: ${MODEL}`);
  console.log(`count=${COUNT} concurrency=${CONCURRENCY} poll_ms=${POLL_MS}`);
  if (CONCURRENCY > 3) {
    console.log(
      "WARN: CONCURRENCY>3 — upstream image stability may degrade (see docs/p952-image-concurrency-policy.md)"
    );
  }
  console.log("");

  const indexes = Array.from({ length: COUNT }, (_, i) => i);
  const rows = await runPool(indexes, CONCURRENCY, (index) =>
    runOneImageJob(base, apiKey, index)
  );
  const summary = summarizeImageConcurrencyLoad(rows);
  console.log(formatImageConcurrencySummary(summary));
  const { resultPath, summaryPath } = await writeOutputs(rows, summary);
  console.log("");
  console.log(`wrote: ${resultPath}`);
  console.log(`wrote: ${summaryPath}`);

  // Soft integrity signal — do not fail the process on upstream instability;
  // only fail on billing integrity violations.
  if (summary.bad_billing_failures > 0) {
    console.error(
      `FAIL  bad_billing_failures=${summary.bad_billing_failures} (failed/timeout must not charge)`
    );
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
