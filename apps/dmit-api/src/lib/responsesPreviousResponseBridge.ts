/**
 * P1093 — Responses previous_response_id + function_call_output state bridge.
 *
 * Protocol adapter only:
 * - Does NOT execute tools
 * - Does NOT read/write customer files
 * - Does NOT invent or mutate tool output content (aside from protocol wrap)
 * - Rebuilds the already-proven full-input transcript for round2
 */

import { ApiError } from "../errors.js";
import { log } from "../logger.js";
import { extractChatToolCalls } from "./responsesTransform.js";
import {
  applyCanonicalResponsesPublicId,
  responsesPublicIdHashes,
} from "./responsesPublicId.js";
import {
  getResponsesToolStateHybrid,
  getStoreKind,
  hashForResponsesLog,
  hashToolsSchema,
  hashUserIdForStore,
  RESPONSES_TOOL_STATE_TTL_MS,
  saveResponsesToolStateHybrid,
  type ResponsesToolCallState,
  type ResponsesToolStateRecord,
} from "./responsesToolStateStore.js";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export type FunctionCallOutputItem = {
  type: "function_call_output";
  call_id: string;
  output: unknown;
};

export type PreviousResponseBridgeRequest = {
  previousResponseId: string;
  outputs: FunctionCallOutputItem[];
};

export type ResolvePreviousResponseResult =
  | {
      ok: true;
      state: ResponsesToolStateRecord;
      rebuiltInput: unknown[];
      restoredTools: unknown;
      restoredToolChoice: unknown;
    }
  | { ok: false; error: ApiError };

function isFunctionCallOutputItem(
  item: unknown
): item is FunctionCallOutputItem {
  const row = asRecord(item);
  if (!row || row.type !== "function_call_output") return false;
  const callId =
    typeof row.call_id === "string" && row.call_id.trim()
      ? row.call_id.trim()
      : "";
  if (!callId) return false;
  if (!("output" in row)) return false;
  return true;
}

/**
 * Detect OpenAI-style round2: previous_response_id + function_call_output items.
 * Returns null when the bridge should not activate.
 */
export function detectPreviousResponseToolOutputBridge(
  body: unknown
): PreviousResponseBridgeRequest | null {
  const row = asRecord(body);
  if (!row) return null;
  const previousResponseId =
    typeof row.previous_response_id === "string" &&
    row.previous_response_id.trim()
      ? row.previous_response_id.trim()
      : "";
  if (!previousResponseId) return null;

  const input = row.input;
  if (!Array.isArray(input) || input.length === 0) return null;

  const outputs: FunctionCallOutputItem[] = [];
  for (const item of input) {
    const rec = asRecord(item);
    if (!rec) continue;
    if (rec.type === "function_call_output") {
      const callId =
        typeof rec.call_id === "string" ? rec.call_id.trim() : "";
      if (!callId) {
        throw ApiError.badRequest(
          "Invalid responses request: function_call_output.call_id is required.",
          "invalid_function_call_output"
        );
      }
      if (!("output" in rec)) {
        throw ApiError.badRequest(
          "Invalid responses request: function_call_output.output is required.",
          "invalid_function_call_output"
        );
      }
      outputs.push({
        type: "function_call_output",
        call_id: callId,
        output: rec.output,
      });
      continue;
    }
    // Allow only function_call_output items in the minimal previous_response_id shape.
    // Mixed full transcripts should not use this bridge path.
    if (rec.type === "function_call" || rec.type === "message" || rec.role) {
      return null;
    }
  }

  if (outputs.length === 0) return null;
  // Strict: every input item must be function_call_output for bridge activation.
  if (outputs.length !== input.length) return null;

  return { previousResponseId, outputs };
}

function normalizeOriginalInputForStore(input: unknown): unknown {
  if (typeof input === "string") {
    return [
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: input }],
      },
    ];
  }
  if (Array.isArray(input)) {
    // Shallow copy items only — keep protocol fields, no mutation of content.
    return input.map((item) => {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        return { ...(item as Record<string, unknown>) };
      }
      return item;
    });
  }
  if (input && typeof input === "object") {
    return [{ ...(input as Record<string, unknown>) }];
  }
  return [];
}

function countTools(tools: unknown): number {
  return Array.isArray(tools) ? tools.length : 0;
}

function toolCallsFromResponsesOutput(
  response: Record<string, unknown>
): ResponsesToolCallState[] {
  const output = Array.isArray(response.output) ? response.output : [];
  const out: ResponsesToolCallState[] = [];
  for (const item of output) {
    const row = asRecord(item);
    if (!row || row.type !== "function_call") continue;
    const name =
      typeof row.name === "string" && row.name.trim() ? row.name.trim() : "";
    if (!name) continue;
    const callId =
      typeof row.call_id === "string" && row.call_id.trim()
        ? row.call_id.trim()
        : typeof row.id === "string" && row.id.trim()
          ? row.id.trim().replace(/^fc_/, "")
          : "";
    if (!callId) continue;
    const args =
      typeof row.arguments === "string" && row.arguments.trim()
        ? row.arguments
        : "{}";
    out.push({ callId, name, arguments: args });
  }
  return out;
}

