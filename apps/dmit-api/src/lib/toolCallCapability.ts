/**
 * P970 — OpenAI-compatible tools / tool_choice capability helpers.
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

/** Preferred concrete models when falling back for a tools request. */
export const TOOLS_CAPABLE_FALLBACK_MODELS = [
  "gpt-5.5",
  "gpt-5.4",
  "gemini-2.5-flash",
  "gemini-3-flash",
  "gemini-3-pro",
] as const;

/**
 * Models known not to support OpenAI-style function/tool calling on Tokfai.
 * Everything else chat-family is treated as tools-capable by default.
 */
const TOOLS_INCAPABLE_MODEL_IDS = new Set<string>([
  // Image family is never tools-capable on chat.
]);

export type ModelCapabilityFlags = {
  chat: boolean;
  stream: boolean;
  tools: boolean;
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

export function modelSupportsTools(model: string): boolean {
  const m = normalizeClientModelId(model);
  if (!m) return false;
  if (isImageModel(m) || m.startsWith("gpt-image") || m.includes("nano-banana")) {
    return false;
  }
  if (TOOLS_INCAPABLE_MODEL_IDS.has(m)) return false;
  // Smart aliases resolve to tools-capable chains.
  if (m.startsWith("auto-")) return true;
  if (m.startsWith("gpt-5") || m.startsWith("gpt-4") || m.startsWith("o1") || m.startsWith("o3")) {
    return true;
  }
  if (m.startsWith("gemini-")) return true;
  if (m.startsWith("claude-")) return true;
  // Default chat models: allow tools; upstream may still reject.
  return true;
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
    tools: modelSupportsTools(m),
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

  // Requested concrete model / chain has no tools-capable entry → prefer fallback list.
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
