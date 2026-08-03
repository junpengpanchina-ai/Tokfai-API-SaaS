import type { Context } from "hono";

import { ApiError, buildClientErrorBody, errorTypeForCode } from "../errors.js";
import { respondApiError } from "../middleware/error.js";
import type { ExecuteChatCompletionResult } from "./executeChatCompletion.js";
import { safeInvalidRequestMessage } from "./chatCompletionDiagnostics.js";
import {
  forcedToolFailureJsonResponse,
  isForcedToolFailureCode,
} from "./toolCallFailureEnvelope.js";
import {
  mergeTokfaiRouting,
  type TokfaiRoutingEvidence,
} from "./routingEvidence.js";

function requestIdFromContext(c: Context): string | undefined {
  const fromCtx = c.get("requestId" as never);
  return typeof fromCtx === "string" && fromCtx.trim() ? fromCtx.trim() : undefined;
}

function tokfaiFromResult(
  result: ExecuteChatCompletionResult & { ok: false },
  requestId: string | undefined
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    billing_status: "not_billable",
    credits_charged: 0,
    ...(requestId ? { request_id: requestId } : {}),
  };
  if (result.routing) {
    return mergeTokfaiRouting(base, {
      ...result.routing,
      request_id: result.routing.request_id || requestId || result.requestId,
      billing_status: "not_billable",
      credits_charged: 0,
      error_code: result.routing.error_code ?? result.errorCode,
      fallback_reason:
        result.routing.fallback_reason ?? result.errorCode ?? null,
    } satisfies TokfaiRoutingEvidence);
  }
  return base;
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
    if (
      typeof err.retryAfterSeconds === "number" &&
      Number.isFinite(err.retryAfterSeconds)
    ) {
      headers["Retry-After"] = String(
        Math.max(1, Math.trunc(err.retryAfterSeconds))
      );
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
 *
 * P972: forced tool failures (tool_call_not_generated / …) always return
 * parseable JSON with tokfai not_billable (never 504 / HTML / empty).
 * stream=true mid-path failures use SSE via respondEarlySse instead.
 *
 * P984: attach routing evidence on tokfai when present on the result.
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

  const tokfai = tokfaiFromResult(result, requestId);

  // P972 — graceful JSON for forced tool-call failures (billing unchanged).
  if (isForcedToolFailureCode(code)) {
    return forcedToolFailureJsonResponse({
      code,
      message,
      requestId,
      httpStatus: result.httpStatus,
      tokfai,
    });
  }

  if (result.httpStatus === 400) {
    const err = new ApiError({
      status: 400,
      message,
      publicMessage: message,
      code,
      type: errorTypeForCode(code, 400),
    });
    const extra: Record<string, unknown> = { tokfai };
    if (result.suggestedModels?.length) {
      extra.suggestedModels = result.suggestedModels;
    }
    return respondJsonError(c, err, requestId, extra);
  }

  if (result.httpStatus === 404) {
    return respondApiError(
      c,
      ApiError.notFound(message, code),
      requestId
    );
  }

  if (result.httpStatus === 402) {
    const err = new ApiError({
      status: 402,
      message,
      publicMessage: message,
      code,
      type: "billing_error",
    });
    return respondJsonError(c, err, requestId, { tokfai });
  }

  // Timeout / upstream errors may include suggestedModels when the provider
  // circuit is degraded — surface them without changing the error envelope.
  if (result.suggestedModels?.length) {
    const err = new ApiError({
      status: result.httpStatus,
      message,
      publicMessage: message,
      code,
      type: errorTypeForCode(code, result.httpStatus),
    });
    return respondJsonError(c, err, requestId, {
      suggestedModels: result.suggestedModels,
      tokfai,
    });
  }

  const err = new ApiError({
    status: result.httpStatus,
    message,
    publicMessage: message,
    code,
    type: errorTypeForCode(code, result.httpStatus),
    ...(typeof result.retryAfterSeconds === "number"
      ? { retryAfterSeconds: result.retryAfterSeconds }
      : {}),
  });
  return respondJsonError(c, err, requestId, { tokfai });
}
