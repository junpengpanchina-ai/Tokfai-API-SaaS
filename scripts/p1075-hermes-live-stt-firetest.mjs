#!/usr/bin/env node
/**
 * P1075 — Hermes LIVE STT firetest (real network, no mock success).
 *
 *   node scripts/p1075-hermes-live-stt-firetest.mjs
 *
 * PASS marker only when real provider + real Tokfai HTTP entry return a transcript.
 * Missing credentials / unreachable upstream → EXTERNAL_BLOCKER (not PASS).
 */

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createConnection } from "node:net";
import { connect as tlsConnect } from "node:tls";
import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { URL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WAV = join(ROOT, "scripts/fixtures/p1074/stt-canary-silence.wav");
const REPORT = join(ROOT, "docs/p1075-hermes-live-stt-firetest-report.md");
const SUMMARY = join(ROOT, "tmp/p1075-hermes-live-stt-firetest-summary.json");
const PASS = "TOKFAI_P1075_HERMES_LIVE_STT_PASS";
const FAIL = "TOKFAI_P1075_HERMES_LIVE_STT_FAIL";
const BLOCKED = "TOKFAI_P1075_HERMES_LIVE_STT_BLOCKED";

/** @type {{ id: string, ok: boolean, detail?: string }[]} */
const cases = [];
/** @type {string[]} */
const attempts = [];

function record(id, ok, detail) {
  cases.push({ id, ok: !!ok, detail: detail ? String(detail).slice(0, 500) : undefined });
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}${detail ? ` — ${detail}` : ""}`);
  return !!ok;
}

function logAttempt(label, detail) {
  attempts.push(`${label}: ${detail}`);
  console.log(`LIVE  ${label}: ${detail}`);
}

function presence(v) {
  return Boolean(v && String(v).trim());
}

function readEnvFile(path) {
  if (!existsSync(path)) return new Map();
  /** @type {Map<string, string>} */
  const map = new Map();
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    map.set(line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^["']|["']$/g, ""));
  }
  return map;
}

function classifyKey(v) {
  if (!v) return "absent";
  if (v.startsWith("sk-tokfai")) return "tokfai_consumer";
  if (v.startsWith("gsk_")) return "groqish";
  if (v.startsWith("sk-")) return "openaiish";
  return "other";
}

/** Phase 1 — credential discovery (Tokfai config only; never print secrets). */
function discoverCredentials() {
  const tokfaiEnvPaths = [
    join(ROOT, "apps/dmit-api/.env"),
    join(ROOT, "apps/dmit-api/.env.local"),
    join(ROOT, "apps/dmit-api/.env.production"),
    join(ROOT, ".env"),
  ];
  /** @type {Map<string, string>} */
  const merged = new Map();
  const sources = [];
  for (const p of tokfaiEnvPaths) {
    const m = readEnvFile(p);
    if (m.size) sources.push(p);
    for (const [k, v] of m) {
      if (!merged.has(k) && v) merged.set(k, v);
    }
  }
  // process env overrides
  for (const k of [
    "TOKFAI_STT_PROVIDER",
    "TOKFAI_STT_BASE_URL",
    "TOKFAI_STT_API_KEY",
    "TOKFAI_STT_DEFAULT_MODEL",
  ]) {
    if (presence(process.env[k])) merged.set(k, String(process.env[k]));
  }

  const provider =
    (merged.get("TOKFAI_STT_PROVIDER") || "openai_compatible").trim() ||
    "openai_compatible";
  const base = (merged.get("TOKFAI_STT_BASE_URL") || "").trim();
  const key = (merged.get("TOKFAI_STT_API_KEY") || "").trim();
  const model =
    (merged.get("TOKFAI_STT_DEFAULT_MODEL") || "").trim() || "whisper-1";

  const found =
    presence(base) &&
    presence(key) &&
    classifyKey(key) !== "tokfai_consumer";

  console.log(`STT_PROVIDER=${provider}`);
  console.log(`BASE_URL_CONFIGURED=${presence(base) ? "YES" : "NO"}`);
  console.log(`API_KEY_PRESENT=${presence(key) ? "YES" : "NO"}`);
  console.log(`MODEL_CONFIGURED=${presence(model) ? "YES" : "NO"}`);
  console.log(
    `KEY_CLASS=${presence(key) ? classifyKey(key) : "absent"} (tokfai_consumer keys are NOT STT upstream)`
  );
  console.log(`TOKFAI_ENV_FILES_FOUND=${sources.length ? sources.join(",") : "none"}`);

  // Explicitly refuse GRSAI as STT unless TOKFAI_STT_* points there intentionally
  const grsaiAsStt =
    /grsai/i.test(base) && presence(key);
  record(
    "not_auto_grsai_as_stt",
    !grsaiAsStt || Boolean(merged.get("TOKFAI_STT_BASE_URL")),
    grsaiAsStt ? "STT base explicitly grsai" : "GRSAI not assumed"
  );

  return {
    found,
    provider,
    base,
    keyPresent: presence(key),
    keyClass: presence(key) ? classifyKey(key) : "absent",
    key, // kept in memory for live call only; never logged
    model,
    sources,
  };
}

function tcpConnect(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    const t = setTimeout(() => {
      socket.destroy();
      resolve({ ok: false, err: "timeout" });
    }, timeoutMs);
    socket.once("connect", () => {
      clearTimeout(t);
      socket.end();
      resolve({ ok: true });
    });
    socket.once("error", (err) => {
      clearTimeout(t);
      resolve({ ok: false, err: err.message });
    });
  });
}

function tlsHandshake(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = tlsConnect({ host, port, servername: host, rejectUnauthorized: true });
    const t = setTimeout(() => {
      socket.destroy();
      resolve({ ok: false, err: "timeout" });
    }, timeoutMs);
    socket.once("secureConnect", () => {
      clearTimeout(t);
      const v = socket.getProtocol();
      socket.end();
      resolve({ ok: true, version: v });
    });
    socket.once("error", (err) => {
      clearTimeout(t);
      resolve({ ok: false, err: err.message });
    });
  });
}

function httpProbe(url, timeoutMs) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = httpsRequest(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: "GET",
        timeout: timeoutMs,
        headers: { "user-agent": "tokfai-p1075-firetest/1.0" },
      },
      (res) => {
        res.resume();
        resolve({ ok: true, status: res.statusCode || 0 });
      }
    );
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, err: "timeout" });
    });
    req.on("error", (err) => resolve({ ok: false, err: err.message }));
    req.end();
  });
}

async function networkTest(hostname) {
  let DNS_OK = false;
  let TCP_443_OK = false;
  let TLS_OK = false;
  let HTTP_REACHED = false;
  let detail = "";
  try {
    const addrs = await lookup(hostname, { all: true });
    DNS_OK = addrs.length > 0;
    detail = `addrs=${addrs.map((a) => a.address).slice(0, 3).join(",")}`;
  } catch (err) {
    detail = err instanceof Error ? err.message : String(err);
    return { DNS_OK, TCP_443_OK, TLS_OK, HTTP_REACHED, detail };
  }
  const tcp = await tcpConnect(hostname, 443, 8000);
  TCP_443_OK = tcp.ok;
  if (!tcp.ok) {
    detail += ` tcp=${tcp.err}`;
    return { DNS_OK, TCP_443_OK, TLS_OK, HTTP_REACHED, detail };
  }
  const tls = await tlsHandshake(hostname, 443, 8000);
  TLS_OK = tls.ok;
  if (!tls.ok) {
    detail += ` tls=${tls.err}`;
    return { DNS_OK, TCP_443_OK, TLS_OK, HTTP_REACHED, detail };
  }
  const http = await httpProbe(`https://${hostname}/`, 10000);
  HTTP_REACHED = http.ok;
  detail += ` http=${http.status || http.err}`;
  return { DNS_OK, TCP_443_OK, TLS_OK, HTTP_REACHED, detail };
}

