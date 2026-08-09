/**
 * Resolve STT provider from env — never hard-code a vendor into the route.
 */

import { env } from "../../env.js";
import {
  createOpenaiCompatSttAdapter,
  createUnavailableSttAdapter,
} from "./openaiCompatSttAdapter.js";
import type { AudioSttProvider, ResolvedAudioSttConfig } from "./types.js";

function parsePrice(raw: string | undefined): number | null {
  if (raw == null || !String(raw).trim()) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function resolveAudioSttConfig(): ResolvedAudioSttConfig {
  const providerRaw = String(env.TOKFAI_STT_PROVIDER ?? "openai_compatible")
    .trim()
    .toLowerCase();
  const baseUrl = (env.TOKFAI_STT_BASE_URL ?? "").trim() || null;
  const apiKeySet = Boolean((env.TOKFAI_STT_API_KEY ?? "").trim());
  const defaultModel =
    (env.TOKFAI_STT_DEFAULT_MODEL ?? "").trim() || "whisper-1";
  const timeoutMs = env.TOKFAI_STT_TIMEOUT_MS ?? 60_000;
  const priceCredits = parsePrice(env.TOKFAI_STT_PRICE_CREDITS);

  let providerId: ResolvedAudioSttConfig["providerId"] = "unavailable";
  if (providerRaw === "groq_whisper_compatible" || providerRaw === "groq") {
    providerId = "groq_whisper_compatible";
  } else if (
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
    priceCredits,
  };
}

export function resolveAudioSttProvider(): AudioSttProvider {
  const cfg = resolveAudioSttConfig();
  if (cfg.providerId === "unavailable" || !cfg.baseUrl) {
    return createUnavailableSttAdapter();
  }
  const apiKey = (env.TOKFAI_STT_API_KEY ?? "").trim();
  if (
    cfg.providerId === "openai_compatible" ||
    cfg.providerId === "groq_whisper_compatible"
  ) {
    return createOpenaiCompatSttAdapter({
      providerId: cfg.providerId,
      baseUrl: cfg.baseUrl,
      apiKey,
    });
  }
  return createUnavailableSttAdapter();
}
