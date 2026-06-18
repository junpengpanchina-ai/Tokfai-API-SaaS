#!/usr/bin/env node
/**
 * Internal operator offline acceptance — not customer documentation.
 *
 * P793 — large-volume Batch queue customer path gate.
 *
 * Usage:
 *   node scripts/p793-large-volume-batch-path-acceptance.mjs
 */

import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ensureMockGateway } from "./lib/ensure-mock-gateway.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS_DIR = join(ROOT, "p793-large-volume-batch-results");
const LATEST_FILE = join(RESULTS_DIR, "latest.json");
const GREP_SCRIPT = join(ROOT, "scripts/p778-docs-customer-visible-grep.mjs");

const MOCK_KEY = process.env.MOCK_API_KEY ?? "sk-tokfai_mock_acceptance";

function shellSingleQuotedJson(value) {
  return JSON.stringify(value).replace(/'/g, "'\\''");
}

function chatCurlOneLine(apiKey) {
  const body = shellSingleQuotedJson({
    model: "auto-fast",
    messages: [{ role: "user", content: "Say ok only." }],
    stream: false,
  });
  return `curl -sS https://api.tokfai.com/v1/chat/completions -H "Authorization: Bearer ${apiKey}" -H "Content-Type: application/json" -d '${body}'`;
}

function buildBatchCreateCurlOneLine(apiKey) {
  const body = shellSingleQuotedJson({
    model: "auto-fast",
    items: [
      { messages: [{ role: "user", content: "Say ok only." }] },
      { messages: [{ role: "user", content: "Say hello only." }] },
      { messages: [{ role: "user", content: "Say hi only." }] },
    ],
  });
  return `curl -sS https://api.tokfai.com/v1/batches/chat -H "Authorization: Bearer ${apiKey}" -H "Content-Type: application/json" -d '${body}'`;
}

function buildBatchPollCurlOneLine(apiKey, batchId = "batch_xxx") {
  return `curl -sS https://api.tokfai.com/v1/batches/${batchId} -H "Authorization: Bearer ${apiKey}"`;
}

function buildBatchItemsCurlOneLine(apiKey, batchId = "batch_xxx") {
  return `curl -sS https://api.tokfai.com/v1/batches/${batchId}/items -H "Authorization: Bearer ${apiKey}"`;
}

function read(path) {
  return readFileSync(path, "utf8");
}

function assertContains(file, pattern, label) {
  const text = read(join(ROOT, file));
  if (!pattern.test(text)) {
    return { pass: false, label, file };
  }
  return { pass: true, label, file };
}

async function runCustomerGrep() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [GREP_SCRIPT], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => {
      resolve({
        pass: code === 0,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });
  });
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { _raw: text };
  }
  return { status: res.status, body };
}