function toolCallsFromChatResponse(
  chatResponse: Record<string, unknown>
): ResponsesToolCallState[] {
  return extractChatToolCalls(chatResponse).map((tc) => ({
    callId: tc.id,
    name: tc.name,
    arguments: tc.arguments,
  }));
}

export function extractToolCallsForStatePersist(
  response: Record<string, unknown>
): ResponsesToolCallState[] {
  if (response.object === "response") {
    return toolCallsFromResponsesOutput(response);
  }
  return toolCallsFromChatResponse(response);
}

/**
 * Persist round1 function_call state for later previous_response_id resume.
 * No-op when there are no tool calls.
 */
export async function persistResponsesToolStateFromRound1(args: {
  response: Record<string, unknown>;
  requestBody: Record<string, unknown>;
  userId: string;
  route?: string;
  providerId?: string;
  requestedModel?: string;
  resolvedModel?: string;
  /** Tokfai request id — canonical public response.id = resp_<requestId>. */
  requestId?: string;
  /** When false, durable write is fire-and-forget (stream path). Default true. */
  awaitDurable?: boolean;
}): Promise<boolean> {
  const toolCalls = extractToolCallsForStatePersist(args.response);
  if (toolCalls.length === 0) return false;

  const requestIdForCanon =
    (typeof args.requestId === "string" && args.requestId.trim()
      ? args.requestId.trim()
      : null) ||
    (typeof args.response.request_id === "string" &&
    args.response.request_id.trim()
      ? args.response.request_id.trim()
      : null) ||
    (typeof (args.response.tokfai as { request_id?: unknown } | undefined)
      ?.request_id === "string"
      ? String(
          (args.response.tokfai as { request_id: string }).request_id
        ).trim()
      : null) ||
    "";

  if (!requestIdForCanon) {
    // No request id → cannot form a stable public id; refuse to save under a
    // random key that clients cannot previous_response_id against.
    return false;
  }

  const { publicResponseId, previousResponseId, changed } =
    applyCanonicalResponsesPublicId(args.response, requestIdForCanon);

  const model =
    (typeof args.resolvedModel === "string" && args.resolvedModel.trim()
      ? args.resolvedModel.trim()
      : null) ||
    (typeof args.response.model === "string" && args.response.model.trim()
      ? args.response.model.trim()
      : null) ||
    (typeof args.requestBody.model === "string"
      ? args.requestBody.model.trim()
      : "") ||
    "";

  const tools = args.requestBody.tools;
  const toolChoice = args.requestBody.tool_choice;
  const toolsCount = countTools(tools);
  const ttlMs = RESPONSES_TOOL_STATE_TTL_MS;
  const first = toolCalls[0]!;
  const route = args.route ?? "/v1/responses";
  const providerId =
    typeof args.providerId === "string" && args.providerId.trim()
      ? args.providerId.trim()
      : "unknown";

  const baseRecord = {
    userIdHash: hashUserIdForStore(args.userId),
    model,
    route,
    providerId,
    originalInput: normalizeOriginalInputForStore(args.requestBody.input),
    toolCalls,
    tools: tools !== undefined ? tools : null,
    toolChoice: toolChoice !== undefined ? toolChoice : null,
    toolsCount,
    toolsSchemaHash: hashToolsSchema(tools),
    ttlMs,
  };

  // Primary key = canonical public response.id (what clients send back).
  await saveResponsesToolStateHybrid(
    {
      ...baseRecord,
      responseId: publicResponseId,
    },
    { awaitDurable: args.awaitDurable !== false }
  );

  let aliasSaved = false;
  // Additive legacy alias only — never replaces primary public id.
  if (
    changed &&
    previousResponseId &&
    previousResponseId !== publicResponseId &&
    previousResponseId.startsWith("resp_")
  ) {
    await saveResponsesToolStateHybrid(
      {
        ...baseRecord,
        responseId: previousResponseId,
      },
      { awaitDurable: args.awaitDurable !== false }
    );
    aliasSaved = true;
  }

  log.info("responses_tool_state_key_canonicalized", {
    route,
    model,
    providerId,
    ...responsesPublicIdHashes({
      publicResponseId,
      savedResponseId: publicResponseId,
    }),
    aliasSaved,
    toolsCount,
    callIdHash: hashForResponsesLog(first.callId),
    storeKind: getStoreKind(),
  });

  return true;
}

function rebuildFullInputFromState(
  state: ResponsesToolStateRecord,
  outputs: FunctionCallOutputItem[]
): unknown[] {
  const items: unknown[] = [];

  if (Array.isArray(state.originalInput)) {
    for (const item of state.originalInput) {
      // Skip any prior function_call / function_call_output from stored input;
      // we re-append tool calls from state + client outputs.
      const row = asRecord(item);
      if (
        row &&
        (row.type === "function_call" || row.type === "function_call_output")
      ) {
        continue;
      }
      items.push(item);
    }
  }

  for (const tc of state.toolCalls) {
    items.push({
      type: "function_call",
      call_id: tc.callId,
      name: tc.name,
      arguments: tc.arguments,
    });
  }

  for (const out of outputs) {
    items.push({
      type: "function_call_output",
      call_id: out.call_id,
      // Pass through client output unchanged (protocol wrap only).
      output: out.output,
    });
  }

  return items;
}

