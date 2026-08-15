/**
 * STT provider capability metadata (P1107).
 *
 * GrsAI openai-completions docs currently cover chat + image only.
 * P1105/P1106 real-channel matrix found no working audio/transcriptions path.
 * Do not treat a GrsAI chat /v1 base as a confirmed STT endpoint.
 */

import type { AudioSttProviderId } from "./types.js";

export const GRSAI_STT_ENDPOINT_UNKNOWN_MESSAGE =
  "GrsAI STT endpoint is not documented/confirmed. Chat completions base URL cannot be used for audio transcription.";

export type SttProviderCapabilityMeta = {
  providerId: AudioSttProviderId | string;
  /** True when the Whisper-compatible STT URL shape is known/confirmed. */
  sttEndpointKnown: boolean;
  /** True when STT support is experimental / unverified against upstream docs. */
  experimental: boolean;
};

function normalizeBase(url: string): string {
  return String(url || "")
    .trim()
    .replace(/\/+$/, "");
}

/**
 * Ops override: only when explicitly affirmed AND the channel base matches
 * the confirmed STT base. Chat completions hosts must not pass by default.
 *
 *   TOKFAI_GRSAI_STT_ENDPOINT_CONFIRMED=1
 *   TOKFAI_GRSAI_STT_CONFIRMED_BASE_URL=https://example.com/v1
 */
export function isGrsaiSttEndpointConfirmed(baseUrl: string): boolean {
  if (
    String(process.env.TOKFAI_GRSAI_STT_ENDPOINT_CONFIRMED || "").trim() !== "1"
  ) {
    return false;
  }
  const confirmed = normalizeBase(
    process.env.TOKFAI_GRSAI_STT_CONFIRMED_BASE_URL || ""
  );
  if (!confirmed) return false;
  const base = normalizeBase(baseUrl);
  if (!base) return false;
  return base.toLowerCase() === confirmed.toLowerCase();
}

export function getSttProviderCapability(
  provider: string,
  opts?: { baseUrl?: string | null }
): SttProviderCapabilityMeta {
  const p = String(provider || "")
    .trim()
    .toLowerCase();

  if (p === "groq_whisper_compatible" || p === "groq") {
    return {
      providerId: "groq_whisper_compatible",
      sttEndpointKnown: true,
      experimental: false,
    };
  }
  if (p === "self_hosted_whisper") {
    return {
      providerId: "self_hosted_whisper",
      sttEndpointKnown: true,
      experimental: false,
    };
  }
  if (p === "openai_compatible") {
    return {
      providerId: "openai_compatible",
      sttEndpointKnown: true,
      experimental: false,
    };
  }
  if (p === "grsai_whisper_compatible" || p === "grsai") {
    const confirmed = isGrsaiSttEndpointConfirmed(opts?.baseUrl ?? "");
    return {
      providerId: "grsai_whisper_compatible",
      sttEndpointKnown: confirmed,
      experimental: !confirmed,
    };
  }
  return {
    providerId: (p || "unavailable") as AudioSttProviderId,
    sttEndpointKnown: false,
    experimental: true,
  };
}
