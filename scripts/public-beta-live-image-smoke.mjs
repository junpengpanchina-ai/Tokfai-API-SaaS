#!/usr/bin/env node
/**
 * Public Beta Live Image Smoke — real image generation + poll.
 *
 * Usage:
 *   TOKFAI_API_KEY=sk-tokfai_... node scripts/public-beta-live-image-smoke.mjs
 *   TOKFAI_API_KEY=... TOKFAI_OTHER_API_KEY=... node scripts/public-beta-live-image-smoke.mjs
 *
 * Optional faster-model acceptance:
 *   TOKFAI_API_KEY=... TOKFAI_IMAGE_MODEL=nano-banana-fast node scripts/public-beta-live-image-smoke.mjs
 *
 * Env:
 *   TOKFAI_IMAGE_MODEL   default gpt-image-2 (try nano-banana-fast for faster runs)
 *   TOKFAI_IMAGE_PROMPT  default clean dashboard illustration
 *   TOKFAI_IMAGE_SIZE    default 1024x1024
 *   TOKFAI_IMAGE_POLL_MS default 180000
 */

import { acceptanceFetch } from "./lib/acceptance-http.mjs";
import {
  assertNoLeaks,
  extractCredits,
  extractRequestId,
  maskApiKey,
  normalizeApiBase,
  safeErrorSummary,
} from "./lib/public-beta-live-helpers.mjs";

const API_KEY = (process.env.TOKFAI_API_KEY ?? "").trim();
const OTHER_KEY = (process.env.TOKFAI_OTHER_API_KEY ?? "").trim();
const BASE = normalizeApiBase(process.env.TOKFAI_API_BASE);
const MODEL = (process.env.TOKFAI_IMAGE_MODEL ?? "gpt-image-2").trim();
const PROMPT =
  process.env.TOKFAI_IMAGE_PROMPT ??
  "A clean minimal API dashboard illustration, white background";
const SIZE = process.env.TOKFAI_IMAGE_SIZE ?? "1024x1024";
const POLL_MS = Math.max(
  30_000,
  parseInt(process.env.TOKFAI_IMAGE_POLL_MS ?? "180000", 10) || 180_000
);

let failures = 0;

function pass(label, extra = "") {
  console.log(`PASS  ${label}${extra ? ` — ${extra}` : ""}`);
}

function fail(label, detail) {
  failures += 1;
  console.error(`FAIL  ${label}`);
  if (detail) console.error(`      ${detail}`);
}

