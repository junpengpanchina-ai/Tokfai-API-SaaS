/**
 * P970/P971/P974 — OpenAI-compatible tools / tool_choice capability +
 * verified tool-capable registry / routing guard.
 *
 * Kept in lib/ (not capabilities/) so hot-deploys stay writable on prod.
 * Does not touch image billing / P961 reconcile.
 */

import { env } from "../env.js";
import { normalizeClientModelId } from "../upstream/modelAliases.js";
import { isImageModel } from "../capabilities/modelCapabilityPolicy.js";
import {
  modelHasToolCallingSupport,
  resolveToolCallingAttempts,
  type ToolCallingMode,
} from "./toolCallingModeRegistry.js";

export {
  resolveToolCallingMode,
  modelHasToolCallingSupport,
  bestToolCallingModeForModel,
  resolveToolCallingAttempts,
  canNativeEmulatedRepair,
  listRegistryNativeModels,
  listRegistryEmulatedModels,
  listRegistryToolCapableModels,
  type ToolCallingMode,
} from "./toolCallingModeRegistry.js";

export const MODEL_NOT_TOOL_CAPABLE_CODE = "model_not_tool_capable" as const;
export const ALL_TOOL_UPSTREAMS_UNAVAILABLE_CODE =
  "all_tool_upstreams_unavailable" as const;
export const TOOL_CALL_NOT_SUPPORTED_CODE = "tool_call_not_supported" as const;
/** P971 — strict tools request got plain content instead of tool_calls. */
export const TOOL_CALL_NOT_GENERATED_CODE = "tool_call_not_generated" as const;
export const PROVIDER_TOOL_CALL_NOT_SUPPORTED_CODE =
  "provider_tool_call_not_supported" as const;

export const MODEL_NOT_TOOL_CAPABLE_MESSAGE =
  "This model is not verified for tool calling on Tokfai. Choose a verified tool-capable model or remove tool_choice.";

/** Preferred concrete models when falling back among tool-capable models. */
export const TOOLS_CAPABLE_FALLBACK_MODELS = [
  "gpt-5.5",
  "gpt-5.4",
  "gemini-2.5-flash",
  "gemini-3-flash",
  "gemini-3-pro",
] as const;

/** P974 — catalog tools is boolean only (true iff LIVE-verified whitelist). */
export type ToolsCapabilityMark = boolean;

export type ModelCapabilityFlags = {
  chat: boolean;
  stream: boolean;
  tools: ToolsCapabilityMark;
  image: boolean;
  coding: boolean;
};

/** Parse VERIFIED_TOOLS_CAPABLE_MODEL_IDS (comma / semicolon / whitespace). */
export function parseVerifiedToolsCapableModelIds(
  raw: string | undefined | null = env.VERIFIED_TOOLS_CAPABLE_MODEL_IDS
): Set<string> {
  const out = new Set<string>();
  if (typeof raw !== "string" || !raw.trim()) return out;
  for (const part of raw.split(/[,;\s]+/)) {
    const id = normalizeClientModelId(part.trim());
    if (id) out.add(id);
  }
  return out;
}

/**
 * P974/P1017 — tool-capable when registry has native|emulated for the model,
 * or (legacy) when listed in VERIFIED_TOOLS_CAPABLE_MODEL_IDS.
 * auto-fast / auto-pro are false unless their concrete attempts are capable.
 */
export function isVerifiedToolCapableModel(modelId: string): boolean {
  const m = normalizeClientModelId(modelId);
  if (!m) return false;
  if (isImageModel(m) || m.startsWith("gpt-image") || m.includes("nano-banana")) {
    return false;
  }
  if (modelHasToolCallingSupport(m)) return true;
  return parseVerifiedToolsCapableModelIds().has(m);
}

/** True when the client sent a non-empty tools array (Cursor Agent signal). */
export function requestHasNonEmptyTools(body: unknown): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const tools = (body as Record<string, unknown>).tools;
  return Array.isArray(tools) && tools.length > 0;
}

/**
 * P1027 — missing / null tool_choice with tools present ≡ OpenAI "auto".
 * Never treat null/undefined as "tools not requested".
 */
export function effectiveToolChoice(body: unknown): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body)) return undefined;
  const choice = (body as Record<string, unknown>).tool_choice;
  if (choice === undefined || choice === null) {
    return requestHasNonEmptyTools(body) ? "auto" : undefined;
  }
  return choice;
}

export function requestHasTools(body: unknown): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const record = body as Record<string, unknown>;
  if (requestHasNonEmptyTools(record)) return true;
  if (record.tool_choice != null && record.tool_choice !== "none") return true;
  return false;
}

