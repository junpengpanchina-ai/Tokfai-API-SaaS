#!/usr/bin/env node
/**
 * Tokfai one-click Hermes voice compatibility bootstrap (P1072).
 *
 * Consumer inputs (only three):
 *   1. Base URL   (e.g. https://api.tokfai.com/v1)
 *   2. API Key    (sk-tokfai_...)
 *   3. Model      (e.g. gpt-5.5)
 *
 * Internally writes Hermes STT settings so stock Desktop (sourceMode=false)
 * routes OpenAI STT to Tokfai without the user setting STT_OPENAI_BASE_URL
 * or VOICE_TOOLS_OPENAI_KEY by hand.
 *
 * Explicit existing STT overrides are preserved (never clobber).
 *
 * Usage:
 *   node scripts/hermes-tokfai-voice-bootstrap.mjs \
 *     --base-url https://api.tokfai.com/v1 \
 *     --api-key sk-tokfai_... \
 *     --model gpt-5.5
 *
 *   HERMES_HOME=~/.hermes DRY_RUN=1 node scripts/hermes-tokfai-voice-bootstrap.mjs ...
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PASS = "TOKFAI_HERMES_VOICE_BOOTSTRAP_OK";
const FAIL = "TOKFAI_HERMES_VOICE_BOOTSTRAP_FAIL";

function arg(name, envName) {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return process.env[envName] ?? "";
}

function parseEnvFile(text) {
  /** @type {Map<string, string>} */
  const map = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    map.set(line.slice(0, i).trim(), line.slice(i + 1));
  }
  return map;
}

function serializeEnv(map) {
  const lines = [];
  for (const [k, v] of map) {
    lines.push(`${k}=${v}`);
  }
  return lines.join("\n") + (lines.length ? "\n" : "");
}

/**
 * Minimal YAML-ish update for stt.openai.base_url under stt:/openai: block.
 * Preserves explicit values.
 */
function ensureSttOpenaiBaseUrl(yamlText, baseUrl) {
  if (/^\s*base_url:\s*\S+/m.test(
    (yamlText.match(/stt:\s*\n([\s\S]*?)(?=\n[a-zA-Z_]|\n*$)/) || [])[1]?.match(
      /openai:\s*\n([\s\S]*?)(?=\n  [a-zA-Z_]|\n[a-zA-Z_]|\n*$)/
    )?.[1] || ""
  )) {
    // already has stt.openai.base_url
    return { text: yamlText, wrote: false, reason: "explicit_stt_openai_base_url" };
  }
  if (!/^stt:\s*$/m.test(yamlText) && !/^stt:\s*\n/m.test(yamlText)) {
    return {
      text:
        yamlText.replace(/\s*$/, "") +
        `\nstt:\n  enabled: true\n  provider: openai\n  openai:\n    model: whisper-1\n    base_url: ${JSON.stringify(baseUrl)}\n`,
      wrote: true,
      reason: "appended_stt_block",
    };
  }
  if (/^  openai:\s*$/m.test(yamlText) || /^  openai:\s*\n/m.test(yamlText)) {
    const next = yamlText.replace(
      /(^  openai:\s*\n(?:    .*\n)*)/m,
      (block) => {
        if (/^\s*base_url:/m.test(block)) return block;
        return block.replace(
          /(^  openai:\s*\n)/m,
          `$1    base_url: ${JSON.stringify(baseUrl)}\n`
        );
      }
    );
    return {
      text: next,
      wrote: next !== yamlText,
      reason: next !== yamlText ? "injected_stt_openai_base_url" : "unchanged",
    };
  }
  return {
    text: yamlText.replace(
      /(^stt:\s*\n)/m,
      `$1  openai:\n    model: whisper-1\n    base_url: ${JSON.stringify(baseUrl)}\n`
    ),
    wrote: true,
    reason: "injected_openai_under_stt",
  };
}

