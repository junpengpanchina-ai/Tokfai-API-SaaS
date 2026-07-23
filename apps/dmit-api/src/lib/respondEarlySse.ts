import type { Context } from "hono";

import { ApiError, buildClientErrorBody } from "../errors.js";
import {
  chatCompletionRoleSseFrame,
  chatCompletionSseBodyAfterRole,
  chatCompletionToSseBody,
} from "./chatCompletionSse.js";
import type { ExecuteChatCompletionResult } from "./executeChatCompletion.js";
import { executeChatCompletion } from "./executeChatCompletion.js";
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

function failureToSseEnvelope(
  result: ExecuteChatCompletionResult & { ok: false }
): string {
  const message = safeInvalidRequestMessage(
    result.errorMessage,
    "Invalid request."
  );
  const code =
    (typeof result.errorCode === "string" && result.errorCode.trim()) ||
    "invalid_request_error";
  const err = new ApiError({
    status: result.httpStatus || 500,
    message,
    publicMessage: message,
    code,
  });
  const body = buildClientErrorBody(err, result.requestId);
  // Mid-stream failure: preserve standard envelope shape; never charge.
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

function writeResponsesRest(
  write: EarlySseWrite,
  response: Record<string, unknown>
) {
  write(responsesSseBodyAfterCreated(response, { skipCreated: true }));
}

/**
 * stream=true /v1/chat/completions: flush role chunk immediately after precheck,
 * then synthesize remaining SSE from the completed upstream response.
 * Precheck failures still return the JSON error envelope (no SSE, no charge).
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
    return respondExecuteChatCompletionFailure(c, result);
  }

  const response = args.toResponsesPayload(result);
  return createEarlySseResponse({
    requestId: result.requestId,
    firstFrame: responsesCreatedSseFrame({
      responseId: typeof response.id === "string" ? response.id : undefined,
      model: typeof response.model === "string" ? response.model : undefined,
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
  const sseBody = chatCompletionToSseBody(response);
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