export function toolChoiceSummary(body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const choice = (body as Record<string, unknown>).tool_choice;
  if (choice == null) return null;
  if (typeof choice === "string") return choice;
  if (typeof choice === "object") {
    try {
      return JSON.stringify(choice).slice(0, 120);
    } catch {
      return "object";
    }
  }
  return String(choice);
}

/** Client opt-in: tokfai.require_tool_call=true forces strict mode even for auto. */
export function clientRequiresToolCall(body: unknown): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const record = body as Record<string, unknown>;
  const tokfai = record.tokfai;
  if (tokfai && typeof tokfai === "object" && !Array.isArray(tokfai)) {
    const flag = (tokfai as Record<string, unknown>).require_tool_call;
    if (flag === true || flag === "true" || flag === 1) return true;
  }
  const top = record.require_tool_call;
  return top === true || top === "true" || top === 1;
}

/**
 * Strict tool-call: must receive real tool_calls or fail not_billable.
 * - tool_choice is a concrete function object
 * - tool_choice === "required"
 * - tokfai.require_tool_call === true
 */
export function isStrictToolCallRequest(body: unknown): boolean {
  if (!requestHasTools(body)) return false;
  if (clientRequiresToolCall(body)) return true;
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const choice = (body as Record<string, unknown>).tool_choice;
  if (choice === "required") return true;
  if (choice && typeof choice === "object" && !Array.isArray(choice)) {
    const row = choice as Record<string, unknown>;
    if (row.type === "function") return true;
    if (row.function && typeof row.function === "object") return true;
    if (typeof row.name === "string" && row.name.trim()) return true;
  }
  return false;
}

export function responseHasToolCalls(data: unknown): boolean {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const choices = (data as Record<string, unknown>).choices;
  if (!Array.isArray(choices) || choices.length === 0) return false;
  const first = choices[0];
  if (!first || typeof first !== "object" || Array.isArray(first)) return false;
  const message = (first as Record<string, unknown>).message;
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return false;
  }
  const toolCalls = (message as Record<string, unknown>).tool_calls;
  return Array.isArray(toolCalls) && toolCalls.length > 0;
}

export function extractResponseFinishReason(data: unknown): string | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const choices = (data as Record<string, unknown>).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") {
    return null;
  }
  const reason = (choices[0] as Record<string, unknown>).finish_reason;
  return typeof reason === "string" && reason.trim() ? reason.trim() : null;
}

/**
 * P1028 — finish reasons that count as ordinary text completion (not tool /
 * length / filter). Missing / empty is treated as stop-equivalent.
 */
export function isPlainTextCompletionFinishReason(
  finishReason: string | null | undefined
): boolean {
  if (finishReason == null || finishReason === "") return true;
  const r = finishReason.trim().toLowerCase();
  return r === "stop" || r === "end_turn" || r === "stop_sequence";
}

/**
 * P1028 — Whether effective tool_choice is OpenAI "auto" (including null /
 * undefined with tools present, already normalized by effectiveToolChoice).
 * Pure boolean; no provider / model names.
 */
export function isAutoEffectiveToolChoice(choice: unknown): boolean {
  return choice === "auto" || choice === null || choice === undefined;
}

/**
 * P1028 — AUTO NO-TOOL INTENT ARBITRATION gate.
 *
 * When native returns ordinary text under client auto tools, allow at most one
 * controlled emulated_json intent arbitration instead of accepting text
 * immediately. Provider-agnostic: no providerId / model hardcodes.
 */
export function shouldAttemptAutoToolIntentArbitration(args: {
  hasTools: boolean;
  supportsToolsRequested: boolean;
  effectiveToolChoice: unknown;
  activeToolMode: ToolCallingMode | string;
  upstreamReturnedToolCalls: boolean;
  finishReason: string | null | undefined;
  autoIntentArbitrationAttempted: boolean;
  freshRemainingTotalMs: number;
}): boolean {
  if (!args.hasTools) return false;
  if (!args.supportsToolsRequested) return false;
  if (!isAutoEffectiveToolChoice(args.effectiveToolChoice)) return false;
  if (args.activeToolMode !== "native") return false;
  if (args.upstreamReturnedToolCalls) return false;
  if (!isPlainTextCompletionFinishReason(args.finishReason)) return false;
  if (args.autoIntentArbitrationAttempted) return false;
  if (!(args.freshRemainingTotalMs > 0)) return false;
  return true;
}

/**
 * Whether Tokfai may forward tools upstream for this model (P974 = verified only).
 */
export function modelSupportsTools(model: string): boolean {
  return isVerifiedToolCapableModel(model);
}

