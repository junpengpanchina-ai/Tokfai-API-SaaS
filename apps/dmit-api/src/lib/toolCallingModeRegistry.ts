/**
 * P1017 — Provider-aware Tool Calling mode registry.
 *
 * Authority key: (providerId, upstreamModelId) — never client alias alone.
 * Alias chains (auto-pro / gpt-5-pro / …) resolve attempts first, then look up
 * each attempt × provider independently.
 *
 * Does not import providers/env so offline unit tests can load this module.
 */

import { normalizeClientModelId } from "../upstream/modelAliases.js";
import { isImageModel } from "../capabilities/modelCapabilityPolicy.js";

export type ToolCallingMode = "native" | "emulated_json" | "unsupported";

/** Models with confirmed/intended emulated JSON support on GRSAI primary. */
const GRSAI_EMULATED_MODELS = [
  "gpt-5.5",
  "gpt-5.4",
  "gemini-2.5-flash",
  "gemini-3-flash",
  "gemini-3-pro",
] as const;

/**
 * Static capability table. Unlisted combinations default to unsupported.
 * Future slots (openai-official / azure-openai / future-official-agent) are
 * reserved as native defaults when those providers are enabled.
 */
const MODE_TABLE: ReadonlyMap<string, ToolCallingMode> = (() => {
  const m = new Map<string, ToolCallingMode>();
  const key = (providerId: string, modelId: string) =>
    `${providerId}::${normalizeClientModelId(modelId)}`;

  for (const model of GRSAI_EMULATED_MODELS) {
    m.set(key("grsai-primary", model), "emulated_json");
    // Secondary OpenAI-compatible proxy: same models emulated until LIVE-proven native.
    m.set(key("openai-compatible-secondary", model), "emulated_json");
    // Reserved future official slots — native when those providers exist.
    m.set(key("openai-official", model), "native");
    m.set(key("azure-openai", model), "native");
    m.set(key("future-official-agent", model), "native");
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
  return MODE_TABLE.get(registryKey(providerId, model)) ?? "unsupported";
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
}): {
  attempts: string[];
  supportsTools: boolean;
  fallbackApplied: boolean;
} | null {
  const filtered = args.attempts.filter((id) => modelHasToolCallingSupport(id));
  if (filtered.length > 0) {
    const supportsRequested = modelHasToolCallingSupport(args.requestedModel);
    return {
      attempts: filtered,
      supportsTools: true,
      fallbackApplied:
        !supportsRequested || filtered[0] !== args.attempts[0],
    };
  }

  const fallbacks = GRSAI_EMULATED_MODELS.filter((id) =>
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
