#!/usr/bin/env node
/**
 * Internal operator smoke only — not customer documentation.
 * Customers use API Key + one-line curl from Dashboard; they never run this script.
 *
 * P780 — production customer live walkthrough:
 *   - Always: invalid_token curl (no JWT)
 *   - With TOKFAI_SUPABASE_JWT: full chat/models/batch/revoke reconcile
 *
 * Usage:
 *   node scripts/p780-production-customer-live-walkthrough.mjs
 *   TOKFAI_SUPABASE_JWT=<access_token> node scripts/p780-production-customer-live-walkthrough.mjs
 */

import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { exitUnlessLive, resolveApiBaseUrl } from "./lib/acceptance-config.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = "scripts/p780-production-customer-live-walkthrough.mjs";
exitUnlessLive(SCRIPT);
const BASE = resolveApiBaseUrl(true);
const JWT =
  process.env.TOKFAI_SUPABASE_JWT ?? process.env.SUPABASE_ACCESS_TOKEN ?? "";
const MODEL = (process.env.TOKFAI_MODEL ?? "auto-fast").trim();
const KEY_NAME_PREFIX = process.env.KEY_NAME_PREFIX ?? "p780-live";
const CHAT_TIMEOUT_MS = Math.max(
  1000,
  parseInt(process.env.CHAT_TIMEOUT_MS ?? "120000", 10) || 120_000
);

const RESULTS_DIR = join(ROOT, "p780-live-walkthrough-results");
const RESULTS_FILE = join(RESULTS_DIR, "latest.json");