/**
 * Resolve previous_response_id state and rebuild full-input for existing
 * round2 path. Never fetches provider; never bills.
 */
export async function resolvePreviousResponseToolOutputBridge(args: {
  bridge: PreviousResponseBridgeRequest;
  userId: string;
  route?: string;
}): Promise<ResolvePreviousResponseResult> {
  // Memory first, then optional durable (no provider fetch, no billing).
  const lookupId = args.bridge.previousResponseId;
  const state = await getResponsesToolStateHybrid(lookupId);
  if (!state) {
    log.warn("responses_previous_response_id_missing", {
      route: args.route ?? "/v1/responses",
      responseIdHash: hashForResponsesLog(lookupId),
      ...responsesPublicIdHashes({
        publicResponseId: lookupId,
        lookupResponseId: lookupId,
      }),
      durableHit: false,
      toolsCount: 0,
      storeKind: getStoreKind(),
    });
    return {
      ok: false,
      error: ApiError.notFound(
        "Previous response not found or expired.",
        "previous_response_not_found"
      ),
    };
  }

  // Soft ownership check: same user hash when available.
  const callerHash = hashUserIdForStore(args.userId);
  if (state.userIdHash && state.userIdHash !== callerHash) {
    log.warn("responses_previous_response_id_user_mismatch", {
      route: args.route ?? "/v1/responses",
      responseIdHash: hashForResponsesLog(args.bridge.previousResponseId),
      toolsCount: state.toolsCount,
    });
    return {
      ok: false,
      error: ApiError.notFound(
        "Previous response not found or expired.",
        "previous_response_not_found"
      ),
    };
  }

  const knownIds = new Set(state.toolCalls.map((t) => t.callId));
  for (const out of args.bridge.outputs) {
    if (!knownIds.has(out.call_id)) {
      log.warn("responses_tool_call_id_mismatch", {
        route: args.route ?? "/v1/responses",
        responseIdHash: hashForResponsesLog(args.bridge.previousResponseId),
        callIdHash: hashForResponsesLog(out.call_id),
        toolsCount: state.toolCalls.length,
      });
      return {
        ok: false,
        error: ApiError.badRequest(
          "function_call_output.call_id does not match previous response.",
          "tool_call_id_mismatch"
        ),
      };
    }
  }

  const rebuiltInput = rebuildFullInputFromState(state, args.bridge.outputs);

  log.info("responses_previous_response_id_resolved", {
    route: args.route ?? "/v1/responses",
    responseIdHash: hashForResponsesLog(args.bridge.previousResponseId),
    ...responsesPublicIdHashes({
      publicResponseId: state.responseId,
      savedResponseId: state.responseId,
      lookupResponseId: args.bridge.previousResponseId,
    }),
    callIdHash: hashForResponsesLog(args.bridge.outputs[0]!.call_id),
    toolsCount: state.toolsCount,
    outputByteLength: (() => {
      try {
        return Buffer.byteLength(
          typeof args.bridge.outputs[0]!.output === "string"
            ? args.bridge.outputs[0]!.output
            : JSON.stringify(args.bridge.outputs[0]!.output ?? ""),
          "utf8"
        );
      } catch {
        return 0;
      }
    })(),
  });

  log.info("responses_tool_output_round2_rebuilt", {
    route: args.route ?? "/v1/responses",
    responseIdHash: hashForResponsesLog(args.bridge.previousResponseId),
    callIdHash: hashForResponsesLog(args.bridge.outputs[0]!.call_id),
    toolsCount: state.toolsCount,
    messageCount: rebuiltInput.length,
  });

  return {
    ok: true,
    state,
    rebuiltInput,
    restoredTools: state.tools,
    restoredToolChoice: state.toolChoice,
  };
}

/** Apply rebuilt input (+ restored tools) onto a mutable Responses request body. */
export function applyRebuiltPreviousResponseBody(
  body: Record<string, unknown>,
  resolved: Extract<ResolvePreviousResponseResult, { ok: true }>
): Record<string, unknown> {
  const next: Record<string, unknown> = {
    ...body,
    input: resolved.rebuiltInput,
  };
  // Drop previous_response_id so it never leaks into chat upstream.
  delete next.previous_response_id;

  if (next.tools === undefined && resolved.restoredTools != null) {
    next.tools = resolved.restoredTools;
  }
  if (next.tool_choice === undefined && resolved.restoredToolChoice != null) {
    next.tool_choice = resolved.restoredToolChoice;
  }
  return next;
}

export function isFunctionCallOutputItemExport(
  item: unknown
): boolean {
  return isFunctionCallOutputItem(item);
}
