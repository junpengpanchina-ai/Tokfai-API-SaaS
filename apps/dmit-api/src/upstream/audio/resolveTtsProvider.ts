/**
 * Resolve TTS provider from TOKFAI_TTS_* only.
 * Never uses GRSAI chat key, OpenAI official key, or consumer Tokfai keys.
 */

import { env } from "../../env.js";
import {
  createOpenaiCompatTtsAdapter,
  createUnavailableTtsAdapter,
} from "./openaiCompatTtsAdapter.js";
import type { AudioTtsProvider, ResolvedAudioTtsConfig } from "./types.js";

function ttsEnv(name: string): string | undefined {
  const live = process.env[name];
  if (typeof live === "string" && live.trim()) return live.trim();
  const frozen = (env as Record<string, unknown>)[name];
  if (typeof frozen === "string" && frozen.trim()) return frozen.trim();
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
  if (cfg.providerId === "openai_compatible") {
    return createOpenaiCompatTtsAdapter({
      baseUrl: cfg.baseUrl,
      apiKey,
    });
  }
  return createUnavailableTtsAdapter();
}
