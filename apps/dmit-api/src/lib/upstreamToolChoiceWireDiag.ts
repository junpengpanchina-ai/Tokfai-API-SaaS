/**
 * P1116R2 / P1119 — Privacy-safe upstream tool_choice / tools-shape diagnostics.
 *
 * Enumerates tool *types*, tool_choice *kinds*, name *hashes*, and schema
 * *byte lengths* only.
 * Never logs tool names, descriptions, parameters bodies, args, prompts,
 * paths, Authorization, or API keys.
 */

import { createHash } from "node:crypto";
import { toolChoiceKind } from "./cursorToolProtocol.js";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function utf8JsonByteLength(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value ?? null), "utf8");
  } catch {
    return 0;
  }
}

function hashToolName8(name: string): string {
  return createHash("sha256").update(name).digest("hex").slice(0, 8);
}

/** Safe short type token for histograms (never a tool name). */
function safeTypeToken(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) return "missing";
  const t = raw.trim().toLowerCase();
  if (t.length > 40) return "long_type";
  if (!/^[a-z0-9_./+-]+$/i.test(t)) return "opaque_type";
  return t;
}

export type UpstreamToolShapeClass =
  | "function_chat_nested"
  | "function_responses_flat"
  | "non_function"
  | "malformed";

export type UpstreamToolsShapeSummary = {
  toolsCount: number;
  toolTypesSummary: string;
  hasFunctionTools: boolean;
  hasUnsupportedToolTypes: boolean;
  unsupportedToolTypeCount: number;
  functionChatNestedCount: number;
  functionResponsesFlatCount: number;
  bodyShape: "response_to_chat" | "chat_native" | "mixed" | "unknown" | "empty";
};

/**
 * Classify a single tool row without reading name/schema content beyond
 * structural presence of nested `function` vs flat `name`.
 */
export function classifyUpstreamToolRow(tool: unknown): {
  shape: UpstreamToolShapeClass;
  typeToken: string;
} {
  const row = asRecord(tool);
  if (!row) return { shape: "malformed", typeToken: "null" };
  const typeToken = safeTypeToken(row.type);
  const nested = asRecord(row.function);
  const nestedName =
    nested && typeof nested.name === "string" && nested.name.trim()
      ? true
      : false;
  const flatName =
    typeof row.name === "string" && row.name.trim() ? true : false;

  if (typeToken === "function" || typeToken === "missing") {
    if (nestedName) {
      return { shape: "function_chat_nested", typeToken: "function" };
    }
    if (flatName && !nested) {
      return { shape: "function_responses_flat", typeToken: "function" };
    }
    if (flatName && nested && !nestedName) {
      return { shape: "function_responses_flat", typeToken: "function" };
    }
  }
  if (typeToken !== "function" && typeToken !== "missing") {
    return { shape: "non_function", typeToken };
  }
  return { shape: "malformed", typeToken };
}

export function summarizeUpstreamToolsShape(
  tools: unknown
): UpstreamToolsShapeSummary {
  if (!Array.isArray(tools) || tools.length === 0) {
    return {
      toolsCount: 0,
      toolTypesSummary: "",
      hasFunctionTools: false,
      hasUnsupportedToolTypes: false,
      unsupportedToolTypeCount: 0,
      functionChatNestedCount: 0,
      functionResponsesFlatCount: 0,
      bodyShape: "empty",
    };
  }

  const typeCounts = new Map<string, number>();
  let functionChatNestedCount = 0;
  let functionResponsesFlatCount = 0;
  let unsupportedToolTypeCount = 0;

  for (const tool of tools) {
    const { shape, typeToken } = classifyUpstreamToolRow(tool);
    typeCounts.set(typeToken, (typeCounts.get(typeToken) || 0) + 1);
    if (shape === "function_chat_nested") functionChatNestedCount += 1;
    else if (shape === "function_responses_flat") {
      functionResponsesFlatCount += 1;
      // Flat function tools are not Chat Completions-native; count as
      // unsupported *for direct upstream* until adapted.
      unsupportedToolTypeCount += 1;
    } else {
      unsupportedToolTypeCount += 1;
    }
  }

  const toolTypesSummary = [...typeCounts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `${k}:${v}`)
    .join(",");

  const hasFunctionTools =
    functionChatNestedCount + functionResponsesFlatCount > 0;

  let bodyShape: UpstreamToolsShapeSummary["bodyShape"] = "unknown";
  if (functionChatNestedCount === tools.length) bodyShape = "chat_native";
  else if (functionResponsesFlatCount === tools.length) {
    bodyShape = "response_to_chat"; // inbound Responses flat (pre-adapt)
  } else if (
    functionChatNestedCount > 0 &&
    functionResponsesFlatCount === 0 &&
    unsupportedToolTypeCount === tools.length - functionChatNestedCount
  ) {
    bodyShape = "mixed";
  } else if (functionChatNestedCount > 0 && functionResponsesFlatCount > 0) {
    bodyShape = "mixed";
  } else if (functionChatNestedCount > 0) {
    bodyShape = "chat_native";
  }

  return {
    toolsCount: tools.length,
    toolTypesSummary,
    hasFunctionTools,
    hasUnsupportedToolTypes: unsupportedToolTypeCount > 0,
    unsupportedToolTypeCount,
    functionChatNestedCount,
    functionResponsesFlatCount,
    bodyShape,
  };
}

