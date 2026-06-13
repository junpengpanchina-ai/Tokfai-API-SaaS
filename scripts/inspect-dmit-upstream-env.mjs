#!/usr/bin/env node
/**
 * P758 — Inspect DMIT upstream env (masked). Run on the DMIT server.
 *
 * Usage (from repo root on DMIT):
 *   node scripts/inspect-dmit-upstream-env.mjs
 *
 * Optional:
 *   DMIT_ENV_FILE=apps/dmit-api/.env
 *   RUN_PM2_INSPECT=1   — also run pm2 show/env (keys redacted in output)
 */

import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_FILE =
  process.env.DMIT_ENV_FILE ?? join(ROOT, "apps/dmit-api/.env");

const WATCH_KEYS = [
  "GRSAI_BASE_URL",
  "GRSAI_API_BASE",
  "GRSAI_API_KEY",
  "GRSAI_CHAT_COMPLETIONS_PATH",
  "GRSAI_CHAT_TIMEOUT_MS",
  "TOKFAI_UPSTREAM_TIMEOUT_MS",
  "TOKFAI_UPSTREAM_SECONDARY_ENABLED",
  "TOKFAI_UPSTREAM_SECONDARY_BASE_URL",
  "TOKFAI_UPSTREAM_SECONDARY_API_KEY",
  "TOKFAI_UPSTREAM_SECONDARY_CHAT_PATH",
  "NODE_ENV",
  "LOG_LEVEL",
];

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

function resolveUpstreamTarget(env) {
  const rawBase =
    env.GRSAI_BASE_URL ?? env.GRSAI_API_BASE ?? "https://grsaiapi.com";
  const base = normalizeGrsaiBaseUrl(rawBase);
  const chatPath = (env.GRSAI_CHAT_COMPLETIONS_PATH ?? "/v1/chat/completions")
    .startsWith("/")
    ? env.GRSAI_CHAT_COMPLETIONS_PATH ?? "/v1/chat/completions"
    : `/${env.GRSAI_CHAT_COMPLETIONS_PATH ?? "v1/chat/completions"}`;
  const url = new URL(`${base.replace(/\/+$/, "")}${chatPath}`);
  return {
    rawBase,
    normalizedBase: base,
    chatPath,
    fullUrl: url.toString(),
    host: url.host,
    pathname: url.pathname,
  };
}

function redactPm2Output(text) {
  return text
    .split("\n")
    .map((line) => {
      if (/GRSAI_API_KEY|TOKEN_PEPPER|STRIPE_|SUPABASE_SERVICE_ROLE|SECONDARY_API_KEY/i.test(line)) {
        const idx = line.indexOf(":");
        if (idx === -1) return `${line.split("=")[0]}=****`;
        const key = line.slice(0, idx).trim();
        return `${key}: ****`;
      }
      return line;
    })
    .join("\n");
}

async function loadEnv() {
  try {
    const text = await readFile(ENV_FILE, "utf8");
    return parseEnvFile(text);
  } catch {
    return { ...process.env };
  }
}

async function maybePm2Inspect() {
  if (process.env.RUN_PM2_INSPECT !== "1") return;
  console.log("=== PM2 inspect (redacted) ===");
  try {
    const show = await execFileAsync("pm2", ["show", "dmit-api"], {
      maxBuffer: 2 * 1024 * 1024,
    });
    console.log(redactPm2Output(show.stdout));
  } catch (err) {
    console.log("pm2 show failed:", err instanceof Error ? err.message : err);
  }
  try {
    const envOut = await execFileAsync("pm2", ["env", "dmit-api"], {
      maxBuffer: 2 * 1024 * 1024,
    });
    console.log(redactPm2Output(envOut.stdout));
  } catch (err) {
    console.log("pm2 env failed:", err instanceof Error ? err.message : err);
  }
  console.log("");
}

async function main() {
  console.log("=== P758 DMIT upstream env (masked) ===");
  console.log(`env_file: ${ENV_FILE}`);
  console.log("");

  const env = await loadEnv();
  const target = resolveUpstreamTarget(env);

  console.log("Resolved GRSAI chat target:");
  console.log(`  raw_base:        ${target.rawBase}`);
  console.log(`  normalized_base: ${target.normalizedBase}`);
  console.log(`  chat_path:       ${target.chatPath}`);
  console.log(`  full_url:        ${target.fullUrl}`);
  console.log(`  host:            ${target.host}`);
  console.log(`  pathname:        ${target.pathname}`);
  if (target.pathname.includes("/v1/v1/")) {
    console.log("  WARNING: pathname contains /v1/v1 — check GRSAI_BASE_URL");
  }
  console.log("");

  console.log("Key env vars:");
  for (const key of WATCH_KEYS) {
    const val = env[key] ?? process.env[key];
    if (!val) {
      console.log(`  ${key}: (unset)`);
      continue;
    }
    if (/KEY|SECRET|PEPPER|PASSWORD/i.test(key)) {
      console.log(`  ${key}: ${maskSecret(val)}`);
    } else {
      console.log(`  ${key}: ${val}`);
    }
  }
  console.log("");

  await maybePm2Inspect();

  console.log("Next: node scripts/probe-grsai-upstream.mjs");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
