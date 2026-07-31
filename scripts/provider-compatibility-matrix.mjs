#!/usr/bin/env node
/**
 * Provider compatibility matrix — LIVE probe across models × APIs.
 *
 * For each model:
 *   1. /v1/chat/completions stream=true
 *   2. /v1/chat/completions stream=false
 *   3. /v1/responses stream=true
 *   4. /v1/responses stream=false
 *
 * Output columns:
 *   MODEL | API | STREAM | STATUS | LATENCY | ERROR
 *
 * Failures are printed in-table and appended to a failure log file.
 *
 * Usage:
 *   TOKFAI_API_KEY=sk-tokfai_... node scripts/provider-compatibility-matrix.mjs
 *   TOKFAI_API_BASE=https://api.tokfai.com TOKFAI_API_KEY=... \
 *     node scripts/provider-compatibility-matrix.mjs
 *
 * Optional:
 *   MODELS=gpt-5-pro,gpt-5          — override model list
 *   TIMEOUT_MS=120000               — per-request timeout
 *   FAIL_LOG=tmp/provider-compat-failures.jsonl
 */

import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const API_BASE = (
  process.env.TOKFAI_API_BASE ||
  process.env.DMIT_API_BASE ||
  "https://api.tokfai.com"
).replace(/\/$/, "");

const API_KEY = (process.env.TOKFAI_API_KEY || "").trim();

const TIMEOUT_MS = Math.max(
  5_000,
  parseInt(process.env.TIMEOUT_MS || "120000", 10) || 120_000
);

const DEFAULT_MODELS = [
  "gpt-5-pro",
  "gpt-5",
  "gemini-3-flash",
  "deepseek-chat",
];

const MODELS = (process.env.MODELS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const models = MODELS.length > 0 ? MODELS : DEFAULT_MODELS;

const FAIL_LOG =
  process.env.FAIL_LOG ||
  join(ROOT, "tmp", "provider-compat-failures.jsonl");

const PROMPT = "Say OK in one short sentence.";

/** @typedef {{
 *   model: string,
 *   api: "chat" | "responses",
 *   stream: boolean,
 *   status: "PASS" | "FAIL",
 *   latencyMs: number,
 *   error: string,
 *   httpStatus?: number,
 * }} MatrixRow */

const CASES = [
  { api: "chat", stream: true, path: "/v1/chat/completions" },
  { api: "chat", stream: false, path: "/v1/chat/completions" },
  { api: "responses", stream: true, path: "/v1/responses" },
  { api: "responses", stream: false, path: "/v1/responses" },
];

function buildBody(model, api, stream) {
  if (api === "chat") {
    return {
      model,
      stream,
      messages: [{ role: "user", content: PROMPT }],
    };
  }
  return {
    model,
    stream,
    input: PROMPT,
  };
}

function truncate(text, max = 160) {
  const s = String(text ?? "").replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function extractErrorMessage(status, text, json) {
  if (json?.error) {
    const code =
      typeof json.error.code === "string" ? json.error.code : "";
    const msg =
      typeof json.error.message === "string"
        ? json.error.message
        : typeof json.error === "string"
          ? json.error
          : JSON.stringify(json.error);
    return truncate([`HTTP ${status}`, code, msg].filter(Boolean).join(" "));
  }

  // SSE error frames
  if (typeof text === "string" && text.includes("data:")) {
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const parsed = JSON.parse(payload);
        if (parsed?.error) {
          const code =
            typeof parsed.error.code === "string" ? parsed.error.code : "";
          const msg =
            typeof parsed.error.message === "string"
              ? parsed.error.message
              : "";
          return truncate(
            [`HTTP ${status}`, code, msg].filter(Boolean).join(" ")
          );
        }
      } catch {
        // continue
      }
    }
  }

  if (status >= 400) {
    return truncate(`HTTP ${status} ${text || ""}`);
  }
  return truncate(text || `HTTP ${status}`);
}

