#!/usr/bin/env node
/**
 * P778.13 — Internal one-line curl regression (not for customers).
 *
 * Mirrors apps/web/lib/customer-curl-oneline.ts builders and live API checks.
 *
 * Usage:
 *   node scripts/p778-13-one-line-curl-regression.mjs
 *   TOKFAI_API_KEY=sk-tokfai_... node scripts/p778-13-one-line-curl-regression.mjs
 *
 * Writes: p778-live-smoke-results/latest.json
 */

import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = (process.env.TOKFAI_API_BASE ?? "https://api.tokfai.com/v1").replace(
  /\/+$/,
  ""
);
const API_KEY = process.env.TOKFAI_API_KEY ?? "";
const PLACEHOLDER = "sk-tokfai_xxx";
const MODEL = (process.env.TOKFAI_MODEL ?? "auto-fast").trim();
const CHAT_TIMEOUT_MS = Math.max(
  1000,
  parseInt(process.env.CHAT_TIMEOUT_MS ?? "120000", 10) || 120_000
);

const RESULTS_DIR = join(ROOT, "p778-live-smoke-results");
const RESULTS_FILE = join(RESULTS_DIR, "latest.json");

function shellSingleQuotedJson(value) {
  return JSON.stringify(value).replace(/'/g, "'\\''");
}

function chatCurlOneLine(apiKey = PLACEHOLDER) {
  const body = shellSingleQuotedJson({
    model: MODEL,
    messages: [{ role: "user", content: "Say ok only." }],
    stream: false,
  });
  return `curl -sS ${BASE}/chat/completions -H "Authorization: Bearer ${apiKey}" -H "Content-Type: application/json" -d '${body}'`;
}

function modelsCurlOneLine(apiKey = PLACEHOLDER) {
  return `curl -sS ${BASE}/models -H "Authorization: Bearer ${apiKey}"`;
}

function imageCurlOneLine(apiKey = PLACEHOLDER) {
  const body = shellSingleQuotedJson({
    model: "gpt-image-2",
    prompt: "Create a clean product-style image of a futuristic API dashboard.",
    size: "1024x1024",
    n: 1,
    response_format: "url",
  });
  return `curl -sS ${BASE}/images/generations -H "Authorization: Bearer ${apiKey}" -H "Content-Type: application/json" -d '${body}'`;
}

function batchCreateCurlOneLine(apiKey = PLACEHOLDER) {
  const body = shellSingleQuotedJson({
    model: MODEL,
    items: [
      { messages: [{ role: "user", content: "Say ok only." }] },
      { messages: [{ role: "user", content: "Say hello only." }] },
      { messages: [{ role: "user", content: "Say hi only." }] },
    ],
  });
  return `curl -sS ${BASE}/batches/chat -H "Authorization: Bearer ${apiKey}" -H "Content-Type: application/json" -d '${body}'`;
}

function batchPollCurlOneLine(apiKey = PLACEHOLDER, batchId = "batch_xxx") {
  return `curl -sS ${BASE}/batches/${batchId} -H "Authorization: Bearer ${apiKey}"`;
}

const INDUSTRY_CURLS = {
  hospital: () => {
    const body = shellSingleQuotedJson({
      model: "auto-pro",
      messages: [
        {
          role: "user",
          content:
            "请把以下患者自述整理成结构化摘要，分为主诉、持续时间、伴随症状、需医生确认的问题。不要诊断，不要给治疗方案。\n\n患者自述：头痛三天，偶有恶心，无发热。",
        },
      ],
      stream: false,
    });
    return `curl -sS ${BASE}/chat/completions -H "Authorization: Bearer ${PLACEHOLDER}" -H "Content-Type: application/json" -d '${body}'`;
  },
  automotive: () => {
    const body = shellSingleQuotedJson({
      model: "auto-pro",
      messages: [
        {
          role: "user",
          content:
            "请把以下售后工单整理为：问题类型、用户描述、可能涉及模块、需要人工确认的问题、建议回复草稿。\n\n工单：车辆怠速不稳，仪表盘偶尔亮起发动机故障灯。",
        },
      ],
      stream: false,
    });
    return `curl -sS ${BASE}/chat/completions -H "Authorization: Bearer ${PLACEHOLDER}" -H "Content-Type: application/json" -d '${body}'`;
  },
  ecommerce: () => batchCreateCurlOneLine(PLACEHOLDER).replace(MODEL, "auto-cheap"),
  support: () => {
    const body = shellSingleQuotedJson({
      model: "auto-fast",
      messages: [
        {
          role: "user",
          content:
            "请基于以下 FAQ 和用户问题，生成客服回复草稿。不要承诺退款、赔偿、发货时间，涉及政策时提示人工确认。\n\nFAQ：退货需在签收7天内申请。用户问：我买了10天还能退吗？",
        },
      ],
      stream: false,
    });
    return `curl -sS ${BASE}/chat/completions -H "Authorization: Bearer ${PLACEHOLDER}" -H "Content-Type: application/json" -d '${body}'`;
  },
};

const CURL_CASES = [
  { id: "quick-start-chat", label: "Quick Start chat", build: () => chatCurlOneLine(PLACEHOLDER) },
  { id: "api-key-models", label: "API Key models", build: () => modelsCurlOneLine(PLACEHOLDER) },
  { id: "api-key-chat", label: "API Key chat", build: () => chatCurlOneLine(PLACEHOLDER) },
  { id: "chat-api", label: "Chat API", build: () => chatCurlOneLine(PLACEHOLDER) },
  { id: "image-api", label: "Image API", build: () => imageCurlOneLine(PLACEHOLDER) },
  { id: "batch-create", label: "Batch create", build: () => batchCreateCurlOneLine(PLACEHOLDER) },
  { id: "batch-poll", label: "Batch poll", build: () => batchPollCurlOneLine(PLACEHOLDER) },
  ...Object.entries(INDUSTRY_CURLS).map(([id, build]) => ({
    id: `industry-${id}`,
    label: `Industry ${id}`,
    build,
  })),
];

function maskKey(key) {
  if (!key || key.length <= 12) return null;
  return `${key.slice(0, 12)}…${key.slice(-4)}`;
}

function truncate(text, max = 240) {
  if (!text) return "";
  const s = String(text).replace(/\s+/g, " ").trim();
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

function isOneLineCurl(curl) {
  if (curl.includes("\n")) return false;
  if (/\\\s*$/.test(curl)) return false;
  if (curl.includes("cd ") || curl.includes("node scripts")) return false;
  return true;
}

function runCurlShell(curl, timeoutMs = CHAT_TIMEOUT_MS) {
  const out = execFileSync("bash", ["-lc", curl], {
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 4 * 1024 * 1024,
  });
  return JSON.parse(out);
}

function requestId(body) {
  return body?.request_id ?? body?.tokfai?.request_id ?? body?.error?.request_id ?? null;
}

function creditsCharged(body) {
  return body?.credits_charged ?? body?.tokfai?.credits_charged ?? null;
}

function resolvedModel(body) {
  return body?.tokfai?.resolved_model ?? null;
}

async function main() {
  const report = {
    suite: "p778-13-one-line-curl-regression",
    timestamp: new Date().toISOString(),
    base: BASE,
    model: MODEL,
    api_key_masked: maskKey(API_KEY),
    curls: [],
    live: [],
    pass: true,
  };

  console.log("=== P778.13 one-line curl regression ===");
  console.log(`base: ${BASE}`);
  console.log(`api_key: ${maskKey(API_KEY) ?? "(not set — live auth skipped)"}`);
  console.log("");

  let failures = 0;

  for (const item of CURL_CASES) {
    const curl = item.build();
    const oneLine = isOneLineCurl(curl);
    const row = {
      id: item.id,
      label: item.label,
      one_line: oneLine,
      length: curl.length,
      curl_preview: truncate(curl, 180),
    };

    if (!oneLine) {
      failures += 1;
      report.pass = false;
      row.shell_probe = { pass: false, notes: "curl is not single-line safe" };
      console.log(`[FAIL] ${item.id} — not one-line`);
    } else {
      try {
        const body = runCurlShell(curl, 30_000);
        const code = body?.error?.code ?? null;
        const isModels = item.id.includes("models") || item.id === "api-key-models";
        const ok = isModels
          ? Array.isArray(body?.data) && body.data.length > 0
          : code === "invalid_token";
        row.shell_probe = {
          pass: ok,
          error_code: code,
          model_count: isModels ? body?.data?.length ?? 0 : undefined,
          notes: ok
            ? isModels
              ? "models list returned (shell quoting OK)"
              : "placeholder key returns invalid_token (shell quoting OK)"
            : truncate(JSON.stringify(body)),
        };
        console.log(
          `[${ok ? "PASS" : "FAIL"}] ${item.id} shell probe — ${isModels ? `models=${body?.data?.length ?? 0}` : code ?? "no code"}`
        );
        if (!ok) {
          failures += 1;
          report.pass = false;
        }
      } catch (err) {
        failures += 1;
        report.pass = false;
        row.shell_probe = { pass: false, notes: truncate(err.message) };
        console.log(`[FAIL] ${item.id} shell probe — ${truncate(err.message)}`);
      }
    }

    report.curls.push(row);
  }

  if (API_KEY.startsWith("sk-tokfai_")) {
    console.log("");
    console.log("--- Live API (real key) ---");

    const liveCases = [
      { id: "live-chat", label: "Chat curl", curl: chatCurlOneLine(API_KEY) },
      { id: "live-models", label: "Models curl", curl: modelsCurlOneLine(API_KEY) },
      { id: "live-batch-create", label: "Batch create curl", curl: batchCreateCurlOneLine(API_KEY) },
    ];

    for (const item of liveCases) {
      try {
        const body = runCurlShell(item.curl, CHAT_TIMEOUT_MS);
        const httpOk =
          item.id === "live-batch-create"
            ? body?.id && (body?.status === "pending" || body?.status === "running")
            : item.id === "live-models"
              ? Array.isArray(body?.data) && body.data.length > 0
              : Boolean(body?.choices?.[0]?.message?.content);
        const row = {
          id: item.id,
          label: item.label,
          pass: httpOk,
          request_id: requestId(body),
          credits_charged: creditsCharged(body),
          resolved_model: resolvedModel(body),
          batch_id: body?.id ?? null,
          status: body?.status ?? null,
          error_code: body?.error?.code ?? null,
        };
        report.live.push(row);
        console.log(`[${httpOk ? "PASS" : "FAIL"}] ${item.id}`);
        if (row.request_id) console.log(`  request_id: ${row.request_id}`);
        if (row.credits_charged != null) console.log(`  credits_charged: ${row.credits_charged}`);
        if (row.resolved_model) console.log(`  tokfai.resolved_model: ${row.resolved_model}`);
        if (!httpOk) {
          failures += 1;
          report.pass = false;
        }
      } catch (err) {
        failures += 1;
        report.pass = false;
        report.live.push({
          id: item.id,
          pass: false,
          notes: truncate(err.message),
        });
        console.log(`[FAIL] ${item.id} — ${truncate(err.message)}`);
      }
    }
  } else {
    report.live_skipped = "Set TOKFAI_API_KEY for live HTTP 200 chat/models/batch checks.";
    console.log("");
    console.log("Live auth suite skipped — set TOKFAI_API_KEY for HTTP 200 verification.");
  }

  await mkdir(RESULTS_DIR, { recursive: true });
  await writeFile(RESULTS_FILE, JSON.stringify(report, null, 2));

  console.log("");
  console.log(`Results: ${RESULTS_FILE}`);
  if (failures > 0) {
    console.error(`FAILED (${failures} checks)`);
    process.exit(1);
  }
  console.log("PASS");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
