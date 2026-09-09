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

/**
 * Extract a top-level YAML mapping section body (lines until next top-level key).
 * @returns {{ start: number, end: number, body: string } | null}
 */
function topLevelSection(yamlText, name) {
  const text = String(yamlText || "");
  const re = new RegExp(`^${name}:\\s*(?:\\n|$)`, "m");
  const m = re.exec(text);
  if (!m) return null;
  const bodyStart = m.index + m[0].length;
  const rest = text.slice(bodyStart);
  const next = rest.search(/\n[a-zA-Z_][a-zA-Z0-9_]*:/);
  const bodyEnd = next < 0 ? text.length : bodyStart + next;
  return { start: m.index, end: bodyEnd, body: text.slice(bodyStart, bodyEnd) };
}

function sectionProvider(body) {
  const pm = String(body || "").match(/^\s*provider:\s*(\S+)/m);
  return pm ? pm[1].replace(/['"]/g, "") : null;
}

function openaiSubBlock(body) {
  const m = String(body || "").match(
    /(^|\n)(  openai:\s*\n)((?:    .*\n)*)/
  );
  if (!m) return null;
  return { full: m[0], lead: m[1], head: m[2], rest: m[3], index: m.index };
}

function injectOpenaiBaseUrlInSection(yamlText, sectionName, baseUrl, defaults) {
  const sec = topLevelSection(yamlText, sectionName);
  if (!sec) {
    const block = [
      "",
      `${sectionName}:`,
      `  provider: openai`,
      `  openai:`,
      ...Object.entries(defaults).map(
        ([k, v]) => `    ${k}: ${typeof v === "string" ? JSON.stringify(v) : v}`
      ),
      `    base_url: ${JSON.stringify(baseUrl)}`,
      "",
    ].join("\n");
    return {
      text: String(yamlText || "").replace(/\s*$/, "") + block,
      wrote: true,
      reason: `appended_${sectionName}_block`,
    };
  }
  const provider = sectionProvider(sec.body);
  if (provider && provider !== "openai") {
    return {
      text: yamlText,
      wrote: false,
      reason: `preserve_${sectionName}_provider_${provider}`,
    };
  }
  const oai = openaiSubBlock(sec.body);
  if (oai && /^\s*base_url:\s*\S+/m.test(oai.rest)) {
    return {
      text: yamlText,
      wrote: false,
      reason: `explicit_${sectionName}_openai_base_url`,
    };
  }
  let newBody;
  if (oai) {
    newBody =
      sec.body.slice(0, oai.index) +
      `${oai.lead}${oai.head}    base_url: ${JSON.stringify(baseUrl)}\n${oai.rest}` +
      sec.body.slice(oai.index + oai.full.length);
  } else {
    const trimmed = sec.body.replace(/\s*$/, "");
    const suffix = [
      "",
      "  openai:",
      ...Object.entries(defaults).map(
        ([k, v]) => `    ${k}: ${typeof v === "string" ? JSON.stringify(v) : v}`
      ),
      `    base_url: ${JSON.stringify(baseUrl)}`,
      "",
    ].join("\n");
    newBody = `${trimmed}${suffix}`;
  }
  const next =
    yamlText.slice(0, sec.start) +
    `${sectionName}:\n${newBody}` +
    yamlText.slice(sec.end);
  return {
    text: next,
    wrote: next !== yamlText,
    reason: oai
      ? `injected_${sectionName}_openai_base_url`
      : `injected_openai_under_${sectionName}`,
  };
}

/**
 * Inject tts.openai.base_url when TTS provider is openai/unset and base absent.
 * Lets Hermes speech hit Tokfai (/v1/audio/speech) instead of api.openai.com.
 */
export function ensureTtsOpenaiBaseUrl(yamlText, baseUrl) {
  return injectOpenaiBaseUrlInSection(yamlText, "tts", baseUrl, {
    model: "tts-1",
    voice: "alloy",
  });
}

/**
 * Inject stt.openai.base_url only when absent and provider is openai/unset.
 */
export function ensureSttOpenaiBaseUrl(yamlText, baseUrl) {
  return injectOpenaiBaseUrlInSection(yamlText, "stt", baseUrl, {
    model: "whisper-1",
  });
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
    const sttResult = ensureSttOpenaiBaseUrl(cfgText, baseUrl);
    nextCfg = sttResult.text;
    cfgWrote = sttResult.wrote;
    actions.push(`config.yaml stt: ${sttResult.reason}`);
    const ttsResult = ensureTtsOpenaiBaseUrl(nextCfg, baseUrl);
    nextCfg = ttsResult.text;
    cfgWrote = cfgWrote || ttsResult.wrote;
    actions.push(`config.yaml tts: ${ttsResult.reason}`);
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
