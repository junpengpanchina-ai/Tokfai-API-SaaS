/**
 * P972 — OpenAI-compatible graceful error envelope for forced tool failures.
 *
 * Does not change P971 billing rules (still not_billable / credits=0).
 * Ensures clients never see 504 HTML, empty bodies, or mid-stream header races
 * when strict tools requests fail without tool_calls.
 */

import { ApiError, buildClientErrorBody, errorTypeForCode } from "../errors.js";
import {
  PROVIDER_TOOL_CALL_NOT_SUPPORTED_CODE,
  TOOL_CALL_NOT_GENERATED_CODE,
} from "./toolCallCapability.js";
import { safeInvalidRequestMessage } from "./chatCompletionDiagnostics.js";

const FORCED_TOOL_FAILURE_CODES = new Set<string>([
  TOOL_CALL_NOT_GENERATED_CODE,
  PROVIDER_TOOL_CALL_NOT_SUPPORTED_CODE,
]);

/** HTTP statuses allowed for non-stream forced-tool failure JSON. */
const ALLOWED_HTTP = new Set([400, 422, 502, 503]);

export function isForcedToolFailureCode(code: unknown): boolean {
  return typeof code === "string" && FORCED_TOOL_FAILURE_CODES.has(code);
}

/**
 * Never surface nginx-style 504 / odd 5xx for this contract — clamp to 502.
 * Keep 400/422/502/503 as-is.
 */
export function clampForcedToolFailureHttpStatus(status: number): number {
  if (ALLOWED_HTTP.has(status)) return status;
  return 502;
}

export function buildForcedToolFailurePayload(args: {
  code?: string | null;
  message?: string | null;
  requestId?: string | null;
  httpStatus?: number;
}): {
  status: number;
  payload: Record<string, unknown>;
} {
  const code = isForcedToolFailureCode(args.code)
    ? String(args.code)
    : TOOL_CALL_NOT_GENERATED_CODE;
  const status = clampForcedToolFailureHttpStatus(args.httpStatus ?? 502);
  const message = safeInvalidRequestMessage(
    args.message,
    "Upstream did not return tool_calls for a strict tools request."
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
  const payload: Record<string, unknown> = {
    ...body,
    tokfai: {
      billing_status: "not_billable",
      credits_charged: 0,
      ...(requestId ? { request_id: requestId } : {}),
    },
    credits_charged: 0,
  };

  return { status, payload };
}

/** Non-stream: application/json body (never empty / HTML). */
export function forcedToolFailureJsonResponse(args: {
  code?: string | null;
  message?: string | null;
  requestId?: string | null;
  httpStatus?: number;
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
  const { payload } = buildForcedToolFailurePayload(args);
  return `data: ${JSON.stringify(payload)}\n\ndata: [DONE]\n\n`;
}

export function forcedToolFailureSseResponse(args: {
  code?: string | null;
  message?: string | null;
  requestId?: string | null;
  httpStatus?: number;
}): Response {
  const body = forcedToolFailureToSseBody(args);
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
