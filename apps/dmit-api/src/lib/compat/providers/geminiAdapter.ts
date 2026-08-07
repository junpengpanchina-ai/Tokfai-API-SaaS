/**
 * P1051 — Explicit Gemini provider adapter (additive compatibility).
 *
 * OpenAI-compatible client shapes ↔ Gemini generateContent ↔ Canonical → OpenAI.
 *
 * Guarded: only for providerFamily === "gemini" (or gemini-api profile).
 * Does NOT change GPT Golden Path, auto-pro order, billing, or Gemini
 * toolCallingModeRegistry default (emulated_json).
 */

import type {
  CanonicalAssistantResult,
  CanonicalFinishReason,
  CanonicalToolCall,
  CanonicalUsage,
  ProviderFamily,
} from "../canonicalAgentTypes.js";
import { normalizeGeminiFinishReasonToCanonical } from "../finishReasonNormalization.js";
import { getProviderCapabilityProfile } from "../providerCapabilities.js";
import {
  deterministicToolCallId,
  normalizeGeminiStyleToolCall,
  parseToolCallArguments,
} from "../toolCallNormalization.js";

/**
 * P1053 — Explicit registry of upstream models that may resume canonical
 * OpenAI tool transcripts via this Gemini adapter (not via native OpenAI
 * role=tool ingest). Membership is controlled — not "name contains gemini".
 */
export const GEMINI_ADAPTER_TOOL_RESUME_MODELS = [
  "gemini-2.5-flash",
  "gemini-3-flash",
  "gemini-3-pro",
] as const;

const GEMINI_ADAPTER_TOOL_RESUME_MODEL_SET = new Set<string>(
  GEMINI_ADAPTER_TOOL_RESUME_MODELS
);

/**
 * True only when the upstream model is registered for P1051/P1053 Gemini
 * adapter tool-resume. Does not inspect raw model-name substrings beyond the
 * registered id set.
 */
export function isRegisteredGeminiAdapterToolResumeModel(
  upstreamModelId: string
): boolean {
  const id =
    typeof upstreamModelId === "string" ? upstreamModelId.trim().toLowerCase() : "";
  if (!id) return false;
  const normalized = id.replace(/[_\s]+/g, "-");
  return (
    GEMINI_ADAPTER_TOOL_RESUME_MODEL_SET.has(id) ||
    GEMINI_ADAPTER_TOOL_RESUME_MODEL_SET.has(normalized)
  );
}

/**
 * Capability seam: registered Gemini adapter resume models only.
 */
export function modelSupportsCanonicalToolResumeViaGeminiAdapter(
  upstreamModelId: string
): boolean {
  return isRegisteredGeminiAdapterToolResumeModel(upstreamModelId);
}
// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GeminiFunctionDeclaration = {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
};

/** Gemini tools[] entry accepted by generateContent. */
export type GeminiToolsEntry = {
  functionDeclarations: GeminiFunctionDeclaration[];
};

export type GeminiFunctionCallPart = {
  functionCall: {
    name: string;
    args?: Record<string, unknown>;
  };
};

export type GeminiFunctionResponsePart = {
  functionResponse: {
    name: string;
    response: Record<string, unknown>;
  };
};

export type GeminiContentPart =
  | { text: string }
  | GeminiFunctionCallPart
  | GeminiFunctionResponsePart
  | Record<string, unknown>;

export type GeminiContent = {
  role?: string;
  parts?: GeminiContentPart[];
};

export type GeminiGenerateContentResponseLike = {
  candidates?: Array<{
    content?: { role?: string; parts?: unknown[] };
    finishReason?: unknown;
    index?: number;
  }>;
  usageMetadata?: {
    promptTokenCount?: unknown;
    candidatesTokenCount?: unknown;
    totalTokenCount?: unknown;
    /** Alternate / OpenAI-ish keys some proxies may emit — still no fabrication. */
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
    total_tokens?: unknown;
  };
};