/** Catalog advertising for tools — true only if verified whitelist (P974). */
export function resolveToolsCapabilityMark(model: string): ToolsCapabilityMark {
  return isVerifiedToolCapableModel(model);
}

export function isCodingModel(model: string): boolean {
  const m = normalizeClientModelId(model);
  return /(^|[-_/])(coding|codex|code)([-_/]|$)/i.test(m);
}

export function resolveModelCapabilityFlags(model: string): ModelCapabilityFlags {
  const m = normalizeClientModelId(model);
  const image = isImageModel(m) || m.startsWith("gpt-image") || m.includes("nano-banana");
  if (image) {
    return {
      chat: false,
      stream: false,
      tools: false,
      image: true,
      coding: false,
    };
  }
  return {
    chat: true,
    stream: true,
    tools: resolveToolsCapabilityMark(m),
    image: false,
    coding: isCodingModel(m) || m.startsWith("gpt-5") || m.startsWith("auto-pro"),
  };
}

/**
 * Strip tools / tool_choice so an auto tools request can run as ordinary chat.
 */
export function stripToolsFromChatBody<T extends Record<string, unknown>>(
  body: T
): T {
  const next = { ...body } as Record<string, unknown>;
  delete next.tools;
  delete next.tool_choice;
  return next as T;
}

/**
 * Reorder attempt chain among tool-capable models (registry native|emulated).
 * Returns null when no capable attempt remains (caller rejects or degrades).
 */
export function resolveToolsCapableAttempts(args: {
  requestedModel: string;
  attempts: string[];
  /** See resolveToolCallingAttempts.allowGlobalFallback */
  allowGlobalFallback?: boolean;
}): { attempts: string[]; supportsTools: boolean; fallbackApplied: boolean } | null {
  if (_toolsCapableAttemptsTestForceNull === true) {
    return null;
  }

  const fromRegistry = resolveToolCallingAttempts(args);
  if (fromRegistry) return fromRegistry;

  // Legacy whitelist fallback when registry empty but env lists models.
  const filtered = args.attempts.filter((id) =>
    parseVerifiedToolsCapableModelIds().has(normalizeClientModelId(id))
  );
  if (filtered.length > 0) {
    // P1027 — same as registry: reorder/drop only, not "requested id unverified".
    return {
      attempts: filtered,
      supportsTools: true,
      fallbackApplied: filtered[0] !== args.attempts[0],
    };
  }

  if (args.allowGlobalFallback === false) {
    return null;
  }

  const verifiedFallbacks = TOOLS_CAPABLE_FALLBACK_MODELS.filter((id) =>
    isVerifiedToolCapableModel(id)
  );
  if (verifiedFallbacks.length > 0) {
    return {
      attempts: [...verifiedFallbacks],
      supportsTools: true,
      fallbackApplied: true,
    };
  }

  return null;
}

/**
 * P1019 test hook (same pattern as imageQuotaGuards __testSet).
 * When true, resolveToolsCapableAttempts returns null (no concrete capable).
 */
let _toolsCapableAttemptsTestForceNull: boolean | null = null;

export function __toolsCapableAttemptsTestSet(
  forceNull: boolean | null
): void {
  _toolsCapableAttemptsTestForceNull = forceNull;
}

/** Normalize non-stream OpenAI message so tool_calls imply finish_reason=tool_calls. */
export function normalizeToolCallsOnChatCompletion(
  data: Record<string, unknown>
): Record<string, unknown> {
  const choices = Array.isArray(data.choices) ? data.choices : null;
  if (!choices || choices.length === 0) return data;

  const nextChoices = choices.map((choice, index) => {
    if (!choice || typeof choice !== "object" || Array.isArray(choice)) {
      return choice;
    }
    const row = { ...(choice as Record<string, unknown>) };
    const message =
      row.message && typeof row.message === "object" && !Array.isArray(row.message)
        ? { ...(row.message as Record<string, unknown>) }
        : null;
    if (!message) return row;

    const toolCalls = message.tool_calls;
    const hasToolCalls = Array.isArray(toolCalls) && toolCalls.length > 0;
    if (hasToolCalls) {
      // P1031 — OpenAI / Cursor: tool_calls responses must use content=null.
      // Do not leave "" or assistant prose alongside tool_calls (breaks agents).
      message.content = null;
      row.message = message;
      if (index === 0) {
        row.finish_reason = "tool_calls";
      } else if (
        typeof row.finish_reason !== "string" ||
        !row.finish_reason.trim()
      ) {
        row.finish_reason = "tool_calls";
      }
    }
    return row;
  });

  return { ...data, choices: nextChoices };
}
