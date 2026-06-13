#!/usr/bin/env node
/**
 * P758 — Direct GRSAI upstream probe. Run on the DMIT server (not local browser).
 *
 * Usage:
 *   node scripts/probe-grsai-upstream.mjs
 *
 * Reads GRSAI_* from apps/dmit-api/.env unless already exported.
 * Never prints full API keys.
 *
 * Optional:
 *   DMIT_ENV_FILE=apps/dmit-api/.env
 *   MODELS=gpt-5.4,gpt-4o-mini,gemini-3-flash
 *   TIMEOUT_MS=90000
 */

import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_FILE =
  process.env.DMIT_ENV_FILE ?? join(ROOT, "apps/dmit-api/.env");
const MODELS = (process.env.MODELS ?? "gpt-5.4,gpt-4o-mini,gemini-3-flash")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);
const TIMEOUT_MS = Math.max(
  1000,
  parseInt(process.env.TIMEOUT_MS ?? "90000", 10) || 90_000
);
const PROMPT = process.env.PROMPT ?? "Say ok only.";

function maskSecret(value) {
  if (!value) return "(unset)";
  if (value.length <= 8) return `**** (len=${value.length})`;
  return `${value.slice(0, 4)}…${value.slice(-4)} (len=${value.length})`;
}

function parseEnvFile(text) {
  const out = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function normalizeGrsaiBaseUrl(raw) {
  const trimmed = raw.replace(/\/+$/, "");
  if (trimmed.endsWith("/v1")) return trimmed.slice(0, -3);
  return trimmed;
}

function buildUrl(base, path) {
  const normalizedBase = normalizeGrsaiBaseUrl(base);
  const chatPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase.replace(/\/+$/, "")}${chatPath}`;
}

function truncate(text, max = 200) {
  if (!text) return "";
  const s = String(text).replace(/\s+/g, " ").trim();
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

async function loadConfig() {
  let fileEnv = {};
  try {
    fileEnv = parseEnvFile(await readFile(ENV_FILE, "utf8"));
  } catch {
    /* use process.env */
  }

  const base =
    process.env.GRSAI_BASE_URL ??
    process.env.GRSAI_API_BASE ??
    fileEnv.GRSAI_BASE_URL ??
    fileEnv.GRSAI_API_BASE ??
    "https://grsaiapi.com";
  const apiKey =
    process.env.GRSAI_API_KEY ?? fileEnv.GRSAI_API_KEY ?? "";
  const chatPath =
    process.env.GRSAI_CHAT_COMPLETIONS_PATH ??
    fileEnv.GRSAI_CHAT_COMPLETIONS_PATH ??
    "/v1/chat/completions";

  return { base, apiKey, chatPath };
}

async function probeGet(url, apiKey, label) {
  const started = performance.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text();
    return {
      label,
      method: "GET",
      url,
      status: res.status,
      latencyMs: Math.round(performance.now() - started),
      bodyPreview: truncate(text),
    };
  } catch (err) {
    return {
      label,
      method: "GET",
      url,
      status: 0,
      latencyMs: Math.round(performance.now() - started),
      bodyPreview: truncate(err instanceof Error ? err.message : String(err)),
    };
  }
}

async function probeChat(url, apiKey, model) {
  const started = performance.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: PROMPT }],
        stream: false,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text();
    let parsed = {};
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = { raw: truncate(text) };
    }
    const errMsg =
      parsed?.error?.message ??
      parsed?.message ??
      (typeof parsed.raw === "string" ? parsed.raw : "");
    return {
      label: `chat:${model}`,
      method: "POST",
      url,
      status: res.status,
      latencyMs: Math.round(performance.now() - started),
      errorCode: parsed?.error?.code ?? null,
      errorMessage: truncate(errMsg),
      bodyPreview: truncate(text),
    };
  } catch (err) {
    return {
      label: `chat:${model}`,
      method: "POST",
      url,
      status: 0,
      latencyMs: Math.round(performance.now() - started),
      errorMessage: truncate(err instanceof Error ? err.message : String(err)),
      bodyPreview: "",
    };
  }
}

function printResult(r) {
  console.log(`--- ${r.label} ---`);
  console.log(`  ${r.method} ${r.url}`);
  console.log(`  status:     ${r.status}`);
  console.log(`  latency_ms: ${r.latencyMs}`);
  if (r.errorCode) console.log(`  error_code: ${r.errorCode}`);
  if (r.errorMessage) console.log(`  error_msg:  ${r.errorMessage}`);
  console.log(`  body:       ${r.bodyPreview || "(empty)"}`);
  console.log("");
}

async function main() {
  const { base, apiKey, chatPath } = await loadConfig();
  const chatUrl = buildUrl(base, chatPath);
  const modelsUrl = buildUrl(base, "/v1/models");

  console.log("=== P758 direct GRSAI upstream probe ===");
  console.log(`env_file:   ${ENV_FILE}`);
  console.log(`base:       ${base}`);
  console.log(`chat_path:  ${chatPath}`);
  console.log(`chat_url:   ${chatUrl}`);
  console.log(`api_key:    ${maskSecret(apiKey)}`);
  console.log(`models:     ${MODELS.join(", ")}`);
  console.log("");

  if (!apiKey) {
    console.error("GRSAI_API_KEY is unset — cannot probe authenticated chat.");
    process.exit(1);
  }

  printResult(await probeGet(modelsUrl, apiKey, "grsai_models"));
  for (const model of MODELS) {
    printResult(await probeChat(chatUrl, apiKey, model));
  }

  console.log("Interpretation:");
  console.log("- If direct GRSAI chat succeeds but Tokfai returns 502 → DMIT forwarding bug.");
  console.log("- If direct GRSAI chat fails → fix GRSAI_BASE_URL / GRSAI_API_KEY / model id on DMIT.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
