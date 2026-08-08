/**
 * P1059 — Explicit GPT/Gemini model → transparent model gateway.
 *
 * When the client names a concrete gpt-* / gemini-* model (not a smart
 * auto-* router alias), Tokfai must not start Agent orchestration rounds
 * inside one HTTP request. Cursor remains the Agent Runtime.
 *
 * Pure predicate only: no prompt text, no Search/Read/Write cues, no
 * task-completeness inference.
 */

import { normalizeClientModelId } from "../upstream/modelAliases.js";
import {
  listRegistryEmulatedModels,
  listRegistryNativeModels,
  listRegistryToolCapableModels,
} from "./toolCallingModeRegistry.js";

/** Smart routing aliases — keep historical P1048/P1049/P1055 behavior. */
const SMART_AUTO_ROUTING_ALIASES = new Set([
  "auto-pro",
  "auto-fast",
  "auto-cheap",
]);

function registryExplicitGptGeminiIds(): ReadonlySet<string> {
  const out = new Set<string>();
  for (const id of [
    ...listRegistryNativeModels(),
    ...listRegistryEmulatedModels(),
    ...listRegistryToolCapableModels(),
  ]) {
    const n = normalizeClientModelId(id);
    if (n.startsWith("gpt-") || n.startsWith("gemini-")) out.add(n);
  }
  // Documented concrete ids that may appear before registry rows exist.
  for (const id of [
    "gpt-5.5",
    "gpt-5.4",
    "gpt-5.1",
    "gemini-3-pro",
    "gemini-3-flash",
    "gemini-2.5-flash",
    "gemini-2.5-pro",
  ]) {
    out.add(id);
  }
  return out;
}

const REGISTRY_EXPLICIT_IDS = registryExplicitGptGeminiIds();

/** True when id is a gpt-* or gemini-* family key (after normalize). */
export function isGptOrGeminiFamilyModelId(modelId: string): boolean {
  const n = normalizeClientModelId(modelId);
  if (!n) return false;
  return n.startsWith("gpt-") || n.startsWith("gemini-");
}

/**
 * Request-scoped gate: explicit provider model → transparent gateway.
 *
 * Inputs must already be resolved (requested / canonical / attempt). Never
 * inspects user prompt or tool-execution keywords.
 */
export function isTransparentExplicitModelRequest(args: {
  requestedModel: string;
  resolvedModel: string;
  /** Canonical id after CLIENT_MODEL_REWRITES (optional). */
  canonicalId?: string;
  isAlias?: boolean;
}): boolean {
  const requested = normalizeClientModelId(args.requestedModel);
  const resolved = normalizeClientModelId(args.resolvedModel);
  const canonical = normalizeClientModelId(
    args.canonicalId ?? args.resolvedModel
  );

  if (
    SMART_AUTO_ROUTING_ALIASES.has(requested) ||
    SMART_AUTO_ROUTING_ALIASES.has(canonical) ||
    SMART_AUTO_ROUTING_ALIASES.has(resolved)
  ) {
    return false;
  }

  // Quality aliases like gpt-5-pro / gpt-5 still name a GPT/Gemini family —
  // treat as explicit transparent (not smart auto routers).
  void args.isAlias;
  const candidates = [requested, resolved, canonical].filter(Boolean);
  for (const id of candidates) {
    if (SMART_AUTO_ROUTING_ALIASES.has(id)) return false;
    if (REGISTRY_EXPLICIT_IDS.has(id)) return true;
    if (isGptOrGeminiFamilyModelId(id)) return true;
  }

  return false;
}
