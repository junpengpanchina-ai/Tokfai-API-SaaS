#!/usr/bin/env node
/**
 * Public Beta Live Load — real light pressure (not mock).
 *
 * Usage:
 *   TOKFAI_API_KEY=sk-tokfai_... node scripts/public-beta-live-load.mjs
 *   TOKFAI_API_KEY=... TOKFAI_LOAD_CONCURRENCY=10 TOKFAI_LOAD_DURATION_SEC=60 \
 *     TOKFAI_LOAD_MODEL=gpt-5.5 TOKFAI_LOAD_ROUTE=responses node scripts/public-beta-live-load.mjs
 *
 * Pass criteria:
 *   - 5xx = 0
 *   - error_rate <= 1%
 *   - p95 <= 15000ms
 *   - 429 allowed; must not report a charge
 *   - errors must not leak stack / upstream
 */

import { acceptanceFetch } from "./lib/acceptance-http.mjs";
import {
  assertNoLeaks,
  extractCredits,
  extractRequestId,
  maskApiKey,
  normalizeApiBase,
  percentile,
} from "./lib/public-beta-live-helpers.mjs";

const API_KEY = (process.env.TOKFAI_API_KEY ?? "").trim();
const BASE = normalizeApiBase(process.env.TOKFAI_API_BASE);
const CONCURRENCY = Math.max(
  1,
  parseInt(process.env.TOKFAI_LOAD_CONCURRENCY ?? "10", 10) || 10
);
const DURATION_SEC = Math.max(
  5,
  parseInt(process.env.TOKFAI_LOAD_DURATION_SEC ?? "60", 10) || 60
);
const MODEL = (process.env.TOKFAI_LOAD_MODEL ?? "gpt-5.5").trim();
const ROUTE = (process.env.TOKFAI_LOAD_ROUTE ?? "responses").trim().toLowerCase();
const P95_MAX_MS = Math.max(
  1000,
  parseInt(process.env.TOKFAI_LOAD_P95_MAX_MS ?? "15000", 10) || 15_000
);
const TIMEOUT_MS = Math.max(
  10_000,
  parseInt(process.env.TOKFAI_LOAD_TIMEOUT_MS ?? "60000", 10) || 60_000
);
const PROMPT = "Say OK in one short sentence.";

/** @type {number[]} */
const latencies = [];
let requests = 0;
let success = 0;
let status4xx = 0;
let status5xx = 0;
let status429 = 0;
let timeouts = 0;
let otherErrors = 0;
let sampleRequestId = null;
let chargedOn429 = false;
let leakOnError = false;

async function oneShot() {
  const started = Date.now();
  try {
    let path;
    let body;
    if (ROUTE === "chat") {
      path = "/v1/chat/completions";
      body = {
        model: MODEL,
        messages: [{ role: "user", content: PROMPT }],
        max_tokens: 24,
        stream: false,
      };
    } else {
      path = "/v1/responses";
      body = {
        model: MODEL,
        input: PROMPT,
        stream: false,
      };
    }

    const { res, body: json, text } = await acceptanceFetch(`${BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      timeoutMs: TIMEOUT_MS,
    });

    const ms = Date.now() - started;
    latencies.push(ms);
    requests += 1;

    const rid = extractRequestId(json, res);
    if (rid && !sampleRequestId) sampleRequestId = rid;

    if (res.status >= 500) {
      status5xx += 1;
      const leak = assertNoLeaks("5xx body", text);
      if (!leak.ok) leakOnError = true;
      return;
    }

    if (res.status === 429) {
      status429 += 1;
      const credits = extractCredits(json);
      if (typeof credits === "number" && credits > 0) chargedOn429 = true;
      const leak = assertNoLeaks("429 body", text);
      if (!leak.ok) leakOnError = true;
      return;
    }

    if (res.status >= 400) {
      status4xx += 1;
      const leak = assertNoLeaks("4xx body", text);
      if (!leak.ok) leakOnError = true;
      return;
    }

    if (!res.ok) {
      otherErrors += 1;
      return;
    }

    const leak = assertNoLeaks("success body", text);
    if (!leak.ok) {
      leakOnError = true;
      otherErrors += 1;
      return;
    }

    success += 1;
  } catch (err) {
    const ms = Date.now() - started;
    latencies.push(ms);
    requests += 1;
    const msg = err instanceof Error ? err.message : String(err);
    if (/timeout|AbortError|aborted/i.test(msg)) timeouts += 1;
    else otherErrors += 1;
  }
}

async function worker(stopAt) {
  while (Date.now() < stopAt) {
    await oneShot();
  }
}

async function main() {
  console.log("=== Tokfai Public Beta Live Load ===");
  console.log(`base: ${BASE}`);
  console.log(`api_key: ${maskApiKey(API_KEY)}`);
  console.log(
    `route=${ROUTE} model=${MODEL} concurrency=${CONCURRENCY} duration=${DURATION_SEC}s`
  );
  console.log("");

  if (!API_KEY.startsWith("sk-tokfai_")) {
    console.error("TOKFAI_API_KEY is required (sk-tokfai_...).");
    process.exit(1);
  }
  if (ROUTE !== "responses" && ROUTE !== "chat") {
    console.error("TOKFAI_LOAD_ROUTE must be responses or chat");
    process.exit(1);
  }

  const stopAt = Date.now() + DURATION_SEC * 1000;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, () => worker(stopAt))
  );

  const sorted = [...latencies].sort((a, b) => a - b);
  const p50 = percentile(sorted, 50);
  const p95 = percentile(sorted, 95);
  const p99 = percentile(sorted, 99);
  const hardErrors = status5xx + timeouts + otherErrors;
  const errorRate = requests === 0 ? 1 : hardErrors / requests;

  console.log("=== Results ===");
  console.log(`requests=${requests}`);
  console.log(`success=${success}`);
  console.log(`4xx=${status4xx}`);
  console.log(`5xx=${status5xx}`);
  console.log(`429=${status429}`);
  console.log(`timeout=${timeouts}`);
  console.log(`p50=${p50}ms p95=${p95}ms p99=${p99}ms`);
  console.log(`error_rate=${(errorRate * 100).toFixed(2)}%`);
  console.log(`sample_request_id=${sampleRequestId ?? "(none)"}`);
  if (status429 > 0) {
    console.log(
      `429_charge_check=${chargedOn429 ? "CHARGED (bad)" : "no_charge (ok)"}`
    );
  }

  let failed = false;
  if (status5xx > 0) {
    console.error("FAIL  5xx > 0");
    failed = true;
  }
  if (errorRate > 0.01) {
    console.error("FAIL  error_rate > 1%");
    failed = true;
  }
  if (p95 > P95_MAX_MS) {
    console.error(`FAIL  p95 ${p95}ms > ${P95_MAX_MS}ms`);
    failed = true;
  }
  if (chargedOn429) {
    console.error("FAIL  429 response reported credits_charged > 0");
    failed = true;
  }
  if (leakOnError) {
    console.error("FAIL  error/success body leaked stack or upstream material");
    failed = true;
  }

  if (failed) {
    console.error("\npublic-beta-live-load: FAILED");
    process.exit(1);
  }

  console.log("\nPASS  live load within budget");
  console.log("public-beta-live-load: OK");
  console.log("TOKFAI_PUBLIC_BETA_LIVE_LOAD_PASS");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