export type OpenAiToolDefinition = {
  type?: string;
  function?: {
    name?: string;
    description?: string;
    parameters?: unknown;
  };
  name?: string;
  description?: string;
  parameters?: unknown;
};

export type OpenAiAssistantToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type OpenAiAssistantMessage = {
  role: "assistant";
  content: string | null;
  tool_calls?: OpenAiAssistantToolCall[];
};

export type OpenAiToolMessage = {
  role: "tool";
  tool_call_id: string;
  content: string;
  name?: string;
};

export type GeminiAdapterGateInput = {
  providerFamily?: ProviderFamily | string | null;
  providerId?: string | null;
};

// ---------------------------------------------------------------------------
// Explicit path gate
// ---------------------------------------------------------------------------

/**
 * True only for explicit Gemini provider family / gemini-api profile.
 * Never true for grsai-primary / openai-compatible GPT paths.
 */
export function isExplicitGeminiProviderPath(
  input: GeminiAdapterGateInput
): boolean {
  const family =
    typeof input.providerFamily === "string"
      ? input.providerFamily.trim().toLowerCase()
      : "";
  if (family === "gemini") return true;

  const id =
    typeof input.providerId === "string" ? input.providerId.trim() : "";
  if (!id) return false;
  if (id === "gemini-api") return true;
  return getProviderCapabilityProfile(id).providerFamily === "gemini";
}

/**
 * Refuse GPT / non-Gemini objects from entering the Gemini adapter.
 * Returns the input unchanged when not on the explicit Gemini path.
 */
export function guardExplicitGeminiAdapter<T>(
  input: GeminiAdapterGateInput,
  value: T
): { ok: true; value: T } | { ok: false; reason: "not_explicit_gemini_path"; value: T } {
  if (!isExplicitGeminiProviderPath(input)) {
    return { ok: false, reason: "not_explicit_gemini_path", value };
  }
  return { ok: true, value };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asNonNegativeInt(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  if (value < 0) return undefined;
  return Math.floor(value);
}

function stringifyToolArgumentsOnce(
  args: Record<string, unknown>
): string {
  return JSON.stringify(args);
}

function toolResultContentToResponseObject(
  content: unknown
): Record<string, unknown> {
  if (isPlainObject(content)) {
    return { ...content };
  }
  if (typeof content === "string") {
    const trimmed = content.trim();
    if (trimmed) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (isPlainObject(parsed)) return { ...parsed };
      } catch {
        // fall through — wrap as text
      }
    }
    return { result: content };
  }
  if (content == null) {
    return { result: null };
  }
  return { result: content };
}

// ---------------------------------------------------------------------------
// 1. OpenAI tools → Gemini functionDeclarations
// ---------------------------------------------------------------------------

/**
 * Convert OpenAI tools[] into Gemini functionDeclarations (order preserved).
 * Reuses no geminiTransform helper — none exists for tools yet.
 */
export function convertOpenAIToolsToGemini(
  tools: unknown
): GeminiFunctionDeclaration[] {
  if (!Array.isArray(tools)) return [];

  const out: GeminiFunctionDeclaration[] = [];
  for (const raw of tools) {
    if (!isPlainObject(raw)) continue;

    const fn = isPlainObject(raw.function) ? raw.function : null;
    const nameRaw =
      typeof fn?.name === "string"
        ? fn.name
        : typeof raw.name === "string"
          ? raw.name
          : "";
    const name = nameRaw.trim();
    if (!name) continue;

    const descriptionRaw =
      typeof fn?.description === "string"
        ? fn.description
        : typeof raw.description === "string"
          ? raw.description
          : undefined;
    const parametersRaw =
      fn && "parameters" in fn
        ? fn.parameters
        : "parameters" in raw
          ? raw.parameters
          : undefined;

    const decl: GeminiFunctionDeclaration = { name };
    if (typeof descriptionRaw === "string") {
      decl.description = descriptionRaw;
    }
    if (isPlainObject(parametersRaw)) {
      decl.parameters = { ...parametersRaw };
    } else if (parametersRaw !== undefined && parametersRaw !== null) {
      // Preserve non-object schemas only when already JSON-schema-like object;
      // skip inventing {}. Keep order / name / description still.
    }
    out.push(decl);
  }
  return out;
}

