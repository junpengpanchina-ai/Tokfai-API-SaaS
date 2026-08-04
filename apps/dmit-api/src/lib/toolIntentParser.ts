/**
 * P1017 / P1026 — Parse emulated tool intent JSON from upstream assistant content
 * into OpenAI-compatible message.tool_calls (or plain assistant text).
 *
 * P1026: string-aware balanced JSON candidate extraction + OpenAI shape
 * normalization into Tokfai canonical envelope. No JSON5 / eval / bracket repair.
 */

import { randomBytes } from "node:crypto";

import {
  extractClientToolFunctions,
} from "./toolIntentCompiler.js";
import {
  MAX_ARGUMENTS_JSON_BYTES,
  MAX_TOOL_CALLS,
  utf8ByteLength,
  validateAgainstJsonSchema,
} from "./toolIntentSchema.js";
import {
  REQUIRED_TOOL_CALL_MISSING_CODE,
  TOOL_ARGUMENTS_INVALID_CODE,
  TOOL_INTENT_AMBIGUOUS_JSON_CODE,
  TOOL_INTENT_INVALID_JSON_CODE,
  TOOL_INTENT_NOT_GENERATED_CODE,
  TOOL_INTENT_TOO_LARGE_CODE,
  TOOL_NAME_NOT_ALLOWED_CODE,
  toolIntentApiError,
  type ToolIntentErrorCode,
} from "./toolIntentErrors.js";
import { ApiError } from "../errors.js";

export type ParsedToolIntent =
  | {
      kind: "tool_call";
      toolCalls: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    }
  | {
      kind: "assistant_text";
      content: string;
    };

export type ToolIntentWrapperClass =
  | "raw"
  | "object"
  | "fenced_json"
  | "fenced"
  | "prefixed"
  | "suffixed"
  | "wrapped";

export type ToolIntentNormalizedShape =
  | "canonical_tool_call"
  | "canonical_assistant_text"
  | "openai_tool_calls"
  | "openai_assistant_message";

export type ToolIntentParseDiag = {
  requestId?: string;
  providerId?: string;
  attemptModel?: string;
  log?: {
    info: (msg: string, fields?: Record<string, unknown>) => void;
    warn: (msg: string, fields?: Record<string, unknown>) => void;
  };
};

export type ToolIntentExtractMeta = {
  rawLength: number;
  candidateCount: number;
  wrapperClass: ToolIntentWrapperClass;
  normalizedShape?: ToolIntentNormalizedShape;
  toolCount?: number;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function exactKeys(obj: Record<string, unknown>, keys: string[]): boolean {
  const got = Object.keys(obj);
  if (got.length !== keys.length) return false;
  const set = new Set(keys);
  return got.every((k) => set.has(k));
}

function newToolCallId(): string {
  return `call_${randomBytes(12).toString("hex")}`;
}

function flattenContent(content: unknown): string | null {
  if (content === null || content === undefined) return null;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const item of content) {
      if (typeof item === "string") parts.push(item);
      else if (isPlainObject(item) && typeof item.text === "string") {
        parts.push(item.text);
      }
    }
    return parts.join("");
  }
  if (isPlainObject(content)) {
    if (typeof content.text === "string") return content.text;
    return null;
  }
  return null;
}

function forcedFunctionName(toolChoice: unknown): string | null {
  if (!toolChoice || typeof toolChoice !== "object" || Array.isArray(toolChoice)) {
    return null;
  }
  const row = toolChoice as Record<string, unknown>;
  const fn =
    row.function && typeof row.function === "object"
      ? (row.function as Record<string, unknown>)
      : row;
  return typeof fn.name === "string" && fn.name.trim() ? fn.name.trim() : null;
}

function fail(code: ToolIntentErrorCode, message?: string): never {
  throw toolIntentApiError(code, message ? { message } : undefined);
}

function stripBomAndTrim(s: string): string {
  const noBom = s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
  return noBom.trim();
}

/**
 * String-aware scan for all top-level balanced JSON object/array candidates.
 * Uses a bracket stack so mixed nesting and escaped quotes are handled.
 */
