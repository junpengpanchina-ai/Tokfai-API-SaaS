#!/usr/bin/env node
/**
 * P769 — Industry task template demo (maps templates → /v1/batches/chat).
 *
 * Usage:
 *   node scripts/industry-task-demo.mjs list
 *   node scripts/industry-task-demo.mjs show <template_id>
 *   node scripts/industry-task-demo.mjs print-batch <template_id>
 *   TOKFAI_API_KEY=sk-tokfai_... node scripts/industry-task-demo.mjs run <template_id>
 *
 * Optional env:
 *   TOKFAI_API_BASE        default https://api.tokfai.com/v1
 *   POLL_INTERVAL_MS       default 3000
 *   POLL_TIMEOUT_MS        default 300000
 *   TIMEOUT_MS             default 120000
 */

import {
  INDUSTRY_TASK_TEMPLATES,
  getTemplate,
  exampleBatchRequest,
  buildBatchRequest,
} from "./industry-task-templates.mjs";

const BASE = (process.env.TOKFAI_API_BASE ?? "https://api.tokfai.com/v1").replace(
  /\/+$/,
  ""
);
const API_KEY = process.env.TOKFAI_API_KEY ?? "";
const POLL_INTERVAL_MS = Math.max(
  500,
  parseInt(process.env.POLL_INTERVAL_MS ?? "3000", 10) || 3000
);
const POLL_TIMEOUT_MS = Math.max(
  10_000,
  parseInt(process.env.POLL_TIMEOUT_MS ?? "300000", 10) || 300_000
);
const TIMEOUT_MS = Math.max(
  1000,
  parseInt(process.env.TIMEOUT_MS ?? "120000", 10) || 120_000
);

const TERMINAL_BATCH = new Set([
  "completed",
  "failed",
  "partial_failed",
  "cancelled",
]);

function maskKey(key) {
  if (!key || key.length <= 12) return "(not set)";
  return `${key.slice(0, 12)}…${key.slice(-4)} (len=${key.length})`;
}

function truncate(text, max = 200) {
  if (!text) return "";
  const s = String(text).replace(/\s+/g, " ").trim();
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function usage() {
  console.log("P769 industry task template demo");
  console.log("");
  console.log("  node scripts/industry-task-demo.mjs list");
  console.log("  node scripts/industry-task-demo.mjs show <template_id>");
  console.log("  node scripts/industry-task-demo.mjs print-batch <template_id>");
  console.log("  TOKFAI_API_KEY=sk-tokfai_... node scripts/industry-task-demo.mjs run <template_id>");
  console.log("");
  console.log("Templates:");
  for (const t of INDUSTRY_TASK_TEMPLATES) {
    console.log(`  - ${t.template_id} (${t.recommended_model})`);
  }
}

function cmdList() {
  console.log("=== P769 industry task templates ===");
  console.log("");
  for (const t of INDUSTRY_TASK_TEMPLATES) {
    console.log(`${t.template_id}`);
    console.log(`  model:     ${t.recommended_model}`);
    console.log(`  use_case:  ${truncate(t.use_case, 120)}`);
    console.log(`  examples:  ${t.example_inputs.length} batch items`);
    console.log("");
  }
}

function cmdShow(templateId) {
  const template = getTemplate(templateId);
  if (!template) {
    console.error(`Unknown template: ${templateId}`);
    process.exit(1);
  }

  console.log(`=== ${template.template_id} ===`);
  console.log(`use_case: ${template.use_case}`);
  console.log(`recommended_model: ${template.recommended_model}`);
  console.log("");
  console.log("input_schema:");
  console.log(JSON.stringify(template.input_schema, null, 2));
  console.log("");
  console.log("example_inputs:");
  console.log(JSON.stringify(template.example_inputs, null, 2));
  console.log("");
  console.log("example prompt (first item):");
  console.log("---");
  console.log(template.prompt_builder(template.example_inputs[0]));
  console.log("---");
}

function cmdPrintBatch(templateId) {
  const template = getTemplate(templateId);
  if (!template) {
    console.error(`Unknown template: ${templateId}`);
    process.exit(1);
  }

  const body = exampleBatchRequest(template);
  console.log(JSON.stringify(body, null, 2));
}

async function apiFetch(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: truncate(text) };
  }
  return { res, body };
}

