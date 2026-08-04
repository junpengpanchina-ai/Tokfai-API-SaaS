/**
 * P1017/P1020 — Provider-aware Tool Calling mode registry.
 *
 * Authority key: (providerId, upstreamModelId) — never client alias alone.
 * Alias chains (auto-pro / gpt-5-pro / …) resolve attempts first, then look up
 * each attempt × provider independently.
 *
 * GPT (gpt-5.5 / gpt-5.4): prefer native tool calling on GRSAI / secondary.
 * Gemini: default emulated_json unless a row is explicitly LIVE-verified native.
 *
 * Does not import providers/env so offline unit tests can load this module.
 */

import { normalizeClientModelId } from "../upstream/modelAliases.js";
import { isImageModel } from "../capabilities/modelCapabilityPolicy.js";

export type ToolCallingMode = "native" | "emulated_json" | "unsupported";

/**
 * GPT family — prefer native OpenAI tools/tool_choice on current proxies.
 * Controlled emulated_json repair is allowed once when native yields no
 * tool_calls under strict/required (see executeChatCompletion).
 * P1028 — under tool_choice=auto, one controlled emulated_json intent
 * arbitration is allowed when native yields plain text (safe-fallback).
 */
const GRSAI_NATIVE_MODELS = ["gpt-5.5", "gpt-5.4"] as const;

/**
 * Gemini family — emulated JSON intent (no reliance on upstream tools field)
 * until a registry row is explicitly marked LIVE-verified native.
 */
const GRSAI_EMULATED_MODELS = [
  "gemini-2.5-flash",
  "gemini-3-flash",
  "gemini-3-pro",
] as const;

/** All models with any tool-calling support on GRSAI-class providers. */
const GRSAI_TOOL_CAPABLE_MODELS = [
  ...GRSAI_NATIVE_MODELS,
  ...GRSAI_EMULATED_MODELS,
] as const;

/**
 * Explicit LIVE-verified native overrides.
 * Empty by default — Gemini stays emulated until proven.
 * Key format matches registryKey(providerId, upstreamModelId).
 */
const LIVE_VERIFIED_NATIVE = new Set<string>([
  // Example (disabled until LIVE): "grsai-primary::gemini-3-pro",
]);

/**
 * Static capability table. Unlisted combinations default to unsupported.
 * Future slots (openai-official / azure-openai / future-official-agent /
 * hermes-official) are reserved as native defaults when those providers exist.
 */
const MODE_TABLE: ReadonlyMap<string, ToolCallingMode> = (() => {
  const m = new Map<string, ToolCallingMode>();
  const key = (providerId: string, modelId: string) =>
    `${providerId}::${normalizeClientModelId(modelId)}`;

  for (const model of GRSAI_NATIVE_MODELS) {
    m.set(key("grsai-primary", model), "native");
    m.set(key("openai-compatible-secondary", model), "native");
    m.set(key("openai-official", model), "native");
    m.set(key("azure-openai", model), "native");
    m.set(key("future-official-agent", model), "native");
    m.set(key("hermes-official", model), "native");
  }

  for (const model of GRSAI_EMULATED_MODELS) {
    const kPrimary = key("grsai-primary", model);
    const kSecondary = key("openai-compatible-secondary", model);
    m.set(
      kPrimary,
      LIVE_VERIFIED_NATIVE.has(kPrimary) ? "native" : "emulated_json"
    );
    m.set(
      kSecondary,
      LIVE_VERIFIED_NATIVE.has(kSecondary) ? "native" : "emulated_json"
    );
    // Reserved future official slots — native when those providers exist.
    m.set(key("openai-official", model), "native");
    m.set(key("azure-openai", model), "native");
    m.set(key("future-official-agent", model), "native");
    m.set(key("hermes-official", model), "native");
  }

  return m;
})();

function registryKey(providerId: string, upstreamModelId: string): string {
  return `${providerId}::${normalizeClientModelId(upstreamModelId)}`;
}

