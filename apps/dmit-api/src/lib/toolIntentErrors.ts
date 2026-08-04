/**
 * P1017 / P1026 — Emulated Tool Intent error codes + ApiError factories.
 * All failures are not_billable (caller must not debit).
 */

import { ApiError } from "../errors.js";

export const TOOL_INTENT_NOT_GENERATED_CODE =
  "tool_intent_not_generated" as const;
export const TOOL_INTENT_INVALID_JSON_CODE =
  "tool_intent_invalid_json" as const;
export const TOOL_INTENT_AMBIGUOUS_JSON_CODE =
  "tool_intent_ambiguous_json" as const;
export const TOOL_NAME_NOT_ALLOWED_CODE = "tool_name_not_allowed" as const;
export const TOOL_ARGUMENTS_INVALID_CODE = "tool_arguments_invalid" as const;
export const REQUIRED_TOOL_CALL_MISSING_CODE =
  "required_tool_call_missing" as const;
export const TOOL_INTENT_TOO_LARGE_CODE = "tool_intent_too_large" as const;
export const TOOL_EMULATION_UNAVAILABLE_CODE =
  "tool_emulation_unavailable" as const;

export const TOOL_INTENT_ERROR_CODES = [
  TOOL_INTENT_NOT_GENERATED_CODE,
  TOOL_INTENT_INVALID_JSON_CODE,
  TOOL_INTENT_AMBIGUOUS_JSON_CODE,
  TOOL_NAME_NOT_ALLOWED_CODE,
  TOOL_ARGUMENTS_INVALID_CODE,
  REQUIRED_TOOL_CALL_MISSING_CODE,
  TOOL_INTENT_TOO_LARGE_CODE,
  TOOL_EMULATION_UNAVAILABLE_CODE,
] as const;

export type ToolIntentErrorCode = (typeof TOOL_INTENT_ERROR_CODES)[number];

const PUBLIC_MESSAGES: Record<ToolIntentErrorCode, string> = {
  tool_intent_not_generated:
    "Model did not return a valid tool intent. Retry or choose another model.",
  tool_intent_invalid_json:
    "Model returned invalid tool intent JSON. Please retry.",
  tool_intent_ambiguous_json:
    "Model returned multiple JSON candidates. Please retry with a single JSON object.",
  tool_name_not_allowed:
    "Model selected a tool that is not allowed for this request.",
  tool_arguments_invalid:
    "Model returned tool arguments that do not match the schema.",
  required_tool_call_missing:
    "A tool call was required but the model did not return one.",
  tool_intent_too_large: "Tool intent payload exceeded size limits.",
  tool_emulation_unavailable:
    "Tool calling is not available for this model/provider combination.",
};

/** Codes eligible for one same-provider repair retry. */
export function isToolIntentRepairableCode(code: string | undefined): boolean {
  return (
    code === TOOL_INTENT_INVALID_JSON_CODE ||
    code === TOOL_INTENT_AMBIGUOUS_JSON_CODE ||
    code === TOOL_ARGUMENTS_INVALID_CODE
  );
}

/** Codes that may try the next provider / model attempt. */
export function isToolIntentFallbackEligible(code: string | undefined): boolean {
  return (
    code === TOOL_INTENT_NOT_GENERATED_CODE ||
    code === REQUIRED_TOOL_CALL_MISSING_CODE ||
    code === TOOL_EMULATION_UNAVAILABLE_CODE ||
    code === TOOL_INTENT_INVALID_JSON_CODE ||
    code === TOOL_INTENT_AMBIGUOUS_JSON_CODE
  );
}

export function isToolIntentErrorCode(code: unknown): code is ToolIntentErrorCode {
  return (
    typeof code === "string" &&
    (TOOL_INTENT_ERROR_CODES as readonly string[]).includes(code)
  );
}

export function toolIntentApiError(
  code: ToolIntentErrorCode,
  opts?: { message?: string; upstreamStatus?: number }
): ApiError {
  const publicMessage = PUBLIC_MESSAGES[code];
  const status =
    code === TOOL_EMULATION_UNAVAILABLE_CODE
      ? 400
      : 502;
  return new ApiError({
    status,
    message: opts?.message ?? publicMessage,
    publicMessage,
    code,
    type:
      code === TOOL_EMULATION_UNAVAILABLE_CODE
        ? "invalid_request_error"
        : "upstream_error",
    upstreamStatus: opts?.upstreamStatus ?? 200,
  });
}
