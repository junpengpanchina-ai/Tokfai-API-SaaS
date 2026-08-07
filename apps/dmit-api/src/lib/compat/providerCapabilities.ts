/**
 * P1050 — Descriptive provider capability registry (compatibility seam only).
 *
 * Does NOT change model selection, auto-pro routing, or GPT provider attempt
 * order. Existing authorities remain:
 * - apps/dmit-api/src/upstream/providers.ts (UpstreamProvider / resolveProviderAttempts)
 * - apps/dmit-api/src/lib/toolCallingModeRegistry.ts (resolveToolCallingMode)
 */

import type { ProtocolFamily, ProviderFamily } from "./canonicalAgentTypes.js";

export type ProviderCapabilityFlags = {
  supportsNativeTools: boolean;
  supportsParallelTools: boolean;
  supportsStreaming: boolean;
  supportsNativeToolChoice: boolean;
  supportsReasoning: boolean;
  supportsVision: boolean;
  /**
   * P1053 — Canonical OpenAI tool-transcript resume via a registered provider
   * adapter (e.g. Gemini P1051). Does not mean native OpenAI role=tool ingest.
   * Native OpenAI resume semantics remain supportsNativeTools + live native mode.
   */
  supportsCanonicalToolResumeViaAdapter: boolean;
};

export type ProviderCapabilityProfile = ProviderCapabilityFlags & {
  /** Stable registry key (e.g. grsai-primary, gemini-api). */
  id: string;
  providerFamily: ProviderFamily;
  protocolFamily: ProtocolFamily;
};

/**
 * Static descriptive profiles. Lookup failures return a safe unknown profile
 * (all false) — never throws, never rewrites routing.
 */
const PROFILES: ReadonlyMap<string, ProviderCapabilityProfile> = new Map([
  [
    "grsai-primary",
    {
      id: "grsai-primary",
      providerFamily: "openai_compatible",
      protocolFamily: "openai_chat_completions",
      supportsNativeTools: true,
      supportsParallelTools: true,
      supportsStreaming: true,
      supportsNativeToolChoice: true,
      supportsReasoning: false,
      supportsVision: true,
      supportsCanonicalToolResumeViaAdapter: false,
    },
  ],
  [
    "openai-compatible-secondary",
    {
      id: "openai-compatible-secondary",
      providerFamily: "openai_compatible",
      protocolFamily: "openai_chat_completions",
      supportsNativeTools: true,
      supportsParallelTools: true,
      supportsStreaming: true,
      supportsNativeToolChoice: true,
      supportsReasoning: false,
      supportsVision: true,
      supportsCanonicalToolResumeViaAdapter: false,
    },
  ],
  [
    "openai-official",
    {
      id: "openai-official",
      providerFamily: "openai",
      protocolFamily: "openai_chat_completions",
      supportsNativeTools: true,
      supportsParallelTools: true,
      supportsStreaming: true,
      supportsNativeToolChoice: true,
      supportsReasoning: true,
      supportsVision: true,
      supportsCanonicalToolResumeViaAdapter: false,
    },
  ],
  [
    "gemini-api",
    {
      id: "gemini-api",
      providerFamily: "gemini",
      protocolFamily: "gemini_generate_content",
      supportsNativeTools: true,
      supportsParallelTools: true,
      supportsStreaming: true,
      supportsNativeToolChoice: false,
      supportsReasoning: false,
      supportsVision: true,
      supportsCanonicalToolResumeViaAdapter: true,
    },
  ],
  [
    "anthropic-messages",
    {
      id: "anthropic-messages",
      providerFamily: "anthropic",
      protocolFamily: "anthropic_messages",
      supportsNativeTools: true,
      supportsParallelTools: true,
      supportsStreaming: true,
      supportsNativeToolChoice: true,
      supportsReasoning: true,
      supportsVision: true,
      supportsCanonicalToolResumeViaAdapter: false,
    },
  ],
]);

const UNKNOWN_PROFILE: ProviderCapabilityProfile = {
  id: "unknown",
  providerFamily: "unknown",
  protocolFamily: "unknown",
  supportsNativeTools: false,
  supportsParallelTools: false,
  supportsStreaming: false,
  supportsNativeToolChoice: false,
  supportsReasoning: false,
  supportsVision: false,
  supportsCanonicalToolResumeViaAdapter: false,
};

/** Lookup by provider id. Unknown → safe all-false profile (no throw). */
export function getProviderCapabilityProfile(
  providerId: string
): ProviderCapabilityProfile {
  const id = typeof providerId === "string" ? providerId.trim() : "";
  if (!id) return { ...UNKNOWN_PROFILE };
  return PROFILES.get(id) ?? { ...UNKNOWN_PROFILE, id };
}

/** List known descriptive profiles (copy). Does not include runtime env state. */
export function listProviderCapabilityProfiles(): ProviderCapabilityProfile[] {
  return [...PROFILES.values()].map((p) => ({ ...p }));
}
