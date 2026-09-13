#!/usr/bin/env node
/**
 * Tokfai P12 — Post-deploy ops checklist smoke (observability acceptance).
 *
 * Does NOT mutate production env and does NOT restart PM2.
 * Does NOT change audio / billing product code — HTTP probes only.
 *
 * Usage:
 *   TOKFAI_KEY=sk-tokfai_... ADMIN_TOKEN=<supabase_jwt> \
 *     node scripts/tokfai-p12-ops-checklist-smoke.mjs
 *
 * Env:
 *   TOKFAI_KEY          required (alias: TOKFAI_API_KEY)
 *   ADMIN_TOKEN         required for provider-health (alias: TOKFAI_ADMIN_JWT)
 *   TOKFAI_BASE_URL     default https://api.tokfai.com
 *   TOKFAI_STT_WAV      default /tmp/test.wav
 *   TIMEOUT_MS          default 120000
 *
 * Markers:
 *   TOKFAI_P12_OPS_CHECKLIST_PASS
 *   TOKFAI_P12_OPS_CHECKLIST_FAIL
 *
 * Also runnable via:
 *   OPS_CHECKLIST_ONLY=1 node scripts/tokfai-release-gate.mjs
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DMIT = join(ROOT, "apps/dmit-api");

const PASS_MARKER = "TOKFAI_P12_OPS_CHECKLIST_PASS";
const FAIL_MARKER = "TOKFAI_P12_OPS_CHECKLIST_FAIL";

const BASE = (
  process.env.TOKFAI_BASE_URL ||
  process.env.TOKFAI_API_BASE ||
  "https://api.tokfai.com"
)
  .trim()
  .replace(/\/+$/, "");

const API_KEY = (
  process.env.TOKFAI_KEY ||
  process.env.TOKFAI_API_KEY ||
  ""
).trim();

const ADMIN_TOKEN = (
  process.env.ADMIN_TOKEN ||
  process.env.TOKFAI_ADMIN_JWT ||
  ""
).trim();

const WAV_PATH = (process.env.TOKFAI_STT_WAV || "/tmp/test.wav").trim();
const TIMEOUT_MS = Math.max(
  5_000,
  Number(process.env.TIMEOUT_MS || 120_000) || 120_000
);

/** @typedef {"PASS"|"WARN"|"FAIL"} Verdict */

/**
 * @typedef {{
 *   id: string,
 *   verdict: Verdict,
 *   latency_ms: number,
 *   status: number|string|null,
 *   provider: string|null,
 *   fallback_used: boolean|null,
 *   request_id: string|null,
 *   detail?: string,
 * }} CheckRow
 */

/** @type {CheckRow[]} */
const rows = [];

function maskSecret(value) {
  if (!value) return "(not set)";
  if (value.length <= 12) return `(set len=${value.length})`;
  return `${value.slice(0, 8)}…${value.slice(-4)} (len=${value.length})`;
}

function record(row) {
  rows.push(row);
  const line = [
    row.verdict.padEnd(4),
    row.id.padEnd(36),
    `status=${row.status ?? "-"}`,
    `latency_ms=${row.latency_ms}`,
    `provider=${row.provider ?? "-"}`,
    `fallback_used=${row.fallback_used ?? "-"}`,
    `request_id=${row.request_id ?? "-"}`,
  ].join("  ");
  console.log(line);
  if (row.detail) console.log(`       detail: ${row.detail}`);
}

function extractRequestId(res, body) {
  const header =
    res.headers.get("x-request-id") || res.headers.get("X-Request-Id");
  if (header) return header.trim();
  if (body && typeof body === "object") {
    if (typeof body.request_id === "string") return body.request_id;
    if (body.error && typeof body.error.request_id === "string") {
      return body.error.request_id;
    }
    if (body.tokfai && typeof body.tokfai.request_id === "string") {
      return body.tokfai.request_id;
    }
  }
  return null;
}

