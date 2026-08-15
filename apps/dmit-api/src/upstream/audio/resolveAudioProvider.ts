/**
 * Resolve STT provider: ADMIN_CHANNEL > ENV_FALLBACK > UNAVAILABLE.
 * Never hard-code a vendor into the route. Never use consumer keys as upstream.
 */

import { env } from "../../env.js";
import { resolveEnabledSttAdminChannel } from "../../routes/adminChannels.js";
import {
  createOpenaiCompatSttAdapter,
  createUnavailableSttAdapter,
} from "./openaiCompatSttAdapter.js";
import { createSelfHostedWhisperAdapter } from "./selfHostedWhisperAdapter.js";
import type { AudioSttProvider, ResolvedAudioSttConfig } from "./types.js";

function parsePrice(raw: string | undefined): number | null {
  if (raw == null || !String(raw).trim()) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/** Live process.env for optional STT vars (boot `env` + runtime fallback tests). */
function sttEnv(name: string): string | undefined {
  const live = process.env[name];
  if (typeof live === "string" && live.trim()) return live.trim();
  const frozen = (env as Record<string, unknown>)[name];
  if (typeof frozen === "string" && frozen.trim()) return frozen.trim();
  return undefined;
}

function resolveEnvSttConfig(): ResolvedAudioSttConfig {
  const providerRaw = String(
    sttEnv("TOKFAI_STT_PROVIDER") ?? "openai_compatible"
  )
    .trim()
    .toLowerCase();
  const baseUrl = sttEnv("TOKFAI_STT_BASE_URL") || null;
  const apiKeyLive = sttEnv("TOKFAI_STT_API_KEY");
  const apiKeySet = Boolean(apiKeyLive);
  const defaultModel = sttEnv("TOKFAI_STT_DEFAULT_MODEL") || "whisper-1";
  const timeoutRaw = sttEnv("TOKFAI_STT_TIMEOUT_MS");
  const timeoutMs = timeoutRaw
    ? Number(timeoutRaw) || 60_000
    : env.TOKFAI_STT_TIMEOUT_MS ?? 60_000;
  const priceCredits = parsePrice(sttEnv("TOKFAI_STT_PRICE_CREDITS"));

  let providerId: ResolvedAudioSttConfig["providerId"] = "unavailable";
  if (providerRaw === "groq_whisper_compatible" || providerRaw === "groq") {
    providerId = "groq_whisper_compatible";
  } else if (
    providerRaw === "grsai_whisper_compatible" ||
    providerRaw === "grsai" ||
    providerRaw === "grsai_whisper"
  ) {
    providerId = "grsai_whisper_compatible";
  } else if (
    providerRaw === "openai_compatible" ||
    providerRaw === "openai" ||
    providerRaw === "openai-compatible"
  ) {
    providerId = "openai_compatible";
  } else if (
    providerRaw === "self_hosted_whisper" ||
    providerRaw === "self_hosted" ||
    providerRaw === "self-hosted-whisper"
  ) {
    providerId = "self_hosted_whisper";
  }

  // Self-hosted worker secret is optional; cloud STT still requires key + base.
  if (providerId === "self_hosted_whisper") {
    if (!baseUrl) providerId = "unavailable";
  } else if (!baseUrl || !apiKeySet) {
    providerId = "unavailable";
  }

  return {
    providerId,
    baseUrl,
    apiKeySet,
    defaultModel,
    /** Env path: client model || default (legacy P1071–P1075). */
    upstreamModel: null,
    timeoutMs,
    priceCredits,
    source: providerId === "unavailable" ? "unavailable" : "env",
    channelId: null,
  };
}

export async function resolveAudioSttConfig(): Promise<ResolvedAudioSttConfig> {
  const admin = await resolveEnabledSttAdminChannel();
  if (admin) {
    const priceCredits = parsePrice(sttEnv("TOKFAI_STT_PRICE_CREDITS"));
    return {
      providerId: admin.providerId,
      baseUrl: admin.baseUrl,
      apiKeySet:
        admin.providerId === "self_hosted_whisper"
          ? Boolean(admin.apiKey?.trim())
          : true,
      /** Public / fallback when client omits model. */
      defaultModel: admin.defaultModel,
      /**
       * Channel-configured upstream model wins over client model.
       * Client model remains Tokfai public contract / intent only.
       */
      upstreamModel: admin.defaultModel,
      timeoutMs: admin.timeoutMs,
      priceCredits,
      source: "admin_channel",
      channelId: admin.id,
    };
  }

  return resolveEnvSttConfig();
}

/**
 * Resolve which model string is sent to the STT upstream.
 * - Admin channel: channel default_model always (do not forward unknown client models).
 * - Env fallback: client model || env default (legacy).
 */
export function resolveSttUpstreamModel(
  clientModel: string | undefined,
  cfg: ResolvedAudioSttConfig
): { clientModel: string; upstreamModel: string } {
  const client =
    (clientModel && clientModel.trim()) || cfg.defaultModel || "whisper-1";
  if (cfg.source === "admin_channel" && cfg.upstreamModel) {
    return { clientModel: client, upstreamModel: cfg.upstreamModel };
  }
  return { clientModel: client, upstreamModel: client };
}

export async function resolveAudioSttProvider(): Promise<AudioSttProvider> {
  const cfg = await resolveAudioSttConfig();
  if (cfg.providerId === "unavailable" || !cfg.baseUrl) {
    return createUnavailableSttAdapter();
  }

  let apiKey = "";
  if (cfg.source === "admin_channel" && cfg.channelId) {
    const admin = await resolveEnabledSttAdminChannel();
    apiKey = admin?.apiKey?.trim() ?? "";
  } else {
    apiKey = sttEnv("TOKFAI_STT_API_KEY") ?? "";
  }

  if (cfg.providerId === "self_hosted_whisper") {
    return createSelfHostedWhisperAdapter({
      baseUrl: cfg.baseUrl,
      apiKey,
    });
  }

  if (!apiKey) {
    return createUnavailableSttAdapter();
  }

  if (
    cfg.providerId === "openai_compatible" ||
    cfg.providerId === "groq_whisper_compatible" ||
    cfg.providerId === "grsai_whisper_compatible"
  ) {
    return createOpenaiCompatSttAdapter({
      providerId: cfg.providerId,
      baseUrl: cfg.baseUrl,
      apiKey,
    });
  }
  return createUnavailableSttAdapter();
}
