/**
 * P1090 — GRSAI /v1/responses tool-call compatibility fallback.
 *
 * After P1087/P1088 native tool_choice=required retry still returns HTTP 200
 * + stop + no tool_calls, perform one provider-adapter fetch that asks GRSAI
 * for a strict JSON tool-call envelope, then map it to OpenAI/Codex
 * function_call wire.
 *
 * Protocol adapter only:
 * - Does NOT execute tools
 * - Does NOT invent tools outside the client tools list
 * - Does NOT run Agent / task-completeness / intent arbitration
 * - Does NOT change /v1/chat/completions non-tool paths
 * - Does NOT open Round-2 when incoming tool results are present
 *
 * Pure helpers: no env / DB / network / billing side effects.
 */

import { createHash } from "node:crypto";

import { toolChoiceKind } from "./cursorToolProtocol.js";
import {
  extractClientToolFunctions,
} from "./toolIntentCompiler.js";
import {
  applyToolIntentToChatCompletion,
  extractAssistantContentFromCompletion,
  parseToolIntentFromContent,
  type ParsedToolIntent,
} from "./toolIntentParser.js";

/** Distinctive marker for outbound messages (tests may detect; never log content). */
export const GRSAI_TOOL_COMPAT_FALLBACK_MARKER =
  "Tokfai GRSAI tool-call compatibility adapter";

export const GRSAI_TOOL_COMPAT_FALLBACK_SYSTEM_PROMPT = `${GRSAI_TOOL_COMPAT_FALLBACK_MARKER}.

Return exactly one minified JSON object.
Do not use Markdown or code fences.
Do not explain.
Do not write assistant prose.
Do not invent tool names.
Pick exactly ONE tool from the allowed list.
arguments must be a JSON object.

Preferred envelope:
{"name":"<allowed_tool_name>","arguments":{}}

Also accepted:
{"type":"tool_call","tool_calls":[{"name":"<allowed_tool_name>","arguments":{}}]}`;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isStopLikeFinish(finishReason: string | null | undefined): boolean {
  if (finishReason == null || finishReason === "") return true;
  const r = finishReason.trim().toLowerCase();
  return r === "stop" || r === "end_turn" || r === "stop_sequence";
}

/** Safe short hash for allowlisted logs (never the raw tool name except tests). */
export function hashToolNameForLog(name: string): string {
  return createHash("sha256").update(name).digest("hex").slice(0, 12);
}

export function isGrsaiToolCompatProvider(providerId: string): boolean {
  const id = providerId.trim().toLowerCase();
  return id === "grsai-primary" || id.startsWith("grsai");
}

/**
 * Client tool_choice allows or requires a tool call (not none / unknown).
 */
export function isGrsaiToolCompatEligibleToolChoice(
  toolChoice: unknown
): boolean {
  const kind = toolChoiceKind(toolChoice);
  if (kind === "auto" || kind === "required" || kind === "missing" || kind === "null") {
    return true;
  }
  if (kind === "object") {
    const row = asRecord(toolChoice);
    if (!row || row.type !== "function") return false;
    const nested = asRecord(row.function);
    if (nested && typeof nested.name === "string" && nested.name.trim()) {
      return true;
    }
    if (typeof row.name === "string" && row.name.trim()) return true;
  }
  return false;
}

export function shouldAttemptGrsaiToolCompatFallback(args: {
  route: string;
  providerId: string;
  hasTools: boolean;
  toolsCount: number;
  toolChoice: unknown;
  incomingToolMessageCount: number;
  codexAutoToolRetryAttempted: boolean;
  nativeRetryReturnedToolCalls: boolean;
  nativeRetryHttpOk: boolean;
  nativeRetryFinishReason: string | null | undefined;
  alreadyAttempted: boolean;
  freshRemainingTotalMs: number;
}): boolean {
  if (args.route !== "/v1/responses") return false;
  if (!isGrsaiToolCompatProvider(args.providerId)) return false;
  if (!args.hasTools) return false;
  if (!(args.toolsCount > 0)) return false;
  if (!isGrsaiToolCompatEligibleToolChoice(args.toolChoice)) return false;
  if (args.incomingToolMessageCount > 0) return false;
  if (!args.codexAutoToolRetryAttempted) return false;
  if (args.nativeRetryReturnedToolCalls) return false;
  if (!args.nativeRetryHttpOk) return false;
  if (!isStopLikeFinish(args.nativeRetryFinishReason)) return false;
  if (args.alreadyAttempted) return false;
  if (!(args.freshRemainingTotalMs > 0)) return false;
  return true;
}

function forcedFunctionName(toolChoice: unknown): string | null {
  if (!toolChoice || typeof toolChoice !== "object" || Array.isArray(toolChoice)) {
    return null;
  }
  const row = toolChoice as Record<string, unknown>;
  if (row.type !== "function") return null;
  const nested = asRecord(row.function);
  if (nested && typeof nested.name === "string" && nested.name.trim()) {
    return nested.name.trim();
  }
  if (typeof row.name === "string" && row.name.trim()) {
    return row.name.trim();
  }
  return null;
}

/**
 * Prefer named tool_choice; otherwise the sole tool; otherwise first tool.
 * Never invents a name outside client tools.
 */
export function selectAllowedToolForGrsaiCompatFallback(args: {
  tools: unknown;
  toolChoice: unknown;
}): { name: string; parameters?: unknown } | null {
  const tools = extractClientToolFunctions(args.tools);
  if (tools.length === 0) return null;
  const forced = forcedFunctionName(args.toolChoice);
  if (forced) {
    const hit = tools.find((t) => t.name === forced);
    return hit ? { name: hit.name, parameters: hit.parameters } : null;
  }
  const first = tools[0]!;
  return { name: first.name, parameters: first.parameters };
}