function extractProvider(body) {
  if (!body || typeof body !== "object") return null;
  const tokfai = body.tokfai && typeof body.tokfai === "object" ? body.tokfai : null;
  if (tokfai) {
    for (const key of ["provider_id", "providerId", "provider"]) {
      if (typeof tokfai[key] === "string" && tokfai[key].trim()) {
        return tokfai[key].trim();
      }
    }
  }
  return null;
}

function extractFallbackUsed(body) {
  if (!body || typeof body !== "object") return null;
  const tokfai =
    body.tokfai && typeof body.tokfai === "object" ? body.tokfai : null;
  if (!tokfai) return false;
  const provider = extractProvider(body);
  if (provider === "grsai-secondary") return true;
  if (tokfai.fallback_used === true) return true;
  // Prefer explicit provider-pool signals; ignore validation "fallback_attempts"
  // which often counts local attempt slots, not secondary failover.
  const reason = String(tokfai.fallback_reason ?? tokfai.error_code ?? "");
  if (
    /circuit_open|no_secondary|provider|upstream_timeout|upstream_transport|502|503|504/i.test(
      reason
    )
  ) {
    return true;
  }
  return false;
}

function assistantText(body) {
  if (!body || typeof body !== "object") return "";
  const choice = Array.isArray(body.choices) ? body.choices[0] : null;
  const msg = choice?.message?.content;
  if (typeof msg === "string") return msg;
  if (Array.isArray(msg)) {
    return msg
      .map((p) => (p && typeof p.text === "string" ? p.text : ""))
      .join("");
  }
  return "";
}

/**
 * @param {string} path
 * @param {RequestInit & { timeoutMs?: number }} init
 */
async function fetchJson(path, init = {}) {
  const timeoutMs = init.timeoutMs ?? TIMEOUT_MS;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const started = Date.now();
  /** @type {Response|null} */
  let res = null;
  /** @type {unknown} */
  let body = null;
  let rawText = "";
  try {
    const { timeoutMs: _t, ...rest } = init;
    res = await fetch(`${BASE}${path}`, {
      ...rest,
      signal: ctrl.signal,
    });
    rawText = await res.text();
    try {
      body = rawText ? JSON.parse(rawText) : null;
    } catch {
      body = { _raw: rawText.slice(0, 200) };
    }
  } catch (err) {
    clearTimeout(timer);
    return {
      ok: false,
      status: 0,
      body: null,
      rawText: "",
      latency_ms: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
      request_id: null,
    };
  }
  clearTimeout(timer);
  return {
    ok: res.ok,
    status: res.status,
    body,
    rawText,
    latency_ms: Date.now() - started,
    error: null,
    request_id: extractRequestId(res, body),
    headers: res.headers,
  };
}

async function chatNonStream(model) {
  const id = `chat_nonstream_${model}`;
  const result = await fetchJson("/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "Reply with exactly: OK" }],
      max_tokens: 16,
      stream: false,
    }),
  });

  const text = assistantText(result.body).trim();
  const provider = extractProvider(result.body);
  const fallback_used = extractFallbackUsed(result.body);
  const ok =
    result.status === 200 &&
    text.length > 0 &&
    !result.body?.error;

  record({
    id,
    verdict: ok ? "PASS" : "FAIL",
    latency_ms: result.latency_ms,
    status: result.status,
    provider,
    fallback_used,
    request_id: result.request_id,
    detail: ok
      ? `content=${JSON.stringify(text.slice(0, 40))}`
      : result.error ||
        JSON.stringify(result.body?.error || result.body)?.slice(0, 180),
  });
}