function shellSingleQuotedJson(value) {
  return JSON.stringify(value).replace(/'/g, "'\\''");
}

function chatCurlOneLine(apiKey) {
  const body = shellSingleQuotedJson({
    model: MODEL,
    messages: [{ role: "user", content: "Say ok only." }],
    stream: false,
  });
  return `curl -sS ${BASE}/chat/completions -H "Authorization: Bearer ${apiKey}" -H "Content-Type: application/json" -d '${body}'`;
}

function modelsCurlOneLine(apiKey) {
  return `curl -sS ${BASE}/models -H "Authorization: Bearer ${apiKey}"`;
}

function batchCreateCurlOneLine(apiKey) {
  const body = shellSingleQuotedJson({
    model: MODEL,
    items: [
      { messages: [{ role: "user", content: "Say ok only." }] },
      { messages: [{ role: "user", content: "Say hello only." }] },
    ],
  });
  return `curl -sS -w "\\n%{http_code}" ${BASE}/batches/chat -H "Authorization: Bearer ${apiKey}" -H "Content-Type: application/json" -d '${body}'`;
}

function batchPollCurlOneLine(apiKey, batchId) {
  return `curl -sS ${BASE}/batches/${batchId} -H "Authorization: Bearer ${apiKey}"`;
}

function curlHasNewline(curl) {
  return curl.includes("\n");
}

function runCurl(curl, withStatus = false) {
  const out = execFileSync("bash", ["-lc", curl], {
    encoding: "utf8",
    timeout: CHAT_TIMEOUT_MS,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (withStatus) {
    const lines = out.trimEnd().split("\n");
    const statusLine = lines.pop();
    const httpStatus = parseInt(statusLine ?? "0", 10);
    const bodyText = lines.join("\n");
    return { httpStatus, body: bodyText ? JSON.parse(bodyText) : {} };
  }
  return JSON.parse(out);
}

function extractChatFields(body) {
  return {
    content: body?.choices?.[0]?.message?.content ?? null,
    request_id: body?.request_id ?? body?.tokfai?.request_id ?? null,
    credits_charged: body?.credits_charged ?? body?.tokfai?.credits_charged ?? null,
    requested_model: body?.tokfai?.requested_model ?? null,
    resolved_model: body?.tokfai?.resolved_model ?? body?.model ?? null,
    error_code: body?.error?.code ?? null,
  };
}

function chatFieldsOk(fields) {
  return Boolean(
    fields.content &&
      fields.request_id &&
      fields.credits_charged != null &&
      fields.requested_model &&
      fields.resolved_model
  );
}

async function jwtFetch(path, init = {}) {
  const url = `${BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${JWT}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
  });
  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text.slice(0, 400) };
  }
  return { res, body, url };
}

async function createKey() {
  const name = `${KEY_NAME_PREFIX}-${Date.now()}`;
  const { res, body } = await jwtFetch("/me/api-keys", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  const secret = body?.secret;
  const id = body?.api_key?.id;
  if (!res.ok || !secret || !id) {
    throw new Error(`create key failed HTTP ${res.status}: ${JSON.stringify(body)}`);
  }
  return { id, secret, name };
}

async function revokeKey(id) {
  const { res, body } = await jwtFetch("/me/api-keys/revoke", {
    method: "POST",
    body: JSON.stringify({ id }),
  });
  if (!res.ok) {
    throw new Error(`revoke failed HTTP ${res.status}: ${JSON.stringify(body)}`);
  }
}

async function writeReport(report) {
  await mkdir(RESULTS_DIR, { recursive: true });
  await writeFile(RESULTS_FILE, JSON.stringify(report, null, 2));
  console.log(`Report: ${RESULTS_FILE}`);
}

async function main() {
  const report = {
    suite: "p780-production-customer-live-walkthrough",
    timestamp: new Date().toISOString(),
    base: BASE,
    model: MODEL,
    jwt_provided: Boolean(JWT),
    steps: [],
    pass: false,
  };

  let failures = 0;

  function record(step, pass, fields = {}) {
    report.steps.push({ step, pass, ...fields });
    console.log(`[${pass ? "PASS" : "FAIL"}] ${step}`);
    for (const [k, v] of Object.entries(fields)) {
      if (v != null && v !== "") console.log(`  ${k}: ${v}`);
    }
    console.log("");
    if (!pass) failures += 1;
    return pass;
  }

  console.log("=== P780 production customer live walkthrough ===\n");

  const sampleCurl = chatCurlOneLine("sk-tokfai_placeholder");
  record(
    "one_line_chat_curl_format",
    !curlHasNewline(sampleCurl) && sampleCurl.startsWith("curl -sS"),
    { line_count: sampleCurl.split("\n").length }
  );

  try {
    const body = runCurl(chatCurlOneLine("sk-tokfai_invalid_walkthrough_key"));
    const code = body?.error?.code ?? null;
    record("invalid_token_not_missing_token", code === "invalid_token", {
      error_code: code,
    });
  } catch (err) {
    record("invalid_token_not_missing_token", false, { error: String(err.message) });
  }

  if (!JWT) {
    console.log("No TOKFAI_SUPABASE_JWT — skipping live key chat/models/batch/revoke.");
    report.pass = failures === 0;
    await writeReport(report);
    process.exit(failures === 0 ? 0 : 1);
  }

  let keyId;
  let secret;
  try {
    const created = await createKey();
    keyId = created.id;
    secret = created.secret;
    record("create_api_key", true, { key_id: keyId });
  } catch (err) {
    record("create_api_key", false, { error: String(err.message) });
    report.pass = false;
    await writeReport(report);
    process.exit(1);
  }

  let chatBody;
  try {
    chatBody = runCurl(chatCurlOneLine(secret));
    const fields = extractChatFields(chatBody);
    record("chat_curl_http_200", chatFieldsOk(fields), {
      http_status: 200,
      ...fields,
    });
  } catch (err) {
    record("chat_curl_http_200", false, { error: String(err.message) });
  }

  try {
    const body = runCurl(modelsCurlOneLine(secret));
    const count = Array.isArray(body?.data) ? body.data.length : 0;
    record("models_curl_http_200", count > 0, { http_status: 200, model_count: count });
  } catch (err) {
    record("models_curl_http_200", false, { error: String(err.message) });
  }

  try {
    const { httpStatus, body } = runCurl(batchCreateCurlOneLine(secret), true);
    const batchId = body?.id ?? body?.batch_id ?? null;
    const ok = httpStatus === 202 && Boolean(batchId);
    record("batch_create_curl_http_202", ok, {
      http_status: httpStatus,
      batch_id: batchId,
    });
    if (ok && batchId) {
      try {
        const pollBody = runCurl(batchPollCurlOneLine(secret, batchId));
        record("batch_poll_curl", Boolean(pollBody?.id ?? pollBody?.status), {
          batch_status: pollBody?.status ?? null,
        });
      } catch (err) {
        record("batch_poll_curl", false, { error: String(err.message) });
      }
    }
  } catch (err) {
    record("batch_create_curl_http_202", false, { error: String(err.message) });
  }

  try {
    await revokeKey(keyId);
    const body = runCurl(chatCurlOneLine(secret));
    const code = body?.error?.code ?? null;
    record("revoke_then_invalid_token", code === "invalid_token", { error_code: code });
  } catch (err) {
    record("revoke_then_invalid_token", false, { error: String(err.message) });
  }

  report.pass = failures === 0;
  await writeReport(report);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
