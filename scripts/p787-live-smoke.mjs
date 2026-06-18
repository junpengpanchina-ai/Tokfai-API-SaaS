#!/usr/bin/env node
/**
 * Internal operator live smoke — not customer documentation.
 *
 * P787 — one request per endpoint against production (explicit opt-in).
 *
 * Usage:
 *   LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p787-live-smoke.mjs
 *   LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p787-live-smoke.mjs --live
 *
 * Offline default:
 *   node scripts/p786-offline-customer-acceptance.mjs
 *
 * Writes: p787-live-smoke-results/latest.json
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  exitUnlessLive,
  isLiveMode,
  resolveApiBaseUrl,
} from "./lib/acceptance-config.mjs";
import { acceptanceFetch } from "./lib/acceptance-http.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS_DIR = join(ROOT, "p787-live-smoke-results");
const RESULTS_FILE = join(RESULTS_DIR, "latest.json");
const SCRIPT = "scripts/p787-live-smoke.mjs";

const API_KEY = process.env.TOKFAI_API_KEY ?? "";
const MODEL = (process.env.TOKFAI_MODEL ?? "auto-fast").trim();

function maskKey(key) {
  if (!key || key.length <= 12) return null;
  return `${key.slice(0, 12)}…${key.slice(-4)}`;
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

async function main() {
  exitUnlessLive(SCRIPT);

  if (!API_KEY.startsWith("sk-tokfai_")) {
    console.error("Set TOKFAI_API_KEY=sk-tokfai_... for live smoke.");
    process.exit(1);
  }

  const base = resolveApiBaseUrl(true);
  const report = {
    suite: "p787-live-smoke",
    mode: "live",
    live: isLiveMode(),
    timestamp: new Date().toISOString(),
    base,
    model: MODEL,
    api_key_masked: maskKey(API_KEY),
    steps: [],
    pass: true,
  };

  console.log("=== P787 live smoke (one shot per endpoint) ===");
  console.log(`base: ${base}`);
  console.log(`api_key: ${maskKey(API_KEY)}`);
  console.log("Headers: X-Tokfai-Acceptance, X-Tokfai-Test-Run, User-Agent");
  console.log("");

  let failures = 0;

  async function step(name, run) {
    const row = { step: name, pass: false };
    try {
      const result = await run(row);
      row.pass = result.pass;
      Object.assign(row, result.fields ?? {});
    } catch (err) {
      row.pass = false;
      row.notes = err instanceof Error ? err.message : String(err);
    }
    report.steps.push(row);
    console.log(`[${row.pass ? "PASS" : "FAIL"}] ${name}`);
    if (row.http_status) console.log(`  HTTP ${row.http_status}`);
    if (row.request_id) console.log(`  request_id: ${row.request_id}`);
    if (row.notes) console.log(`  ${row.notes}`);
    if (!row.pass) {
      failures += 1;
      report.pass = false;
    }
    console.log("");
    return row.pass;
  }

  await step("GET /v1/models", async (row) => {
    const { res, body } = await acceptanceFetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    row.http_status = res.status;
    row.request_id = requestId(body, res);
    const count = Array.isArray(body?.data) ? body.data.length : 0;
    return { pass: res.ok && count > 0, fields: { model_count: count } };
  });

  await step("POST /v1/chat/completions", async (row) => {
    const { res, body } = await acceptanceFetch(`${base}/chat/completions`, {
      method: "POST",
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
    row.http_status = res.status;
    row.request_id = requestId(body, res);
    return {
      pass:
        res.ok &&
        Boolean(body?.choices?.[0]?.message?.content) &&
        Boolean(row.request_id),
      fields: {
        resolved_model: body?.tokfai?.resolved_model ?? body?.model ?? null,
        credits_charged: body?.credits_charged ?? body?.tokfai?.credits_charged,
      },
    };
  });

  await step("POST /v1/responses", async (row) => {
    const { res, body } = await acceptanceFetch(`${base}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: MODEL, input: "Say ok only." }),
    });
    row.http_status = res.status;
    row.request_id = requestId(body, res);
    return {
      pass: res.ok && typeof body?.output_text === "string" && Boolean(row.request_id),
      fields: { resolved_model: body?.tokfai?.resolved_model ?? body?.model },
    };
  });

  let batchId = null;
  await step("POST /v1/batches/chat", async (row) => {
    const { res, body } = await acceptanceFetch(`${base}/batches/chat`, {
      method: "POST",
      timeoutMs: 60_000,
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        items: [{ messages: [{ role: "user", content: "Say ok only." }] }],
      }),
    });
    row.http_status = res.status;
    row.request_id = requestId(body, res);
    batchId = body?.id ?? null;
    return {
      pass: (res.status === 202 || res.ok) && Boolean(batchId),
      fields: { batch_id: batchId, status: body?.status },
    };
  });

  if (batchId) {
    await step(`GET /v1/batches/${batchId}`, async (row) => {
      const { res, body } = await acceptanceFetch(`${base}/batches/${batchId}`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
        timeoutMs: 60_000,
      });
      row.http_status = res.status;
      row.request_id = requestId(body, res);
      return {
        pass: res.ok && Boolean(body?.status),
        fields: { batch_status: body?.status },
      };
    });

    await step(`GET /v1/batches/${batchId}/items`, async (row) => {
      const { res, body } = await acceptanceFetch(
        `${base}/batches/${batchId}/items`,
        {
          headers: { Authorization: `Bearer ${API_KEY}` },
          timeoutMs: 60_000,
        }
      );
      row.http_status = res.status;
      const items = body?.data ?? [];
      return {
        pass: res.ok && Array.isArray(items) && items.length > 0,
        fields: { item_count: items.length },
      };
    });
  }

  await mkdir(RESULTS_DIR, { recursive: true });
  await writeFile(RESULTS_FILE, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`Results: ${RESULTS_FILE}`);
  if (failures > 0) {
    console.error(`FAILED (${failures} step(s))`);
    process.exit(1);
  }
  console.log("PASS — P787 live smoke complete (single pass, no load test)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
