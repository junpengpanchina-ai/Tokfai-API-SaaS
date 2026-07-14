#!/usr/bin/env node
/**
 * Public Beta Live Load — two modes for rate-limit vs real throughput.
 *
 * Modes (TOKFAI_LOAD_MODE):
 *   rate-limit  (default) — abuse / RPM guard proof.
 *     Must observe real 429s. Non-429 4xx / 5xx / timeout / other_errors fail.
 *     429 must not charge. Banner: TOKFAI_PUBLIC_BETA_RATE_LIMIT_PASS
 *
 *   throughput — real success under concurrency.
 *     Requires success_rate >= 95% and 429_rate <= 5%.
 *     Needs a high-RPM test key / high-quota tenant (temporarily raise RPM).
 *     Banner: TOKFAI_PUBLIC_BETA_THROUGHPUT_PASS
 *
 * Usage:
 *   TOKFAI_API_KEY=sk-tokfai_... node scripts/public-beta-live-load.mjs
 *   TOKFAI_API_KEY=... TOKFAI_LOAD_MODE=rate-limit \
 *     TOKFAI_LOAD_CONCURRENCY=10 TOKFAI_LOAD_DURATION_SEC=60 \
 *     node scripts/public-beta-live-load.mjs
 *   TOKFAI_API_KEY=... TOKFAI_LOAD_MODE=throughput \
 *     TOKFAI_LOAD_CONCURRENCY=10 TOKFAI_LOAD_DURATION_SEC=60 \
 *     node scripts/public-beta-live-load.mjs
 *
 * Never prints full API key or upstream brand/host/key.
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
const MODE_RAW = (process.env.TOKFAI_LOAD_MODE ?? "rate-limit").trim().toLowerCase();
const MODE =
  MODE_RAW === "throughput" || MODE_RAW === "rate-limit"
    ? MODE_RAW
    : null;

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
const SUCCESS_RATE_MIN = Math.min(
  1,
  Math.max(
    0,
    parseFloat(process.env.TOKFAI_LOAD_SUCCESS_RATE_MIN ?? "0.95") || 0.95
  )
);
const RATE_429_MAX = Math.min(
  1,
  Math.max(0, parseFloat(process.env.TOKFAI_LOAD_429_RATE_MAX ?? "0.05") || 0.05)
);
const PROMPT = "Say OK in one short sentence.";
const MAX_FAILURE_SAMPLES = 5;

/** @type {number[]} */
const latencies = [];
let requests = 0;
let success = 0;
let status4xxExcluding429 = 0;
let status5xx = 0;
let status429 = 0;
let timeouts = 0;
let otherErrors = 0;
let sampleRequestId = null;
/** @type {number[]} */
const creditsSamples = [];
let chargedOn429 = false;
let leakOnError = false;

/** @type {Array<Record<string, unknown>>} */
const failureSamples4xx = [];

function pct(n, d) {
  if (!d) return "0.00%";
  return `${((n / d) * 100).toFixed(2)}%`;
}

function routePath() {
  return ROUTE === "chat" ? "/v1/chat/completions" : "/v1/responses";
}

function extractErrorCode(json) {
  const err = json?.error;
  if (err && typeof err === "object" && typeof err.code === "string") {
    return err.code;
  }
  if (typeof json?.code === "string") return json.code;
  return null;
}

function extractErrorMessage(json, text) {
  const err = json?.error;
  if (err && typeof err === "object" && typeof err.message === "string") {
    return err.message;
  }
  if (typeof err === "string" && err.trim()) return err;
  if (typeof json?.message === "string") return json.message;
  if (typeof text === "string" && text.trim()) return text.slice(0, 200);
  return null;
}

function maybeRecord4xxSample({ status, json, text, path, url, elapsedMs, res }) {
  if (failureSamples4xx.length >= MAX_FAILURE_SAMPLES) return;
  failureSamples4xx.push({
    status,
    code: extractErrorCode(json),
    message: extractErrorMessage(json, text),
    request_id: extractRequestId(json, res),
    route: path,
    model: MODEL,
    final_url: url,
    body_preview: (typeof text === "string" ? text : "").slice(0, 500),
    elapsed_ms: elapsedMs,
  });
}