export function findBalancedJsonCandidates(
  s: string
): Array<{ start: number; end: number; text: string }> {
  const out: Array<{ start: number; end: number; text: string }> = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch !== "{" && ch !== "[") {
      i += 1;
      continue;
    }
    const extracted = extractBalancedJsonAt(s, i);
    if (!extracted) {
      i += 1;
      continue;
    }
    out.push({ start: i, end: extracted.end, text: extracted.text });
    i = extracted.end;
  }
  return out;
}

/** Scan one balanced JSON object/array starting at `start`, string-aware. */
export function extractBalancedJsonAt(
  s: string,
  start: number
): { end: number; text: string } | null {
  const open0 = s[start];
  if (open0 !== "{" && open0 !== "[") return null;
  const stack: string[] = [];
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{" || ch === "[") {
      stack.push(ch);
      continue;
    }
    if (ch === "}" || ch === "]") {
      const top = stack[stack.length - 1];
      if (
        (ch === "}" && top === "{") ||
        (ch === "]" && top === "[")
      ) {
        stack.pop();
        if (stack.length === 0) {
          return { end: i + 1, text: s.slice(start, i + 1) };
        }
        continue;
      }
      // Mismatched bracket — not a valid balanced candidate from start.
      return null;
    }
  }
  return null;
}

const FENCE_FULL =
  /^```(?:json)?[ \t]*\r?\n?([\s\S]*?)\r?\n?[ \t]*```$/i;

