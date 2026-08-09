import type { Context } from "hono";

import { ApiError, buildClientErrorBody } from "../errors.js";
import type { ChatCaller } from "../middleware/chatAuth.js";
import { respondApiError } from "../middleware/error.js";
import {
  gatewayLimitKey,
  getGlobalUpstreamInflight,
  getKeyInflight,
} from "../gateway/concurrency.js";
import {
  normalizeChatMessages,
  normalizeClientChatCompletionBody,
} from "./chatCompletionCompat.js";
import {
  buildChatValidationFailureTokfai,
  buildEmptyMessagesNoopChatCompletion,
  formatZodIssues,
  logChatCompletionClientNormalized,
  logChatCompletionEmptyMessagesNoop,
  logChatCompletionInvalidRequest,
  safeInvalidRequestMessage,
} from "./chatCompletionDiagnostics.js";
import {
  ChatCompletionRequestSchema,
  executeChatCompletion,
} from "./executeChatCompletion.js";
import { respondExecuteChatCompletionFailure } from "./handleExecuteChatCompletionResult.js";
import { parseIdempotencyKey } from "./idempotency.js";
import { readJsonBodyWithLimit } from "./readJsonBodyWithLimit.js";
import {
  respondBufferedChatSse,
  respondChatCompletionEarlySse,
} from "./respondEarlySse.js";
import { normalizeOpenAiFinishReasonOnChatCompletion } from "./openaiFinishReason.js";
import { resolveChatModel } from "../upstream/modelAliases.js";
import { logGatewayRejection } from "../routes/chatGatewayLogs.js";

function respondChatValidationError(
  c: Context,
  err: ApiError,
  requestId: string,
  requestedModel?: string | null
): Response {
  const tokfai = buildChatValidationFailureTokfai({
    requestId,
    requestedModel,
    errorCode: err.code ?? "invalid_request_error",
  });
  const body = {
    ...buildClientErrorBody(err, requestId),
    tokfai,
  };
  const text = JSON.stringify(body);
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": String(Buffer.byteLength(text, "utf8")),
    "Cache-Control": "no-store",
    "X-Request-Id": requestId,
  };
  try {
    c.header("X-Request-Id", requestId);
  } catch {
    // ignore
  }
  return new Response(text, { status: err.status || 400, headers });
}

/**
 * Shared OpenAI chat-completions HTTP pipeline used by:
 *   - POST /v1/chat/completions
 *   - Azure OpenAI ingress (after deployment/auth normalize only)
 *
 * Always executes the production /v1/chat/completions main chain
 * (executeChatCompletion + early SSE). Does not implement Agent logic.
 */