function assertChatNonStream(status, json) {
  if (status !== 200) return { ok: false, reason: null };
  if (json?.object !== "chat.completion") {
    return { ok: false, reason: "missing object=chat.completion" };
  }
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    return { ok: false, reason: "missing choices[0].message.content" };
  }
  return { ok: true, reason: null };
}

function assertChatStream(status, text, contentType) {
  if (status !== 200) return { ok: false, reason: null };
  const ct = contentType || "";
  const body = text || "";
  if (!ct.includes("text/event-stream") && !body.includes("data:")) {
    return { ok: false, reason: "not event-stream" };
  }
  if (!/data:\s*\[DONE\]/.test(body)) {
    return { ok: false, reason: "missing data: [DONE]" };
  }
  if (!body.includes("delta") && !body.includes("chat.completion.chunk")) {
    return { ok: false, reason: "missing chat chunk delta" };
  }
  if (/"finish_reason"\s*:\s*"other"/i.test(body)) {
    return { ok: false, reason: 'finish_reason "other"' };
  }
  return { ok: true, reason: null };
}

function assertResponsesNonStream(status, json) {
  if (status !== 200) return { ok: false, reason: null };
  if (json?.object !== "response") {
    return { ok: false, reason: "missing object=response" };
  }
  const text =
    typeof json.output_text === "string"
      ? json.output_text
      : json?.output?.[0]?.content?.[0]?.text;
  if (typeof text !== "string") {
    return { ok: false, reason: "missing output_text" };
  }
  return { ok: true, reason: null };
}

function assertResponsesStream(status, text, contentType) {
  if (status !== 200) return { ok: false, reason: null };
  const ct = contentType || "";
  const body = text || "";
  if (!ct.includes("text/event-stream") && !body.includes("data:")) {
    return { ok: false, reason: "not event-stream" };
  }
  if (
    !body.includes("response.output_text.delta") &&
    !body.includes("response.completed") &&
    !body.includes("response.incomplete")
  ) {
    return { ok: false, reason: "missing responses SSE events" };
  }
  if (!/data:\s*\[DONE\]/.test(body) && !body.includes("response.completed")) {
    return { ok: false, reason: "missing completed/[DONE]" };
  }
  if (/"finish_reason"\s*:\s*"other"/i.test(body)) {
    return { ok: false, reason: 'finish_reason "other"' };
  }
  return { ok: true, reason: null };
}

