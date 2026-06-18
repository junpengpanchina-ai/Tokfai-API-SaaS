#!/usr/bin/env node
/**
 * Internal operator offline acceptance — not customer documentation.
 *
 * P786 — offline customer integration acceptance against local mock gateway.
 *
 * Usage:
 *   node scripts/p786-offline-customer-acceptance.mjs
 *
 * Writes: p786-offline-results/latest.json
 */

import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MOCK_SCRIPT = join(ROOT, "scripts/p786-offline-customer-mock.mjs");
const RESULTS_DIR = join(ROOT, "p786-offline-results");
const RESULTS_FILE = join(RESULTS_DIR, "latest.json");
const SDK_CHAPTER = join(ROOT, "apps/web/lib/customer-openai-sdk-chapter.ts");
const TOKFAI_API = join(ROOT, "apps/web/lib/tokfai-api.ts");

const MOCK_HOST = process.env.MOCK_HOST ?? "127.0.0.1";
const MOCK_PORT = parseInt(process.env.MOCK_PORT ?? "8787", 10);
const MOCK_KEY = process.env.MOCK_API_KEY ?? `sk-tokfai_${"a".repeat(48)}`;
const BASE = `http://${MOCK_HOST}:${MOCK_PORT}/v1`;
const MODEL = "auto-fast";
const PLACEHOLDER = "sk-tokfai_xxx";