/** Privacy-safe tool_choice wire shape (no names). */
export type UpstreamToolChoiceShapeSummary = {
  kind: string;
  typeToken: string;
  shape:
    | "string"
    | "chat_named"
    | "responses_named"
    | "object_other"
    | "missing"
    | "null";
};

export function summarizeToolChoiceWireShape(
  toolChoice: unknown
): UpstreamToolChoiceShapeSummary {
  if (toolChoice === undefined) {
    return { kind: "missing", typeToken: "missing", shape: "missing" };
  }
  if (toolChoice === null) {
    return { kind: "null", typeToken: "null", shape: "null" };
  }
  if (typeof toolChoice === "string") {
    return {
      kind: toolChoiceKind(toolChoice),
      typeToken: "string",
      shape: "string",
    };
  }
  const row = asRecord(toolChoice);
  if (!row) {
    return {
      kind: toolChoiceKind(toolChoice),
      typeToken: "opaque",
      shape: "object_other",
    };
  }
  const typeToken = safeTypeToken(row.type);
  const nested = asRecord(row.function);
  const nestedName =
    nested && typeof nested.name === "string" && nested.name.trim()
      ? true
      : false;
  const flatName =
    typeof row.name === "string" && row.name.trim() ? true : false;
  if (typeToken === "function" && nestedName) {
    return {
      kind: toolChoiceKind(toolChoice),
      typeToken: "function",
      shape: "chat_named",
    };
  }
  if (typeToken === "function" && flatName && !nestedName) {
    return {
      kind: toolChoiceKind(toolChoice),
      typeToken: "function",
      shape: "responses_named",
    };
  }
  return {
    kind: toolChoiceKind(toolChoice),
    typeToken,
    shape: "object_other",
  };
}

/**
 * Per-tool numeric / hash fingerprint. Never includes name/description/schema
 * bodies — only hashes and byte lengths / missing-field counts.
 */
export type UpstreamToolsSchemaFingerprint = {
  toolsCount: number;
  toolTypesSummary: string;
  toolNameHashes: string[];
  parametersByteLengths: number[];
  largestParametersBytes: number;
  totalParametersBytes: number;
  missingNameCount: number;
  missingParametersCount: number;
  /** Present on inbound Responses-ish tools; not copied by chat adapter. */
  inputSchemaPresentCount: number;
  missingTypeCount: number;
  nonFunctionPassthroughCount: number;
  chatNestedFunctionCount: number;
  responsesFlatFunctionCount: number;
  emptyParametersStubCount: number;
};

function isEmptyParametersStub(params: unknown): boolean {
  const row = asRecord(params);
  if (!row) return false;
  if (row.type !== "object") return false;
  const props = row.properties;
  if (props === undefined) return true;
  const propRow = asRecord(props);
  if (!propRow) return Array.isArray(props) && props.length === 0;
  return Object.keys(propRow).length === 0;
}

