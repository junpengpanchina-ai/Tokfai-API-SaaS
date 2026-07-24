/**
 * Narrow gate for gemini-2.5-flash /v1/chat/completions stream=false only:
 * when upstream non-stream times out or is unavailable, drain upstream
 * stream=true and assemble chat.completion JSON.
 *
 * Does not touch aliases, Cherry compat, or image paths.
 */

import type { ApiError } from "../errors.js";

export const GEMINI_25_FLASH_NONSTREAM_STREAM_FALLBACK_MODEL =
  "gemini-2.5-flash" as const;

export function isGemini25FlashNonStreamStreamFallbackPath(args: {
  clientStream: boolean;
  attemptModel: string;
  requestedModel: string;
}): boolean {
  return (
    args.clientStream !== true &&
    args.attemptModel === GEMINI_25_FLASH_NONSTREAM_STREAM_FALLBACK_MODEL &&
    args.requestedModel === GEMINI_25_FLASH_NONSTREAM_STREAM_FALLBACK_MODEL
  );
}

/** Errors that may retry via upstream stream assemble (same model). */
export function isGemini25FlashStreamFallbackEligible(err: ApiError): boolean {
  const code = err.code;
  if (!code) return false;
  if (
    code === "upstream_timeout" ||
    code === "upstream_model_busy" ||
    code === "model_not_available" ||
    code === "all_upstreams_unavailable"
  ) {
    return true;
  }
  if (code === "upstream_error") {
    return (err.upstreamStatus ?? 502) >= 500;
  }
  return false;
}