async function chatStream(model) {
  const id = `chat_stream_${model}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const started = Date.now();
  let status = 0;
  let request_id = null;
  let sawData = false;
  let sawDone = false;
  let contentChars = 0;
  let errMsg = null;

  try {
    const res = await fetch(`${BASE}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Reply with exactly: OK" }],
        max_tokens: 32,
        stream: true,
      }),
      signal: ctrl.signal,
    });
    status = res.status;
    request_id =
      res.headers.get("x-request-id") || res.headers.get("X-Request-Id");
    if (!res.ok || !res.body) {
      const t = await res.text();
      errMsg = t.slice(0, 180);
    } else {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n");
        buf = parts.pop() ?? "";
        for (const line of parts) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload) continue;
          sawData = true;
          if (payload === "[DONE]") {
            sawDone = true;
            break;
          }
          try {
            const json = JSON.parse(payload);
            const delta = json?.choices?.[0]?.delta?.content;
            if (typeof delta === "string") contentChars += delta.length;
          } catch {
            // ignore non-JSON SSE comments
          }
        }
        if (sawDone) break;
      }
    }
  } catch (err) {
    errMsg = err instanceof Error ? err.message : String(err);
  } finally {
    clearTimeout(timer);
  }

  const latency_ms = Date.now() - started;
  const ok =
    status === 200 && sawData && (sawDone || contentChars > 0) && !errMsg;

  record({
    id,
    verdict: ok ? "PASS" : "FAIL",
    latency_ms,
    status,
    provider: null,
    fallback_used: null,
    request_id,
    detail: ok
      ? `sse_data=${sawData} done=${sawDone} content_chars=${contentChars}`
      : errMsg || `sse_data=${sawData} done=${sawDone} content_chars=${contentChars}`,
  });
}

