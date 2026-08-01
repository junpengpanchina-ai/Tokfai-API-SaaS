import type { Context } from "hono";

import { ApiError, buildClientErrorBody, errorTypeForCode } from "../errors.js";
import type { ExecuteChatCompletionResult } from "./executeChatCompletion.js";
import { executeChatCompletion } from "./executeChatCompletion.js";
import {
  chatCompletionRoleSseFrame,
  chatCompletionSseBodyAfterRole,
  chatCompletionToSseBody,
  sanitizeChatCompletionSseOutboundText,
} from "./chatCompletionSse.js";
import {
  createEarlySseResponse,
  runWithEarlySseGate,
  type EarlySseWrite,
} from "./earlySseStream.js";
import { respondExecuteChatCompletionFailure } from "./handleExecuteChatCompletionResult.js";
import {
  responsesCreatedSseFrame,
  responsesSseBodyAfterCreated,
  responsesToSseBody,
} from "./responsesSse.js";
import { safeInvalidRequestMessage } from "./chatCompletionDiagnostics.js";
import {
  forcedToolFailureSseResponse,
  isForcedToolFailureCode,
  notBillableErrorToSseBody,
  isToolRoutingGuardErrorCode,
} from "./toolCallFailureEnvelope.js";

function failureToSseEnvelope(
  result: ExecuteChatCompletionResult & { ok: false }
): string {
  if (
    isForcedToolFailureCode(result.errorCode) ||
    isToolRoutingGuardErrorCode(result.errorCode)
  ) {
    return notBillableErrorToSseBody({
      code: result.errorCode,
      message: result.errorMessage,
      requestId: result.requestId,
      httpStatus: result.httpStatus,
    });
  }
  const message = safeInvalidRequestMessage(
    result.errorMessage,
    "Invalid request."
  );
  const status = result.httpStatus || 500;
  const code =
    (typeof result.errorCode === "string" && result.errorCode.trim()) ||
    "invalid_request_error";
  const err = new ApiError({
    status,
    message,
    publicMessage: message,
    code,
    type: errorTypeForCode(code, status),
  });
  const body = buildClientErrorBody(err, result.requestId);
  const payload = {
    ...body,
    tokfai: { billing_status: "not_billable", credits_charged: 0 },
  };
  return `data: ${JSON.stringify(payload)}\n\ndata: [DONE]\n\n`;
}

function writeChatRest(write: EarlySseWrite, result: ExecuteChatCompletionResult) {
  if (!result.ok) return;
  write(chatCompletionSseBodyAfterRole(result.response));
}

function asSseRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * P991 last-mile SSE sanitizer for Cherry Studio /v1/responses.
 * Only patches `response.completed` blocks when `response.status === "completed"`
 * so clients get an explicit stop signal (not inferred "other").
 * Does not rewrite the business response object; does not touch chat/completions;
 * never upgrades failed / errored / incomplete into stop.
 */
export function sanitizeResponsesCompletedForCherry(sseText: string): string {
  if (!sseText || !sseText.includes("response.completed")) return sseText;

  const blocks = sseText.split("\n\n");
  const out: string[] = [];

  for (const block of blocks) {
    if (!block.trim()) {
      out.push(block);
      continue;
    }
    out.push(sanitizeOneResponsesCompletedBlock(block));
  }

  return out.join("\n\n");
}

function sanitizeOneResponsesCompletedBlock(block: string): string {
  const lines = block.split("\n");
  let eventName: string | undefined;
  let dataIdx = -1;
  let dataRaw: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataIdx = i;
      dataRaw = line.startsWith("data: ")
        ? line.slice(6)
        : line.slice(5).trimStart();
    }
  }

  if (
    dataIdx < 0 ||
    dataRaw === undefined ||
    !dataRaw ||
    dataRaw === "[DONE]" ||
    dataRaw[0] !== "{"
  ) {
    return block;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(dataRaw);
  } catch {
    return block;
  }

  const payload = asSseRecord(parsed);
  if (!payload) return block;

  const isCompletedEvent =
    eventName === "response.completed" ||
    payload.type === "response.completed";
  if (!isCompletedEvent) return block;

  // Never rewrite failure / incomplete terminals as stop.
  if (
    eventName === "response.failed" ||
    eventName === "response.incomplete" ||
    eventName === "response.errored" ||
    payload.type === "response.failed" ||
    payload.type === "response.incomplete" ||
    payload.type === "error"
  ) {
    return block;
  }

  const response = asSseRecord(payload.response);
  if (!response || response.status !== "completed") return block;

  const nextResponse: Record<string, unknown> = { ...response };
  if (!("incomplete_details" in nextResponse)) {
    nextResponse.incomplete_details = null;
  }
  nextResponse.finish_reason = "stop";

  const nextPayload: Record<string, unknown> = {
    ...payload,
    response: nextResponse,
    finish_reason: "stop",
  };

  const nextLines = [...lines];
  nextLines[dataIdx] = `data: ${JSON.stringify(nextPayload)}`;
  return nextLines.join("\n");
}

function writeResponsesRest(
  write: EarlySseWrite,
  response: Record<string, unknown>
) {
  const raw = responsesSseBodyAfterCreated(response, { skipCreated: true });
  write(sanitizeResponsesCompletedForCherry(raw));
}

