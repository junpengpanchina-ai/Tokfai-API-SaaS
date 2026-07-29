/**
 * P970/P971 — OpenAI-compatible tools / tool_choice capability + fake tool-call guard.
 *
 * Kept in lib/ (not capabilities/) so hot-deploys stay writable on prod.
 * Does not touch image billing / P961 reconcile.
 */

import { normalizeClientModelId } from "../upstream/modelAliases.js";
import { isImageModel } from "../capabilities/modelCapabilityPolicy.js";

export const MODEL_NOT_TOOL_CAPABLE_CODE = "model_not_tool_capable" as const;
export const ALL_TOOL_UPSTREAMS_UNAVAILABLE_CODE =
  "all_tool_upstreams_unavailable" as const;
export const TOOL_CALL_NOT_SUPPORTED_CODE = "tool_call_not_supported" as const;
/** P971 — strict tools request got plain content instead of tool_calls. */
export const TOOL_CALL_NOT_GENERATED_CODE = "tool_call_not_generated" as const;
export const PROVIDER_TOOL_CALL_NOT_SUPPORTED_CODE =
  "provider_tool_call_not_supported" as const;

/** Preferred concrete models when falling back for a tools request. */
export const TOOLS_CAPABLE_FALLBACK_MODELS = [
  "gpt-5.5",
  "gpt-5.4",
  "gemini-2.5-flash",
  "gemini-3-flash",
  "gemini-3-pro",
] as const;

/**
 * P971 — models that have returned real `message.tool_calls` in LIVE smoke.
 * Until LIVE confirms, keep this narrow so /v1/models does not advertise fake tools.
 */
export const VERIFIED_TOOLS_CAPABLE_MODEL_IDS = new Set<string>([
  // Live-verified only. Offline mock may still exercise the contract.
]);

/**
 * Models that may accept tools params but are not yet LIVE-verified for
 * stable tool_calls. Advertised as tools: "experimental".
 * auto-fast intentionally excluded — production returned fake stop/content.
 */
export const EXPERIMENTAL_TOOLS_MODEL_IDS = new Set<string>([
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5-pro",
  "gpt-5",
  "gpt-5-chat",
  "gpt-5.1",
  "gpt-5.2",
  "auto-pro",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-3-pro",
]);

export type ToolsCapabilityMark = boolean | "experimental";

export type ModelCapabilityFlags = {
  chat: boolean;
  stream: boolean;
  tools: ToolsCapabilityMark;
  image: boolean;
  coding: boolean;
};

export function requestHasTools(body: unknown): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const record = body as Record<string, unknown>;
  if (Array.isArray(record.tools) && record.tools.length > 0) return true;
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
  // Also accept top-level for convenience (never forwarded upstream).
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
    // OpenAI: { type: "function", function: { name } } or { function: { name } }
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
 * Whether Tokfai may *attempt* tools against this model (routing).
 * Catalog advertising is separate — see resolveToolsCapabilityMark().
 */
export function modelSupportsTools(model: string): boolean {
  const m = normalizeClientModelId(model);
  if (!m) return false;
  if (isImageModel(m) || m.startsWith("gpt-image") || m.includes("nano-banana")) {
    return false;
  }
  if (VERIFIED_TOOLS_CAPABLE_MODEL_IDS.has(m)) return true;
  if (EXPERIMENTAL_TOOLS_MODEL_IDS.has(m)) return true;
  // auto-pro is experimental; auto-fast / auto-cheap do not claim tools.
  if (m === "auto-pro") return true;
  if (m.startsWith("auto-")) return false;
  if (m.startsWith("gpt-5") || m.startsWith("gpt-4") || m.startsWith("o1") || m.startsWith("o3")) {
    return true;
  }
  if (m.startsWith("gemini-2.5") || m === "gemini-3-pro") return true;
  // gemini-3-flash / others: allow attempt but do not advertise (catalog false)
  if (m.startsWith("gemini-")) return true;
  if (m.startsWith("claude-")) return true;
  return false;
}

/** Catalog advertising for tools — conservative (P971). */
export function resolveToolsCapabilityMark(model: string): ToolsCapabilityMark {
  const m = normalizeClientModelId(model);
  if (!m) return false;
  if (isImageModel(m) || m.startsWith("gpt-image") || m.includes("nano-banana")) {
    return false;
  }
  if (VERIFIED_TOOLS_CAPABLE_MODEL_IDS.has(m)) return true;
  if (m === "auto-fast" || m === "auto-cheap") return false;
  if (EXPERIMENTAL_TOOLS_MODEL_IDS.has(m) || m === "auto-pro") {
    return "experimental";
  }
  if (m.startsWith("gpt-5") || m.startsWith("gpt-4")) return "experimental";
  return false;
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
 * Reorder / extend attempt chain so tools requests hit tools-capable models first.
 * Returns null when no tools-capable attempt remains.
 */
export function resolveToolsCapableAttempts(args: {
  requestedModel: string;
  attempts: string[];
}): { attempts: string[]; supportsTools: boolean; fallbackApplied: boolean } | null {
  const filtered = args.attempts.filter((id) => modelSupportsTools(id));
  if (filtered.length > 0) {
    const supportsRequested = modelSupportsTools(args.requestedModel);
    return {
      attempts: filtered,
      supportsTools: true,
      fallbackApplied: !supportsRequested || filtered[0] !== args.attempts[0],
    };
  }

  if (!modelSupportsTools(args.requestedModel)) {
    return {
      attempts: [...TOOLS_CAPABLE_FALLBACK_MODELS],
      supportsTools: true,
      fallbackApplied: true,
    };
  }

  return null;
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
      if (message.content === undefined) message.content = null;
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