function buildMultipartWav(wavBuf, model = "whisper-1") {
  const boundary = `----tokfaiP12${Date.now()}`;
  const head =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="model"\r\n\r\n${model}\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="test.wav"\r\n` +
    `Content-Type: audio/wav\r\n\r\n`;
  const mid = `\r\n--${boundary}--\r\n`;
  const body = Buffer.concat([
    Buffer.from(head, "utf8"),
    wavBuf,
    Buffer.from(mid, "utf8"),
  ]);
  return {
    body,
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

async function audioTranscription() {
  const id = "audio_transcriptions";
  if (!existsSync(WAV_PATH)) {
    record({
      id,
      verdict: "FAIL",
      latency_ms: 0,
      status: null,
      provider: null,
      fallback_used: null,
      request_id: null,
      detail: `missing wav fixture: ${WAV_PATH}`,
    });
    return;
  }
  const wav = readFileSync(WAV_PATH);
  const mp = buildMultipartWav(wav);
  const result = await fetchJson("/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": mp.contentType,
    },
    body: mp.body,
    timeoutMs: Math.max(TIMEOUT_MS, 180_000),
  });
  const text =
    typeof result.body?.text === "string" ? result.body.text.trim() : "";
  const ok = result.status === 200 && text.length > 0;
  record({
    id,
    verdict: ok ? "PASS" : "FAIL",
    latency_ms: result.latency_ms,
    status: result.status,
    provider:
      result.body?.tokfai?.provider ||
      result.body?.provider ||
      null,
    fallback_used: null,
    request_id: result.request_id,
    detail: ok
      ? `text_len=${text.length} preview=${JSON.stringify(text.slice(0, 48))}`
      : result.error ||
        JSON.stringify(result.body?.error || result.body)?.slice(0, 180),
  });
}

async function audioSpeech() {
  const id = "audio_speech_mp3";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const started = Date.now();
  let status = 0;
  let request_id = null;
  let bytes = 0;
  let contentType = "";
  let errMsg = null;
  try {
    const res = await fetch(`${BASE}/v1/audio/speech`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        voice: "alloy",
        input: "Tokfai P12 speech check.",
        response_format: "mp3",
      }),
      signal: ctrl.signal,
    });
    status = res.status;
    request_id =
      res.headers.get("x-request-id") || res.headers.get("X-Request-Id");
    contentType = res.headers.get("content-type") || "";
    const buf = Buffer.from(await res.arrayBuffer());
    bytes = buf.length;
    if (!res.ok) {
      errMsg = buf.toString("utf8").slice(0, 180);
    }
  } catch (err) {
    errMsg = err instanceof Error ? err.message : String(err);
  } finally {
    clearTimeout(timer);
  }
  const latency_ms = Date.now() - started;
  const ok = status === 200 && bytes > 100;
  record({
    id,
    verdict: ok ? "PASS" : "FAIL",
    latency_ms,
    status,
    provider: null,
    fallback_used: null,
    request_id,
    detail: ok
      ? `bytes=${bytes} content_type=${contentType || "n/a"}`
      : errMsg || `bytes=${bytes}`,
  });
}

async function invalidToken() {
  const id = "error_invalid_token";
  const result = await fetchJson("/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization:
        "Bearer sk-tokfai_000000000000000000000000000000000000000000000000",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-5.6-sol",
      messages: [{ role: "user", content: "hi" }],
    }),
    timeoutMs: 30_000,
  });
  const code = result.body?.error?.code || result.body?.code;
  const ok = result.status === 401 && code === "invalid_token";
  record({
    id,
    verdict: ok ? "PASS" : "FAIL",
    latency_ms: result.latency_ms,
    status: result.status,
    provider: null,
    fallback_used: false,
    request_id: result.request_id,
    detail: ok ? "401 invalid_token" : JSON.stringify(result.body?.error || result.body)?.slice(0, 160),
  });
}

async function invalidRequestNoFallback() {
  const id = "error_invalid_request_no_fallback";
  const result = await fetchJson("/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-5.6-sol",
      // Tool-only transcript without prior assistant tool_calls → local 400.
      messages: [
        { role: "tool", tool_call_id: "call_p12", content: "tool output" },
      ],
    }),
    timeoutMs: 30_000,
  });
  const code = result.body?.error?.code || result.body?.code;
  const type = result.body?.error?.type;
  const fallback_used = extractFallbackUsed(result.body) === true;
  const ok =
    result.status === 400 &&
    (type === "invalid_request_error" ||
      String(code || "").includes("invalid") ||
      String(code || "").includes("missing_assistant") ||
      String(code || "").includes("empty")) &&
    !fallback_used;

  record({
    id,
    verdict: ok ? "PASS" : "FAIL",
    latency_ms: result.latency_ms,
    status: result.status,
    provider: extractProvider(result.body),
    fallback_used: fallback_used ?? false,
    request_id: result.request_id,
    detail: ok
      ? `400 ${code || type} fallback_used=${fallback_used}`
      : JSON.stringify(result.body?.error || result.body)?.slice(0, 180),
  });
}

async function adminProviderHealth() {
  const id = "admin_provider_health";
  if (!ADMIN_TOKEN) {
    record({
      id,
      verdict: "FAIL",
      latency_ms: 0,
      status: null,
      provider: null,
      fallback_used: null,
      request_id: null,
      detail: "ADMIN_TOKEN / TOKFAI_ADMIN_JWT not set",
    });
    return;
  }
  const result = await fetchJson("/v1/admin/provider-health", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${ADMIN_TOKEN}`,
      Accept: "application/json",
    },
    timeoutMs: 30_000,
  });
  const providers = Array.isArray(result.body?.data?.providers)
    ? result.body.data.providers
    : [];
  const byId = new Map(providers.map((p) => [p.providerId, p]));
  const primary = byId.get("grsai-primary");
  const secondary = byId.get("grsai-secondary");
  const ok =
    result.status === 200 &&
    primary != null &&
    typeof primary.status === "string";

  const summary = ["grsai-primary", "grsai-secondary"]
    .map((pid) => {
      const p = byId.get(pid);
      if (!p) return `${pid}=missing`;
      return `${pid} status=${p.status} success=${p.successCount} timeout=${p.timeoutCount} error=${p.errorCount} circuitUntil=${p.circuitOpenUntil || 0}`;
    })
    .join(" | ");

  let verdict = /** @type {Verdict} */ ("FAIL");
  if (ok) {
    verdict =
      primary.status === "open" || secondary?.status === "open"
        ? "WARN"
        : "PASS";
  }

  record({
    id,
    verdict,
    latency_ms: result.latency_ms,
    status: result.status,
    provider: primary ? "grsai-primary" : null,
    fallback_used: null,
    request_id: result.request_id,
    detail: ok
      ? summary
      : result.error ||
        JSON.stringify(result.body?.error || result.body)?.slice(0, 180),
  });

  if (ok) {
    console.log("       health_summary:");
    for (const pid of ["grsai-primary", "grsai-secondary"]) {
      const p = byId.get(pid);
      if (!p) {
        console.log(`         - ${pid}: (not present)`);
        continue;
      }
      console.log(
        `         - ${pid}: status=${p.status} successCount=${p.successCount} timeoutCount=${p.timeoutCount} errorCount=${p.errorCount} lastErrorCode=${p.lastErrorCode ?? "null"} circuitOpenUntil=${p.circuitOpenUntil || 0}`
      );
    }
  }
}