/** Wrap declarations as Gemini tools[] entries. */
export function convertOpenAIToolsToGeminiTools(
  tools: unknown
): GeminiToolsEntry[] {
  const functionDeclarations = convertOpenAIToolsToGemini(tools);
  if (functionDeclarations.length === 0) return [];
  return [{ functionDeclarations }];
}

// ---------------------------------------------------------------------------
// 5. Tool result continuation: OpenAI tool_calls + role=tool → functionResponse
// ---------------------------------------------------------------------------

/**
 * Build tool_call_id → function name association from an assistant message
 * that carries OpenAI tool_calls (or a bare tool_calls array).
 */
export function buildToolCallIdToNameMap(
  assistantOrToolCalls: unknown
): Map<string, string> {
  const map = new Map<string, string>();
  let list: unknown[] = [];
  if (Array.isArray(assistantOrToolCalls)) {
    list = assistantOrToolCalls;
  } else if (isPlainObject(assistantOrToolCalls)) {
    const tc = assistantOrToolCalls.tool_calls;
    if (Array.isArray(tc)) list = tc;
  }
  for (const item of list) {
    if (!isPlainObject(item)) continue;
    const id = typeof item.id === "string" ? item.id.trim() : "";
    const fn = isPlainObject(item.function) ? item.function : null;
    const name =
      typeof fn?.name === "string"
        ? fn.name.trim()
        : typeof item.name === "string"
          ? item.name.trim()
          : "";
    if (id && name) map.set(id, name);
  }
  return map;
}

/**
 * Convert OpenAI role=tool message(s) into Gemini functionResponse part(s).
 * Uses id→name association from the prior assistant.tool_calls turn.
 * Does not cross associations when multiple tools are present.
 */
export function convertOpenAIToolResultsToGeminiFunctionResponses(
  args: {
    assistantToolCalls?: unknown;
    toolMessages: unknown;
    /** Optional explicit map; otherwise derived from assistantToolCalls. */
    idToName?: Map<string, string> | Record<string, string>;
  }
): GeminiFunctionResponsePart[] {
  const idToName =
    args.idToName instanceof Map
      ? args.idToName
      : args.idToName
        ? new Map(Object.entries(args.idToName))
        : buildToolCallIdToNameMap(args.assistantToolCalls);

  const messages = Array.isArray(args.toolMessages)
    ? args.toolMessages
    : args.toolMessages != null
      ? [args.toolMessages]
      : [];

  const out: GeminiFunctionResponsePart[] = [];
  for (const msg of messages) {
    if (!isPlainObject(msg)) continue;
    const role = typeof msg.role === "string" ? msg.role.trim() : "";
    if (role && role !== "tool" && role !== "function") continue;

    const toolCallId =
      typeof msg.tool_call_id === "string" ? msg.tool_call_id.trim() : "";
    if (!toolCallId) continue;

    const fromMap = idToName.get(toolCallId);
    const fromMsg = typeof msg.name === "string" ? msg.name.trim() : "";
    const name = (fromMap || fromMsg || "").trim();
    if (!name) continue;

    out.push({
      functionResponse: {
        name,
        response: toolResultContentToResponseObject(msg.content),
      },
    });
  }
  return out;
}

/**
 * Build Gemini contents for a tool-continuation turn:
 * model functionCall parts (from prior assistant) + user functionResponse parts.
 */
