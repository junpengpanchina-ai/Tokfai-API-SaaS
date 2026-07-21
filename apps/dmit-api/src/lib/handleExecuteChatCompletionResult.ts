import type { Context } from "hono";

import { ApiError, buildClientErrorBody } from "../errors.js";
import { respondApiError } from "../middleware/error.js";
import type { ExecuteChatCompletionResult } from "./executeChatCompletion.js";
import { safeInvalidRequestMessage } from "./chatCompletionDiagnostics.js";

function requestIdFromContext(c: Context): string | undefined {
  const fromCtx = c.get("requestId" as never);
  return typeof fromCtx === "string" && fromCtx.trim() ? fromCtx : undefined;
}

function respondJsonError(
  c: Context,
  err: ApiError,
  requestId: string | undefined,
  extra?: Record<string, unknown>
): Response {
  if (extra && Object.keys(extra).length > 0) {
    const resolvedId =
      (typeof requestId === "string" && requestId.trim()) ||
      requestIdFromContext(c);
    if (resolvedId) {
      c.header("X-Request-Id", resolvedId);
    }
    const body = {
      ...buildClientErrorBody(err, resolvedId),
      ...extra,
    };
    return c.body(JSON.stringify(body), err.status as never, {
      "Content-Type": "application/json; charset=utf-8",
    });
  }
  return respondApiError(c, err, requestId);
}

/**
 * Always return the standard Tokfai error envelope — never an empty body
 * and never code/message/request_id null or the literal string "undefined".
 */
export function respondExecuteChatCompletionFailure(
  c: Context,
  result: ExecuteChatCompletionResult & { ok: false }
): Response {
  const requestId =
    (typeof result.requestId === "string" && result.requestId.trim()
      ? result.requestId
      : undefined) ?? requestIdFromContext(c);

  const message = safeInvalidRequestMessage(
    result.errorMessage,
    "Invalid request."
  );
  const code =
    (typeof result.errorCode === "string" && result.errorCode.trim()) ||
    "invalid_request_error";

  if (result.httpStatus === 400) {
    const err = new ApiError({
      status: 400,
      message,
      publicMessage: message,
      code,
      type: "invalid_request_error",
    });
    return respondJsonError(
      c,
      err,
      requestId,
      result.suggestedModels?.length
        ? { suggestedModels: result.suggestedModels }
        : undefined
    );
  }

  if (result.httpStatus === 404) {
    throw ApiError.notFound(message, code);
  }

  if (result.httpStatus === 402) {
    throw new ApiError({
      status: 402,
      message,
      publicMessage: message,
      code,
      type: "billing_error",
    });
  }

  // Timeout / upstream errors may include suggestedModels when the provider
  // circuit is degraded — surface them without changing the error envelope.
  if (result.suggestedModels?.length) {
    const err = new ApiError({
      status: result.httpStatus,
      message,
      publicMessage: message,
      code,
    });
    return respondJsonError(c, err, requestId, {
      suggestedModels: result.suggestedModels,
    });
  }

  throw new ApiError({
    status: result.httpStatus,
    message,
    publicMessage: message,
    code,
  });
}