function runTypecheckBuild() {
  const steps = [
    { id: "typecheck", args: ["run", "typecheck"] },
    { id: "build", args: ["run", "build"] },
  ];
  for (const step of steps) {
    const started = Date.now();
    const r = spawnSync("npm", step.args, {
      cwd: DMIT,
      encoding: "utf8",
      env: process.env,
      maxBuffer: 16 * 1024 * 1024,
    });
    const ok = (r.status ?? 1) === 0;
    record({
      id: `local_${step.id}`,
      verdict: ok ? "PASS" : "FAIL",
      latency_ms: Date.now() - started,
      status: r.status,
      provider: null,
      fallback_used: null,
      request_id: null,
      detail: ok
        ? "ok"
        : (r.stderr || r.stdout || r.error?.message || "failed").slice(0, 200),
    });
  }
}

function printSummary() {
  const pass = rows.filter((r) => r.verdict === "PASS").length;
  const warn = rows.filter((r) => r.verdict === "WARN").length;
  const fail = rows.filter((r) => r.verdict === "FAIL").length;
  console.log("\n════════ P12 OPS CHECKLIST SUMMARY ════════");
  console.log(`base=${BASE}`);
  console.log(`key=${maskSecret(API_KEY)}`);
  console.log(`admin_token=${maskSecret(ADMIN_TOKEN)}`);
  console.log(`wav=${WAV_PATH}`);
  console.log(`PASS=${pass} WARN=${warn} FAIL=${fail} total=${rows.length}`);
  console.log(
    JSON.stringify(
      {
        base: BASE,
        checks: rows.map((r) => ({
          id: r.id,
          verdict: r.verdict,
          latency_ms: r.latency_ms,
          status: r.status,
          provider: r.provider,
          fallback_used: r.fallback_used,
          request_id: r.request_id,
        })),
      },
      null,
      2
    )
  );
  if (fail > 0) {
    console.log(FAIL_MARKER);
    return 1;
  }
  console.log(PASS_MARKER);
  return 0;
}

async function main() {
  console.log("Tokfai P12 ops checklist smoke");
  console.log(`base=${BASE} key=${maskSecret(API_KEY)}`);

  if (!API_KEY) {
    record({
      id: "env_tokfai_key",
      verdict: "FAIL",
      latency_ms: 0,
      status: null,
      provider: null,
      fallback_used: null,
      request_id: null,
      detail: "TOKFAI_KEY / TOKFAI_API_KEY required",
    });
    process.exitCode = printSummary();
    return;
  }

  // Local compile gate (no prod mutation).
  if (process.env.SKIP_TYPECHECK_BUILD !== "1") {
    runTypecheckBuild();
  }

  await chatNonStream("gpt-5.6-sol");
  await chatNonStream("gpt-5.6-terra");
  await chatNonStream("auto-fast");

  await chatStream("gpt-5.6-sol");
  await chatStream("auto-fast");

  await audioTranscription();
  await audioSpeech();

  await invalidToken();
  await invalidRequestNoFallback();

  await adminProviderHealth();

  process.exitCode = printSummary();
}

main().catch((err) => {
  console.error(FAIL_MARKER);
  console.error(err instanceof Error ? err.stack || err.message : String(err));
  process.exitCode = 1;
});
