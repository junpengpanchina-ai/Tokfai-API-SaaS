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
import { modelSupportsCanonicalToolResumeViaGeminiAdapter } from "./compat/providers/geminiAdapter.js";
import {
  modelHasToolCallingSupport,
  resolveToolCallingAttempts,
  resolveToolCallingMode,
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

/**
 * Live provider ids that can actually serve chat today. Reserved/disabled
 * registry slots (openai-official / azure / …) must not make Gemini look
 * "native" for resume routing via bestToolCallingModeForModel.
 */
const LIVE_TOOL_RESUME_PROVIDER_IDS = [
  "grsai-primary",
  "openai-compatible-secondary",
] as const;

/** P1033 — explicit resume failure (not a generic invalid_request_error). */
export const TOOL_ROUND_RESUME_UNAVAILABLE_CODE =
  "tool_round_resume_unavailable" as const;

export const TOOL_ROUND_RESUME_UNAVAILABLE_MESSAGE =
  "Tool-round resume requires a native OpenAI tool-transcript provider; none are available for this request.";

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
 * P1047 / P1048 — Whether a second controlled emulated_json pass is warranted
 * after a structurally valid native OpenAI-compatible response.
 *
 * OpenAI tool_choice semantics:
 * - missing / auto: assistant text OR tool_calls are both legal finals
 *   (P1047 single-pass), EXCEPT P1048 when the client shows *explicit* tool
 *   execution intent and native returned plain text with no tool_calls.
 * - required / named / require_tool_call: handled by the strict repair path
 *   (`isStrictToolCallRequest` + `canNativeEmulatedRepair`), not this gate
 *
 * "Client sent tools[]" ≠ "model must call a tool this turn".
 * Never open solely because hasTools=true.
 */
export function shouldRunToolArbitrationAfterNativeResponse(args: {
  hasTools: boolean;
  supportsToolsRequested: boolean;
  effectiveToolChoice: unknown;
  activeToolMode: ToolCallingMode | string;
  upstreamReturnedToolCalls: boolean;
  finishReason: string | null | undefined;
  alreadyAttempted: boolean;
  freshRemainingTotalMs: number;
  /** Structurally valid OpenAI-compatible assistant response from native. */
  nativeResponseValid?: boolean;
  /**
   * P1048 — explicit tool execution intent from
   * {@link detectExplicitToolExecutionIntent} (toolIntentCompiler).
   * Resume continuation must leave this unset/false.
   */
  explicitToolExecutionIntent?: boolean;
}): boolean {
  if (!args.hasTools) return false;
  if (!args.supportsToolsRequested) return false;
  if (args.activeToolMode !== "native") return false;
  if (args.alreadyAttempted) return false;
  if (!(args.freshRemainingTotalMs > 0)) return false;
  if (args.nativeResponseValid === false) return false;

  if (isAutoEffectiveToolChoice(args.effectiveToolChoice)) {
    // P1047 fast path: auto/missing valid native is final…
    // P1048 narrow exception: explicit execution intent + plain text miss.
    if (args.explicitToolExecutionIntent !== true) return false;
    if (args.upstreamReturnedToolCalls) return false;
    if (!isPlainTextCompletionFinishReason(args.finishReason)) return false;
    return true;
  }

  // Non-auto (required/named) uses the strict repair path, not this gate.
  void args.upstreamReturnedToolCalls;
  void args.finishReason;
  return false;
}

/**
 * P1028 / P1047 / P1048 — First-turn AUTO tool-intent repair gate.
 *
 * P1047: auto plain text is final when there is no explicit execution intent.
 * P1048: when toolIntentDetected (real toolIntentCompiler result) and native
 * returned plain text, allow exactly one emulated_json tool-intent repair.
 * Never opens solely because hasTools=true.
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
  /** P1033 — legal role=tool resume; skip first-turn AUTO arbitration. */
  resumeToolRound?: boolean;
  /** P1048 — from detectExplicitToolExecutionIntent().detected */
  toolIntentDetected?: boolean;
}): boolean {
  if (args.resumeToolRound === true) return false;
  return shouldRunToolArbitrationAfterNativeResponse({
    hasTools: args.hasTools,
    supportsToolsRequested: args.supportsToolsRequested,
    effectiveToolChoice: args.effectiveToolChoice,
    activeToolMode: args.activeToolMode,
    upstreamReturnedToolCalls: args.upstreamReturnedToolCalls,
    finishReason: args.finishReason,
    alreadyAttempted: args.autoIntentArbitrationAttempted,
    freshRemainingTotalMs: args.freshRemainingTotalMs,
    nativeResponseValid: true,
    explicitToolExecutionIntent: args.toolIntentDetected === true,
  });
}

