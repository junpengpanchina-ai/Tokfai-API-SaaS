#!/usr/bin/env node
/**
 * Internal operator production recovery gate — not customer documentation.
 *
 * P788 — read-only status by default; billable endpoints only with LIVE=1.
 *
 * Usage:
 *   node scripts/p788-production-recovery-gate.mjs
 *   LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p788-production-recovery-gate.mjs
 *
 * Writes: p788-recovery-gate-results/latest.json
 */

process.env.TOKFAI_ACCEPTANCE_RUN = "p788";

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { isLiveMode, PRODUCTION_API_BASE } from "./lib/acceptance-config.mjs";
import { acceptanceFetch } from "./lib/acceptance-http.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS_DIR = join(ROOT, "p788-recovery-gate-results");
const RESULTS_FILE = join(RESULTS_DIR, "latest.json");

const LIVE = isLiveMode();
const API_KEY = process.env.TOKFAI_API_KEY ?? "";
const MODEL = (process.env.TOKFAI_MODEL ?? "auto-fast").trim();

const ORIGIN = (
  process.env.TOKFAI_STATUS_ORIGIN ??
  process.env.TOKFAI_API_ORIGIN ??
  PRODUCTION_API_BASE.replace(/\/v1$/, "")
).replace(/\/+$/, "");

const API_V1 = `${ORIGIN}/v1`;

function maskKey(key) {
  if (!key || key.length <= 12) return null;
  return `${key.slice(0, 12)}…${key.slice(-4)}`;
}

function errorCode(body) {
  return body?.error?.code ?? body?.code ?? null;
}

function requestId(body, res) {
  return (
    body?.request_id ??
    body?.tokfai?.request_id ??
    body?.error?.request_id ??
    res?.headers?.get("x-request-id") ??
    null
  );
}

function resolvedModel(body) {
  return body?.tokfai?.resolved_model ?? body?.model ?? null;
}

function creditsCharged(body) {
  return body?.credits_charged ?? body?.tokfai?.credits_charged ?? null;
}

async function main() {
  const report = {
    suite: "p788-production-recovery-gate",
    mode: LIVE ? "live" : "status-only",
    timestamp: new Date().toISOString(),
    origin: ORIGIN,
    api_v1: API_V1,
    api_key_masked: maskKey(API_KEY),
    steps: [],
    pass: true,
  };

  console.log("=== P788 production recovery gate ===");
  console.log(`mode: ${LIVE ? "live (status + billable probes)" : "status-only (no billable endpoints)"}`);
  console.log(`origin: ${ORIGIN}`);
  console.log("Headers: X-Tokfai-Acceptance, X-Tokfai-Test-Run, User-Agent");
  console.log("");

  let failures = 0;

  async function record(step, row) {
    report.steps.push(row);
    const mark = row.pass ? "PASS" : "FAIL";
    console.log(`[${mark}] ${step}`);
    if (row.http_status != null) console.log(`  HTTP ${row.http_status}`);
    if (row.error_code) console.log(`  error.code: ${row.error_code}`);
    if (row.request_id) console.log(`  request_id: ${row.request_id}`);
    if (row.resolved_model) console.log(`  resolved_model: ${row.resolved_model}`);
    if (row.credits_charged != null) console.log(`  credits_charged: ${row.credits_charged}`);
    if (row.git_commit) console.log(`  git_commit: ${row.git_commit}`);
    if (row.supported_endpoints) {
      console.log(`  supported_endpoints: ${row.supported_endpoints.join(", ")}`);
    }
    if (row.notes) console.log(`  notes: ${row.notes}`);
    console.log("");
    if (!row.pass) {
      failures += 1;
      report.pass = false;
    }
  }

  {
    const { res, body } = await acceptanceFetch(`${ORIGIN}/health`, { timeoutMs: 30_000 });
    await record("GET /health", {
      pass: res.ok && body?.ok === true,
      http_status: res.status,
      notes: body?.service ? `service=${body.service}` : undefined,
    });
  }

  {
    const { res, body } = await acceptanceFetch(`${API_V1}/status`, { timeoutMs: 30_000 });
    const endpoints = body?.supported_endpoints;
    const hasResponses =
      Array.isArray(endpoints) &&
      endpoints.some((e) => String(e).includes("/v1/responses"));
    await record("GET /v1/status", {
      pass: res.ok && body?.ok === true && body?.service === "dmit-api",
      http_status: res.status,
      git_commit: body?.git_commit ?? null,
      version: body?.version ?? null,
      supported_endpoints: Array.isArray(endpoints) ? endpoints : null,
      notes: hasResponses
        ? "POST /v1/responses listed in supported_endpoints"
        : "POST /v1/responses not listed — deploy may be behind",
    });
  }

  if (!LIVE) {
    console.log("Status-only complete (no billable endpoints contacted).");
    console.log("Next: LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p788-production-recovery-gate.mjs");
    await mkdir(RESULTS_DIR, { recursive: true });
    await writeFile(RESULTS_FILE, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Results: ${RESULTS_FILE}`);
    process.exit(failures > 0 ? 1 : 0);
  }

  if (!API_KEY.startsWith("sk-tokfai_")) {
    console.error("LIVE=1 requires TOKFAI_API_KEY=sk-tokfai_...");
    process.exit(1);
  }

  {
    const { res, body } = await acceptanceFetch(`${API_V1}/models`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
      timeoutMs: 30_000,
    });
    const count = Array.isArray(body?.data) ? body.data.length : 0;
    await record("GET /v1/models", {
      pass: res.ok && count > 0,
      http_status: res.status,
      error_code: errorCode(body),
      request_id: requestId(body, res),
      notes: `model_count=${count}`,
    });
  }

  {
    const { res, body } = await acceptanceFetch(`${API_V1}/chat/completions`, {
      method: "POST",
      timeoutMs: 120_000,
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: "Say ok only." }],
        stream: false,
      }),
    });
    await record("POST /v1/chat/completions", {
      pass:
        res.ok &&
        Boolean(body?.choices?.[0]?.message?.content) &&
        Boolean(requestId(body, res)),
      http_status: res.status,
      error_code: errorCode(body),
      request_id: requestId(body, res),
      resolved_model: resolvedModel(body),
      credits_charged: creditsCharged(body),
    });
  }

  {
    const { res, body } = await acceptanceFetch(`${API_V1}/responses`, {
      method: "POST",
      timeoutMs: 120_000,
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: MODEL, input: "Say ok only." }),
    });
    const routeMissing =
      res.status === 404 && errorCode(body) === "route_not_found";
    await record("POST /v1/responses", {
      pass:
        res.ok &&
        typeof body?.output_text === "string" &&
        Boolean(requestId(body, res)),
      http_status: res.status,
      error_code: errorCode(body),
      request_id: requestId(body, res),
      resolved_model: resolvedModel(body),
      credits_charged: creditsCharged(body),
      notes: routeMissing
        ? "route_not_found — production not deployed with /v1/responses"
        : undefined,
    });
  }

  await mkdir(RESULTS_DIR, { recursive: true });
  await writeFile(RESULTS_FILE, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`Results: ${RESULTS_FILE}`);
  if (failures > 0) {
    console.error(`FAILED (${failures} step(s))`);
    process.exit(1);
  }
  console.log("PASS — recovery gate complete. Safe to proceed with Cursor / Cherry Studio.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
