/**
 * Resolve TTS provider from TOKFAI_TTS_* only.
 * Never uses GRSAI chat key, OpenAI official key, or consumer Tokfai keys.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { env } from "../../env.js";
import {
  createOpenaiCompatTtsAdapter,
  createUnavailableTtsAdapter,
} from "./openaiCompatTtsAdapter.js";
import type { AudioTtsProvider, ResolvedAudioTtsConfig } from "./types.js";

/** Cached .env fallback — PM2 dump may inject empty TOKFAI_TTS_* and block --env-file. */
let dotEnvCache: Map<string, string> | null = null;

function loadDotEnvFallback(): Map<string, string> {
  if (dotEnvCache) return dotEnvCache;
  const map = new Map<string, string>();
  try {
    const text = readFileSync(join(process.cwd(), ".env"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      let v = line.slice(i + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (k.startsWith("TOKFAI_TTS_") && v) map.set(k, v);
    }
  } catch {
    // no .env / unreadable — ignore
  }
  dotEnvCache = map;
  return map;
}

function ttsEnv(name: string): string | undefined {
  const live = process.env[name];
  // Treat whitespace-only as unset (PM2 dump empty strings block --env-file).
  if (typeof live === "string" && live.trim()) return live.trim();
  const frozen = (env as Record<string, unknown>)[name];
  if (typeof frozen === "string" && frozen.trim()) return frozen.trim();
  if (name.startsWith("TOKFAI_TTS_")) {
    const fromFile = loadDotEnvFallback().get(name);
    if (fromFile) return fromFile;
  }
  return undefined;
}

export function resolveAudioTtsConfig(): ResolvedAudioTtsConfig {
  const providerRaw = String(ttsEnv("TOKFAI_TTS_PROVIDER") ?? "")
    .trim()
    .toLowerCase();
  const baseUrl = ttsEnv("TOKFAI_TTS_BASE_URL") || null;
  const apiKeyLive = ttsEnv("TOKFAI_TTS_API_KEY");
  const apiKeySet = Boolean(apiKeyLive);
  const defaultModel = ttsEnv("TOKFAI_TTS_DEFAULT_MODEL") || "tts-1";
  const defaultVoice = ttsEnv("TOKFAI_TTS_DEFAULT_VOICE") || "alloy";
  const timeoutRaw = ttsEnv("TOKFAI_TTS_TIMEOUT_MS");
  const timeoutMs = timeoutRaw
    ? Number(timeoutRaw) || 60_000
    : env.TOKFAI_TTS_TIMEOUT_MS ?? 60_000;

  let providerId: ResolvedAudioTtsConfig["providerId"] = "unavailable";
  if (
    providerRaw === "openai_compatible" ||
    providerRaw === "openai" ||
    providerRaw === "openai-compatible"
  ) {
    providerId = "openai_compatible";
  }

  if (!baseUrl || !apiKeySet) {
    providerId = "unavailable";
  }

  return {
    providerId,
    baseUrl,
    apiKeySet,
    defaultModel,
    defaultVoice,
    timeoutMs,
    source: providerId === "unavailable" ? "unavailable" : "env",
  };
}

export function resolveAudioTtsProvider(): AudioTtsProvider {
  const cfg = resolveAudioTtsConfig();
  if (cfg.providerId === "unavailable" || !cfg.baseUrl) {
    return createUnavailableTtsAdapter();
  }
  const apiKey = ttsEnv("TOKFAI_TTS_API_KEY") ?? "";
  if (!apiKey) {
    return createUnavailableTtsAdapter();
  }
  // Never allow chat GRSAI / OpenAI official keys to masquerade as TTS upstream.
  const grsaiChatKey =
    (typeof process.env.GRSAI_API_KEY === "string" &&
    process.env.GRSAI_API_KEY.trim()
      ? process.env.GRSAI_API_KEY.trim()
      : undefined) ??
    env.GRSAI_API_KEY ??
    "";
  if (grsaiChatKey && apiKey === grsaiChatKey) {
    return createUnavailableTtsAdapter();
  }
  if (cfg.providerId === "openai_compatible") {
    return createOpenaiCompatTtsAdapter({
      baseUrl: cfg.baseUrl,
      apiKey,
    });
  }
  return createUnavailableTtsAdapter();
}