function isBlockedImageModel(model: string): boolean {
  return (
    isImageModel(model) ||
    model.startsWith("gpt-image") ||
    model.includes("nano-banana")
  );
}

/** Resolve mode for a concrete provider × upstream model pair. */
export function resolveToolCallingMode(
  providerId: string,
  upstreamModelId: string
): ToolCallingMode {
  const model = normalizeClientModelId(upstreamModelId);
  if (!model || !providerId) return "unsupported";
  if (isBlockedImageModel(model)) return "unsupported";
  const k = registryKey(providerId, model);
  if (LIVE_VERIFIED_NATIVE.has(k)) return "native";
  return MODE_TABLE.get(k) ?? "unsupported";
}

/**
 * Whether a native attempt may do one controlled emulated_json repair when
 * upstream returned no usable tool_calls under strict/required.
 */
export function canNativeEmulatedRepair(
  providerId: string,
  upstreamModelId: string
): boolean {
  return resolveToolCallingMode(providerId, upstreamModelId) === "native";
}

/** True when any registry row offers native or emulated_json for this model. */
export function modelHasToolCallingSupport(upstreamModelId: string): boolean {
  const model = normalizeClientModelId(upstreamModelId);
  if (!model || isBlockedImageModel(model)) return false;
  const suffix = `::${model}`;
  for (const [key, mode] of MODE_TABLE) {
    if (
      key.endsWith(suffix) &&
      (mode === "native" || mode === "emulated_json")
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Best mode among registry rows for a concrete upstream model.
 * Preference: native > emulated_json > unsupported.
 * (Enabled-provider filtering happens at attempt time via resolveToolCallingMode.)
 */
export function bestToolCallingModeForModel(
  upstreamModelId: string
): ToolCallingMode {
  const model = normalizeClientModelId(upstreamModelId);
  if (!model || isBlockedImageModel(model)) return "unsupported";
  let best: ToolCallingMode = "unsupported";
  const suffix = `::${model}`;
  for (const [key, mode] of MODE_TABLE) {
    if (!key.endsWith(suffix)) continue;
    if (mode === "native") return "native";
    if (mode === "emulated_json") best = "emulated_json";
  }
  return best;
}

/** Reorder/filter attempt chain to models with tool support. */
export function resolveToolCallingAttempts(args: {
  requestedModel: string;
  attempts: string[];
  /**
   * When false, do not inject GRSAI_TOOL_CAPABLE_MODELS after an empty filter.
   * Used for alias gates (auto-pro / gpt-5-pro): only concrete chain members
   * count — avoids pretending unsupported alias attempts are capable.
   */
  allowGlobalFallback?: boolean;
}): {
  attempts: string[];
  supportsTools: boolean;
  fallbackApplied: boolean;
} | null {
  const filtered = args.attempts.filter((id) => modelHasToolCallingSupport(id));
  if (filtered.length > 0) {
    // P1027 — fallbackApplied only when the concrete attempt chain actually
    // changes (reorder / drop). Alias ids (e.g. gpt-5) are not themselves in
    // the registry; using the first capable member of the planned chain is
    // NOT a tools fallback.
    return {
      attempts: filtered,
      supportsTools: true,
      fallbackApplied: filtered[0] !== args.attempts[0],
    };
  }

  if (args.allowGlobalFallback === false) {
    return null;
  }

  const fallbacks = GRSAI_TOOL_CAPABLE_MODELS.filter((id) =>
    modelHasToolCallingSupport(id)
  );
  if (fallbacks.length > 0) {
    return {
      attempts: [...fallbacks],
      supportsTools: true,
      fallbackApplied: true,
    };
  }
  return null;
}

export function listRegistryEmulatedModels(): readonly string[] {
  return GRSAI_EMULATED_MODELS;
}

export function listRegistryNativeModels(): readonly string[] {
  return GRSAI_NATIVE_MODELS;
}

export function listRegistryToolCapableModels(): readonly string[] {
  return GRSAI_TOOL_CAPABLE_MODELS;
}