async function api(method, path, key = API_KEY, body) {
  const headers = { Authorization: `Bearer ${key}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return acceptanceFetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    timeoutMs: Math.min(POLL_MS, 120_000),
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isTerminal(status) {
  return (
    status === "completed" ||
    status === "succeeded" ||
    status === "failed" ||
    status === "retryable_timeout"
  );
}

function assertTimeoutNoCharge(latest, taskId) {
  const progress =
    typeof latest.progress === "number" ? latest.progress : null;
  if (progress == null || progress >= 100) {
    fail(
      "progress under retryable_timeout must be < 100",
      `progress=${progress}`
    );
  } else {
    pass(
      "progress under retryable_timeout must be < 100",
      `progress=${progress}`
    );
  }

  const charged = Number(
    latest.credits_charged ?? latest.usage?.credits_charged ?? 0
  );
  if (!Number.isFinite(charged) || charged !== 0) {
    fail("timeout 不扣费", `credits_charged=${charged}`);
  } else {
    pass("timeout 不扣费", "credits_charged=0");
  }

  const url =
    latest?.data?.[0]?.url ?? latest?.results?.[0]?.url ?? null;
  if (url) {
    fail(
      "result url only on completed",
      "url present on retryable_timeout"
    );
  } else {
    pass("result url only on completed", "no url on timeout");
  }

  const err = latest.error && typeof latest.error === "object" ? latest.error : {};
  const code = err.code ?? latest.status;
  const message =
    typeof err.message === "string" ? err.message.slice(0, 160) : null;
  pass(
    "image retryable_timeout (friendly only)",
    `code=${code} message=${message ?? "(none)"} request_id=${taskId}`
  );
}

async function main() {
  console.log("=== Tokfai Public Beta Live Image Smoke ===");
  console.log(`base: ${BASE}`);
  console.log(`api_key: ${maskApiKey(API_KEY)}`);
  console.log(`model: ${MODEL}`);
  console.log(`poll_budget_ms: ${POLL_MS}`);
  console.log("");

  if (!API_KEY.startsWith("sk-tokfai_")) {
    console.error("TOKFAI_API_KEY is required (sk-tokfai_...).");
    process.exit(1);
  }

  const { res, body, text } = await api("POST", "/v1/images/generations", API_KEY, {
    model: MODEL,
    prompt: PROMPT,
    size: SIZE,
    n: 1,
    response_format: "url",
  });

  {
    const leak = assertNoLeaks("image POST", text);
    if (!leak.ok) fail("image POST no leak", leak.detail);
  }

  const taskId = body?.id ?? body?.request_id ?? extractRequestId(body, res);
  if (!(res.status === 202 || res.status === 200) || !taskId) {
    fail(
      "POST /v1/images/generations",
      JSON.stringify(safeErrorSummary(body, res.status))
    );
    console.error("\npublic-beta-live-image-smoke: FAILED");
    process.exit(1);
  }

  pass(
    "POST accepted",
    `HTTP ${res.status} id=${taskId} status=${body?.status ?? "n/a"}`
  );

  if (
    body?.status &&
    body.status !== "queued" &&
    body.status !== "completed" &&
    body.status !== "succeeded"
  ) {
    // validating / generating etc. is fine mid-flight if sync somehow returned early
    pass("initial status", String(body.status));
  } else if (body?.status === "queued" || res.status === 202) {
    pass("initial status queued / accepted");
  }

  let latest = body;
  const deadline = Date.now() + POLL_MS;
  while (Date.now() < deadline && !isTerminal(latest?.status)) {
    await sleep(2500);
    const poll = await api(
      "GET",
      `/v1/images/generations/${encodeURIComponent(taskId)}`
    );
    const leak = assertNoLeaks("image GET", poll.text);
    if (!leak.ok) {
      fail("poll no leak", leak.detail);
      break;
    }
    if (!poll.res.ok) {
      fail(
        "GET poll",
        JSON.stringify(safeErrorSummary(poll.body, poll.res.status))
      );
      break;
    }
    latest = poll.body;
    const progress =
      typeof latest.progress === "number" ? latest.progress : null;
    if (progress != null && (progress < 0 || progress > 100)) {
      fail("progress range", `progress=${progress}`);
      break;
    }
    // Only completed may report 100 while in-flight / terminal non-complete.
    if (
      progress === 100 &&
      latest.status !== "completed" &&
      latest.status !== "succeeded"
    ) {
      fail(
        "progress=100 only when completed",
        `status=${latest.status} progress=${progress}`
      );
      break;
    }
    process.stdout.write(
      `  … status=${latest.status} progress=${progress ?? "?"}\n`
    );
  }

  if (latest?.status === "retryable_timeout") {
    assertTimeoutNoCharge(latest, taskId);
    const blob = JSON.stringify(latest);
    const leak = assertNoLeaks("timeout image body", blob);
    if (!leak.ok) fail("timeout body no upstream", leak.detail);
  } else if (latest?.status === "failed") {
    const err = latest.error && typeof latest.error === "object" ? latest.error : {};
    const code = err.code ?? latest.status;
    const message =
      typeof err.message === "string" ? err.message.slice(0, 160) : null;
    pass(
      "image failed (friendly only)",
      `code=${code} message=${message ?? "(none)"} request_id=${taskId}`
    );
    const credits = extractCredits(latest);
    if (typeof credits === "number" && credits > 0) {
      fail("failed must not charge", `credits_charged=${credits}`);
    } else {
      pass("failed 不扣费", String(credits ?? 0));
    }
    const progress =
      typeof latest.progress === "number" ? latest.progress : null;
    if (progress != null && progress >= 100) {
      fail("failed progress < 100", `progress=${progress}`);
    }
    const blob = JSON.stringify(latest);
    const leak = assertNoLeaks("failed image body", blob);
    if (!leak.ok) fail("failed body no upstream", leak.detail);
  } else if (
    latest?.status === "completed" ||
    latest?.status === "succeeded"
  ) {
    if (typeof latest.progress === "number" && latest.progress !== 100) {
      fail("progress=100", `got ${latest.progress}`);
    } else {
      pass("progress=100");
    }
    const url =
      latest?.data?.[0]?.url ??
      latest?.results?.[0]?.url ??
      null;
    if (!url || typeof url !== "string") {
      fail("result url", "missing data/url");
    } else {
      pass("result url present");
    }
    const credits = extractCredits(latest);
    if (credits == null) {
      fail("usage/credits", "missing on completed task");
    } else {
      pass("usage/credits_charged", String(credits));
    }
  } else {
    fail(
      "poll deadline",
      `last status=${latest?.status ?? "unknown"} request_id=${taskId}`
    );
  }

  // Non-owner cannot read task
  {
    const other =
      OTHER_KEY.startsWith("sk-tokfai_") && OTHER_KEY !== API_KEY
        ? OTHER_KEY
        : `sk-tokfai_${"c".repeat(48)}`;
    const poll = await api(
      "GET",
      `/v1/images/generations/${encodeURIComponent(taskId)}`,
      other
    );
    if (
      poll.res.status === 401 ||
      poll.res.status === 403 ||
      poll.res.status === 404
    ) {
      pass(
        "non-owner cannot read task",
        `HTTP ${poll.res.status}`
      );
    } else {
      fail(
        "non-owner cannot read task",
        `expected 401/403/404 got ${poll.res.status}`
      );
    }
    const leak = assertNoLeaks("non-owner response", poll.text);
    if (!leak.ok) fail("non-owner no leak", leak.detail);
  }

  console.log("\n=== Summary ===");
  if (failures > 0) {
    console.error(`public-beta-live-image-smoke: FAILED (${failures})`);
    process.exit(1);
  }
  console.log("public-beta-live-image-smoke: OK");
  console.log("TOKFAI_PUBLIC_BETA_IMAGE_READY");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
