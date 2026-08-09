/**
 * Tokfai ↔ Hermes STT compatibility sync (P1073).
 *
 * Idempotent, non-destructive. Priority:
 *   explicit STT config > Tokfai integration-derived > Hermes default
 *
 * Never clobbers Groq/Mistral/custom STT providers or unrelated Hermes keys.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
} from "node:fs";
import { join } from "node:path";

export const TOKFAI_HOST_RE = /(^|\.)tokfai\.com$/i;

export function normalizeBaseUrl(url) {
  return String(url || "")
    .trim()
    .replace(/\/+$/, "");
}

export function isTokfaiOpenAiCompatibleBaseUrl(url) {
  try {
    const u = new URL(normalizeBaseUrl(url));
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    return TOKFAI_HOST_RE.test(u.hostname);
  } catch {
    return false;
  }
}

export function parseEnvFile(text) {
  /** @type {Map<string, string>} */
  const map = new Map();
  for (const line of String(text || "").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    map.set(line.slice(0, i).trim(), line.slice(i + 1));
  }
  return map;
}

export function serializeEnv(map) {
  const lines = [];
  for (const [k, v] of map) lines.push(`${k}=${v}`);
  return lines.join("\n") + (lines.length ? "\n" : "");
}

function sttProviderFromYaml(yamlText) {
  const m = String(yamlText || "").match(
    /^stt:\s*\n([\s\S]*?)(?=\n[a-zA-Z_]|\n*$)/m
  );
  if (!m) return null;
  const pm = m[1].match(/^\s*provider:\s*(\S+)/m);
  return pm ? pm[1].replace(/['"]/g, "") : null;
}

function hasExplicitSttOpenaiBaseUrl(yamlText) {
  const stt = (String(yamlText || "").match(
    /^stt:\s*\n([\s\S]*?)(?=\n[a-zA-Z_]|\n*$)/m
  ) || [])[1];
  if (!stt) return false;
  const openai = (stt.match(
    /openai:\s*\n([\s\S]*?)(?=\n  [a-zA-Z_]|\n[a-zA-Z_]|\n*$)/
  ) || [])[1];
  return Boolean(openai && /^\s*base_url:\s*\S+/m.test(openai));
}

/**
 * Inject stt.openai.base_url only when absent and provider is openai/unset.
 */
export function ensureSttOpenaiBaseUrl(yamlText, baseUrl) {
  const provider = sttProviderFromYaml(yamlText);
  if (provider && provider !== "openai") {
    return {
      text: yamlText,
      wrote: false,
      reason: `preserve_stt_provider_${provider}`,
    };
  }
  if (hasExplicitSttOpenaiBaseUrl(yamlText)) {
    return {
      text: yamlText,
      wrote: false,
      reason: "explicit_stt_openai_base_url",
    };
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

function modelBaseUrlFromYaml(yamlText) {
  const m = String(yamlText || "").match(
    /^model:\s*\n([\s\S]*?)(?=\n[a-zA-Z_]|\n*$)/m
  );
  if (!m) return "";
  const bu = m[1].match(/^\s*base_url:\s*(.+)\s*$/m);
  if (!bu) return "";
  return bu[1].replace(/^["']|["']$/g, "").trim();
}

/**
 * Detect chat Tokfai base from Hermes persistence (.env + config.yaml).
 */
export function detectTokfaiChatBase(hermesHome) {
  const envPath = join(hermesHome, ".env");
  const cfgPath = join(hermesHome, "config.yaml");
  const envMap = existsSync(envPath)
    ? parseEnvFile(readFileSync(envPath, "utf8"))
    : new Map();
  const cfg = existsSync(cfgPath) ? readFileSync(cfgPath, "utf8") : "";
  const candidates = [
    envMap.get("OPENAI_BASE_URL"),
    modelBaseUrlFromYaml(cfg),
  ].filter(Boolean);
  for (const c of candidates) {
    const n = normalizeBaseUrl(c);
    if (isTokfaiOpenAiCompatibleBaseUrl(n)) return n;
  }
  return null;
}

/**
 * @param {{
 *   hermesHome: string,
 *   baseUrl?: string,
 *   apiKey?: string,
 *   model?: string,
 *   dryRun?: boolean,
 *   mode?: 'connect' | 'sync-derived',
 *   backupTag?: string,
 * }} opts
 */
export function applyHermesTokfaiSttSync(opts) {
  const hermesHome = opts.hermesHome;
  const dryRun = Boolean(opts.dryRun);
  const mode = opts.mode || "connect";
  const backupTag = opts.backupTag || "p1073";
  const model = opts.model || "gpt-5.5";
  /** @type {string[]} */
  const actions = [];

  mkdirSync(hermesHome, { recursive: true });
  const envPath = join(hermesHome, ".env");
  const cfgPath = join(hermesHome, "config.yaml");

  const envMap = existsSync(envPath)
    ? parseEnvFile(readFileSync(envPath, "utf8"))
    : new Map();
  let cfgText = existsSync(cfgPath) ? readFileSync(cfgPath, "utf8") : "";

  let baseUrl = normalizeBaseUrl(opts.baseUrl || "");
  if (!baseUrl) {
    baseUrl = detectTokfaiChatBase(hermesHome) || "";
  }
  if (!baseUrl || !isTokfaiOpenAiCompatibleBaseUrl(baseUrl)) {
    return {
      ok: false,
      skipped: true,
      reason: "no_tokfai_openai_compatible_base_url",
      actions,
      chatBaseUrl: baseUrl || null,
      sttBaseUrl: envMap.get("STT_OPENAI_BASE_URL") || null,
      sttKeySource: envMap.get("VOICE_TOOLS_OPENAI_KEY")
        ? "VOICE_TOOLS_OPENAI_KEY"
        : envMap.get("OPENAI_API_KEY")
          ? "OPENAI_API_KEY"
          : "none",
    };
  }

  const sttProvider = sttProviderFromYaml(cfgText);
  if (sttProvider && sttProvider !== "openai") {
    return {
      ok: true,
      skipped: true,
      reason: `preserve_non_openai_stt_provider:${sttProvider}`,
      actions: [`preserve stt.provider=${sttProvider}`],
      chatBaseUrl: baseUrl,
      sttBaseUrl: envMap.get("STT_OPENAI_BASE_URL") || null,
      sttKeySource: envMap.get("VOICE_TOOLS_OPENAI_KEY")
        ? "VOICE_TOOLS_OPENAI_KEY"
        : envMap.get("OPENAI_API_KEY")
          ? "OPENAI_API_KEY"
          : "none",
    };
  }

  if (mode === "connect") {
    if (!envMap.get("OPENAI_BASE_URL")?.trim()) {
      envMap.set("OPENAI_BASE_URL", baseUrl);
      actions.push("set OPENAI_BASE_URL");
    } else {
      actions.push("preserve OPENAI_BASE_URL");
    }
    const apiKey = String(opts.apiKey || "").trim();
    if (apiKey) {
      if (!envMap.get("OPENAI_API_KEY")?.trim()) {
        envMap.set("OPENAI_API_KEY", apiKey);
        actions.push("set OPENAI_API_KEY");
      } else {
        actions.push("preserve OPENAI_API_KEY");
      }
    }
  } else {
    actions.push("sync-derived: leave chat credentials untouched");
  }

  const explicitSttEnv = Boolean(envMap.get("STT_OPENAI_BASE_URL")?.trim());
  if (explicitSttEnv) {
    actions.push("preserve explicit STT_OPENAI_BASE_URL");
  } else {
    envMap.set("STT_OPENAI_BASE_URL", baseUrl);
    actions.push("set STT_OPENAI_BASE_URL from Tokfai chat Base URL");
  }

  // Never invent VOICE_TOOLS_OPENAI_KEY — Hermes inherits OPENAI_API_KEY.
  actions.push("rely_on OPENAI_API_KEY inherit for STT auth");

  let cfgWrote = false;
  let nextCfg = cfgText;
  if (cfgText) {
    const result = ensureSttOpenaiBaseUrl(cfgText, baseUrl);
    nextCfg = result.text;
    cfgWrote = result.wrote;
    actions.push(`config.yaml: ${result.reason}`);
  } else if (mode === "connect") {
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
    actions.push("created config.yaml with model+stt");
  } else {
    actions.push("config.yaml missing — skipped yaml inject in sync-derived");
  }

  if (!dryRun) {
    if (existsSync(envPath)) {
      copyFileSync(envPath, `${envPath}.bak-${backupTag}-${Date.now()}`);
    }
    writeFileSync(envPath, serializeEnv(envMap), { mode: 0o600 });
    if (cfgWrote) {
      if (existsSync(cfgPath)) {
        copyFileSync(cfgPath, `${cfgPath}.bak-${backupTag}-${Date.now()}`);
      }
      writeFileSync(cfgPath, nextCfg, { mode: 0o600 });
    }
  }

  return {
    ok: true,
    skipped: false,
    reason: dryRun ? "dry_run" : "applied",
    actions,
    chatBaseUrl: baseUrl,
    chatKeySource: envMap.get("OPENAI_API_KEY") ? "OPENAI_API_KEY" : "none",
    sttBaseUrl: envMap.get("STT_OPENAI_BASE_URL") || null,
    sttKeySource: envMap.get("VOICE_TOOLS_OPENAI_KEY")
      ? "VOICE_TOOLS_OPENAI_KEY"
      : envMap.get("OPENAI_API_KEY")
        ? "OPENAI_API_KEY"
        : "none",
    dryRun,
  };
}
