import { Hono } from "hono";

import { ApiError } from "../errors.js";
import {
  gatewayLimitKey,
  getGlobalUpstreamInflight,
  getKeyInflight,
} from "../gateway/concurrency.js";
import {
  ChatCompletionRequestSchema,
  executeChatCompletion,
} from "../lib/executeChatCompletion.js";
import {
  buildGeminiModelsList,
  chatCompletionResponseToGemini,
  chatCompletionToGeminiSseBody,
  geminiBodyToChatBody,
  GeminiGenerateContentRequestSchema,
  isGeminiPublicModelId,
  parseGeminiModelAction,
  resolveGeminiCompatModelId,
  unsupportedGeminiModelMessage,
} from "../lib/geminiTransform.js";
import { respondExecuteChatCompletionFailure } from "../lib/handleExecuteChatCompletionResult.js";
import { parseIdempotencyKey } from "../lib/idempotency.js";
import { readJsonBodyWithLimit } from "../lib/readJsonBodyWithLimit.js";
import { getChatCaller } from "../middleware/chatAuth.js";
import { chatGatewayMiddleware } from "../middleware/chatGateway.js";
import { requireGeminiAuth } from "../middleware/geminiAuth.js";
import { logGatewayRejection } from "./chatGatewayLogs.js";

/**
 * /v1beta/* — Google Gemini Generative Language API compatibility shim.
 *
 * Cherry Studio Gemini Provider calls these paths against api.tokfai.com.
 * Auth/billing/upstream reuse executeChatCompletion; only request/response
 * shape is translated.
 */
export const geminiRoutes = new Hono();

geminiRoutes.get("/v1beta/models", async (c) => {
  return c.json(buildGeminiModelsList());
});

geminiRoutes.use("/v1beta/models/:modelAction{.+}", requireGeminiAuth);
geminiRoutes.use("/v1beta/models/:modelAction{.+}", chatGatewayMiddleware);

geminiRoutes.post("/v1beta/models/:modelAction{.+}", async (c) => {
  const modelAction = c.req.param("modelAction");
  const parsedAction = parseGeminiModelAction(modelAction);
  if (!parsedAction) {
    throw ApiError.badRequest(
      `Invalid Gemini model action path: ${c.req.path}`,
      "invalid_request_error"
    );
  }

  const { requested, resolved } = resolveGeminiCompatModelId(
    parsedAction.modelId
  );
  if (!isGeminiPublicModelId(resolved)) {
    throw ApiError.badRequest(
      unsupportedGeminiModelMessage(requested),
      "model_not_supported"
    );
  }

  const modelId = resolved;
  const { action } = parsedAction;
  const caller = getChatCaller(c);
  const requestId = c.get("requestId" as never) as string;
  const limitKey = gatewayLimitKey(caller.apiKeyId, caller.userId);

  let body: unknown;
  try {
    body = await readJsonBodyWithLimit(c);
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
    throw err;
  }

  const parsed = GeminiGenerateContentRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest(
      "Invalid generateContent request.",
      "invalid_request_error"
    );
  }

  const chatBody = geminiBodyToChatBody(parsed.data, modelId);
  if (
    !chatBody.messages?.length ||
    chatBody.messages.every(
      (message) =>
        typeof message.content !== "string" || message.content.trim() === ""
    )
  ) {
    throw ApiError.badRequest(
      "Invalid generateContent request: contents produced empty messages.",
      "invalid_request_error"
    );
  }

  const chatParsed = ChatCompletionRequestSchema.safeParse(chatBody);
  if (!chatParsed.success) {
    throw ApiError.badRequest(
      "Invalid generateContent request.",
      "invalid_request_error"
    );
  }

  const rawIdempotencyKey =
    c.req.header("idempotency-key") ?? c.req.header("Idempotency-Key");
  const idempotencyKey = parseIdempotencyKey(rawIdempotencyKey);
  if (rawIdempotencyKey && !idempotencyKey) {
    throw ApiError.badRequest(
      "Invalid Idempotency-Key header.",
      "invalid_idempotency_key"
    );
  }

  const route =
    action === "streamGenerateContent"
      ? "/v1beta/models/:model:streamGenerateContent"
      : "/v1beta/models/:model:generateContent";

  const result = await executeChatCompletion({
    caller,
    requestId,
    body: chatParsed.data,
    limitKey,
    idempotencyKey,
    route,
  });

  if (!result.ok) {
    return respondExecuteChatCompletionFailure(c, result);
  }

  if (action === "streamGenerateContent") {
    const alt = c.req.query("alt");
    if (alt && alt !== "sse") {
      throw ApiError.badRequest(
        "Only alt=sse is supported for streamGenerateContent.",
        "invalid_request_error"
      );
    }
    const sseBody = chatCompletionToGeminiSseBody(result.response, modelId);
    return c.newResponse(sseBody, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Request-Id": result.requestId,
      },
    });
  }

  return c.json(chatCompletionResponseToGemini(result.response, modelId));
});