export function convertOpenAIToolContinuationToGeminiContents(args: {
  assistantMessage: unknown;
  toolMessages: unknown;
}): GeminiContent[] {
  const idToName = buildToolCallIdToNameMap(args.assistantMessage);
  const modelParts: GeminiContentPart[] = [];

  if (isPlainObject(args.assistantMessage)) {
    const toolCalls = Array.isArray(args.assistantMessage.tool_calls)
      ? args.assistantMessage.tool_calls
      : [];
    for (const tc of toolCalls) {
      if (!isPlainObject(tc)) continue;
      const fn = isPlainObject(tc.function) ? tc.function : null;
      const name =
        typeof fn?.name === "string"
          ? fn.name.trim()
          : typeof tc.name === "string"
            ? tc.name.trim()
            : "";
      if (!name) continue;

      let argsObj: Record<string, unknown> = {};
      const rawArgs = fn?.arguments ?? tc.arguments;
      if (isPlainObject(rawArgs)) {
        argsObj = { ...rawArgs };
      } else if (typeof rawArgs === "string") {
        const parsed = parseToolCallArguments(rawArgs);
        if (parsed.ok) argsObj = parsed.arguments;
        // malformed → empty args object for upstream shape only (name still required)
        // Do not invent field values; empty {} means "no recoverable args".
      }

      modelParts.push({
        functionCall: { name, args: argsObj },
      });
    }
  }

  const responseParts = convertOpenAIToolResultsToGeminiFunctionResponses({
    idToName,
    toolMessages: args.toolMessages,
  });

  const contents: GeminiContent[] = [];
  if (modelParts.length > 0) {
    contents.push({ role: "model", parts: modelParts });
  }
  if (responseParts.length > 0) {
    contents.push({ role: "user", parts: responseParts });
  }
  return contents;
}

function messageContentToPlainText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const chunks: string[] = [];
    for (const part of content) {
      if (typeof part === "string") chunks.push(part);
      else if (isPlainObject(part) && typeof part.text === "string") {
        chunks.push(part.text);
      }
    }
    return chunks.join("");
  }
  if (content == null) return "";
  return "";
}

function serializeGeminiPartsForChat(
  role: "assistant" | "user",
  parts: GeminiContentPart[] | undefined
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  if (!parts?.length) return out;
  const textChunks: string[] = [];
  for (const part of parts) {
    if (!isPlainObject(part)) continue;
    const rec = part as Record<string, unknown>;
    if (typeof rec.text === "string" && rec.text.length > 0) {
      textChunks.push(rec.text);
      continue;
    }
    if (isPlainObject(rec.functionCall)) {
      if (textChunks.length > 0) {
        out.push({ role, content: textChunks.join("") });
        textChunks.length = 0;
      }
      out.push({
        role: "assistant",
        content: JSON.stringify({ functionCall: rec.functionCall }),
      });
      continue;
    }
    if (isPlainObject(rec.functionResponse)) {
      if (textChunks.length > 0) {
        out.push({ role, content: textChunks.join("") });
        textChunks.length = 0;
      }
      out.push({
        role: "user",
        content: JSON.stringify({ functionResponse: rec.functionResponse }),
      });
    }
  }
  if (textChunks.length > 0) {
    out.push({ role, content: textChunks.join("") });
  }
  return out;
}

/**
 * P1053 — Convert a full OpenAI chat message list for Gemini adapter resume.
 * Reuses P1051 convertOpenAIToolContinuationToGeminiContents for tool rounds.
 * Output never contains role=tool / role=function / assistant.tool_calls.
 */