async function cmdRun(templateId) {
  if (!API_KEY.startsWith("sk-tokfai_")) {
    console.error("Set TOKFAI_API_KEY=sk-tokfai_... before run.");
    process.exit(1);
  }

  const template = getTemplate(templateId);
  if (!template) {
    console.error(`Unknown template: ${templateId}`);
    process.exit(1);
  }

  const batchBody = buildBatchRequest(template, template.example_inputs);

  console.log("=== P769 industry task demo (live batch) ===");
  console.log(`api_base:   ${BASE}`);
  console.log(`api_key:    ${maskKey(API_KEY)}`);
  console.log(`template:   ${template.template_id}`);
  console.log(`model:      ${batchBody.model}`);
  console.log(`items:      ${batchBody.items.length}`);
  console.log("");

  console.log("POST /v1/batches/chat …");
  const { res: createRes, body: created } = await apiFetch("/batches/chat", {
    method: "POST",
    body: JSON.stringify(batchBody),
  });

  if (createRes.status !== 202 && !createRes.ok) {
    console.error("Create failed:", createRes.status, created);
    process.exit(1);
  }

  console.log(`  batch_id=${created.id} status=${created.status}`);
  console.log("");
  console.log("Polling …");

  const started = Date.now();
  let finalBatch = created;

  while (Date.now() - started < POLL_TIMEOUT_MS) {
    const { res, body } = await apiFetch(`/batches/${created.id}`);
    if (!res.ok) {
      console.error("Get batch failed:", res.status, body);
      process.exit(1);
    }
    finalBatch = body;
    console.log(
      `  status=${body.status} ok=${body.succeeded_items}/${body.total_items} credits=${body.credits_charged}`
    );
    if (TERMINAL_BATCH.has(body.status)) break;
    await sleep(POLL_INTERVAL_MS);
  }

  if (!TERMINAL_BATCH.has(finalBatch.status)) {
    console.error("Poll timeout");
    process.exit(1);
  }

  const { res: itemsRes, body: itemsBody } = await apiFetch(
    `/batches/${created.id}/items?limit=100&offset=0`
  );
  if (!itemsRes.ok) {
    console.error("Get items failed:", itemsRes.status, itemsBody);
    process.exit(1);
  }

  const items = itemsBody.data ?? [];
  console.log("");
  console.log("Results:");
  for (const item of items) {
    const preview =
      item.output?.choices?.[0]?.message?.content ??
      truncate(JSON.stringify(item.output), 120);
    console.log(
      `  [${item.index}] ${item.status} credits=${item.credits_charged ?? 0} request_id=${item.request_id ?? "-"}`
    );
    if (item.error_code) console.log(`    error: ${item.error_code}`);
    if (item.status === "succeeded") console.log(`    preview: ${truncate(preview, 160)}`);
  }

  const requestIds = items
    .filter((i) => i.status === "succeeded" && i.request_id)
    .map((i) => i.request_id);

  console.log("");
  console.log("Usage / Credits trace:");
  console.log("  Dashboard → Usage: search each request_id below");
  console.log("  Dashboard → Credits: verify debits match item credits_charged");
  for (const id of requestIds) {
    console.log(`  - ${id}`);
  }

  const ok = (finalBatch.succeeded_items ?? 0) > 0;
  console.log("");
  console.log(ok ? "Demo completed." : "Demo finished with zero successes.");
  if (!ok) process.exit(1);
}

const [command, templateId] = process.argv.slice(2);

switch (command) {
  case "list":
    cmdList();
    break;
  case "show":
    if (!templateId) {
      usage();
      process.exit(1);
    }
    cmdShow(templateId);
    break;
  case "print-batch":
    if (!templateId) {
      usage();
      process.exit(1);
    }
    cmdPrintBatch(templateId);
    break;
  case "run":
    if (!templateId) {
      usage();
      process.exit(1);
    }
    await cmdRun(templateId);
    break;
  default:
    usage();
    process.exit(command ? 1 : 0);
}