function buildAllowedToolsInstruction(
  tools: ReturnType<typeof extractClientToolFunctions>,
  preferredName: string | null
): string {
  const lines: string[] = [
    "Allowed tools (select exactly one name):",
  ];
  for (const t of tools) {
    let params = "{}";
    try {
      params = JSON.stringify(t.parameters ?? { type: "object", properties: {} });
    } catch {
      params = '{"type":"object","properties":{}}';
    }
    lines.push(`- name=${t.name}; parameters=${params}`);
  }
  if (preferredName) {
    lines.push(`Preferred tool name: ${preferredName}`);
  }
  lines.push("Return JSON only. No prose.");
  return lines.join("\n");
}

/**
 * Request-scoped clone: strip native tools API fields and inject a minimal
 * compatibility instruction so GRSAI emits strict JSON (not Agent planning).
 */
export function buildGrsaiToolCompatFallbackUpstreamBody(
  upstreamBody: Record<string, unknown>,
  clientBody: Record<string, unknown>
): {
  body: Record<string, unknown>;
  selectedToolName: string;
  allowedToolNameHashes: string[];
  toolsCount: number;
} {
  const tools = extractClientToolFunctions(clientBody.tools);
  const selected = selectAllowedToolForGrsaiCompatFallback({
    tools: clientBody.tools,
    toolChoice: clientBody.tool_choice,
  });
  if (!selected || tools.length === 0) {
    throw new Error("P1090: no allowed client tools for compat fallback");
  }

  const next: Record<string, unknown> = { ...upstreamBody };
  delete next.tools;
  delete next.tool_choice;
  delete next.parallel_tool_calls;

  const messages = Array.isArray(next.messages)
    ? [...(next.messages as unknown[])]
    : [];
  messages.unshift({
    role: "system",
    content: GRSAI_TOOL_COMPAT_FALLBACK_SYSTEM_PROMPT,
  });
  messages.push({
    role: "user",
    content: buildAllowedToolsInstruction(tools, selected.name),
  });
  next.messages = messages;
  if (next.temperature === undefined) {
    next.temperature = 0;
  }

  return {
    body: next,
    selectedToolName: selected.name,
    allowedToolNameHashes: tools.map((t) => hashToolNameForLog(t.name)),
    toolsCount: tools.length,
  };
}

/**
 * Normalize minimal `{name,arguments}` into the tool_call envelope that
 * {@link parseToolIntentFromContent} already understands.
 */
export function normalizeGrsaiCompatFallbackJson(raw: unknown): unknown {
  const row = asRecord(raw);
  if (!row) return raw;
  if (typeof row.name === "string" && row.name.trim() && row.arguments !== undefined) {
    return {
      type: "tool_call",
      tool_calls: [
        {
          name: row.name.trim(),
          arguments: row.arguments,
        },
      ],
    };
  }
  return raw;
}

export function parseGrsaiToolCompatFallbackCompletion(args: {
  data: Record<string, unknown>;
  clientTools: unknown;
  toolChoice: unknown;
}): {
  intent: ParsedToolIntent;
  selectedToolName: string;
  argumentsByteLength: number;
} {
  const content = extractAssistantContentFromCompletion(args.data);
  let envelope: unknown = content;

  if (typeof content === "string") {
    const trimmed = content.trim();
    const tryParse = (raw: string): unknown | null => {
      try {
        return normalizeGrsaiCompatFallbackJson(JSON.parse(raw));
      } catch {
        return null;
      }
    };
    envelope =
      tryParse(trimmed) ??
      (() => {
        const m = trimmed.match(/\{[\s\S]*\}/);
        return m ? tryParse(m[0]!) : null;
      })() ??
      content;
  } else if (asRecord(content)) {
    envelope = normalizeGrsaiCompatFallbackJson(content);
  }

  const forced = forcedFunctionName(args.toolChoice);
  const intent = parseToolIntentFromContent({
    content: envelope,
    clientTools: args.clientTools,
    toolChoice: forced
      ? { type: "function", function: { name: forced } }
      : "required",
    parallelToolCalls: false,
  });

  if (intent.kind !== "tool_call" || intent.toolCalls.length === 0) {
    throw new Error("P1090: compat fallback did not produce tool_call");
  }

  const first = intent.toolCalls[0]!;
  const name = first.function.name;
  const argsStr = first.function.arguments ?? "{}";
  return {
    intent,
    selectedToolName: name,
    argumentsByteLength: Buffer.byteLength(argsStr, "utf8"),
  };
}

export function applyGrsaiToolCompatFallbackToCompletion(
  data: Record<string, unknown>,
  intent: ParsedToolIntent
): Record<string, unknown> {
  return applyToolIntentToChatCompletion(data, intent);
}

export function outboundLooksLikeGrsaiToolCompatFallback(
  body: Record<string, unknown>
): boolean {
  if (Array.isArray(body.tools) && body.tools.length > 0) return false;
  const messages = body.messages;
  if (!Array.isArray(messages)) return false;
  for (const m of messages) {
    const row = asRecord(m);
    if (!row) continue;
    if (row.role !== "system") continue;
    if (
      typeof row.content === "string" &&
      row.content.includes(GRSAI_TOOL_COMPAT_FALLBACK_MARKER)
    ) {
      return true;
    }
  }
  return false;
}