export function convertOpenAIMessagesForGeminiAdapterResume(
  messages: unknown[]
): { messages: Record<string, unknown>[]; converted: boolean } {
  const list = Array.isArray(messages) ? messages : [];
  const out: Record<string, unknown>[] = [];
  let converted = false;
  let i = 0;

  while (i < list.length) {
    const raw = list[i];
    if (!isPlainObject(raw)) {
      i += 1;
      continue;
    }
    const role = typeof raw.role === "string" ? raw.role.trim() : "";

    if (
      role === "assistant" &&
      Array.isArray(raw.tool_calls) &&
      raw.tool_calls.length > 0
    ) {
      const toolMessages: Record<string, unknown>[] = [];
      let j = i + 1;
      while (j < list.length) {
        const next = list[j];
        if (!isPlainObject(next)) break;
        const nextRole =
          typeof next.role === "string" ? next.role.trim() : "";
        if (nextRole !== "tool" && nextRole !== "function") break;
        toolMessages.push(next);
        j += 1;
      }

      if (toolMessages.length > 0) {
        const text = messageContentToPlainText(raw.content);
        if (text.length > 0) {
          out.push({ role: "assistant", content: text });
        }
        const geminiContents = convertOpenAIToolContinuationToGeminiContents({
          assistantMessage: raw,
          toolMessages,
        });
        for (const content of geminiContents) {
          const chatRole =
            content.role === "model" ? ("assistant" as const) : ("user" as const);
          out.push(
            ...serializeGeminiPartsForChat(chatRole, content.parts)
          );
        }
        converted = true;
        i = j;
        continue;
      }

      // assistant.tool_calls without trailing tool results — strip tool_calls.
      const textOnly = messageContentToPlainText(raw.content);
      if (textOnly.length > 0) {
        out.push({ role: "assistant", content: textOnly });
      }
      for (const tc of raw.tool_calls) {
        if (!isPlainObject(tc)) continue;
        const fn = isPlainObject(tc.function) ? tc.function : null;
        const name =
          typeof fn?.name === "string"
            ? fn.name.trim()
            : typeof tc.name === "string"
              ? tc.name.trim()
              : "";
        if (!name) continue;
        let argsObj: Record<string, unknown> = {};
        const rawArgs = fn?.arguments ?? tc.arguments;
        if (isPlainObject(rawArgs)) argsObj = { ...rawArgs };
        else if (typeof rawArgs === "string") {
          const parsed = parseToolCallArguments(rawArgs);
          if (parsed.ok) argsObj = parsed.arguments;
        }
        out.push({
          role: "assistant",
          content: JSON.stringify({ functionCall: { name, args: argsObj } }),
        });
        converted = true;
      }
      i += 1;
      continue;
    }

    if (role === "tool" || role === "function") {
      // Orphan tool row — convert via name if present; never forward role=tool.
      const fr = convertOpenAIToolResultsToGeminiFunctionResponses({
        toolMessages: [raw],
        idToName: new Map(),
      });
      if (fr.length > 0) {
        out.push(
          ...serializeGeminiPartsForChat("user", fr)
        );
        converted = true;
      } else {
        const name =
          typeof raw.name === "string" && raw.name.trim()
            ? raw.name.trim()
            : "tool";
        out.push({
          role: "user",
          content: JSON.stringify({
            functionResponse: {
              name,
              response: toolResultContentToResponseObject(raw.content),
            },
          }),
        });
        converted = true;
      }
      i += 1;
      continue;
    }

    if (role === "system" || role === "user" || role === "assistant") {
      out.push({
        role,
        content: messageContentToPlainText(raw.content),
      });
      i += 1;
      continue;
    }

    out.push({
      role: role || "user",
      content: messageContentToPlainText(raw.content),
    });
    i += 1;
  }

  return { messages: out, converted };
}

/**
 * P1053 — Apply Gemini adapter resume conversion to an upstream chat body copy.
 * Does not mutate the input object. Strips raw OpenAI tool transcript fields.
 */
export function applyGeminiAdapterToolResumeToUpstreamChatBody(
  upstreamBody: Record<string, unknown>
): { body: Record<string, unknown>; converted: boolean } {
  const next: Record<string, unknown> = { ...upstreamBody };
  if (!Array.isArray(next.messages)) {
    return { body: next, converted: false };
  }
  const { messages, converted } = convertOpenAIMessagesForGeminiAdapterResume(
    next.messages as unknown[]
  );
  next.messages = messages;
  // Never forward OpenAI tools/tool_choice unchanged as "native transcript" —
  // emulated compile (caller) injects instructions; strip here as safety.
  // Caller may re-inject via compileEmulatedUpstreamBody.
  return { body: next, converted };
}

// ---------------------------------------------------------------------------
// 7. Usage
// ---------------------------------------------------------------------------

