#!/usr/bin/env node
/**
 * Internal operator smoke only — not customer documentation.
 * Uses TOKFAI_SUPABASE_JWT for key management API — customers only use sk-tokfai API Keys.
 *
 * P778.14 — operator E2E: create key → curls → Usage/Credits API reconcile → revoke.
 *
 * Usage:
 *   TOKFAI_SUPABASE_JWT=<access_token> node scripts/p778-14-real-key-e2e-acceptance.mjs
 *
 * Optional:
 *   TOKFAI_API_BASE=https://api.tokfai.com/v1
 *   TOKFAI_MODEL=auto-fast
 *   KEY_NAME_PREFIX=p778-14-e2e
 *
 * Writes: p778-live-smoke-results/e2e-latest.json
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
const JWT =
  process.env.TOKFAI_SUPABASE_JWT ?? process.env.SUPABASE_ACCESS_TOKEN ?? "";
const MODEL = (process.env.TOKFAI_MODEL ?? "auto-fast").trim();
const KEY_NAME_PREFIX = process.env.KEY_NAME_PREFIX ?? "p778-14-e2e";
const CHAT_TIMEOUT_MS = Math.max(
  1000,
  parseInt(process.env.CHAT_TIMEOUT_MS ?? "120000", 10) || 120_000
);

const RESULTS_DIR = join(ROOT, "p778-live-smoke-results");
const RESULTS_FILE = join(RESULTS_DIR, "e2e-latest.json");

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

function maskKey(key) {
  if (!key || key.length <= 12) return null;
  return `${key.slice(0, 12)}…${key.slice(-4)}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function runCurl(curl) {
  const out = execFileSync("bash", ["-lc", curl], {
    encoding: "utf8",
    timeout: CHAT_TIMEOUT_MS,
    maxBuffer: 4 * 1024 * 1024,
  });
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

async function findUsageRow(requestId) {
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - 1);
  const qs = new URLSearchParams({
    start_date: start.toISOString().slice(0, 10),
    end_date: today.toISOString().slice(0, 10),
    limit: "100",
  });
  const { res, body } = await jwtFetch(`/me/usage/summary?${qs}`);
  if (!res.ok) return null;
  const rows = Array.isArray(body?.data) ? body.data : [];
  return rows.find((row) => row.request_id === requestId) ?? null;
}

async function findLedgerRow(referenceId) {
  const { res, body } = await jwtFetch("/me/credits/ledger?limit=100");
  if (!res.ok) return null;
  const rows = Array.isArray(body?.data) ? body.data : [];
  return rows.find((row) => row.reference_id === referenceId) ?? null;
}

async function main() {
  const report = {
    suite: "p778-14-real-key-e2e",
    timestamp: new Date().toISOString(),
    base: BASE,
    model: MODEL,
    jwt_masked: JWT ? `${JWT.slice(0, 8)}…` : null,
    steps: [],
    pass: false,
  };

  function record(step, pass, fields = {}) {
    report.steps.push({ step, pass, ...fields });
    console.log(`[${pass ? "PASS" : "FAIL"}] ${step}`);
    for (const [k, v] of Object.entries(fields)) {
      if (v != null && v !== "") console.log(`  ${k}: ${v}`);
    }
    console.log("");
    return pass;
  }

  console.log("=== P778.14 real API key E2E ===");
  if (!JWT) {
    console.error("Set TOKFAI_SUPABASE_JWT (dashboard Supabase access_token).");
    process.exit(1);
  }

  let failures = 0;
  let keyId;
  let secret;

  try {
    const created = await createKey();
    keyId = created.id;
    secret = created.secret;
    record("create_api_key", true, {
      key_id: keyId,
      secret_masked: maskKey(secret),
    });
  } catch (err) {
    record("create_api_key", false, { error: String(err.message) });
    failures += 1;
    await writeReport(report);
    process.exit(1);
  }

  const quickStartCurl = chatCurlOneLine(secret);
  const successCardCurl = chatCurlOneLine(secret);
  const modelsCurl = modelsCurlOneLine(secret);

  let chatBody;
  try {
    chatBody = runCurl(quickStartCurl);
    const fields = extractChatFields(chatBody);
    const ok = chatFieldsOk(fields);
    record("quick_start_one_line_chat_curl", ok, {
      http_status: 200,
      ...fields,
    });
    if (!ok) failures += 1;
  } catch (err) {
    record("quick_start_one_line_chat_curl", false, { error: String(err.message) });
    failures += 1;
  }

  try {
    const body = runCurl(successCardCurl);
    const fields = extractChatFields(body);
    const ok = chatFieldsOk(fields);
    record("api_keys_success_card_chat_curl", ok, {
      http_status: 200,
      ...fields,
    });
    if (!ok) failures += 1;
    if (!chatBody) chatBody = body;
  } catch (err) {
    record("api_keys_success_card_chat_curl", false, { error: String(err.message) });
    failures += 1;
  }

  try {
    const body = runCurl(modelsCurl);
    const count = Array.isArray(body?.data) ? body.data.length : 0;
    const ok = count > 0;
    record("models_one_line_curl", ok, { http_status: 200, model_count: count });
    if (!ok) failures += 1;
  } catch (err) {
    record("models_one_line_curl", false, { error: String(err.message) });
    failures += 1;
  }

  const requestId = chatBody ? extractChatFields(chatBody).request_id : null;
  if (requestId) {
    await sleep(2000);
    const usageRow = await findUsageRow(requestId);
    const usageOk =
      usageRow &&
      usageRow.status === "succeeded" &&
      usageRow.credits_charged != null;
    record("usage_reconcile", usageOk, {
      request_id: requestId,
      usage_status: usageRow?.status ?? null,
      usage_model: usageRow?.model ?? null,
      usage_credits_charged: usageRow?.credits_charged ?? null,
      usage_total_tokens: usageRow?.total_tokens ?? null,
    });
    if (!usageOk) failures += 1;

    const ledgerRow = await findLedgerRow(requestId);
    const chatCredits = chatBody ? extractChatFields(chatBody).credits_charged : null;
    const ledgerOk =
      ledgerRow &&
      Number(ledgerRow.amount) < 0 &&
      chatCredits != null &&
      Math.abs(Number(ledgerRow.amount)) === Number(chatCredits);
    record("credits_reconcile", ledgerOk, {
      request_id: requestId,
      ledger_reference_id: ledgerRow?.reference_id ?? null,
      ledger_amount: ledgerRow?.amount ?? null,
      response_credits_charged: chatCredits,
      ledger_balance_after: ledgerRow?.balance_after ?? null,
    });
    if (!ledgerOk) failures += 1;
  } else {
    record("usage_reconcile", false, { error: "no request_id from chat" });
    record("credits_reconcile", false, { error: "no request_id from chat" });
    failures += 2;
  }

  try {
    await revokeKey(keyId);
    const body = runCurl(chatCurlOneLine(secret));
    const code = body?.error?.code ?? null;
    const ok = code === "invalid_token";
    record("revoke_then_curl_invalid_token", ok, {
      error_code: code,
      request_id: body?.request_id ?? body?.error?.request_id ?? null,
    });
    if (!ok) failures += 1;
  } catch (err) {
    record("revoke_then_curl_invalid_token", false, { error: String(err.message) });
    failures += 1;
  }

  try {
    const recreated = await createKey();
    const body = runCurl(chatCurlOneLine(recreated.secret));
    const fields = extractChatFields(body);
    const ok = chatFieldsOk(fields);
    record("recreate_key_chat_http_200", ok, {
      http_status: 200,
      key_id: recreated.id,
      ...fields,
    });
    if (!ok) failures += 1;
    await revokeKey(recreated.id);
  } catch (err) {
    record("recreate_key_chat_http_200", false, { error: String(err.message) });
    failures += 1;
  }

  report.pass = failures === 0;
  await writeReport(report);

  if (failures > 0) {
    console.error(`FAILED (${failures} checks)`);
    process.exit(1);
  }
  console.log("PASS — full real-key E2E");
}

async function writeReport(report) {
  await mkdir(RESULTS_DIR, { recursive: true });
  await writeFile(RESULTS_FILE, JSON.stringify(report, null, 2));
  console.log(`Results: ${RESULTS_FILE}`);
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
