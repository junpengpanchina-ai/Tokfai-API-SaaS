/**
 * P1055 — Native tool repair (one-shot) before emulated_json fallback.
 *
 * When Cursor/agent sends tools + explicit execution intent and the first
 * native provider response is plain assistant text (no tool_calls), prefer
 * one same-provider native retry with forced tool_choice over jumping
 * straight to emulated_json arbitration.
 *
 * Pure helpers only: no env / DB / network / billing side effects.
 * Never mutates the original client body.
 */

import {
  extractClientToolFunctions,
  inferRequiredAgentCapabilities,
  normalizeToolNameToCapability,
  type AgentToolCapability,
} from "./toolIntentCompiler.js";
import { GRSAI_NATIVE_TOOL_CHOICE_ADAPTER_PROVIDER } from "./grsaiNativeToolChoiceAdapter.js";
import type { ToolCallingMode } from "./toolCallingModeRegistry.js";

function isAutoOrMissingToolChoice(choice: unknown): boolean {
  return choice === "auto" || choice === null || choice === undefined;
}

function isPlainTextFinish(finishReason: string | null | undefined): boolean {
  if (finishReason == null || finishReason === "") return true;
  const r = finishReason.trim().toLowerCase();
  return r === "stop" || r === "end_turn" || r === "stop_sequence";
}

export type NativeToolChoiceStrategy = "named" | "required";

export type NativeRepairToolSelection = {
  requiredCapabilities: AgentToolCapability[];
  selectedCapability: AgentToolCapability;
  selectedToolName: string;
  toolChoiceStrategy: NativeToolChoiceStrategy;
};

/**
 * P1055 gate — narrower than P1048: only when native mode can still force a
 * real OpenAI tool_call. Caller must also enforce max-one via
 * `nativeToolRepairAttempted`.
 */
export function shouldAttemptNativeToolRepair(args: {
  hasTools: boolean;
  supportsToolsRequested: boolean;
  effectiveToolChoice: unknown;
  activeToolMode: ToolCallingMode | string;
  providerSupportsNativeTools: boolean;
  upstreamReturnedToolCalls: boolean;
  finishReason: string | null | undefined;
  explicitToolExecutionIntent: boolean;
  nativeToolRepairAttempted: boolean;
  resumeToolRound: boolean;
  freshRemainingTotalMs: number;
  /** Client object / required tool_choice must not be overridden. */
  clientToolChoiceIsAutoOrMissing: boolean;
}): boolean {
  if (!args.hasTools) return false;
  if (!args.supportsToolsRequested) return false;
  if (!args.providerSupportsNativeTools) return false;
  if (args.activeToolMode !== "native") return false;
  if (args.resumeToolRound) return false;
  if (args.nativeToolRepairAttempted) return false;
  if (!(args.freshRemainingTotalMs > 0)) return false;
  if (!args.clientToolChoiceIsAutoOrMissing) return false;
  if (!isAutoOrMissingToolChoice(args.effectiveToolChoice)) return false;
  if (args.explicitToolExecutionIntent !== true) return false;
  if (args.upstreamReturnedToolCalls) return false;
  if (!isPlainTextFinish(args.finishReason)) return false;
  return true;
}

/**
 * Prefer named OpenAI object tool_choice. GRSAI primary still uses named
 * (adapted outbound to filtered tools + required by existing P1024 helper).
 */
export function resolveNativeRepairToolChoiceStrategy(
  providerId: string
): NativeToolChoiceStrategy {
  void providerId;
  return "named";
}

/**
 * Pick one real client tool for the next step. Preference order follows
 * capability declaration (search → read → write → terminal → delete).
 * Never invents a tool name that is not in the client tools list.
 */
export function selectNativeRepairTool(args: {
  messages: unknown;
  tools: unknown;
  matchedToolNames?: readonly string[];
  providerId: string;
}): NativeRepairToolSelection | null {
  const tools = extractClientToolFunctions(args.tools);
  if (tools.length === 0) return null;

  const byName = new Map(tools.map((t) => [t.name, t]));
  const requiredCapabilities = inferRequiredAgentCapabilities({
    messages: args.messages,
    tools: args.tools,
  });

  const matched = (args.matchedToolNames ?? []).filter((n) => byName.has(n));
  const strategy = resolveNativeRepairToolChoiceStrategy(args.providerId);

  const caps: AgentToolCapability[] =
    requiredCapabilities.length > 0
      ? requiredCapabilities
      : uniqueCapsFromNames(matched);

  for (const cap of caps) {
    const matchedForCap = matched.find(
      (n) => normalizeToolNameToCapability(n) === cap
    );
    if (matchedForCap) {
      return {
        requiredCapabilities: caps,
        selectedCapability: cap,
        selectedToolName: matchedForCap,
        toolChoiceStrategy: strategy,
      };
    }
    const tool = tools.find(
      (t) => normalizeToolNameToCapability(t.name) === cap
    );
    if (tool) {
      return {
        requiredCapabilities: caps,
        selectedCapability: cap,
        selectedToolName: tool.name,
        toolChoiceStrategy: strategy,
      };
    }
  }

  if (matched[0]) {
    const cap = normalizeToolNameToCapability(matched[0]);
    if (cap) {
      return {
        requiredCapabilities: caps.length > 0 ? caps : [cap],
        selectedCapability: cap,
        selectedToolName: matched[0],
        toolChoiceStrategy: strategy,
      };
    }
  }

  return null;
}

/**
 * Request-scoped upstream clone with forced native tool_choice.
 * Does not mutate `upstreamBody` or the original client body.
 */
export function applyNativeToolRepairToUpstreamBody(args: {
  upstreamBody: Record<string, unknown>;
  selection: NativeRepairToolSelection;
  providerId: string;
}): {
  body: Record<string, unknown>;
  toolChoiceStrategy: NativeToolChoiceStrategy;
  selectedToolName: string;
} {
  const next: Record<string, unknown> = { ...args.upstreamBody };
  const { selectedToolName, toolChoiceStrategy } = args.selection;

  if (toolChoiceStrategy === "named") {
    if (args.providerId === GRSAI_NATIVE_TOOL_CHOICE_ADAPTER_PROVIDER) {
      // P1024 — GRSAI rejects object tool_choice; filter + required outbound.
      const tools = Array.isArray(next.tools) ? next.tools : [];
      next.tools = tools.filter((row) => {
        if (!row || typeof row !== "object" || Array.isArray(row)) return false;
        const rec = row as Record<string, unknown>;
        const fn =
          rec.function && typeof rec.function === "object" && !Array.isArray(rec.function)
            ? (rec.function as Record<string, unknown>)
            : rec;
        return typeof fn.name === "string" && fn.name.trim() === selectedToolName;
      });
      next.tool_choice = "required";
    } else {
      next.tool_choice = {
        type: "function",
        function: { name: selectedToolName },
      };
    }
  } else {
    next.tool_choice = "required";
  }

  return {
    body: next,
    toolChoiceStrategy,
    selectedToolName,
  };
}

function uniqueCapsFromNames(
  names: readonly string[]
): AgentToolCapability[] {
  const order: AgentToolCapability[] = [
    "search",
    "read",
    "write",
    "terminal",
    "delete",
  ];
  const seen = new Set<AgentToolCapability>();
  for (const n of names) {
    const cap = normalizeToolNameToCapability(n);
    if (cap) seen.add(cap);
  }
  return order.filter((c) => seen.has(c));
}