/**
 * stream=true /v1/chat/completions: flush role chunk immediately after precheck,
 * then synthesize remaining SSE from the completed upstream response.
 * Precheck failures still return the JSON error envelope (no SSE, no charge).
 * P972: forced tool failures always return SSE error + [DONE] (not_billable).
 */
export async function respondChatCompletionEarlySse(
  c: Context,
  args: {
    caller: Parameters<typeof executeChatCompletion>[0]["caller"];
    requestId: string;
    body: Parameters<typeof executeChatCompletion>[0]["body"];
    limitKey: string;
    idempotencyKey: string | null;
  }
): Promise<Response> {
  const gated = await runWithEarlySseGate<ExecuteChatCompletionResult>({
    requestId: args.requestId,
    firstFrame: chatCompletionRoleSseFrame(),
    execute: ({ onAfterPrecheck }) =>
      executeChatCompletion({
        caller: args.caller,
        requestId: args.requestId,
        body: args.body,
        limitKey: args.limitKey,
        idempotencyKey: args.idempotencyKey,
        clientStream: true,
        onAfterPrecheck,
      }),
    isFailure: (result) => !result.ok,
    writeRest: writeChatRest,
    writeFailure: (write, result) => {
      if (!result.ok) write(failureToSseEnvelope(result));
    },
  });

  if (!("earlyDone" in gated)) {
    return gated;
  }

  const result = gated.earlyDone;
  if (!result.ok) {
    // P972/P974 — stream tool guard failures: SSE error + [DONE] (not JSON).
    if (
      isForcedToolFailureCode(result.errorCode) ||
      isToolRoutingGuardErrorCode(result.errorCode)
    ) {
      return forcedToolFailureSseResponse({
        code: result.errorCode,
        message: result.errorMessage,
        requestId: result.requestId || args.requestId,
        httpStatus: result.httpStatus,
      });
    }
    return respondExecuteChatCompletionFailure(c, result);
  }

  // Idempotent replay (or other sync success before upstream): still early-flush.
  return createEarlySseResponse({
    requestId: result.requestId,
    firstFrame: chatCompletionRoleSseFrame(),
    produceRest: async (write) => {
      write(chatCompletionSseBodyAfterRole(result.response));
    },
  });
}

/**
 * stream=true /v1/responses: flush response.created immediately after precheck.
 */
export async function respondResponsesEarlySse(
  c: Context,
  args: {
    caller: Parameters<typeof executeChatCompletion>[0]["caller"];
    requestId: string;
    body: Parameters<typeof executeChatCompletion>[0]["body"];
    limitKey: string;
    idempotencyKey: string | null;
    toResponsesPayload: (
      result: ExecuteChatCompletionResult & { ok: true }
    ) => Record<string, unknown>;
  }
): Promise<Response> {
  const gated = await runWithEarlySseGate<ExecuteChatCompletionResult>({
    requestId: args.requestId,
    firstFrame: responsesCreatedSseFrame(),
    execute: ({ onAfterPrecheck }) =>
      executeChatCompletion({
        caller: args.caller,
        requestId: args.requestId,
        body: args.body,
        limitKey: args.limitKey,
        idempotencyKey: args.idempotencyKey,
        route: "/v1/responses",
        clientStream: true,
        onAfterPrecheck,
      }),
    isFailure: (result) => !result.ok,
    writeRest: (write, result) => {
      if (!result.ok) return;
      const response = args.toResponsesPayload(result);
      writeResponsesRest(write, response);
    },
    writeFailure: (write, result) => {
      if (!result.ok) write(failureToSseEnvelope(result));
    },
  });

  if (!("earlyDone" in gated)) {
    return gated;
  }

  const result = gated.earlyDone;
  if (!result.ok) {
    if (
      isForcedToolFailureCode(result.errorCode) ||
      isToolRoutingGuardErrorCode(result.errorCode)
    ) {
      return forcedToolFailureSseResponse({
        code: result.errorCode,
        message: result.errorMessage,
        requestId: result.requestId || args.requestId,
        httpStatus: result.httpStatus,
      });
    }
    return respondExecuteChatCompletionFailure(c, result);
  }

  const response = args.toResponsesPayload(result);
  return createEarlySseResponse({
    requestId: result.requestId,
    firstFrame: responsesCreatedSseFrame({
      responseId: typeof response.id === "string" ? response.id : undefined,
      model: typeof response.model === "string" ? response.model : undefined,
      createdAt:
        typeof response.created_at === "number"
          ? response.created_at
          : undefined,
    }),
    produceRest: async (write) => {
      writeResponsesRest(write, response);
    },
  });
}

/** Buffered full-body SSE (noop / legacy paths that already have the response). */
export function respondBufferedChatSse(
  response: Record<string, unknown>,
  requestId: string
): Response {
  // Same last-mile sanitize as controller.enqueue (noop / buffered path).
  const sseBody = sanitizeChatCompletionSseOutboundText(
    chatCompletionToSseBody(response)
  );
  return new Response(sseBody, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Content-Length": String(Buffer.byteLength(sseBody, "utf8")),
      "Cache-Control": "no-cache, no-transform",
      Connection: "close",
      "X-Request-Id": requestId,
    },
  });
}

export function respondBufferedResponsesSse(
  response: Record<string, unknown>,
  requestId: string
): Response {
  const sseBody = responsesToSseBody(response);
  return new Response(sseBody, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      "X-Request-Id": requestId,
    },
  });
}