function shellSingleQuotedJson(value) {
  return JSON.stringify(value).replace(/'/g, "'\\''");
}

function powershellJsonBody(value) {
  return JSON.stringify(value).replace(/"/g, '\\"');
}

function chatCurlOneLine(apiKey, base = BASE) {
  const body = shellSingleQuotedJson({
    model: MODEL,
    messages: [{ role: "user", content: "Say ok only." }],
    stream: false,
  });
  return `curl -sS ${base}/chat/completions -H "Authorization: Bearer ${apiKey}" -H "Content-Type: application/json" -d '${body}'`;
}

function chatCurlPowerShellOneLine(apiKey, base = BASE) {
  const body = powershellJsonBody({
    model: MODEL,
    messages: [{ role: "user", content: "Say ok only." }],
    stream: false,
  });
  return `curl.exe -sS "${base}/chat/completions" -H "Authorization: Bearer ${apiKey}" -H "Content-Type: application/json" -d "${body}"`;
}

function modelsCurlOneLine(apiKey, base = BASE) {
  return `curl -sS ${base}/models -H "Authorization: Bearer ${apiKey}"`;
}

function responsesCurlOneLine(apiKey, base = BASE) {
  const body = shellSingleQuotedJson({ model: MODEL, input: "Say ok only." });
  return `curl -sS ${base}/responses -H "Authorization: Bearer ${apiKey}" -H "Content-Type: application/json" -d '${body}'`;
}

function imageCurlOneLine(apiKey, base = BASE) {
  const body = shellSingleQuotedJson({
    model: "gpt-image-2",
    prompt: "Create a clean product-style image of a futuristic API dashboard.",
    size: "1024x1024",
    n: 1,
    response_format: "url",
  });
  return `curl -sS ${base}/images/generations -H "Authorization: Bearer ${apiKey}" -H "Content-Type: application/json" -d '${body}'`;
}

function batchCreateCurlOneLine(apiKey, base = BASE) {
  const body = shellSingleQuotedJson({
    model: MODEL,
    items: [
      { messages: [{ role: "user", content: "Say ok only." }] },
      { messages: [{ role: "user", content: "Say hello only." }] },
    ],
  });
  return `curl -sS ${base}/batches/chat -H "Authorization: Bearer ${apiKey}" -H "Content-Type: application/json" -d '${body}'`;
}

function batchPollCurlOneLine(apiKey, batchId, base = BASE) {
  return `curl -sS ${base}/batches/${batchId} -H "Authorization: Bearer ${apiKey}"`;
}

function batchItemsCurlOneLine(apiKey, batchId, base = BASE) {
  return `curl -sS ${base}/batches/${batchId}/items -H "Authorization: Bearer ${apiKey}"`;
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

function truncate(text, max = 200) {
  if (!text) return "";
  const s = String(text).replace(/\s+/g, " ").trim();
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

async function waitForMock(baseUrl, attempts = 30, delayMs = 300) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${baseUrl}/models`, {
        headers: { Authorization: `Bearer ${MOCK_KEY}` },
      });
      if (res.ok) return true;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

async function ensureMockRunning() {
  const ready = await waitForMock(BASE, 3, 200);
  if (ready) return { spawned: false };

  const child = spawn(process.execPath, [MOCK_SCRIPT], {
    env: {
      ...process.env,
      MOCK_HOST,
      MOCK_PORT: String(MOCK_PORT),
      MOCK_API_KEY: MOCK_KEY,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const up = await waitForMock(BASE);
  if (!up) {
    child.kill();
    throw new Error("Mock gateway failed to start");
  }
  return { spawned: true, child };
}

function checkSdkSnippetIntegrity() {
  const source = `${readFileSync(SDK_CHAPTER, "utf8")}\n${readFileSync(TOKFAI_API, "utf8")}`;
  const required = [
    "request_id",
    "credits_charged",
    "resolved_model",
    "TOKFAI_API_BASE_URL",
    "buildNodeChatFetchExample",
    "buildPythonChatSdkRunnableFile",
    "buildNodeChatSdkRunnableFile",
  ];
  const missing = required.filter((token) => !source.includes(token));
  return {
    pass: missing.length === 0,
    missing,
  };
}

function validatePowerShellCurlStructure(curl) {
  return (
    isOneLineCurl(curl) &&
    curl.includes("curl.exe") &&
    curl.includes("-d \"") &&
    curl.includes("Authorization: Bearer")
  );
}

async function main() {
  const report = {
    suite: "p786-offline-customer-acceptance",
    timestamp: new Date().toISOString(),
    mock_base: BASE,
    pass: true,
    curls: [],
    sdk_integrity: null,
  };

  console.log("=== P786 offline customer acceptance ===");
  console.log(`mock base: ${BASE}`);

  const mock = await ensureMockRunning();
  report.mock_spawned = mock.spawned;

  let failures = 0;

  const curlCases = [
    {
      id: "bash-chat",
      label: "bash one-line chat curl",
      build: () => chatCurlOneLine(MOCK_KEY),
      validate: (body) =>
        body?.choices?.[0]?.message?.content &&
        body?.request_id &&
        body?.tokfai?.resolved_model,
    },
    {
      id: "powershell-chat",
      label: "PowerShell curl.exe chat",
      build: () => chatCurlPowerShellOneLine(MOCK_KEY),
      validate: (body) =>
        body?.choices?.[0]?.message?.content &&
        body?.request_id &&
        body?.tokfai?.resolved_model,
      powershell: true,
    },
    {
      id: "models",
      label: "models curl",
      build: () => modelsCurlOneLine(MOCK_KEY),
      validate: (body) => Array.isArray(body?.data) && body.data.length > 0,
    },
    {
      id: "responses",
      label: "responses curl",
      build: () => responsesCurlOneLine(MOCK_KEY),
      validate: (body) =>
        body?.output_text === "ok" &&
        body?.request_id &&
        body?.tokfai?.resolved_model,
    },
    {
      id: "image",
      label: "image curl",
      build: () => imageCurlOneLine(MOCK_KEY),
      validate: (body) =>
        body?.data?.[0]?.url && body?.request_id && body?.credits_charged != null,
    },
    {
      id: "batch-create",
      label: "batch create curl",
      build: () => batchCreateCurlOneLine(MOCK_KEY),
      validate: (body) => body?.id && body?.status === "completed",
      storeBatchId: true,
    },
  ];

  let batchId = null;

  for (const item of curlCases) {
    const curl = item.build();
    const oneLine = isOneLineCurl(curl);
    const row = {
      id: item.id,
      label: item.label,
      one_line: oneLine,
      curl_preview: truncate(curl),
      pass: false,
    };

    if (!oneLine) {
      failures += 1;
      report.pass = false;
      row.notes = "curl is not single-line safe";
      console.log(`[FAIL] ${item.id} — not one-line`);
    } else if (item.powershell) {
      const structOk = validatePowerShellCurlStructure(curl);
      row.pass = structOk;
      row.notes = structOk
        ? "PowerShell curl.exe structure OK (execution skipped on non-Windows)"
        : "PowerShell curl.exe structure invalid";
      if (!structOk) {
        failures += 1;
        report.pass = false;
        console.log(`[FAIL] ${item.id} — PowerShell structure`);
      } else {
        console.log(`[PASS] ${item.id} — structure`);
      }
    } else {
      try {
        const body = runCurlShell(curl);
        const ok = item.validate(body);
        row.pass = ok;
        row.request_id = body?.request_id ?? body?.tokfai?.request_id ?? null;
        if (item.storeBatchId && body?.id) batchId = body.id;
        if (!ok) {
          failures += 1;
          report.pass = false;
          row.notes = "response validation failed";
          console.log(`[FAIL] ${item.id} — validation`);
        } else {
          console.log(`[PASS] ${item.id}`);
        }
      } catch (err) {
        failures += 1;
        report.pass = false;
        row.notes = err instanceof Error ? err.message : String(err);
        console.log(`[FAIL] ${item.id} — ${row.notes}`);
      }
    }

    report.curls.push(row);
  }

  if (batchId) {
    for (const item of [
      {
        id: "batch-poll",
        label: "batch poll curl",
        build: () => batchPollCurlOneLine(MOCK_KEY, batchId),
        validate: (body) => body?.status === "completed" && body?.id === batchId,
      },
      {
        id: "batch-items",
        label: "batch items curl",
        build: () => batchItemsCurlOneLine(MOCK_KEY, batchId),
        validate: (body) =>
          Array.isArray(body?.data) && body.data.length > 0 && body.data[0]?.request_id,
      },
    ]) {
      const curl = item.build();
      const oneLine = isOneLineCurl(curl);
      const row = {
        id: item.id,
        label: item.label,
        one_line: oneLine,
        curl_preview: truncate(curl),
        pass: false,
        batch_id: batchId,
      };

      if (!oneLine) {
        failures += 1;
        report.pass = false;
        row.notes = "curl is not single-line safe";
        console.log(`[FAIL] ${item.id} — not one-line`);
      } else {
        try {
          const body = runCurlShell(curl);
          const ok = item.validate(body);
          row.pass = ok;
          if (!ok) {
            failures += 1;
            report.pass = false;
            console.log(`[FAIL] ${item.id}`);
          } else {
            console.log(`[PASS] ${item.id}`);
          }
        } catch (err) {
          failures += 1;
          report.pass = false;
          row.notes = err instanceof Error ? err.message : String(err);
          console.log(`[FAIL] ${item.id}`);
        }
      }
      report.curls.push(row);
    }
  } else {
    failures += 2;
    report.pass = false;
    report.curls.push({
      id: "batch-poll",
      pass: false,
      notes: "batch id missing from create step",
    });
    report.curls.push({
      id: "batch-items",
      pass: false,
      notes: "batch id missing from create step",
    });
    console.log("[FAIL] batch poll/items — no batch id");
  }

  const placeholderProbe = runCurlShell(chatCurlOneLine(PLACEHOLDER));
  const placeholderOk = placeholderProbe?.error?.code === "invalid_token";
  report.placeholder_invalid_token = placeholderOk;
  if (!placeholderOk) {
    failures += 1;
    report.pass = false;
    console.log("[FAIL] placeholder key should return invalid_token");
  } else {
    console.log("[PASS] placeholder key → invalid_token");
  }

  const sdk = checkSdkSnippetIntegrity();
  report.sdk_integrity = sdk;
  if (!sdk.pass) {
    failures += 1;
    report.pass = false;
    console.log(`[FAIL] SDK snippet integrity — missing: ${sdk.missing.join(", ")}`);
  } else {
    console.log("[PASS] Node/Python SDK snippet integrity");
  }

  await mkdir(RESULTS_DIR, { recursive: true });
  await writeFile(RESULTS_FILE, `${JSON.stringify(report, null, 2)}\n`);

  console.log("");
  console.log(`Results: ${RESULTS_FILE}`);
  console.log(report.pass ? "OVERALL: PASS" : `OVERALL: FAIL (${failures} issues)`);

  if (mock.spawned && mock.child) {
    mock.child.kill();
  }

  process.exit(report.pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