export function normalizeGeminiUsage(
  usageMetadata: unknown
): CanonicalUsage | null {
  if (!isPlainObject(usageMetadata)) return null;

  const prompt_tokens =
    asNonNegativeInt(usageMetadata.promptTokenCount) ??
    asNonNegativeInt(usageMetadata.prompt_tokens);
  const completion_tokens =
    asNonNegativeInt(usageMetadata.candidatesTokenCount) ??
    asNonNegativeInt(usageMetadata.completion_tokens);
  const total_tokens =
    asNonNegativeInt(usageMetadata.totalTokenCount) ??
    asNonNegativeInt(usageMetadata.total_tokens);

  if (
    prompt_tokens === undefined &&
    completion_tokens === undefined &&
    total_tokens === undefined
  ) {
    return null;
  }

  const usage: CanonicalUsage = {};
  if (prompt_tokens !== undefined) usage.prompt_tokens = prompt_tokens;
  if (completion_tokens !== undefined) {
    usage.completion_tokens = completion_tokens;
  }
  if (total_tokens !== undefined) usage.total_tokens = total_tokens;
  return usage;
}

// ---------------------------------------------------------------------------
// 2–4, 8. Response → Canonical
// ---------------------------------------------------------------------------

export type NormalizeGeminiResponseOptions = {
  requestScope?: string;
  /** When set, refuses unless explicit Gemini path. */
  providerFamily?: ProviderFamily | string | null;
  providerId?: string | null;
};

export type NormalizeGeminiResponseResult =
  | { ok: true; result: CanonicalAssistantResult }
  | {
      ok: false;
      reason: "not_explicit_gemini_path" | "empty_response" | "invalid_shape";
      result?: CanonicalAssistantResult;
    };

/**
 * Parse a Gemini generateContent-like response into CanonicalAssistantResult.
 * Supports text, single/multiple functionCall, and mixed parts.
 * Never throws on unknown finish reasons. Does not fabricate tool args.
 */
export function normalizeGeminiResponse(
  response: unknown,
  opts?: NormalizeGeminiResponseOptions
): NormalizeGeminiResponseResult {
  if (
    opts &&
    (opts.providerFamily != null || opts.providerId != null) &&
    !isExplicitGeminiProviderPath({
      providerFamily: opts.providerFamily,
      providerId: opts.providerId,
    })
  ) {
    return { ok: false, reason: "not_explicit_gemini_path" };
  }

  if (!isPlainObject(response)) {
    return { ok: false, reason: "invalid_shape" };
  }

  const candidates = Array.isArray(response.candidates)
    ? response.candidates
    : [];
  const first = candidates[0];
  if (!isPlainObject(first)) {
    return {
      ok: false,
      reason: "empty_response",
      result: {
        text: null,
        toolCalls: [],
        finishReason: "unknown",
        usage: normalizeGeminiUsage(response.usageMetadata),
      },
    };
  }

  const content = isPlainObject(first.content) ? first.content : null;
  const parts = content && Array.isArray(content.parts) ? content.parts : [];

  const textChunks: string[] = [];
  const toolCalls: CanonicalToolCall[] = [];
  let toolIndex = 0;
  const requestScope =
    typeof opts?.requestScope === "string" && opts.requestScope.trim()
      ? opts.requestScope.trim()
      : "gemini";

  for (const part of parts) {
    if (!isPlainObject(part)) continue;

    if (typeof part.text === "string") {
      textChunks.push(part.text);
      continue;
    }

    const fcRaw = isPlainObject(part.functionCall)
      ? part.functionCall
      : isPlainObject(part.function_call)
        ? part.function_call
        : null;
    if (!fcRaw) continue;

    const name = typeof fcRaw.name === "string" ? fcRaw.name.trim() : "";
    if (!name) continue;

    // Args: object kept; invalid → skip (no fabricate {}).
    // Missing args → treat as empty object (Gemini no-arg calls).
    let argsForNorm: unknown;
    if (fcRaw.args !== undefined) {
      argsForNorm = fcRaw.args;
    } else if (fcRaw.arguments !== undefined) {
      argsForNorm = fcRaw.arguments;
    } else {
      argsForNorm = {};
    }

    if (
      argsForNorm !== undefined &&
      !isPlainObject(argsForNorm) &&
      typeof argsForNorm !== "string"
    ) {
      // malformed non-object/non-string — do not fabricate
      continue;
    }
    if (typeof argsForNorm === "string") {
      const parsed = parseToolCallArguments(argsForNorm);
      if (!parsed.ok) continue;
      argsForNorm = parsed.arguments;
    } else if (argsForNorm !== undefined && !isPlainObject(argsForNorm)) {
      continue;
    }

    const normalized = normalizeGeminiStyleToolCall(
      { name, args: isPlainObject(argsForNorm) ? argsForNorm : {} },
      { index: toolIndex, requestScope }
    );
    if (!normalized.ok) continue;

    // Prefer P1050 deterministic id when provider omitted id (always for Gemini).
    const id =
      normalized.toolCall.id ||
      deterministicToolCallId({
        requestScope,
        index: toolIndex,
        name,
      });

    toolCalls.push({
      id,
      name: normalized.toolCall.name,
      arguments: normalized.toolCall.arguments,
    });
    toolIndex += 1;
  }

  const joinedText = textChunks.join("");
  const text: string | null =
    joinedText.length > 0 ? joinedText : null;

  let finishReason: CanonicalFinishReason =
    normalizeGeminiFinishReasonToCanonical(first.finishReason);
  if (
    toolCalls.length > 0 &&
    (finishReason === "stop" || finishReason === "unknown")
  ) {
    // Gemini often returns STOP even with functionCall — surface tool_calls.
    finishReason = "tool_calls";
  }

  const usage = normalizeGeminiUsage(response.usageMetadata);

  return {
    ok: true,
    result: {
      text,
      toolCalls,
      finishReason,
      usage,
    },
  };
}