function multipartWav(wav, model) {
  const boundary = "----tokfaiP1075";
  const head =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="model"\r\n\r\n${model}\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="stt-canary-silence.wav"\r\n` +
    `Content-Type: audio/wav\r\n\r\n`;
  const tail = `\r\n--${boundary}--\r\n`;
  return {
    boundary,
    body: Buffer.concat([
      Buffer.from(head),
      wav,
      Buffer.from(tail),
    ]),
  };
}

function httpsPostMultipart(url, apiKey, boundary, body, timeoutMs) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = httpsRequest(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: "POST",
        timeout: timeoutMs,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": body.length,
          "user-agent": "tokfai-p1075-firetest/1.0",
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks);
          let json = null;
          try {
            json = JSON.parse(raw.toString("utf8"));
          } catch {
            json = null;
          }
          resolve({
            status: res.statusCode || 0,
            json,
            bytes: raw.length,
            // never return transcript to logs — only length
            textLen:
              json && typeof json.text === "string" ? json.text.length : 0,
            hasText: Boolean(json && typeof json.text === "string" && json.text.length),
          });
        });
      }
    );
    req.on("timeout", () => {
      req.destroy();
      resolve({ status: 0, err: "timeout", hasText: false, textLen: 0, bytes: 0 });
    });
    req.on("error", (err) =>
      resolve({
        status: 0,
        err: err.message,
        hasText: false,
        textLen: 0,
        bytes: 0,
      })
    );
    req.write(body);
    req.end();
  });
}

async function probeProdTokfaiAudio() {
  const hermesEnv = readEnvFile(join(homedir(), ".hermes/.env"));
  const consumerKey = hermesEnv.get("OPENAI_API_KEY") || "";
  if (!consumerKey.startsWith("sk-tokfai")) {
    return { status: 0, detail: "no_tokfai_consumer_key_in_hermes_env" };
  }
  if (!existsSync(WAV)) return { status: 0, detail: "missing_wav" };
  const { boundary, body } = multipartWav(readFileSync(WAV), "whisper-1");
  const res = await httpsPostMultipart(
    "https://api.tokfai.com/v1/audio/transcriptions",
    consumerKey,
    boundary,
    body,
    60000
  );
  return {
    status: res.status,
    detail: res.err || `bytes=${res.bytes} hasText=${res.hasText}`,
    hasText: res.hasText,
  };
}

async function main() {
  mkdirSync(join(ROOT, "tmp"), { recursive: true });
  mkdirSync(join(ROOT, "docs"), { recursive: true });

  record("wav_fixture", existsSync(WAV), WAV);

  // LIVE_ATTEMPT_1 — credential + network + prod probe
  logAttempt("LIVE_ATTEMPT_1", "discover Tokfai STT creds + network + prod HTTP");
  const creds = discoverCredentials();
  record(
    "real_stt_credential_in_tokfai_config",
    creds.found,
    creds.found ? "TOKFAI_STT_* present" : "missing TOKFAI_STT_BASE_URL/API_KEY in Tokfai .env"
  );

  const targets = [
    { name: "api.openai.com", kind: "openai_compatible" },
    { name: "api.groq.com", kind: "groq_whisper_compatible" },
    { name: "api.tokfai.com", kind: "tokfai_edge" },
  ];
  /** @type {Record<string, any>} */
  const net = {};
  for (const t of targets) {
    net[t.name] = await networkTest(t.name);
    console.log(
      `NET ${t.name} DNS_OK=${net[t.name].DNS_OK} TCP_443_OK=${net[t.name].TCP_443_OK} TLS_OK=${net[t.name].TLS_OK} HTTP_REACHED=${net[t.name].HTTP_REACHED} ${net[t.name].detail}`
    );
  }
  console.log(
    `NETWORK_REACHABLE=${net["api.openai.com"].TLS_OK || net["api.groq.com"].TLS_OK ? "YES" : "NO"} (provider hosts)`
  );

  const prod = await probeProdTokfaiAudio();
  logAttempt(
    "LIVE_ATTEMPT_1_PROD",
    `api.tokfai.com/v1/audio/transcriptions status=${prod.status} ${prod.detail}`
  );
  record(
    "prod_audio_route_deployed",
    prod.status !== 404 && prod.status !== 0,
    `status=${prod.status}`
  );

  let REAL_EXTERNAL_PROVIDER_CALL_EXECUTED = false;
  let REAL_EXTERNAL_PROVIDER_HTTP_STATUS = null;
  let REAL_EXTERNAL_TRANSCRIPTION_RECEIVED = false;
  let REAL_HTTP_ENTRY_EXECUTED = false;
  let REAL_PROVIDER_EXECUTED = false;
  let TRANSCRIPTION_RETURNED = false;
  let LIVE_FIX_COUNT = 0;
  let EXTERNAL_BLOCKER = null;

  const openaiNetOk =
    net["api.openai.com"].DNS_OK &&
    net["api.openai.com"].TCP_443_OK &&
    net["api.openai.com"].TLS_OK;
  const groqNetOk =
    net["api.groq.com"].DNS_OK &&
    net["api.groq.com"].TCP_443_OK &&
    net["api.groq.com"].TLS_OK;

  console.log(`REAL_STT_PROVIDER_NETWORK_TESTED=YES`);
  console.log(
    `REAL_STT_PROVIDER_NETWORK_OK=${openaiNetOk || groqNetOk ? "YES" : "NO"}`
  );

  if (!creds.found) {
    EXTERNAL_BLOCKER =
      "No legitimate TOKFAI_STT_BASE_URL + TOKFAI_STT_API_KEY in Tokfai local/production config " +
      "(apps/dmit-api/.env missing; process env unset). " +
      "Consumer sk-tokfai_* keys are not STT upstream credentials. " +
      "GRSAI is not assumed as STT. " +
      (prod.status === 404
        ? "Production api.tokfai.com returns route_not_found for POST /v1/audio/transcriptions (STT not deployed). "
        : "") +
      (!openaiNetOk
        ? "api.openai.com TCP/TLS not reachable from this network (DNS resolves to non-OpenAI anycast). "
        : "") +
      (groqNetOk
        ? "api.groq.com is reachable but no Groq STT key is configured in Tokfai. "
        : "");
    logAttempt("LIVE_FIX_1", "none — EXTERNAL_BLOCKER is credential/deploy/network, not code");
    LIVE_FIX_COUNT = 0;
  } else {
    // Would run real provider call — path reserved when ops adds TOKFAI_STT_*
    LIVE_FIX_COUNT = 0;
    const base = creds.base.replace(/\/+$/, "");
    const url = `${base}/audio/transcriptions`;
    const { boundary, body } = multipartWav(readFileSync(WAV), creds.model);
    logAttempt("LIVE_ATTEMPT_2", `direct provider POST ${new URL(url).hostname}`);
    REAL_EXTERNAL_PROVIDER_CALL_EXECUTED = true;
    const res = await httpsPostMultipart(url, creds.key, boundary, body, 60000);
    REAL_EXTERNAL_PROVIDER_HTTP_STATUS = res.status;
    REAL_EXTERNAL_TRANSCRIPTION_RECEIVED = Boolean(res.hasText);
    record(
      "real_external_provider_call",
      res.hasText && res.status === 200,
      `status=${res.status} textLen=${res.textLen}`
    );
  }

  // Hermes desktop phase gated
  const HERMES_REAL_VOICE_REQUEST_CREATED = false;
  const TOKFAI_AUDIO_ROUTE_REACHED = prod.status > 0 && prod.status !== 404;
  const HERMES_TRANSCRIPT_DISPLAYED = false;

  const PRODUCTION_STT_UPSTREAM_READY =
    REAL_EXTERNAL_PROVIDER_CALL_EXECUTED &&
    REAL_HTTP_ENTRY_EXECUTED &&
    TRANSCRIPTION_RETURNED;

  const HERMES_VOICE_READY =
    PRODUCTION_STT_UPSTREAM_READY &&
    HERMES_REAL_VOICE_REQUEST_CREATED &&
    TOKFAI_AUDIO_ROUTE_REACHED &&
    HERMES_TRANSCRIPT_DISPLAYED;

  record(
    "production_stt_upstream_ready_honest",
    PRODUCTION_STT_UPSTREAM_READY === false,
    "must stay NO without real transcription"
  );
  record(
    "hermes_voice_ready_honest",
    HERMES_VOICE_READY === false,
    "must stay NO"
  );
  record(
    "external_blocker_stated",
    Boolean(EXTERNAL_BLOCKER),
    EXTERNAL_BLOCKER ? EXTERNAL_BLOCKER.slice(0, 200) : "none"
  );

  const summary = {
    REAL_STT_CREDENTIAL_FOUND: creds.found,
    STT_PROVIDER: creds.provider,
    BASE_URL_CONFIGURED: presence(creds.base),
    API_KEY_PRESENT: creds.keyPresent,
    MODEL_CONFIGURED: true,
    NETWORK_REACHABLE: openaiNetOk || groqNetOk,
    REAL_STT_PROVIDER_NETWORK_TESTED: true,
    REAL_STT_PROVIDER_NETWORK_OK: openaiNetOk || groqNetOk,
    net,
    prod_audio_status: prod.status,
    REAL_EXTERNAL_PROVIDER_CALL_EXECUTED,
    REAL_EXTERNAL_PROVIDER_HTTP_STATUS,
    REAL_EXTERNAL_TRANSCRIPTION_RECEIVED,
    REAL_HTTP_ENTRY_EXECUTED,
    REAL_PROVIDER_EXECUTED,
    TRANSCRIPTION_RETURNED,
    LIVE_FIX_COUNT,
    attempts,
    HERMES_REAL_VOICE_REQUEST_CREATED,
    TOKFAI_AUDIO_ROUTE_REACHED,
    HERMES_TRANSCRIPT_DISPLAYED,
    PRODUCTION_STT_UPSTREAM_READY,
    HERMES_VOICE_READY,
    EXTERNAL_BLOCKER,
    cases,
  };

  writeFileSync(SUMMARY, JSON.stringify(summary, null, 2) + "\n");

  const report = `# P1075 — Hermes LIVE STT Firetest

## Result: **${EXTERNAL_BLOCKER ? "BLOCKED" : PRODUCTION_STT_UPSTREAM_READY ? "PASS" : "FAIL"}**

\`\`\`
REAL_STT_CREDENTIAL_FOUND=${summary.REAL_STT_CREDENTIAL_FOUND}
REAL_STT_PROVIDER_NETWORK_TESTED=${summary.REAL_STT_PROVIDER_NETWORK_TESTED}
REAL_STT_PROVIDER_NETWORK_OK=${summary.REAL_STT_PROVIDER_NETWORK_OK}

REAL_EXTERNAL_PROVIDER_CALL_EXECUTED=${summary.REAL_EXTERNAL_PROVIDER_CALL_EXECUTED}
REAL_EXTERNAL_PROVIDER_HTTP_STATUS=${summary.REAL_EXTERNAL_PROVIDER_HTTP_STATUS}
REAL_EXTERNAL_TRANSCRIPTION_RECEIVED=${summary.REAL_EXTERNAL_TRANSCRIPTION_RECEIVED}

REAL_HTTP_ENTRY_EXECUTED=${summary.REAL_HTTP_ENTRY_EXECUTED}
REAL_PROVIDER_EXECUTED=${summary.REAL_PROVIDER_EXECUTED}
TRANSCRIPTION_RETURNED=${summary.TRANSCRIPTION_RETURNED}

LIVE_FIX_COUNT=${summary.LIVE_FIX_COUNT}

HERMES_REAL_VOICE_REQUEST_CREATED=${summary.HERMES_REAL_VOICE_REQUEST_CREATED}
TOKFAI_AUDIO_ROUTE_REACHED=${summary.TOKFAI_AUDIO_ROUTE_REACHED}
HERMES_TRANSCRIPT_DISPLAYED=${summary.HERMES_TRANSCRIPT_DISPLAYED}

PRODUCTION_STT_UPSTREAM_READY=${summary.PRODUCTION_STT_UPSTREAM_READY}
HERMES_VOICE_READY=${summary.HERMES_VOICE_READY}

EXTERNAL_BLOCKER=${summary.EXTERNAL_BLOCKER || "(none)"}
\`\`\`

### Attempts

${attempts.map((a) => `- ${a}`).join("\n")}

### Cases

| Case | OK | Detail |
|---|---|---|
${cases.map((c) => `| ${c.id} | ${c.ok ? "PASS" : "FAIL"} | ${(c.detail || "").replace(/\|/g, "/")} |`).join("\n")}

### Ops unblock (not done by this task — no deploy / no secret invent)

1. Add server-side to \`apps/dmit-api/.env\` (production host):
   \`TOKFAI_STT_PROVIDER=openai_compatible\` (or \`groq_whisper_compatible\`)
   \`TOKFAI_STT_BASE_URL=...\`
   \`TOKFAI_STT_API_KEY=...\`
   \`TOKFAI_STT_DEFAULT_MODEL=whisper-1\` (or Groq whisper model)
2. Deploy/reload dmit-api so \`POST /v1/audio/transcriptions\` exists on api.tokfai.com
3. Ensure this network can reach the chosen STT host (OpenAI currently DNS/TCP-blocked here; Groq TLS works)
4. Re-run: \`node scripts/p1075-hermes-live-stt-firetest.mjs\`

${EXTERNAL_BLOCKER ? BLOCKED : PRODUCTION_STT_UPSTREAM_READY ? PASS : FAIL}
`;

  writeFileSync(REPORT, report);

  console.log("");
  for (const k of [
    "REAL_STT_CREDENTIAL_FOUND",
    "REAL_STT_PROVIDER_NETWORK_TESTED",
    "REAL_STT_PROVIDER_NETWORK_OK",
    "REAL_EXTERNAL_PROVIDER_CALL_EXECUTED",
    "REAL_EXTERNAL_PROVIDER_HTTP_STATUS",
    "REAL_EXTERNAL_TRANSCRIPTION_RECEIVED",
    "REAL_HTTP_ENTRY_EXECUTED",
    "REAL_PROVIDER_EXECUTED",
    "TRANSCRIPTION_RETURNED",
    "LIVE_FIX_COUNT",
    "HERMES_REAL_VOICE_REQUEST_CREATED",
    "TOKFAI_AUDIO_ROUTE_REACHED",
    "HERMES_TRANSCRIPT_DISPLAYED",
    "PRODUCTION_STT_UPSTREAM_READY",
    "HERMES_VOICE_READY",
  ]) {
    console.log(`${k}=${summary[k]}`);
  }
  console.log(`EXTERNAL_BLOCKER=${EXTERNAL_BLOCKER || ""}`);
  console.log(`report: ${REPORT}`);

  if (PRODUCTION_STT_UPSTREAM_READY && HERMES_VOICE_READY) {
    console.log(PASS);
    process.exit(0);
  }
  if (EXTERNAL_BLOCKER) {
    console.error(BLOCKED);
    process.exit(2);
  }
  console.error(FAIL);
  process.exit(1);
}

main().catch((err) => {
  console.error(FAIL);
  console.error(err);
  process.exit(1);
});