function tryUnwrapSingleFence(
  s: string
): { inner: string; wrapperClass: "fenced_json" | "fenced" } | null {
  const m = s.match(FENCE_FULL);
  if (!m || m[1] === undefined) return null;
  const langJson = /^```json\b/i.test(s);
  return {
    inner: m[1].trim(),
    wrapperClass: langJson ? "fenced_json" : "fenced",
  };
}

function classifyOuterWrapper(
  full: string,
  candidateStart: number,
  candidateEnd: number
): ToolIntentWrapperClass {
  const before = full.slice(0, candidateStart).trim();
  const after = full.slice(candidateEnd).trim();
  if (!before && !after) return "raw";
  if (before && after) return "wrapped";
  if (before) return "prefixed";
  return "suffixed";
}

export type JsonCandidateExtractResult =
  | {
      ok: true;
      value: unknown;
      meta: ToolIntentExtractMeta;
    }
  | {
      ok: false;
      code: typeof TOOL_INTENT_INVALID_JSON_CODE | typeof TOOL_INTENT_AMBIGUOUS_JSON_CODE;
      meta: ToolIntentExtractMeta;
    };

/**
 * Controlled candidate extractor (P1026).
 * 1. Strip UTF-8 BOM + trim
 * 2. Prefer full-string JSON.parse
 * 3. Else single-layer fence OR unique balanced object/array
 * 4. >=2 candidates → ambiguous; 0 → invalid
 * No regex stitch, no bracket completion, no JSON5/eval.
 */
export function extractToolIntentJsonCandidate(
  raw: string
): JsonCandidateExtractResult {
  const trimmed = stripBomAndTrim(raw);
  const rawLength = trimmed.length;
  if (!trimmed) {
    return {
      ok: false,
      code: TOOL_INTENT_INVALID_JSON_CODE,
      meta: { rawLength: 0, candidateCount: 0, wrapperClass: "raw" },
    };
  }

  try {
    const value = JSON.parse(trimmed);
    return {
      ok: true,
      value,
      meta: {
        rawLength,
        candidateCount: 1,
        wrapperClass: "raw",
      },
    };
  } catch {
    // continue to controlled wrappers
  }

  // Single-layer fence unwrap (entire string is one fence).
  const fenced = tryUnwrapSingleFence(trimmed);
  if (fenced) {
    try {
      const value = JSON.parse(fenced.inner);
      return {
        ok: true,
        value,
        meta: {
          rawLength,
          candidateCount: 1,
          wrapperClass: fenced.wrapperClass,
        },
      };
    } catch {
      const innerCandidates = findBalancedJsonCandidates(fenced.inner);
      if (innerCandidates.length >= 2) {
        return {
          ok: false,
          code: TOOL_INTENT_AMBIGUOUS_JSON_CODE,
          meta: {
            rawLength,
            candidateCount: innerCandidates.length,
            wrapperClass: fenced.wrapperClass,
          },
        };
      }
      if (innerCandidates.length === 1) {
        const sole = innerCandidates[0]!;
        try {
          const value = JSON.parse(sole.text);
          return {
            ok: true,
            value,
            meta: {
              rawLength,
              candidateCount: 1,
              wrapperClass: fenced.wrapperClass,
            },
          };
        } catch {
          return {
            ok: false,
            code: TOOL_INTENT_INVALID_JSON_CODE,
            meta: {
              rawLength,
              candidateCount: 1,
              wrapperClass: fenced.wrapperClass,
            },
          };
        }
      }
      return {
        ok: false,
        code: TOOL_INTENT_INVALID_JSON_CODE,
        meta: {
          rawLength,
          candidateCount: 0,
          wrapperClass: fenced.wrapperClass,
        },
      };
    }
  }

  // Prefix / suffix text with exactly one balanced JSON candidate.
  const candidates = findBalancedJsonCandidates(trimmed);
  if (candidates.length >= 2) {
    return {
      ok: false,
      code: TOOL_INTENT_AMBIGUOUS_JSON_CODE,
      meta: {
        rawLength,
        candidateCount: candidates.length,
        wrapperClass: "wrapped",
      },
    };
  }
  if (candidates.length === 0) {
    return {
      ok: false,
      code: TOOL_INTENT_INVALID_JSON_CODE,
      meta: { rawLength, candidateCount: 0, wrapperClass: "raw" },
    };
  }

  const only = candidates[0]!;
  try {
    const value = JSON.parse(only.text);
    return {
      ok: true,
      value,
      meta: {
        rawLength,
        candidateCount: 1,
        wrapperClass: classifyOuterWrapper(trimmed, only.start, only.end),
      },
    };
  } catch {
    return {
      ok: false,
      code: TOOL_INTENT_INVALID_JSON_CODE,
      meta: {
        rawLength,
        candidateCount: 1,
        wrapperClass: classifyOuterWrapper(trimmed, only.start, only.end),
      },
    };
  }
}

function isCanonicalToolCallItem(tc: unknown): boolean {
  return (
    isPlainObject(tc) &&
    exactKeys(tc, ["name", "arguments"]) &&
    typeof tc.name === "string"
  );
}

function isOpenAiToolCallItem(tc: unknown): boolean {
  if (!isPlainObject(tc)) return false;
  const fn = tc.function;
  if (!isPlainObject(fn)) return false;
  return typeof fn.name === "string";
}

function looksLikeOpenAiToolCallsEnvelope(obj: Record<string, unknown>): boolean {
  if (!Array.isArray(obj.tool_calls) || obj.tool_calls.length === 0) return false;
  // Canonical Tokfai envelope uses type=tool_call + {name,arguments} items.
  if (
    obj.type === "tool_call" &&
    obj.tool_calls.every(isCanonicalToolCallItem)
  ) {
    return false;
  }
  return obj.tool_calls.every(isOpenAiToolCallItem);
}

function coerceOpenAiArguments(raw: unknown): Record<string, unknown> {
  if (isPlainObject(raw)) return raw;
  if (typeof raw === "string") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      fail(TOOL_ARGUMENTS_INVALID_CODE, "arguments JSON string is not valid JSON");
    }
    if (!isPlainObject(parsed)) {
      fail(
        TOOL_ARGUMENTS_INVALID_CODE,
        "arguments JSON string must parse to a plain object"
      );
    }
    return parsed;
  }
  fail(TOOL_ARGUMENTS_INVALID_CODE, "arguments must be a JSON object or JSON object string");
}

type NormalizedEnvelope =
  | {
      kind: "tool_call";
      tool_calls: Array<{ name: string; arguments: Record<string, unknown> }>;
      shape: ToolIntentNormalizedShape;
    }
  | {
      kind: "assistant_text";
      content: string;
      shape: ToolIntentNormalizedShape;
    };

/**
 * Normalize Provider-compatible shapes B/C into Tokfai canonical A,
 * or accept canonical A / assistant_text.
 */
export function normalizeToolIntentEnvelope(envelope: unknown): NormalizedEnvelope {
  if (!isPlainObject(envelope)) {
    fail(TOOL_INTENT_INVALID_JSON_CODE);
  }

  // OpenAI B/C — normalize first (before assistant_text content heuristics).
  if (looksLikeOpenAiToolCallsEnvelope(envelope)) {
    const content = envelope.content;
    if (typeof content === "string" && content.trim()) {
      fail(
        TOOL_INTENT_INVALID_JSON_CODE,
        "assistant_text content and tool_calls must not appear together"
      );
    }
    const shape: ToolIntentNormalizedShape =
      envelope.role === "assistant"
        ? "openai_assistant_message"
        : "openai_tool_calls";

    const mapped: Array<{ name: string; arguments: Record<string, unknown> }> =
      [];
    for (const tc of envelope.tool_calls as unknown[]) {
      if (!isOpenAiToolCallItem(tc)) {
        fail(TOOL_INTENT_INVALID_JSON_CODE, "Invalid OpenAI tool_calls item");
      }
      const row = tc as Record<string, unknown>;
      const fn = row.function as Record<string, unknown>;
      const name = typeof fn.name === "string" ? fn.name.trim() : "";
      if (!name) fail(TOOL_NAME_NOT_ALLOWED_CODE);
      mapped.push({
        name,
        arguments: coerceOpenAiArguments(fn.arguments),
      });
    }
    return { kind: "tool_call", tool_calls: mapped, shape };
  }

  // Canonical assistant_text
  if (envelope.type === "assistant_text" || ("content" in envelope && !("tool_calls" in envelope))) {
    if (!exactKeys(envelope, ["type", "content"])) {
      fail(TOOL_INTENT_INVALID_JSON_CODE, "Invalid assistant_text envelope keys");
    }
    if (envelope.type !== "assistant_text") {
      fail(TOOL_INTENT_INVALID_JSON_CODE);
    }
    if (typeof envelope.content !== "string" || !envelope.content.trim()) {
      fail(TOOL_INTENT_INVALID_JSON_CODE, "assistant_text content must be non-empty string");
    }
    if ("tool_calls" in envelope) {
      fail(
        TOOL_INTENT_INVALID_JSON_CODE,
        "assistant_text and tool_calls must not appear together"
      );
    }
    return {
      kind: "assistant_text",
      content: envelope.content,
      shape: "canonical_assistant_text",
    };
  }

  // Canonical tool_call
  if (!exactKeys(envelope, ["type", "tool_calls"])) {
    fail(TOOL_INTENT_INVALID_JSON_CODE, "Invalid tool_call envelope keys");
  }
  if (envelope.type !== "tool_call") {
    fail(TOOL_INTENT_INVALID_JSON_CODE);
  }
  const tcs = envelope.tool_calls;
  if (!Array.isArray(tcs)) {
    fail(TOOL_INTENT_INVALID_JSON_CODE);
  }
  const mapped: Array<{ name: string; arguments: Record<string, unknown> }> = [];
  for (const tc of tcs) {
    if (!isCanonicalToolCallItem(tc)) {
      fail(TOOL_INTENT_INVALID_JSON_CODE, "Each tool_calls item must be {name, arguments}");
    }
    const row = tc as Record<string, unknown>;
    const name = row.name;
    if (typeof name !== "string" || !name.trim()) {
      fail(TOOL_NAME_NOT_ALLOWED_CODE);
    }
    if (!isPlainObject(row.arguments)) {
      fail(TOOL_ARGUMENTS_INVALID_CODE, "arguments must be a JSON object");
    }
    mapped.push({ name: name.trim(), arguments: row.arguments });
  }
  return {
    kind: "tool_call",
    tool_calls: mapped,
    shape: "canonical_tool_call",
  };
}

function emitDiag(
  diag: ToolIntentParseDiag | undefined,
  level: "info" | "warn",
  event: string,
  fields: Record<string, unknown>
): void {
  if (!diag?.log) return;
  const base = {
    requestId: diag.requestId,
    providerId: diag.providerId,
    attemptModel: diag.attemptModel,
    billing_status: "not_billable",
    ...fields,
  };
  if (level === "warn") diag.log.warn(event, base);
  else diag.log.info(event, base);
}

/**
 * Parse upstream message content into a validated tool intent.
 * P1026: controlled candidate extraction + OpenAI shape normalization.
 */
export function parseToolIntentFromContent(args: {
  content: unknown;
  clientTools: unknown;
  toolChoice?: unknown;
  parallelToolCalls?: unknown;
  diag?: ToolIntentParseDiag;
}): ParsedToolIntent {
  const tools = extractClientToolFunctions(args.clientTools);
  const allowed = new Set(tools.map((t) => t.name));
  const paramsByName = new Map(
    tools.map((t) => [t.name, t.parameters] as const)
  );
  const forced = forcedFunctionName(args.toolChoice);
  const choice = args.toolChoice;
  const required = choice === "required" || forced !== null;
  const none = choice === "none";
  const parallelFalse = args.parallelToolCalls === false;
  const diag = args.diag;

  let envelope: unknown;
  let extractMeta: ToolIntentExtractMeta = {
    rawLength: 0,
    candidateCount: 0,
    wrapperClass: "object",
  };

  try {
    // Object content already an envelope (no string extract)
    if (isPlainObject(args.content) && typeof args.content.type === "string") {
      envelope = args.content;
      extractMeta = {
        rawLength: 0,
        candidateCount: 1,
        wrapperClass: "object",
      };
    } else if (
      isPlainObject(args.content) &&
      Array.isArray(args.content.tool_calls)
    ) {
      // OpenAI-shaped object content (no type) — allow direct object path.
      envelope = args.content;
      extractMeta = {
        rawLength: 0,
        candidateCount: 1,
        wrapperClass: "object",
      };
    } else {
      const raw = flattenContent(args.content);
      if (raw === null || !raw.trim()) {
        fail(TOOL_INTENT_NOT_GENERATED_CODE);
      }
      const extracted = extractToolIntentJsonCandidate(raw);
      extractMeta = extracted.meta;
      emitDiag(diag, "info", "tool_intent_candidate_extracted", {
        rawLength: extracted.meta.rawLength,
        candidateCount: extracted.meta.candidateCount,
        wrapperClass: extracted.meta.wrapperClass,
      });
      if (!extracted.ok) {
        fail(extracted.code);
      }
      envelope = extracted.value;
    }

    const normalized = normalizeToolIntentEnvelope(envelope);
    extractMeta = {
      ...extractMeta,
      normalizedShape: normalized.shape,
      toolCount:
        normalized.kind === "tool_call" ? normalized.tool_calls.length : 0,
    };
    emitDiag(diag, "info", "tool_intent_shape_normalized", {
      rawLength: extractMeta.rawLength,
      candidateCount: extractMeta.candidateCount,
      wrapperClass: extractMeta.wrapperClass,
      normalizedShape: normalized.shape,
      toolCount: extractMeta.toolCount,
    });

    if (normalized.kind === "assistant_text") {
      if (required) {
        fail(REQUIRED_TOOL_CALL_MISSING_CODE);
      }
      return { kind: "assistant_text", content: normalized.content };
    }

    if (none) {
      fail(TOOL_NAME_NOT_ALLOWED_CODE, "tool_choice=none forbids tool calls");
    }

    const tcs = normalized.tool_calls;
    if (tcs.length === 0) {
      if (required) fail(REQUIRED_TOOL_CALL_MISSING_CODE);
      fail(TOOL_INTENT_NOT_GENERATED_CODE);
    }
    if (tcs.length > MAX_TOOL_CALLS) {
      fail(TOOL_INTENT_TOO_LARGE_CODE, `At most ${MAX_TOOL_CALLS} tool_calls allowed`);
    }
    if (parallelFalse && tcs.length > 1) {
      fail(
        TOOL_INTENT_INVALID_JSON_CODE,
        "parallel_tool_calls=false allows only one tool call"
      );
    }

    const mapped: Array<{
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    }> = [];
    const seenIds = new Set<string>();

    for (const tc of tcs) {
      const name = tc.name;
      if (!allowed.has(name)) {
        fail(TOOL_NAME_NOT_ALLOWED_CODE);
      }
      if (forced && name !== forced) {
        fail(TOOL_NAME_NOT_ALLOWED_CODE);
      }
      const argumentsObj = tc.arguments;
      if (!isPlainObject(argumentsObj)) {
        fail(TOOL_ARGUMENTS_INVALID_CODE, "arguments must be a JSON object");
      }
      const schema = paramsByName.get(name);
      if (schema !== undefined) {
        const checked = validateAgainstJsonSchema(argumentsObj, schema);
        if (!checked.ok) {
          fail(TOOL_ARGUMENTS_INVALID_CODE, checked.message);
        }
      }
      let argsJson: string;
      try {
        argsJson = JSON.stringify(argumentsObj);
      } catch {
        fail(TOOL_ARGUMENTS_INVALID_CODE);
      }
      if (utf8ByteLength(argsJson) > MAX_ARGUMENTS_JSON_BYTES) {
        fail(TOOL_INTENT_TOO_LARGE_CODE);
      }
      let id = newToolCallId();
      // Never trust model-supplied ids; ensure uniqueness among our ids.
      while (seenIds.has(id)) id = newToolCallId();
      seenIds.add(id);
      mapped.push({
        id,
        type: "function",
        function: { name, arguments: argsJson },
      });
    }

    return { kind: "tool_call", toolCalls: mapped };
  } catch (err) {
    const code =
      err instanceof ApiError && typeof err.code === "string"
        ? err.code
        : TOOL_INTENT_INVALID_JSON_CODE;
    emitDiag(diag, "warn", "tool_intent_parse_failed", {
      rawLength: extractMeta.rawLength,
      candidateCount: extractMeta.candidateCount,
      wrapperClass: extractMeta.wrapperClass,
      normalizedShape: extractMeta.normalizedShape,
      toolCount: extractMeta.toolCount,
      parseErrorCode: code,
    });
    throw err;
  }
}

/** Apply parsed intent onto an OpenAI chat.completion-shaped response. */
export function applyToolIntentToChatCompletion(
  data: Record<string, unknown>,
  intent: ParsedToolIntent
): Record<string, unknown> {
  const choices = Array.isArray(data.choices) ? [...data.choices] : [];
  const firstRaw =
    choices[0] && typeof choices[0] === "object" && !Array.isArray(choices[0])
      ? (choices[0] as Record<string, unknown>)
      : {};
  const first: Record<string, unknown> = { ...firstRaw, index: firstRaw.index ?? 0 };

  if (intent.kind === "assistant_text") {
    first.message = {
      role: "assistant",
      content: intent.content,
    };
    first.finish_reason = "stop";
    choices[0] = first;
    return { ...data, choices };
  }

  first.message = {
    role: "assistant",
    content: null,
    tool_calls: intent.toolCalls,
  };
  first.finish_reason = "tool_calls";
  choices[0] = first;
  return { ...data, choices };
}

export function extractAssistantContentFromCompletion(
  data: unknown
): unknown {
  if (!data || typeof data !== "object") return null;
  const choices = (data as Record<string, unknown>).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") {
    return null;
  }
  const message = (choices[0] as Record<string, unknown>).message;
  if (!message || typeof message !== "object") return null;
  return (message as Record<string, unknown>).content;
}

export function isToolIntentApiError(err: unknown): err is ApiError {
  return (
    err instanceof ApiError &&
    typeof err.code === "string" &&
    (err.code.startsWith("tool_intent_") ||
      err.code === REQUIRED_TOOL_CALL_MISSING_CODE ||
      err.code === TOOL_NAME_NOT_ALLOWED_CODE ||
      err.code === TOOL_ARGUMENTS_INVALID_CODE)
  );
}