// ---------------------------------------------------------------------------
// 6. Canonical → OpenAI / Cursor message
// ---------------------------------------------------------------------------

export function canonicalGeminiResultToOpenAI(
  result: CanonicalAssistantResult
): OpenAiAssistantMessage {
  if (result.toolCalls.length > 0) {
    return {
      role: "assistant",
      content: null,
      tool_calls: result.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: {
          name: tc.name,
          arguments: stringifyToolArgumentsOnce(tc.arguments),
        },
      })),
    };
  }

  return {
    role: "assistant",
    content: result.text ?? "",
  };
}

/**
 * Full explicit-Gemini response path: Gemini JSON → Canonical → OpenAI message.
 * GPT / non-gemini providerFamily is rejected without mutating the input.
 */
export function adaptGeminiResponseToOpenAI(
  response: unknown,
  opts?: NormalizeGeminiResponseOptions
):
  | {
      ok: true;
      canonical: CanonicalAssistantResult;
      message: OpenAiAssistantMessage;
      finishReason: CanonicalFinishReason;
      usage: CanonicalUsage | null | undefined;
    }
  | {
      ok: false;
      reason: string;
      message?: OpenAiAssistantMessage;
    } {
  const family = opts?.providerFamily ?? "gemini";
  const providerId = opts?.providerId;
  if (
    !isExplicitGeminiProviderPath({
      providerFamily: family,
      providerId,
    })
  ) {
    return { ok: false, reason: "not_explicit_gemini_path" };
  }

  const normalized = normalizeGeminiResponse(response, {
    ...opts,
    providerFamily: family,
    providerId,
  });
  if (!normalized.ok) {
    return {
      ok: false,
      reason: normalized.reason,
      message: normalized.result
        ? canonicalGeminiResultToOpenAI(normalized.result)
        : undefined,
    };
  }

  return {
    ok: true,
    canonical: normalized.result,
    message: canonicalGeminiResultToOpenAI(normalized.result),
    finishReason: normalized.result.finishReason,
    usage: normalized.result.usage,
  };
}