export async function runChatCompletionsHttp(
  c: Context,
  args: {
    caller: ChatCaller;
    requestId: string;
    /** Diagnostic route label; execution policies stay on chat completions. */
    route?: string;
    /** Pre-read / pre-normalized body (Azure ingress sets model from deployment). */
    rawBody?: unknown;
  }
): Promise<Response> {
  const caller = args.caller;
  const requestId = args.requestId;
  const limitKey = gatewayLimitKey(caller.apiKeyId, caller.userId);
  const route = args.route ?? "/v1/chat/completions";

  let rawBody: unknown;
  if (args.rawBody !== undefined) {
    rawBody = args.rawBody;
  } else {
    try {
      rawBody = await readJsonBodyWithLimit(c);
    } catch (err) {
      if (err instanceof ApiError && err.code === "request_body_too_large") {
        await logGatewayRejection({
          caller,
          requestId,
          err,
          limitKey,
          keyInflight: await getKeyInflight(limitKey),
          globalInflight: await getGlobalUpstreamInflight(),
        });
      }
      if (err instanceof ApiError && err.status === 400) {
        logChatCompletionInvalidRequest({
          requestId,
          route,
          body: null,
          rejectedReason: safeInvalidRequestMessage(
            err.publicMessage,
            "Invalid JSON body."
          ),
          validationErrors: [err.code ?? "invalid_request_error"],
          normalized: false,
          noop: false,
        });
        return respondApiError(c, err, requestId);
      }
      throw err;
    }
  }

  // Cherry Studio compat: normalize/sanitize BEFORE schema validation.
  // messages missing / null / [] / non-array / all-empty-content → 200 noop.
  const clientNorm = normalizeClientChatCompletionBody(rawBody);
  if (clientNorm.noop) {
    logChatCompletionEmptyMessagesNoop({
      requestId,
      route,
      body: clientNorm.body,
      originalBody: rawBody,
      normalized: clientNorm.normalized,
      rejectedReason: clientNorm.rejectedReason,
    });
    const noop = normalizeOpenAiFinishReasonOnChatCompletion(
      buildEmptyMessagesNoopChatCompletion({
        requestId,
        body: clientNorm.body,
      }),
      { route: "/v1/chat/completions" }
    );
    const wantsStream =
      (clientNorm.body !== null &&
        typeof clientNorm.body === "object" &&
        !Array.isArray(clientNorm.body) &&
        (clientNorm.body as { stream?: unknown }).stream === true) ||
      (rawBody !== null &&
        typeof rawBody === "object" &&
        !Array.isArray(rawBody) &&
        (rawBody as { stream?: unknown }).stream === true);
    if (wantsStream) {
      return respondBufferedChatSse(noop, requestId);
    }
    return c.json(noop);
  }

  if (clientNorm.normalized) {
    logChatCompletionClientNormalized({
      requestId,
      route,
      body: clientNorm.body,
      originalBody: rawBody,
    });
  }

  const body = clientNorm.body;
  const parsed = ChatCompletionRequestSchema.safeParse(body);
  if (!parsed.success) {
    const zodErrors = formatZodIssues(parsed.error);
    const rejectedReason = safeInvalidRequestMessage(
      zodErrors[0]
        ? `Invalid chat completion request: ${zodErrors[0]}`
        : "Invalid chat completion request."
    );
    logChatCompletionInvalidRequest({
      requestId,
      route,
      body: rawBody,
      rejectedReason,
      zodErrors,
      validationErrors: ["schema_validation_failed"],
      normalized: clientNorm.normalized,
      noop: false,
    });
    return respondChatValidationError(
      c,
      ApiError.badRequest(rejectedReason, "invalid_request_error"),
      requestId,
      typeof (rawBody as { model?: unknown })?.model === "string"
        ? (rawBody as { model: string }).model
        : null
    );
  }

  const normalizedMessages = normalizeChatMessages(parsed.data.messages);
  if (!normalizedMessages.ok) {
    const rejectedReason = safeInvalidRequestMessage(
      normalizedMessages.message,
      "Invalid chat completion request."
    );
    logChatCompletionInvalidRequest({
      requestId,
      route,
      body: rawBody,
      rejectedReason,
      validationErrors: ["messages_normalization_failed"],
      normalized: clientNorm.normalized,
      noop: false,
    });
    return respondChatValidationError(
      c,
      ApiError.badRequest(rejectedReason, "invalid_request_error"),
      requestId,
      parsed.data.model ?? null
    );
  }

  const rawIdempotencyKey =
    c.req.header("idempotency-key") ?? c.req.header("Idempotency-Key");
  const idempotencyKey = parseIdempotencyKey(rawIdempotencyKey);
  if (rawIdempotencyKey && !idempotencyKey) {
    const rejectedReason = "Invalid Idempotency-Key header.";
    logChatCompletionInvalidRequest({
      requestId,
      route,
      body: rawBody,
      rejectedReason,
      validationErrors: ["invalid_idempotency_key"],
      normalized: clientNorm.normalized,
      noop: false,
    });
    return respondChatValidationError(
      c,
      ApiError.badRequest(rejectedReason, "invalid_idempotency_key"),
      requestId,
      parsed.data.model ?? null
    );
  }

  const wantsStream = parsed.data.stream === true;

  if (parsed.data.model?.trim() === "__tokfai_mock_invalid_request") {
    logChatCompletionInvalidRequest({
      requestId,
      route,
      body: rawBody,
      rejectedReason: "Invalid request.",
      validationErrors: ["invalid_request_error"],
      requestedModel: "__tokfai_mock_invalid_request",
      normalized: clientNorm.normalized,
      noop: false,
    });
    return respondApiError(
      c,
      ApiError.badRequest("Invalid request.", "invalid_request_error"),
      requestId
    );
  }

  const execBody = {
    ...parsed.data,
    messages: normalizedMessages.messages,
    stream: false as const,
  };

  // Always the production chat completions chain (route default inside exec).
  if (wantsStream) {
    return respondChatCompletionEarlySse(c, {
      caller,
      requestId,
      body: execBody,
      limitKey,
      idempotencyKey,
    });
  }

  const result = await executeChatCompletion({
    caller,
    requestId,
    body: execBody,
    limitKey,
    idempotencyKey,
    clientStream: false,
  });

  if (!result.ok) {
    if (result.httpStatus === 400) {
      const requestedRaw =
        typeof (rawBody as { model?: unknown })?.model === "string"
          ? String((rawBody as { model: string }).model).trim()
          : undefined;
      const resolved = requestedRaw
        ? resolveChatModel(requestedRaw)
        : undefined;
      logChatCompletionInvalidRequest({
        requestId: result.requestId || requestId,
        route,
        body: rawBody,
        rejectedReason: safeInvalidRequestMessage(
          result.errorMessage,
          "Invalid chat completion request."
        ),
        validationErrors: [result.errorCode || "invalid_request_error"],
        requestedModel: requestedRaw,
        resolvedModel: resolved?.canonicalId,
        normalized: clientNorm.normalized,
        noop: false,
      });
    }
    return respondExecuteChatCompletionFailure(c, result);
  }

  return c.json(
    normalizeOpenAiFinishReasonOnChatCompletion(result.response, {
      route: "/v1/chat/completions",
    })
  );
}