async function runMockCurlGate(baseUrl, apiKey) {
  const base = baseUrl.replace(/\/+$/, "");
  const results = {
    chat: { pass: false },
    batchCreate: { pass: false },
    batchPoll: { pass: false },
    batchItems: { pass: false, itemRequestIds: 0, itemTotal: 0 },
  };

  const chatRes = await fetchJson(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "auto-fast",
      messages: [{ role: "user", content: "Say ok only." }],
      stream: false,
    }),
  });
  results.chat = {
    pass:
      chatRes.status === 200 &&
      Boolean(chatRes.body?.request_id ?? chatRes.body?.tokfai?.request_id),
    status: chatRes.status,
    request_id: chatRes.body?.request_id ?? chatRes.body?.tokfai?.request_id,
  };

  const createRes = await fetchJson(`${base}/batches/chat`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "auto-fast",
      items: [{ messages: [{ role: "user", content: "Say ok only." }] }],
    }),
  });
  const batchId = createRes.body?.id;
  results.batchCreate = {
    pass: createRes.status === 200 && Boolean(batchId),
    status: createRes.status,
    batchId,
  };

  if (batchId) {
    const pollRes = await fetchJson(`${base}/batches/${batchId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    results.batchPoll = {
      pass: pollRes.status === 200 && pollRes.body?.status === "completed",
      status: pollRes.status,
      batchStatus: pollRes.body?.status,
    };

    const itemsRes = await fetchJson(`${base}/batches/${batchId}/items`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const items = Array.isArray(itemsRes.body?.data) ? itemsRes.body.data : [];
    const withRid = items.filter((item) => item?.request_id).length;
    results.batchItems = {
      pass: itemsRes.status === 200 && items.length > 0 && withRid === items.length,
      status: itemsRes.status,
      itemTotal: items.length,
      itemRequestIds: withRid,
    };
  }

  return results;
}

function validateOneLineCurls(apiKey) {
  const chat = chatCurlOneLine(apiKey);
  const batchCreate = buildBatchCreateCurlOneLine(apiKey);
  const batchPoll = buildBatchPollCurlOneLine(apiKey, "batch_xxx");
  const batchItems = buildBatchItemsCurlOneLine(apiKey, "batch_xxx");

  const checks = [
    {
      label: "chat one-line curl",
      pass: chat.includes("curl") && chat.includes("/chat/completions") && !chat.includes("\n"),
    },
    {
      label: "batch create one-line curl",
      pass:
        batchCreate.includes("curl") &&
        batchCreate.includes("/batches/chat") &&
        !batchCreate.includes("\n"),
    },
    {
      label: "batch poll one-line curl",
      pass:
        batchPoll.includes("curl") &&
        batchPoll.includes("/batches/batch_xxx") &&
        !batchPoll.includes("\n"),
    },
    {
      label: "batch items one-line curl",
      pass:
        batchItems.includes("curl") &&
        batchItems.includes("/items") &&
        !batchItems.includes("\n"),
    },
    {
      label: "curl uses api.tokfai.com",
      pass:
        chat.includes("api.tokfai.com") &&
        batchCreate.includes("api.tokfai.com"),
    },
    {
      label: "curl embeds api key",
      pass: chat.includes(apiKey) && batchCreate.includes(apiKey),
    },
  ];

  return checks;
}

async function main() {
  if (process.env.LIVE === "1") {
    console.error("P793 batch path acceptance is offline-only — unset LIVE=1");
    process.exit(1);
  }

  console.log("=== P793 large-volume batch path acceptance ===");

  const report = {
    suite: "p793-large-volume-batch-path-acceptance",
    timestamp: new Date().toISOString(),
    pass: true,
    checks: [],
  };

  const staticChecks = [
    {
      label: "large-volume-batch-queue chapter",
      file: "apps/web/lib/docs/customer-docs-content.ts",
      pattern: /id:\s*"large-volume-batch-queue"/,
    },
    {
      label: "retry-and-backoff chapter",
      file: "apps/web/lib/docs/customer-docs-content.ts",
      pattern: /id:\s*"retry-and-backoff"/,
    },
    {
      label: "slow-upstream-behavior chapter",
      file: "apps/web/lib/docs/customer-docs-content.ts",
      pattern: /id:\s*"slow-upstream-behavior"/,
    },
    {
      label: "500-online-readiness chapter",
      file: "apps/web/lib/docs/customer-docs-content.ts",
      pattern: /id:\s*"500-online-readiness"/,
    },
    {
      label: "customer api path panel",
      file: "apps/web/components/customer-api-path-panel.tsx",
      pattern: /CustomerApiPathPanel/,
    },
    {
      label: "workbench choose path",
      file: "apps/web/components/integration-workbench-panel.tsx",
      pattern: /CustomerApiPathPanel/,
    },
    {
      label: "429 retry docs",
      file: "apps/web/lib/i18n/messages.ts",
      pattern: /when4291:/,
    },
    {
      label: "503 fallback docs",
      file: "apps/web/lib/i18n/messages.ts",
      pattern: /when503Title:/,
    },
    {
      label: "504 retry docs",
      file: "apps/web/lib/i18n/messages.ts",
      pattern: /when504Title:/,
    },
    {
      label: "usage credits reference_id text",
      file: "apps/web/lib/i18n/messages.ts",
      pattern: /reference_id/,
    },
    {
      label: "industry batch-first note",
      file: "apps/web/lib/i18n/messages.ts",
      pattern: /batchFirstNote:/,
    },
    {
      label: "api keys batch poll copy",
      file: "apps/web/app/dashboard/api-keys/api-keys-client.tsx",
      pattern: /copyOneLineBatchPollCurl/,
    },
  ];

  for (const check of staticChecks) {
    const result = assertContains(check.file, check.pattern, check.label);
    report.checks.push(result);
    if (!result.pass) {
      report.pass = false;
      console.log(`[FAIL] ${check.label}`);
    } else {
      console.log(`[PASS] ${check.label}`);
    }
  }

  const curlChecks = validateOneLineCurls(MOCK_KEY);
  for (const check of curlChecks) {
    report.checks.push(check);
    if (!check.pass) {
      report.pass = false;
      console.log(`[FAIL] ${check.label}`);
    } else {
      console.log(`[PASS] ${check.label}`);
    }
  }

  const mock = await ensureMockGateway({ apiKey: MOCK_KEY });
  report.mock_spawned = mock.spawned;

  const mockGate = await runMockCurlGate(mock.baseUrl, mock.apiKey);
  report.mock = mockGate;

  for (const [key, value] of Object.entries(mockGate)) {
    const label = `mock ${key}`;
    report.checks.push({ pass: value.pass, label });
    if (!value.pass) {
      report.pass = false;
      console.log(`[FAIL] ${label}`);
    } else {
      console.log(`[PASS] ${label}`);
    }
  }

  if (mock.spawned && mock.child) {
    mock.child.kill();
  }

  const grepResult = await runCustomerGrep();
  report.checks.push({
    pass: grepResult.pass,
    label: "customer-visible grep",
    detail: grepResult.stdout || grepResult.stderr,
  });
  if (!grepResult.pass) {
    report.pass = false;
    console.log("[FAIL] customer-visible grep");
    if (grepResult.stderr) console.error(grepResult.stderr);
  } else {
    console.log(`[PASS] customer-visible grep — ${grepResult.stdout}`);
  }

  await mkdir(RESULTS_DIR, { recursive: true });
  await writeFile(LATEST_FILE, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`\nP793 large-volume batch path acceptance: ${report.pass ? "PASS" : "FAIL"}`);
  console.log(`results: ${LATEST_FILE}`);
  process.exit(report.pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
