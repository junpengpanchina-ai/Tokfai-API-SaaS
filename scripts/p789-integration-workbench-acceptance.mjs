#!/usr/bin/env node
/**
 * Internal operator offline acceptance — not customer documentation.
 *
 * P789 — integration workbench one-line curl acceptance against local mock gateway.
 *
 * Usage:
 *   node scripts/p789-integration-workbench-acceptance.mjs
 *
 * Writes: p789-integration-workbench-results/latest.json
 */

import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ensureMockGateway } from "./lib/ensure-mock-gateway.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS_DIR = join(ROOT, "p789-integration-workbench-results");
const RESULTS_FILE = join(RESULTS_DIR, "latest.json");

const MODEL = "auto-fast";
const PLACEHOLDER = "sk-tokfai_xxx";

function shellSingleQuotedJson(value) {
  return JSON.stringify(value).replace(/'/g, "'\\''");
}

function chatCurlOneLine(apiKey, base) {
  const body = shellSingleQuotedJson({
    model: MODEL,
    messages: [{ role: "user", content: "Say ok only." }],
    stream: false,
  });
  return `curl -sS ${base}/chat/completions -H "Authorization: Bearer ${apiKey}" -H "Content-Type: application/json" -d '${body}'`;
}

function modelsCurlOneLine(apiKey, base) {
  return `curl -sS ${base}/models -H "Authorization: Bearer ${apiKey}"`;
}

function responsesCurlOneLine(apiKey, base) {
  const body = shellSingleQuotedJson({ model: MODEL, input: "Say ok only." });
  return `curl -sS ${base}/responses -H "Authorization: Bearer ${apiKey}" -H "Content-Type: application/json" -d '${body}'`;
}

function imageCurlOneLine(apiKey, base) {
  const body = shellSingleQuotedJson({
    model: "gpt-image-2",
    prompt: "Create a clean product-style image of a futuristic API dashboard.",
    size: "1024x1024",
    n: 1,
    response_format: "url",
  });
  return `curl -sS ${base}/images/generations -H "Authorization: Bearer ${apiKey}" -H "Content-Type: application/json" -d '${body}'`;
}

function batchCreateCurlOneLine(apiKey, base) {
  const body = shellSingleQuotedJson({
    model: MODEL,
    items: [
      { messages: [{ role: "user", content: "Say ok only." }] },
      { messages: [{ role: "user", content: "Say hello only." }] },
    ],
  });
  return `curl -sS ${base}/batches/chat -H "Authorization: Bearer ${apiKey}" -H "Content-Type: application/json" -d '${body}'`;
}

function batchPollCurlOneLine(apiKey, batchId, base) {
  return `curl -sS ${base}/batches/${batchId} -H "Authorization: Bearer ${apiKey}"`;
}

function batchItemsCurlOneLine(apiKey, batchId, base) {
  return `curl -sS ${base}/batches/${batchId}/items -H "Authorization: Bearer ${apiKey}"`;
}

function chatCurlNoAuth(base) {
  const body = shellSingleQuotedJson({
    model: MODEL,
    messages: [{ role: "user", content: "Say ok only." }],
    stream: false,
  });
  return `curl -sS ${base}/chat/completions -H "Content-Type: application/json" -d '${body}'`;
}

function isOneLineCurl(curl) {
  if (curl.includes("\n")) return false;
  if (/\\\s*$/.test(curl)) return false;
  if (/\bcd\s/.test(curl)) return false;
  if (/node\s+scripts/i.test(curl)) return false;
  return true;
}

function runCurlShell(curl, timeoutMs = 30_000) {
  const out = execFileSync("bash", ["-lc", curl], {
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 4 * 1024 * 1024,
  });
  return JSON.parse(out);
}

function summarizeBody(body) {
  return {
    request_id: body?.request_id ?? body?.tokfai?.request_id ?? null,
    credits_charged: body?.credits_charged ?? null,
    resolved_model: body?.tokfai?.resolved_model ?? body?.model ?? null,
    error_code: body?.error?.code ?? null,
  };
}

function logRow(id, pass, http, summary) {
  const status = pass ? "PASS" : "FAIL";
  console.log(
    `[${status}] ${id} HTTP=${http ?? "—"} code=${summary.error_code ?? "—"} request_id=${summary.request_id ?? "—"} credits=${summary.credits_charged ?? "—"} model=${summary.resolved_model ?? "—"}`
  );
}

async function main() {
  if (process.env.LIVE === "1") {
    console.error("P789 workbench acceptance runs against mock only — unset LIVE=1");
    process.exit(1);
  }

  const report = {
    suite: "p789-integration-workbench-acceptance",
    timestamp: new Date().toISOString(),
    pass: true,
    cases: [],
  };

  console.log("=== P789 integration workbench acceptance (mock) ===");

  const mock = await ensureMockGateway();
  const base = mock.baseUrl.replace(/\/+$/, "");
  const apiKey = mock.apiKey;
  report.mock_base = base;
  report.mock_spawned = mock.spawned;

  let batchId = null;

  const successCases = [
    {
      id: "chat-one-line",
      build: () => chatCurlOneLine(apiKey, base),
      validate: (body) =>
        body?.choices?.[0]?.message?.content &&
        body?.request_id &&
        body?.tokfai?.resolved_model,
    },
    {
      id: "models-one-line",
      build: () => modelsCurlOneLine(apiKey, base),
      validate: (body) => Array.isArray(body?.data) && body.data.length > 0,
    },
    {
      id: "responses-one-line",
      build: () => responsesCurlOneLine(apiKey, base),
      validate: (body) =>
        body?.output_text === "ok" &&
        body?.request_id &&
        body?.tokfai?.resolved_model,
    },
    {
      id: "image-one-line",
      build: () => imageCurlOneLine(apiKey, base),
      validate: (body) =>
        body?.data?.[0]?.url && body?.request_id && body?.credits_charged != null,
    },
    {
      id: "batch-create-one-line",
      build: () => batchCreateCurlOneLine(apiKey, base),
      validate: (body) => body?.id && body?.status === "completed",
      captureBatchId: true,
    },
  ];

  for (const item of successCases) {
    const curl = item.build();
    const row = {
      id: item.id,
      one_line: isOneLineCurl(curl),
      pass: false,
      http: null,
      ...summarizeBody({}),
    };

    if (!row.one_line) {
      row.pass = false;
      row.notes = "curl is not single-line safe";
      report.pass = false;
      logRow(item.id, false, null, row);
    } else {
      try {
        const body = runCurlShell(curl);
        const ok = item.validate(body);
        const summary = summarizeBody(body);
        row.pass = ok;
        row.http = ok ? 200 : null;
        Object.assign(row, summary);
        if (item.captureBatchId && body?.id) batchId = body.id;
        if (!ok) {
          report.pass = false;
          row.notes = "response validation failed";
        }
        logRow(item.id, ok, row.http, summary);
      } catch (err) {
        report.pass = false;
        row.notes = err instanceof Error ? err.message : String(err);
        logRow(item.id, false, null, row);
      }
    }

    report.cases.push(row);
  }

  if (batchId) {
    for (const item of [
      {
        id: "batch-poll-one-line",
        build: () => batchPollCurlOneLine(apiKey, batchId, base),
        validate: (body) => body?.status === "completed" && body?.id === batchId,
      },
      {
        id: "batch-items-one-line",
        build: () => batchItemsCurlOneLine(apiKey, batchId, base),
        validate: (body) =>
          Array.isArray(body?.data) && body.data.length > 0 && body.data[0]?.request_id,
      },
    ]) {
      const curl = item.build();
      const row = {
        id: item.id,
        one_line: isOneLineCurl(curl),
        pass: false,
        batch_id: batchId,
        http: null,
        ...summarizeBody({}),
      };

      if (!row.one_line) {
        report.pass = false;
        row.notes = "curl is not single-line safe";
        logRow(item.id, false, null, row);
      } else {
        try {
          const body = runCurlShell(curl);
          const ok = item.validate(body);
          const summary = summarizeBody(body);
          row.pass = ok;
          row.http = ok ? 200 : null;
          Object.assign(row, summary);
          if (!ok) {
            report.pass = false;
            row.notes = "response validation failed";
          }
          logRow(item.id, ok, row.http, summary);
        } catch (err) {
          report.pass = false;
          row.notes = err instanceof Error ? err.message : String(err);
          logRow(item.id, false, null, row);
        }
      }

      report.cases.push(row);
    }
  } else {
    report.pass = false;
    for (const id of ["batch-poll-one-line", "batch-items-one-line"]) {
      const row = { id, pass: false, notes: "batch id missing from create step" };
      report.cases.push(row);
      logRow(id, false, null, {});
    }
  }

  const placeholderBody = runCurlShell(chatCurlOneLine(PLACEHOLDER, base));
  const placeholderOk = placeholderBody?.error?.code === "invalid_token";
  const placeholderSummary = summarizeBody(placeholderBody);
  const placeholderRow = {
    id: "placeholder-invalid-token",
    pass: placeholderOk,
    http: 401,
    ...placeholderSummary,
  };
  if (!placeholderOk) report.pass = false;
  report.cases.push(placeholderRow);
  logRow("placeholder-invalid-token", placeholderOk, 401, placeholderSummary);

  const missingBody = runCurlShell(chatCurlNoAuth(base));
  const missingOk = missingBody?.error?.code === "missing_token";
  const missingSummary = summarizeBody(missingBody);
  const missingRow = {
    id: "no-auth-missing-token",
    pass: missingOk,
    http: 401,
    ...missingSummary,
  };
  if (!missingOk) report.pass = false;
  report.cases.push(missingRow);
  logRow("no-auth-missing-token", missingOk, 401, missingSummary);

  await mkdir(RESULTS_DIR, { recursive: true });
  await writeFile(RESULTS_FILE, `${JSON.stringify(report, null, 2)}\n`);

  if (mock.spawned && mock.child) {
    mock.child.kill();
  }

  console.log(`\nP789 workbench acceptance: ${report.pass ? "PASS" : "FAIL"}`);
  console.log(`results: ${RESULTS_FILE}`);
  process.exit(report.pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