async function requestOnce(path, body, stream) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
        ...(stream ? { Accept: "text/event-stream" } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const contentType = res.headers.get("content-type") || "";
    const text = await res.text();
    const latencyMs = Date.now() - started;
    let json = null;
    if (!stream && contentType.includes("application/json")) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    } else if (!stream) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    return {
      status: res.status,
      text,
      json,
      contentType,
      latencyMs,
      aborted: false,
    };
  } catch (err) {
    const latencyMs = Date.now() - started;
    const aborted =
      err?.name === "AbortError" ||
      /aborted|timeout/i.test(String(err?.message || err));
    return {
      status: 0,
      text: "",
      json: null,
      contentType: "",
      latencyMs,
      aborted,
      fetchError: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

function pad(value, width) {
  const s = String(value ?? "");
  if (s.length >= width) return s.slice(0, width);
  return s + " ".repeat(width - s.length);
}

function printHeader() {
  console.log(
    [
      pad("MODEL", 18),
      pad("API", 10),
      pad("STREAM", 7),
      pad("STATUS", 7),
      pad("LATENCY", 10),
      "ERROR",
    ].join(" | ")
  );
  console.log(
    [
      "-".repeat(18),
      "-".repeat(10),
      "-".repeat(7),
      "-".repeat(7),
      "-".repeat(10),
      "-".repeat(40),
    ].join("-+-")
  );
}

/**
 * @param {MatrixRow} row
 */
function printRow(row) {
  console.log(
    [
      pad(row.model, 18),
      pad(row.api, 10),
      pad(row.stream ? "true" : "false", 7),
      pad(row.status, 7),
      pad(`${row.latencyMs}ms`, 10),
      row.error || "",
    ].join(" | ")
  );
}

/**
 * @param {MatrixRow} row
 * @param {Record<string, unknown>} [extra]
 */
function recordFailure(row, extra = {}) {
  mkdirSync(dirname(FAIL_LOG), { recursive: true });
  const entry = {
    ts: new Date().toISOString(),
    ...row,
    ...extra,
  };
  appendFileSync(FAIL_LOG, `${JSON.stringify(entry)}\n`, "utf8");
}

async function runCase(model, caseDef) {
  const body = buildBody(model, caseDef.api, caseDef.stream);
  const result = await requestOnce(caseDef.path, body, caseDef.stream);

  /** @type {MatrixRow} */
  const row = {
    model,
    api: caseDef.api,
    stream: caseDef.stream,
    status: "FAIL",
    latencyMs: result.latencyMs,
    error: "",
    httpStatus: result.status,
  };

  if (result.aborted) {
    row.error = truncate(
      `timeout after ${TIMEOUT_MS}ms${result.fetchError ? ` (${result.fetchError})` : ""}`
    );
    return row;
  }
  if (result.fetchError) {
    row.error = truncate(result.fetchError);
    return row;
  }

  let check;
  if (caseDef.api === "chat" && caseDef.stream) {
    check = assertChatStream(result.status, result.text, result.contentType);
  } else if (caseDef.api === "chat" && !caseDef.stream) {
    check = assertChatNonStream(result.status, result.json);
  } else if (caseDef.api === "responses" && caseDef.stream) {
    check = assertResponsesStream(
      result.status,
      result.text,
      result.contentType
    );
  } else {
    check = assertResponsesNonStream(result.status, result.json);
  }

  if (check.ok) {
    row.status = "PASS";
    row.error = "";
    return row;
  }

  row.error =
    check.reason ||
    extractErrorMessage(result.status, result.text, result.json);
  return row;
}

async function main() {
  if (!API_KEY) {
    console.error("TOKFAI_API_KEY is required (sk-tokfai_...).");
    process.exit(2);
  }
  if (!API_KEY.startsWith("sk-tokfai_")) {
    console.warn(
      "WARN  TOKFAI_API_KEY does not start with sk-tokfai_ — continuing anyway."
    );
  }

  mkdirSync(dirname(FAIL_LOG), { recursive: true });
  writeFileSync(FAIL_LOG, "", "utf8");

  console.log(`Provider compatibility matrix`);
  console.log(`  base=${API_BASE}`);
  console.log(`  models=${models.join(", ")}`);
  console.log(`  timeout_ms=${TIMEOUT_MS}`);
  console.log(`  fail_log=${FAIL_LOG}`);
  console.log("");

  printHeader();

  /** @type {MatrixRow[]} */
  const rows = [];
  let passCount = 0;
  let failCount = 0;

  for (const model of models) {
    for (const caseDef of CASES) {
      const row = await runCase(model, caseDef);
      rows.push(row);
      printRow(row);
      if (row.status === "PASS") {
        passCount += 1;
      } else {
        failCount += 1;
        recordFailure(row, {
          path: caseDef.path,
          api_base: API_BASE,
        });
      }
    }
  }

  console.log("");
  console.log(
    `SUMMARY  total=${rows.length} pass=${passCount} fail=${failCount}`
  );
  if (failCount > 0) {
    console.log(`FAILURES logged → ${FAIL_LOG}`);
    console.log("TOKFAI_PROVIDER_COMPATIBILITY_MATRIX_FAIL");
    process.exit(1);
  }

  console.log("TOKFAI_PROVIDER_COMPATIBILITY_MATRIX_PASS");
  process.exit(0);
}

main().catch((err) => {
  console.error(
    "TOKFAI_PROVIDER_COMPATIBILITY_MATRIX_FAIL",
    err instanceof Error ? err.message : err
  );
  process.exit(1);
});