export function summarizeUpstreamToolsSchemaFingerprint(
  tools: unknown
): UpstreamToolsSchemaFingerprint {
  const empty: UpstreamToolsSchemaFingerprint = {
    toolsCount: 0,
    toolTypesSummary: "",
    toolNameHashes: [],
    parametersByteLengths: [],
    largestParametersBytes: 0,
    totalParametersBytes: 0,
    missingNameCount: 0,
    missingParametersCount: 0,
    inputSchemaPresentCount: 0,
    missingTypeCount: 0,
    nonFunctionPassthroughCount: 0,
    chatNestedFunctionCount: 0,
    responsesFlatFunctionCount: 0,
    emptyParametersStubCount: 0,
  };
  if (!Array.isArray(tools) || tools.length === 0) return empty;

  const typeCounts = new Map<string, number>();
  const toolNameHashes: string[] = [];
  const parametersByteLengths: number[] = [];
  let missingNameCount = 0;
  let missingParametersCount = 0;
  let inputSchemaPresentCount = 0;
  let missingTypeCount = 0;
  let nonFunctionPassthroughCount = 0;
  let chatNestedFunctionCount = 0;
  let responsesFlatFunctionCount = 0;
  let emptyParametersStubCount = 0;
  let largestParametersBytes = 0;
  let totalParametersBytes = 0;

  for (const tool of tools) {
    const { shape, typeToken } = classifyUpstreamToolRow(tool);
    typeCounts.set(typeToken, (typeCounts.get(typeToken) || 0) + 1);
    if (typeToken === "missing") missingTypeCount += 1;
    if (shape === "function_chat_nested") chatNestedFunctionCount += 1;
    else if (shape === "function_responses_flat") {
      responsesFlatFunctionCount += 1;
    } else if (shape === "non_function") {
      nonFunctionPassthroughCount += 1;
    }

    const row = asRecord(tool);
    if (!row) {
      missingNameCount += 1;
      missingParametersCount += 1;
      parametersByteLengths.push(0);
      continue;
    }

    const nested = asRecord(row.function);
    const nameRaw =
      (nested && typeof nested.name === "string" && nested.name.trim()
        ? nested.name.trim()
        : null) ||
      (typeof row.name === "string" && row.name.trim() ? row.name.trim() : null);
    if (nameRaw) {
      if (toolNameHashes.length < 20) {
        toolNameHashes.push(hashToolName8(nameRaw));
      }
    } else {
      missingNameCount += 1;
    }

    const params =
      nested && nested.parameters !== undefined
        ? nested.parameters
        : row.parameters !== undefined
          ? row.parameters
          : undefined;
    const hasInputSchema =
      row.inputSchema !== undefined ||
      row.input_schema !== undefined ||
      (nested != null &&
        (nested.inputSchema !== undefined ||
          nested.input_schema !== undefined));
    if (hasInputSchema) inputSchemaPresentCount += 1;

    if (params === undefined) {
      missingParametersCount += 1;
      parametersByteLengths.push(0);
    } else {
      const bl = utf8JsonByteLength(params);
      parametersByteLengths.push(bl);
      totalParametersBytes += bl;
      if (bl > largestParametersBytes) largestParametersBytes = bl;
      if (isEmptyParametersStub(params)) emptyParametersStubCount += 1;
    }
  }

  const toolTypesSummary = [...typeCounts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `${k}:${v}`)
    .join(",");

  return {
    toolsCount: tools.length,
    toolTypesSummary,
    toolNameHashes,
    parametersByteLengths: parametersByteLengths.slice(0, 20),
    largestParametersBytes,
    totalParametersBytes,
    missingNameCount,
    missingParametersCount,
    inputSchemaPresentCount,
    missingTypeCount,
    nonFunctionPassthroughCount,
    chatNestedFunctionCount,
    responsesFlatFunctionCount,
    emptyParametersStubCount,
  };
}

export function summarizeOutboundToolChoiceWire(args: {
  inboundToolChoice: unknown;
  outboundToolChoice: unknown;
  outboundTools: unknown;
  route: string;
}): {
  inboundToolChoiceKind: string;
  outboundToolChoiceKind: string;
  outboundToolChoiceShape: UpstreamToolChoiceShapeSummary;
  tools: UpstreamToolsShapeSummary;
  schema: UpstreamToolsSchemaFingerprint;
} {
  return {
    inboundToolChoiceKind: toolChoiceKind(args.inboundToolChoice),
    outboundToolChoiceKind: toolChoiceKind(args.outboundToolChoice),
    outboundToolChoiceShape: summarizeToolChoiceWireShape(
      args.outboundToolChoice
    ),
    tools: summarizeUpstreamToolsShape(args.outboundTools),
    schema: summarizeUpstreamToolsSchemaFingerprint(args.outboundTools),
  };
}