/**
 * P1036 / P1047 / P1049 — Round-2+ continuation arbitration gate.
 *
 * P1047 closed blanket resume plain-text arbitration.
 * P1048 must NOT reopen via first-turn execution-intent alone (CASE D/E).
 * P1049 reopens ONLY when {@link shouldContinueIncompleteToolTask} reports an
 * unmet multi-step capability gap (`incompleteToolTask=true`).
 */
export function shouldAttemptResumeToolContinuationArbitration(args: {
  hasTools: boolean;
  supportsToolsRequested: boolean;
  effectiveToolChoice: unknown;
  activeToolMode: ToolCallingMode | string;
  upstreamReturnedToolCalls: boolean;
  finishReason: string | null | undefined;
  resumeToolRound: boolean;
  unmatchedToolCallIdCount: number;
  duplicateToolResultCount: number;
  orderViolationCount: number;
  continuationArbitrationAttempted: boolean;
  /** Shared with first-turn AUTO: at most one arbitration per HTTP request. */
  autoIntentArbitrationAttempted: boolean;
  freshRemainingTotalMs: number;
  upstreamHttpOk: boolean;
  /**
   * P1049 — from shouldContinueIncompleteToolTask().shouldContinue.
   * Must stay unset/false unless capability gap is proven.
   */
  incompleteToolTask?: boolean;
}): boolean {
  if (!args.resumeToolRound) return false;
  if (args.unmatchedToolCallIdCount !== 0) return false;
  if (args.duplicateToolResultCount !== 0) return false;
  if (args.orderViolationCount !== 0) return false;
  if (!args.upstreamHttpOk) return false;
  if (args.autoIntentArbitrationAttempted) return false;
  // P1049 — never reopen without proven incomplete capability gap.
  if (args.incompleteToolTask !== true) return false;
  return shouldRunToolArbitrationAfterNativeResponse({
    hasTools: args.hasTools,
    supportsToolsRequested: args.supportsToolsRequested,
    effectiveToolChoice: args.effectiveToolChoice,
    activeToolMode: args.activeToolMode,
    upstreamReturnedToolCalls: args.upstreamReturnedToolCalls,
    finishReason: args.finishReason,
    alreadyAttempted: args.continuationArbitrationAttempted,
    freshRemainingTotalMs: args.freshRemainingTotalMs,
    nativeResponseValid: true,
    // Capability-gap continuation uses the same plain-text miss path.
    explicitToolExecutionIntent: true,
  });
}

/**
 * P1033 — True when a live provider can consume OpenAI role=tool transcripts
 * natively for this upstream model.
 */
export function modelSupportsNativeToolResume(upstreamModelId: string): boolean {
  const model = normalizeClientModelId(upstreamModelId);
  if (!model) return false;
  for (const providerId of LIVE_TOOL_RESUME_PROVIDER_IDS) {
    if (resolveToolCallingMode(providerId, model) === "native") return true;
  }
  return false;
}

/**
 * P1053 — True when a registered Gemini compatibility adapter can resume a
 * canonical tool transcript for this upstream model (after adapter conversion).
 * Does not mean native OpenAI role=tool ingest.
 */
export function modelSupportsAdapterToolResume(
  upstreamModelId: string
): boolean {
  const model = normalizeClientModelId(upstreamModelId);
  if (!model) return false;
  return modelSupportsCanonicalToolResumeViaGeminiAdapter(model);
}

/**
 * P1053 — Native OpenAI transcript resume OR registered Gemini adapter resume.
 */
export function modelSupportsToolResume(upstreamModelId: string): boolean {
  return (
    modelSupportsNativeToolResume(upstreamModelId) ||
    modelSupportsAdapterToolResume(upstreamModelId)
  );
}

/**
 * P1033 — Prefer models with live native tool-transcript support for resume.
 * Emulated_json models must not receive raw role=tool transcripts
 * (no transcript compiler). Returns empty when none remain.
 *
 * Kept for GPT Golden Path / P1033 unit proofs. Production resume routing
 * uses {@link resolveToolResumeAttempts} (native + Gemini adapter).
 */
export function resolveNativeToolResumeAttempts(args: {
  attempts: string[];
}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of args.attempts) {
    const model = normalizeClientModelId(id);
    if (!model || seen.has(model)) continue;
    if (!modelSupportsNativeToolResume(model)) continue;
    seen.add(model);
    out.push(model);
  }
  return out;
}

/**
 * P1053 — Resume attempts: native OpenAI transcript models OR models with a
 * registered Gemini adapter resume path. Unsupported models remain excluded
 * (caller still returns tool_round_resume_unavailable when empty).
 */
export function resolveToolResumeAttempts(args: {
  attempts: string[];
}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of args.attempts) {
    const model = normalizeClientModelId(id);
    if (!model || seen.has(model)) continue;
    if (!modelSupportsToolResume(model)) continue;
    seen.add(model);
    out.push(model);
  }
  return out;
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