function printFailureSamples() {
  if (!failureSamples4xx.length) return;
  console.error("\n=== Failure samples (4xx excluding 429, max 5) ===");
  for (let i = 0; i < failureSamples4xx.length; i += 1) {
    const s = failureSamples4xx[i];
    console.error(`--- sample ${i + 1} ---`);
    console.error(`      status=${s.status}`);
    console.error(`      code=${s.code ?? "(n/a)"}`);
    console.error(`      message=${s.message ?? "(n/a)"}`);
    console.error(`      request_id=${s.request_id ?? "(n/a)"}`);
    console.error(`      route=${s.route}`);
    console.error(`      model=${s.model}`);
    console.error(`      final_url=${s.final_url}`);
    console.error(`      body_preview=${JSON.stringify(s.body_preview)}`);
    console.error(`      elapsed_ms=${s.elapsed_ms}`);
  }
}

function chargeCheckLabel() {
  if (status429 === 0) return "n/a (no 429)";
  if (chargedOn429) return "CHARGED (bad)";
  return "no_charge (ok)";
}

async function oneShot() {
  const started = Date.now();
  const path = routePath();
  const url = `${BASE}${path}`;
  try {
    let body;
    if (ROUTE === "chat") {
      body = {
        model: MODEL,
        messages: [{ role: "user", content: PROMPT }],
        stream: false,
      };
    } else {
      body = {
        model: MODEL,
        input: PROMPT,
        stream: false,
      };
    }

    const { res, body: json, text } = await acceptanceFetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      timeoutMs: TIMEOUT_MS,
      curlCompatible: true,
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
      status4xxExcluding429 += 1;
      maybeRecord4xxSample({
        status: res.status,
        json,
        text,
        path,
        url: res.url || url,
        elapsedMs: ms,
        res,
      });
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
    const credits = extractCredits(json);
    if (typeof credits === "number" && creditsSamples.length < 20) {
      creditsSamples.push(credits);
    }
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

function printResults({
  successRate,
  rate429,
  p50,
  p95,
  p99,
}) {
  console.log("=== Results ===");
  console.log(`mode=${MODE}`);
  console.log(`total_requests=${requests}`);
  console.log(`success=${success}`);
  console.log(`success_rate=${pct(success, requests)} (${successRate.toFixed(4)})`);
  console.log(`429=${status429}`);
  console.log(`429_rate=${pct(status429, requests)} (${rate429.toFixed(4)})`);
  console.log(`4xx_excluding_429=${status4xxExcluding429}`);
  console.log(`5xx=${status5xx}`);
  console.log(`timeout=${timeouts}`);
  console.log(`other_errors=${otherErrors}`);
  console.log(`p50=${p50}ms p95=${p95}ms p99=${p99}ms`);
  console.log(
    `credits_charged_sample=${
      creditsSamples.length
        ? creditsSamples.map((c) => String(c)).join(",")
        : "(none — no successes or no usage field)"
    }`
  );
  console.log(`sample_request_id=${sampleRequestId ?? "(none)"}`);
  console.log(`429_charge_check=${chargeCheckLabel()}`);
}

/**
 * Rate-limit mode must prove real RPM 429s — not pass on unrelated 4xx.
 */
function evaluateRateLimit({ p95 }) {
  /** @type {string[]} */
  const fails = [];

  if (requests === 0) {
    fails.push("no requests completed");
  }

  if (success === 0 && status429 === 0) {
    fails.push(
      "no valid authenticated request observed (success=0 and 429=0)"
    );
  }

  if (status429 === 0) {
    fails.push(
      "no 429 observed in rate-limit mode — check API key / auth / endpoint / script headers"
    );
  }

  if (status4xxExcluding429 > 0) {
    fails.push(
      `4xx_excluding_429=${status4xxExcluding429} (must be 0; non-429 4xx is not rate-limit proof)`
    );
  }

  if (status5xx > 0) fails.push(`5xx=${status5xx} (must be 0)`);
  if (timeouts > 0) fails.push(`timeout=${timeouts} (must be 0)`);
  if (otherErrors > 0) {
    fails.push(`other_errors=${otherErrors} (must be 0)`);
  }

  const charge = chargeCheckLabel();
  if (status429 > 0 && chargedOn429) {
    fails.push("429_charge_check=CHARGED (bad) — 429 must be no_charge");
  } else if (status429 > 0 && charge !== "no_charge (ok)") {
    fails.push(`429_charge_check=${charge} (must be no_charge or ok)`);
  }

  if (leakOnError) fails.push("body leaked stack or upstream material");

  // p95 optional soft check for rate-limit (mostly 429s are fast); still flag extreme hangs
  if (p95 > P95_MAX_MS * 2) {
    fails.push(`p95 ${p95}ms extreme (> ${P95_MAX_MS * 2}ms)`);
  }

  return fails;
}

function evaluateThroughput({ successRate, rate429, p95 }) {
  /** @type {string[]} */
  const fails = [];

  if (requests === 0) fails.push("no requests completed");
  if (successRate < SUCCESS_RATE_MIN) {
    fails.push(
      `success_rate ${pct(success, requests)} < ${(SUCCESS_RATE_MIN * 100).toFixed(0)}%`
    );
  }
  if (rate429 > RATE_429_MAX) {
    fails.push(
      `429_rate ${pct(status429, requests)} > ${(RATE_429_MAX * 100).toFixed(0)}%`
    );
  }
  if (status5xx > 0) fails.push(`5xx=${status5xx} (must be 0)`);
  if (timeouts > 0) fails.push(`timeout=${timeouts} (must be 0)`);
  if (chargedOn429) fails.push("429 response reported credits_charged > 0");
  if (leakOnError) fails.push("body leaked stack or upstream material");
  if (p95 > P95_MAX_MS) fails.push(`p95 ${p95}ms > ${P95_MAX_MS}ms`);

  return fails;
}

async function main() {
  console.log("=== Tokfai Public Beta Live Load ===");
  console.log(`base: ${BASE}`);
  console.log(`api_key: ${maskApiKey(API_KEY)}`);
  console.log(
    `mode=${MODE_RAW} route=${ROUTE} model=${MODEL} concurrency=${CONCURRENCY} duration=${DURATION_SEC}s`
  );
  console.log(
    MODE_RAW === "rate-limit"
      ? "purpose: verify abuse resistance (must observe real 429; non-429 4xx fails)"
      : MODE_RAW === "throughput"
        ? "purpose: verify real throughput (needs high RPM key / tenant)"
        : "purpose: (unknown mode)"
  );
  console.log("");

  if (!MODE) {
    console.error(
      'TOKFAI_LOAD_MODE must be "rate-limit" (default) or "throughput"'
    );
    process.exit(1);
  }

  if (!API_KEY.startsWith("sk-tokfai_")) {
    console.error("TOKFAI_API_KEY is required (sk-tokfai_...).");
    console.error(
      "Hint: rate-limit mode validates RPM guards; throughput mode needs a high-RPM test key."
    );
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
  const successRate = requests === 0 ? 0 : success / requests;
  const rate429 = requests === 0 ? 0 : status429 / requests;

  printResults({ successRate, rate429, p50, p95, p99 });

  const fails =
    MODE === "rate-limit"
      ? evaluateRateLimit({ p95 })
      : evaluateThroughput({ successRate, rate429, p95 });

  if (fails.length) {
    console.error("\n=== Failures ===");
    for (const f of fails) console.error(`FAIL  ${f}`);
    if (MODE === "rate-limit" && status4xxExcluding429 > 0) {
      printFailureSamples();
    }
    console.error("\npublic-beta-live-load: FAILED");
    process.exit(1);
  }

  console.log("\npublic-beta-live-load: OK");
  if (MODE === "rate-limit") {
    console.log(
      "PASS  rate-limit mode (429>0; 4xx_excluding_429=0; no 5xx/timeout/other_errors/charge)"
    );
    console.log("TOKFAI_PUBLIC_BETA_RATE_LIMIT_PASS");
  } else {
    console.log(
      `PASS  throughput mode (success_rate>=${(SUCCESS_RATE_MIN * 100).toFixed(0)}%, 429_rate<=${(RATE_429_MAX * 100).toFixed(0)}%)`
    );
    console.log("TOKFAI_PUBLIC_BETA_THROUGHPUT_PASS");
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