function main() {
  const baseUrl = arg("--base-url", "TOKFAI_BASE_URL").replace(/\/+$/, "");
  const apiKey = arg("--api-key", "TOKFAI_API_KEY");
  const model = arg("--model", "TOKFAI_MODEL") || "gpt-5.5";
  const hermesHome =
    process.env.HERMES_HOME || join(homedir(), ".hermes");
  const dryRun =
    process.env.DRY_RUN === "1" || process.argv.includes("--dry-run");

  if (!baseUrl.startsWith("http")) {
    console.error(FAIL);
    console.error("Base URL required (--base-url or TOKFAI_BASE_URL)");
    process.exit(1);
  }
  if (!apiKey.startsWith("sk-tokfai_")) {
    console.error(FAIL);
    console.error("API Key must be sk-tokfai_... (--api-key or TOKFAI_API_KEY)");
    process.exit(1);
  }

  const envPath = join(hermesHome, ".env");
  const cfgPath = join(hermesHome, "config.yaml");
  mkdirSync(hermesHome, { recursive: true });

  const envMap = existsSync(envPath)
    ? parseEnvFile(readFileSync(envPath, "utf8"))
    : new Map();

  const actions = [];

  // Chat three-input → OPENAI_* (Hermes openai-api provider)
  if (!envMap.has("OPENAI_BASE_URL") || !String(envMap.get("OPENAI_BASE_URL")).trim()) {
    envMap.set("OPENAI_BASE_URL", baseUrl);
    actions.push("set OPENAI_BASE_URL");
  } else {
    actions.push("preserve OPENAI_BASE_URL");
  }
  if (!envMap.has("OPENAI_API_KEY") || !String(envMap.get("OPENAI_API_KEY")).trim()) {
    envMap.set("OPENAI_API_KEY", apiKey);
    actions.push("set OPENAI_API_KEY");
  } else {
    actions.push("preserve OPENAI_API_KEY");
  }

  // STT inherit via env (stock Desktop reads this; does not inherit chat URL alone)
  const explicitStt =
    envMap.has("STT_OPENAI_BASE_URL") &&
    String(envMap.get("STT_OPENAI_BASE_URL")).trim();
  if (!explicitStt) {
    envMap.set("STT_OPENAI_BASE_URL", baseUrl);
    actions.push("set STT_OPENAI_BASE_URL from Base URL");
  } else {
    actions.push("preserve explicit STT_OPENAI_BASE_URL");
  }

  // Do NOT set VOICE_TOOLS_OPENAI_KEY — Hermes already inherits OPENAI_API_KEY
  actions.push("rely_on OPENAI_API_KEY inherit for STT auth (no VOICE_TOOLS_OPENAI_KEY)");

  let cfgWrote = false;
  let cfgReason = "no_config";
  let nextCfg = "";
  if (existsSync(cfgPath)) {
    const cfg = readFileSync(cfgPath, "utf8");
    const result = ensureSttOpenaiBaseUrl(cfg, baseUrl);
    nextCfg = result.text;
    cfgWrote = result.wrote;
    cfgReason = result.reason;
    actions.push(`config.yaml: ${cfgReason}`);
  } else {
    nextCfg = [
      "model:",
      `  default: ${JSON.stringify(model)}`,
      "  provider: openai-api",
      `  base_url: ${JSON.stringify(baseUrl)}`,
      "stt:",
      "  enabled: true",
      "  provider: openai",
      "  openai:",
      "    model: whisper-1",
      `    base_url: ${JSON.stringify(baseUrl)}`,
      "",
    ].join("\n");
    cfgWrote = true;
    cfgReason = "created_config";
    actions.push("created config.yaml with model+stt");
  }

  console.log("Hermes home:", hermesHome);
  console.log("Base URL:", baseUrl);
  console.log("Model:", model);
  console.log("API key:", apiKey.slice(0, 14) + "…");
  console.log("Actions:");
  for (const a of actions) console.log(" -", a);

  if (dryRun) {
    console.log("DRY_RUN=1 — no files written");
    console.log(PASS);
    return;
  }

  if (existsSync(envPath)) {
    copyFileSync(envPath, envPath + `.bak-p1072-${Date.now()}`);
  }
  writeFileSync(envPath, serializeEnv(envMap), { mode: 0o600 });
  if (cfgWrote) {
    if (existsSync(cfgPath)) {
      copyFileSync(cfgPath, cfgPath + `.bak-p1072-${Date.now()}`);
    }
    writeFileSync(cfgPath, nextCfg, { mode: 0o600 });
  }

  console.log(PASS);
  console.log(
    "VOICE_THREE_INPUT: consumer only provided Base URL + API Key + Model; bootstrap wrote STT_OPENAI_BASE_URL internally."
  );
}

main();
