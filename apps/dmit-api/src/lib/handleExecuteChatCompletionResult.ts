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
      (typeof requestId === "string" && requestId.trim()
        ? requestId.trim()
        : undefined) ?? requestIdFromContext(c);
    const body = {
      ...buildClientErrorBody(err, resolvedId),
      ...extra,
    };
    let text = JSON.stringify(body);
    if (
      !text ||
      text === "{}" ||
      !body?.error ||
      typeof (body.error as { message?: unknown }).message !== "string" ||
      !(body.error as { message: string }).message.trim() ||
      !(body.error as { code?: string }).code ||
      !(body.error as { type?: string }).type
    ) {
      // Never allow empty / undefined envelopes out (Cherry Studio).
      return respondApiError(c, err, resolvedId);
    }
    const headers: Record<string, string> = {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": String(Buffer.byteLength(text, "utf8")),
      "Cache-Control": "no-store",
      Connection: "close",
    };
    if (resolvedId) {
      headers["X-Request-Id"] = resolvedId;
      try {
        c.header("X-Request-Id", resolvedId);
      } catch {
        // finalized context — Response headers still set
      }
    }
    return new Response(text, {
      status: err.status || 400,
      headers,
    });
  }
  return respondApiError(c, err, requestId);
}

/**
 * Always return the standard Tokfai error envelope — never an empty body
 * and never code/message/request_id null or the literal string "undefined".
 * stream=true failures must still be application/json (not SSE).
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
    return respondApiError(
      c,
      ApiError.notFound(message, code),
      requestId
    );
  }

  if (result.httpStatus === 402) {
    return respondApiError(
      c,
      new ApiError({
        status: 402,
        message,
        publicMessage: message,
        code,
        type: "billing_error",
      }),
      requestId
    );
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

  return respondApiError(
    c,
    new ApiError({
      status: result.httpStatus,
      message,
      publicMessage: message,
      code,
    }),
    requestId
  );
}
