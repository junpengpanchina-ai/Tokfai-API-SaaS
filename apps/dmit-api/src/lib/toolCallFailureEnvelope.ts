/**
 * P972/P974 — OpenAI-compatible graceful error envelope for tool failures /
 * routing guard (model_not_tool_capable, fake tool_call, etc.).
 *
 * Does not change P971 billing rules (still not_billable / credits=0).
 * Ensures clients never see 504 HTML, empty bodies, or mid-stream header races.
 */

import { ApiError, buildClientErrorBody, errorTypeForCode } from "../errors.js";
import {
  ALL_TOOL_UPSTREAMS_UNAVAILABLE_CODE,
  MODEL_NOT_TOOL_CAPABLE_CODE,
  MODEL_NOT_TOOL_CAPABLE_MESSAGE,
  PROVIDER_TOOL_CALL_NOT_SUPPORTED_CODE,
  TOOL_CALL_NOT_GENERATED_CODE,
  TOOL_CALL_NOT_SUPPORTED_CODE,
} from "./toolCallCapability.js";
import { TOOL_INTENT_ERROR_CODES } from "./toolIntentErrors.js";
import { safeInvalidRequestMessage } from "./chatCompletionDiagnostics.js";

const FORCED_TOOL_FAILURE_CODES = new Set<string>([
  TOOL_CALL_NOT_GENERATED_CODE,
  PROVIDER_TOOL_CALL_NOT_SUPPORTED_CODE,
  ...TOOL_INTENT_ERROR_CODES,
]);

const TOOL_ROUTING_GUARD_CODES = new Set<string>([
  MODEL_NOT_TOOL_CAPABLE_CODE,
  TOOL_CALL_NOT_SUPPORTED_CODE,
  ALL_TOOL_UPSTREAMS_UNAVAILABLE_CODE,
  "tool_emulation_unavailable",
]);

/** HTTP statuses allowed for non-stream tool-guard failure JSON. */
const ALLOWED_HTTP = new Set([400, 422, 502, 503]);

export function isForcedToolFailureCode(code: unknown): boolean {
  return typeof code === "string" && FORCED_TOOL_FAILURE_CODES.has(code);
}

export function isToolRoutingGuardErrorCode(code: unknown): boolean {
  return typeof code === "string" && TOOL_ROUTING_GUARD_CODES.has(code);
}

/**
 * Never surface nginx-style 504 / odd 5xx for this contract — clamp to 502.
 * Keep 400/422/502/503 as-is.
 */
export function clampForcedToolFailureHttpStatus(status: number): number {
  if (ALLOWED_HTTP.has(status)) return status;
  return 502;
}

export function buildNotBillableToolErrorPayload(args: {
  code?: string | null;
  message?: string | null;
  requestId?: string | null;
  httpStatus?: number;
  defaultCode?: string;
  defaultMessage?: string;
  tokfai?: Record<string, unknown>;
}): {
  status: number;
  payload: Record<string, unknown>;
} {
  const defaultCode = args.defaultCode ?? TOOL_CALL_NOT_GENERATED_CODE;
  const code =
    isForcedToolFailureCode(args.code) || isToolRoutingGuardErrorCode(args.code)
      ? String(args.code)
      : defaultCode;
  const status = clampForcedToolFailureHttpStatus(
    args.httpStatus ?? (code === MODEL_NOT_TOOL_CAPABLE_CODE ? 400 : 502)
  );
  const message = safeInvalidRequestMessage(
    args.message,
    args.defaultMessage ??
      (code === MODEL_NOT_TOOL_CAPABLE_CODE
        ? MODEL_NOT_TOOL_CAPABLE_MESSAGE
        : "Upstream did not return tool_calls for a strict tools request.")
  );
  const requestId =
    typeof args.requestId === "string" && args.requestId.trim()
      ? args.requestId.trim()
      : undefined;

  const err = new ApiError({
    status,
    message,
    publicMessage: message,
    code,
    type: errorTypeForCode(code, status),
  });

  const body = buildClientErrorBody(err, requestId);
  const tokfai = {
    billing_status: "not_billable" as const,
    credits_charged: 0,
    ...(requestId ? { request_id: requestId } : {}),
    ...(args.tokfai ?? {}),
  };
  tokfai.billing_status = "not_billable";
  tokfai.credits_charged = 0;
  const payload: Record<string, unknown> = {
    ...body,
    tokfai,
    credits_charged: 0,
  };

  return { status, payload };
}

export function buildForcedToolFailurePayload(args: {
  code?: string | null;
  message?: string | null;
  requestId?: string | null;
  httpStatus?: number;
  tokfai?: Record<string, unknown>;
}): {
  status: number;
  payload: Record<string, unknown>;
} {
  return buildNotBillableToolErrorPayload(args);
}

/** Non-stream: application/json body (never empty / HTML). */
export function forcedToolFailureJsonResponse(args: {
  code?: string | null;
  message?: string | null;
  requestId?: string | null;
  httpStatus?: number;
  tokfai?: Record<string, unknown>;
}): Response {
  const { status, payload } = buildForcedToolFailurePayload(args);
  const text = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": String(Buffer.byteLength(text, "utf8")),
    "Cache-Control": "no-store",
    Connection: "close",
  };
  const rid =
    typeof args.requestId === "string" && args.requestId.trim()
      ? args.requestId.trim()
      : undefined;
  if (rid) headers["X-Request-Id"] = rid;
  return new Response(text, { status, headers });
}

export function notBillableErrorToSseBody(args: {
  code?: string | null;
  message?: string | null;
  requestId?: string | null;
  httpStatus?: number;
}): string {
  const { payload } = buildNotBillableToolErrorPayload(args);
  return `data: ${JSON.stringify(payload)}\n\ndata: [DONE]\n\n`;
}

/**
 * Stream: SSE error chunk + data: [DONE].
 * HTTP 200 (headers already committed on early-flush path; buffered path matches).
 */
export function forcedToolFailureToSseBody(args: {
  code?: string | null;
  message?: string | null;
  requestId?: string | null;
  httpStatus?: number;
}): string {
  return notBillableErrorToSseBody(args);
}

export function forcedToolFailureSseResponse(args: {
  code?: string | null;
  message?: string | null;
  requestId?: string | null;
  httpStatus?: number;
}): Response {
  const body = notBillableErrorToSseBody(args);
  const rid =
    typeof args.requestId === "string" && args.requestId.trim()
      ? args.requestId.trim()
      : "unknown";
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Content-Length": String(Buffer.byteLength(body, "utf8")),
      "Cache-Control": "no-cache, no-transform",
      Connection: "close",
      "X-Request-Id": rid,
    },
  });
}
